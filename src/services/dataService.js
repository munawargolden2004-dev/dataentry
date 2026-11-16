import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  startAfter,
  where
} from "firebase/firestore";
import { db } from "../firebase";

import localforage from "localforage";

// Cache schema version. Bump this whenever the cached shape changes (e.g. the
// createdAt normalisation) so old, incompatible cache entries are ignored
// instead of served — no manual "clear site data" needed.
const CACHE_V = "v2";

// Firestore Timestamps lose their .toDate() method when they pass through the
// IndexedDB cache (structured-clone drops the prototype), which makes
// `new Date(createdAt)` return "Invalid Date" on cached loads. We normalise
// createdAt to an ISO string BEFORE caching — a string every consumer already
// handles (`new Date(str)` works, and the `typeof === "string"` branches too).
const toIsoOrNull = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Service for handling paginated and optimized Firestore queries
 */
export const dataService = {
  /**
   * Fetches a page of documents from a collection
   * @param {string} collectionName - name of the firestore collection
   * @param {object} options - query options (limit, lastVisible, filters)
   */
  async fetchPage(collectionName, { pageSize = 20, lastVisible = null, filters = [] } = {}) {
    let q = query(collection(db, collectionName), orderBy("createdAt", "desc"), limit(pageSize));

    if (lastVisible) {
      q = query(q, startAfter(lastVisible));
    }

    // Apply basic filters if any
    filters.forEach(f => {
      if (f.value !== "All" && f.value !== "") {
        q = query(q, where(f.field, "==", f.value));
      }
    });

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return {
      data,
      lastVisible: lastDoc,
      hasMore: data.length === pageSize
    };
  },

  /**
   * Fetches all documents for a collection, cached in IndexedDB via localforage.
   * Avoids re-downloading the whole collection on every dashboard visit / page
   * reload — the biggest Firestore-read drain. Default freshness: 6 hours.
   * Use the Refresh buttons (which call clearCache) to force a fresh pull.
   */
  async fetchAll(collectionName, { ttlMs = 1000 * 60 } = {}) {
    const cacheKey = `os_cache_all_${CACHE_V}_${collectionName}`;

    // Serve from cache if still fresh (zero Firestore reads).
    try {
      const cached = await localforage.getItem(cacheKey);
      if (cached && Array.isArray(cached.data) && Date.now() - cached.t < ttlMs) {
        return cached.data;
      }
    } catch { /* ignore cache-read errors, fall through to network */ }

    const q = query(collection(db, collectionName), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    // NOTE: we deliberately keep the raw doc shape here. Firestore Timestamps
    // become plain {seconds,nanoseconds} objects through the IndexedDB cache;
    // the admin consumers of fetchAll all read that via a `createdAt.seconds`
    // branch, so any consumer that renders a date MUST handle `.seconds`
    // (not just `.toDate()` + `new Date()`), or it shows "Invalid Date".
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Persist for next time (IndexedDB supports hundreds of MBs, no 5MB limit).
    try {
      await localforage.setItem(cacheKey, { t: Date.now(), data });
    } catch { /* ignore */ }

    return data;
  },

  /**
   * Internal: fetch ONE user's own docs from a collection (where field == value),
   * cached per-user in IndexedDB. This is what makes every employee page fast —
   * a staff member downloads only THEIR OWN records once (not the whole
   * collection), cached to disk, and every revisit + sibling page is instant.
   * Critical for heavy users with thousands of applications, and it also stops an
   * employee's browser from pulling every other employee's data.
   * `createdAt` is normalised to a real Date so it survives the cache
   * (Firestore Timestamps lose their .toDate() through structured-clone).
   */
  async _fetchMine(collectionName, field, value, tag, { ttlMs = 1000 * 60 } = {}) {
    if (!value) return [];
    const cacheKey = `os_cache_my_${CACHE_V}_${tag}_${value}`;

    try {
      const cached = await localforage.getItem(cacheKey);
      if (cached && Array.isArray(cached.data) && Date.now() - cached.t < ttlMs) {
        return cached.data;
      }
    } catch { /* ignore */ }

    const q = query(collection(db, collectionName), where(field, "==", value));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((d) => {
      const raw = d.data();
      return { id: d.id, ...raw, createdAt: toIsoOrNull(raw.createdAt) };
    });

    try { await localforage.setItem(cacheKey, { t: Date.now(), data }); } catch { /* ignore */ }
    return data;
  },

  /** One employee's visa bookings (shared by Countries / Search / ApprovedVisas).
   *  Sorted newest-CREATED first so a freshly added record appears at the top,
   *  falling back to the application `date` for older records without createdAt. */
  async fetchMyBookings(userId, opts) {
    const data = await this._fetchMine("bookings", "userId", userId, "visa", opts);
    const t = (b) => (b.createdAt ? new Date(b.createdAt).getTime() : (b.date ? new Date(b.date).getTime() : 0));
    return [...data].sort((a, b) => t(b) - t(a));
  },
  /** One employee's ticket bookings. */
  fetchMyTickets(userId, opts) { return this._fetchMine("ticketBookings", "createdByUid", userId, "tickets", opts); },
  /** One employee's Umrah bookings. */
  fetchMyUmrah(userId, opts) { return this._fetchMine("ummrahBookings", "createdByUid", userId, "umrah", opts); },
  /** One employee's hotel bookings (keyed by email, matching the existing schema). */
  fetchMyHotels(email, opts) { return this._fetchMine("HotelBookings", "userEmail", email, "hotels", opts); },
  /** One employee's medical-insurance bookings (keyed by email). */
  fetchMyMedical(email, opts) { return this._fetchMine("medical_insurance", "userEmail", email, "medical", opts); },
  /** One employee's invoices (keyed by createdByUid). */
  fetchMyInvoices(userId, opts) { return this._fetchMine("invoices", "createdByUid", userId, "invoices", opts); },
  /** One employee's expenses (keyed by createdByUid). */
  fetchMyExpenses(userId, opts) { return this._fetchMine("expenses", "createdByUid", userId, "expenses", opts); },

  /** Bust one user's per-user cache after they add/edit a record, so the refetch is fresh. */
  async clearMine(tag, value) {
    try { await localforage.removeItem(`os_cache_my_${CACHE_V}_${tag}_${value}`); } catch { /* ignore */ }
  },

  /** Clear cached collection(s)/user data so the next fetch pulls fresh. Call from Refresh buttons. */
  async clearCache(collectionName) {
    try {
      if (collectionName) {
        await localforage.removeItem(`os_cache_all_${CACHE_V}_${collectionName}`);
      } else {
        const keys = await localforage.keys();
        for (const k of keys) {
          if (k.startsWith("os_cache_")) {
            await localforage.removeItem(k);
          }
        }
      }
    } catch { /* ignore */ }
  },

  /**
   * Specific search query
   */
  async search(collectionName, { field, value, limit: searchLimit = 50 }) {
    // Note: Firestore doesn't support partial string match well without 3rd party
    // This is a basic prefix match as an example
    const q = query(
      collection(db, collectionName),
      where(field, ">=", value),
      where(field, "<=", value + "\uf8ff"),
      limit(searchLimit)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
};
