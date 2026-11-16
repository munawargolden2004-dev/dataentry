// Data access for the finance module: invoices, expenses, parties
// (vendors / agents / clients), bank & cash accounts, and transactions.
//
// Every finance screen reads the same five collections through one shared
// react-query cache, so moving between Invoices / Ledgers / Bank / Balance
// Sheet is instant, and a write on one screen patches the cache the others
// read from (no refetch, no stale totals).

import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { dataService } from "./dataService";
import { toDateSafe } from "../utils/dates";
import { invoiceAmounts, invoiceStatus, normalizeBooking, round2 } from "../utils/accounting";

export const FINANCE_COLLECTIONS = ["invoices", "expenses", "parties", "accounts", "transactions"];
const BOOKING_COLLECTIONS = [
  ["visa", "bookings"],
  ["ticket", "ticketBookings"],
  ["hotel", "HotelBookings"],
  ["umrah", "ummrahBookings"],
  ["medical", "medical_insurance"],
];

const EMPTY = [];
const financeKey = (name) => ["finance", name];
const createdMs = (d) => toDateSafe(d.createdAt)?.getTime() || 0;

async function fetchCollection(name) {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs
    .map((d) => {
      const raw = d.data();
      return { id: d.id, ...raw, createdAt: toDateSafe(raw.createdAt)?.toISOString() || null };
    })
    .sort((a, b) => createdMs(b) - createdMs(a));
}

const combineFinance = (results) => ({
  data: Object.fromEntries(FINANCE_COLLECTIONS.map((name, i) => [name, results[i].data ?? EMPTY])),
  isLoading: results.some((r) => r.isLoading),
  isFetching: results.some((r) => r.isFetching),
  error: results.find((r) => r.error)?.error || null,
});

/** { data: { invoices, expenses, parties, accounts, transactions }, isLoading, isFetching, error } */
export function useFinanceData() {
  return useQueries({
    queries: FINANCE_COLLECTIONS.map((name) => ({
      queryKey: financeKey(name),
      queryFn: () => fetchCollection(name),
      staleTime: 1000 * 60,
    })),
    combine: combineFinance,
  });
}

const combineBookings = (results) => ({
  bookings: results.flatMap((r, i) => (r.data ?? EMPTY).map((b) => normalizeBooking(BOOKING_COLLECTIONS[i][0], b))),
  isLoading: results.some((r) => r.isLoading),
  error: results.find((r) => r.error)?.error || null,
});

/** Every booking from the five booking modules, in one common shape (admin screens). */
export function useAllBookings(enabled = true) {
  return useQueries({
    queries: BOOKING_COLLECTIONS.map(([, name]) => ({
      queryKey: ["finance-bookings", name],
      queryFn: () => dataService.fetchAll(name),
      staleTime: 1000 * 60,
      enabled,
    })),
    combine: combineBookings,
  });
}

