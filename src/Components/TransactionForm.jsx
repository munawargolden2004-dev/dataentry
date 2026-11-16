import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Modal, Field, FormActions, inputCls } from "./FinanceUI";
import { useFinanceActions, financeErrorMessage } from "../services/financeService";
import { PARTY_TYPES, TXN_TYPES, formatPKR, invoiceAmounts, isPurchase, round2, todayIso } from "../utils/accounting";

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "JazzCash / EasyPaisa", "Credit / Debit Card", "Cheque", "Online"];

/**
 * Add / edit one bank or cash transaction.
 *
 * `parties` is the resolved list from resolveParties(). `preset` pre-fills a
 * new transaction ({ type, partyId, accountId, invoiceId }); `types` limits
 * which transaction types can be chosen (the ledger screen only offers
 * receipt / payment).
 */
export default function TransactionForm({ txn = null, preset = {}, types = Object.keys(TXN_TYPES), parties, accounts, onClose }) {
  const actions = useFinanceActions();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    type: txn?.type || preset.type || types[0],
    amount: txn?.amount ?? preset.amount ?? "",
    date: txn?.date || todayIso(),
    accountId: txn?.accountId || preset.accountId || accounts[0]?.id || "",
    toAccountId: txn?.toAccountId || "",
    partyId: (txn ? parties.find((p) => p.transactions.some((t) => t.id === txn.id))?.id : preset.partyId) || "",
    invoiceId: txn?.invoiceId || preset.invoiceId || "",
    method: txn?.method || "Cash",
    reference: txn?.reference || "",
    notes: txn?.notes || "",
  }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const def = TXN_TYPES[form.type];
  const party = def.party ? parties.find((p) => p.id === form.partyId) : null;

  // Invoices this payment can settle: the party's sales invoices for a receipt,
  // its bills for a payment. `max` is what is still owed on each (plus this
  // transaction's own amount when editing).
  const openInvoices = useMemo(() => {
    if (!party) return [];
    return party.invoices
      .filter((inv) => isPurchase(inv) === (form.type === "payment"))
      .map((inv) => {
        const own = txn?.invoiceId === inv.id ? round2(txn.amount) : 0;
        return { inv, max: round2(invoiceAmounts(inv).balance + own) };
      })
      .filter((o) => o.max > 0);
  }, [party, form.type, txn]);
  const linked = openInvoices.find((o) => o.inv.id === form.invoiceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = round2(form.amount);
    if (amount <= 0) return toast.error("Enter an amount greater than zero");
    if (!form.date) return toast.error("Choose a date");
    if (def.party && !party) return toast.error("Choose a party");
    if (def.dir === "transfer") {
      if (!form.accountId || !form.toAccountId) return toast.error("Choose both accounts for the transfer");
      if (form.accountId === form.toAccountId) return toast.error("Transfer needs two different accounts");
    }
    if (linked && amount > linked.max) {
      return toast.error(`Only ${formatPKR(linked.max)} is outstanding on ${linked.inv.invoiceNumber}`);
    }

    setSaving(true);
    try {
      await actions.saveTransaction(
        {
          type: form.type,
          amount,
          date: form.date,
          accountId: form.accountId || null,
          toAccountId: def.dir === "transfer" ? form.toAccountId : null,
          partyId: party && !party.virtual ? party.id : null,
          partyType: party?.type || null,
          partyName: party?.name || null,
          invoiceId: linked ? linked.inv.id : null,
          method: form.method,
          reference: form.reference.trim(),
          notes: form.notes.trim(),
        },
        txn
      );
      toast.success(txn ? "Transaction updated" : "Transaction recorded");
      onClose();
    } catch (err) {
      toast.error(financeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={txn ? "Edit Transaction" : "Record Transaction"}
      subtitle="Money moving in or out of a bank / cash account"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Type">
            <select value={form.type} onChange={(e) => set({ type: e.target.value, invoiceId: "" })} className={inputCls}>
              {types.map((t) => (
                <option key={t} value={t}>{TXN_TYPES[t].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (PKR) *">
            <input
              type="number" min="0" step="any" inputMode="decimal" required autoFocus
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              className={`${inputCls} font-bold`}
              placeholder="0"
            />
          </Field>
        </div>

        {def.party && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={form.type === "receipt" ? "Received from *" : "Paid to *"}>
              <select
                value={form.partyId}
                onChange={(e) => set({ partyId: e.target.value, invoiceId: "" })}
                className={inputCls}
                disabled={Boolean(preset.partyId) && !txn}
              >
                <option value="">Select party...</option>
                {Object.keys(PARTY_TYPES).map((type) => (
                  <optgroup key={type} label={PARTY_TYPES[type].plural}>
                    {parties.filter((p) => p.type === type).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field
              label={form.type === "receipt" ? "Against invoice" : "Against bill"}
              hint={linked ? `Outstanding: ${formatPKR(linked.max)}` : "Optional — leave on account to settle the overall balance"}
            >
              <select value={form.invoiceId} onChange={(e) => set({ invoiceId: e.target.value })} className={inputCls}>
                <option value="">On account (no invoice)</option>
                {openInvoices.map(({ inv, max }) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {formatPKR(max)} due
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={def.dir === "transfer" ? "From account *" : def.dir === "in" ? "Deposit into" : "Pay from"}>
            <select value={form.accountId} onChange={(e) => set({ accountId: e.target.value })} className={inputCls}>
              <option value="">Unassigned</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          {def.dir === "transfer" ? (
            <Field label="To account *">
              <select value={form.toAccountId} onChange={(e) => set({ toAccountId: e.target.value })} className={inputCls}>
                <option value="">Select account...</option>
                {accounts.filter((a) => a.id !== form.accountId).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Method">
              <select value={form.method} onChange={(e) => set({ method: e.target.value })} className={inputCls}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date *">
            <input type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Reference / Cheque #">
            <input type="text" value={form.reference} onChange={(e) => set({ reference: e.target.value })} className={inputCls} placeholder="Optional" />
          </Field>
        </div>

        <Field label="Notes">
          <textarea rows="2" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} placeholder="Optional description shown on the statement" />
        </Field>

        <FormActions onCancel={onClose} saving={saving} label={txn ? "Save Changes" : "Record"} />
      </form>
    </Modal>
  );
}