// Firestore rejects `undefined`; drop those keys instead of failing the write.
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Write helpers. Each one resolves after Firestore accepts the write and the shared cache is patched. */
export function useFinanceActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMemo(() => {
    const cached = (name) => queryClient.getQueryData(financeKey(name)) || EMPTY;
    const upsert = (name, docs) =>
      queryClient.setQueryData(financeKey(name), (old = EMPTY) => {
        const next = [...old];
        for (const d of docs) {
          const at = next.findIndex((x) => x.id === d.id);
          if (at >= 0) next[at] = d;
          else next.unshift(d);
        }
        return next;
      });
    const drop = (name, id) =>
      queryClient.setQueryData(financeKey(name), (old = EMPTY) => old.filter((x) => x.id !== id));
    const stamp = () => ({
      createdAt: serverTimestamp(),
      createdByUid: user?.uid || null,
      createdByEmail: user?.email || null,
    });
    const localStamp = () => ({
      createdAt: new Date().toISOString(),
      createdByUid: user?.uid || null,
      createdByEmail: user?.email || null,
    });

    /** Invoice field changes needed to move `delta` of later ("linked") payments onto it. */
    const relink = (invoiceId, delta) => {
      const inv = cached("invoices").find((i) => i.id === invoiceId);
      if (!inv || !delta) return null;
      const a = invoiceAmounts(inv);
      const linkedPaid = Math.max(0, round2(a.linkedPaid + delta));
      const paidAmount = round2(a.directPaid + linkedPaid);
      const fields = {
        linkedPaid,
        paidAmount,
        remainingAmount: Math.max(0, round2(a.total - paidAmount)),
        status: invoiceStatus(a.total, paidAmount),
      };
      return { inv, fields };
    };

    return {
      /** Create (no id) or update (id) a document in any finance collection. */
      async save(name, data, id) {
        const payload = clean(data);
        if (id) {
          await updateDoc(doc(db, name, id), { ...payload, updatedAt: serverTimestamp() });
          const prev = cached(name).find((x) => x.id === id) || { id };
          const saved = { ...prev, ...payload };
          upsert(name, [saved]);
          return saved;
        }
        const ref = doc(collection(db, name));
        await setDoc(ref, { ...payload, ...stamp() });
        const saved = { id: ref.id, ...payload, ...localStamp() };
        upsert(name, [saved]);
        return saved;
      },

      async remove(name, id) {
        await deleteDoc(doc(db, name, id));
        drop(name, id);
      },

      /**
       * Create/update a bank or cash transaction. When it settles an invoice
       * (`data.invoiceId`), the invoice's paid amount and status are updated in
       * the same atomic batch, so the two can never disagree.
       */
      async saveTransaction(data, prev = null) {
        // Optional links are stored only when set (never as null).
        const payload = clean({ ...data, invoiceId: data.invoiceId || undefined, toAccountId: data.toAccountId || undefined });
        const batch = writeBatch(db);
        const ref = prev ? doc(db, "transactions", prev.id) : doc(collection(db, "transactions"));

        const deltas = new Map();
        if (prev?.invoiceId) deltas.set(prev.invoiceId, -round2(prev.amount));
        if (payload.invoiceId) {
          deltas.set(payload.invoiceId, round2((deltas.get(payload.invoiceId) || 0) + round2(payload.amount)));
        }
        const patchedInvoices = [];
        deltas.forEach((delta, invoiceId) => {
          const change = relink(invoiceId, delta);
          if (!change) return;
          batch.update(doc(db, "invoices", invoiceId), { ...change.fields, updatedAt: serverTimestamp() });
          patchedInvoices.push({ ...change.inv, ...change.fields });
        });

        if (prev) {
          batch.update(ref, {
            ...payload,
            invoiceId: payload.invoiceId || deleteField(),
            toAccountId: payload.toAccountId || deleteField(),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, { ...payload, ...stamp() });
        }
        await batch.commit();

        const saved = prev ? { ...prev, ...payload } : { id: ref.id, ...payload, ...localStamp() };
        if (!payload.invoiceId) delete saved.invoiceId;
        if (!payload.toAccountId) delete saved.toAccountId;
        upsert("transactions", [saved]);
        if (patchedInvoices.length) upsert("invoices", patchedInvoices);
        return saved;
      },

      async removeTransaction(txn) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "transactions", txn.id));
        const change = txn.invoiceId ? relink(txn.invoiceId, -round2(txn.amount)) : null;
        if (change) batch.update(doc(db, "invoices", txn.invoiceId), { ...change.fields, updatedAt: serverTimestamp() });
        await batch.commit();
        drop("transactions", txn.id);
        if (change) upsert("invoices", [{ ...change.inv, ...change.fields }]);
      },

      /**
       * Delete an invoice. Payments that were recorded against it are kept as
       * on-account payments for the party (the money still moved), just unlinked.
       */
      async removeInvoice(invoiceId) {
        const linked = cached("transactions").filter((t) => t.invoiceId === invoiceId);
        const batch = writeBatch(db);
        batch.delete(doc(db, "invoices", invoiceId));
        linked.forEach((t) => batch.update(doc(db, "transactions", t.id), { invoiceId: deleteField() }));
        await batch.commit();
        drop("invoices", invoiceId);
        if (linked.length) {
          upsert("transactions", linked.map((t) => {
            const next = { ...t };
            delete next.invoiceId;
            return next;
          }));
        }
      },

      /** Force a fresh pull of every finance collection (Refresh buttons). */
      async refresh() {
        await dataService.clearCache();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["finance"] }),
          queryClient.invalidateQueries({ queryKey: ["finance-bookings"] }),
        ]);
      },
    };
  }, [queryClient, user]);
}

/** Readable message for a failed finance read/write. */
export const financeErrorMessage = (err) =>
  err?.code === "permission-denied"
    ? "Permission denied by Firestore. Deploy the updated firestore.rules (parties, accounts, transactions) and reload."
    : err?.message || "Something went wrong. Please try again.";
