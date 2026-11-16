import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  MdMenuBook,
  MdAdd,
  MdSearch,
  MdPrint,
  MdDownload,
  MdEdit,
  MdDelete,
  MdRefresh,
  MdArrowBack,
  MdPayments,
  MdReceiptLong,
  MdPersonAdd,
} from "react-icons/md";
import {
  FinancePage,
  StatCard,
  Modal,
  Field,
  FormActions,
  Spinner,
  Paper,
  PaperSummary,
  inputCls,
  btnCls,
  paperTh,
  paperTd,
  TONE,
} from "../Components/FinanceUI";
import TransactionForm from "../Components/TransactionForm";
import { useFinanceData, useFinanceActions, financeErrorMessage } from "../services/financeService";
import { printElement, downloadStatementPdf } from "../utils/print";
import {
  PARTY_TYPES,
  balanceSide,
  buildLedger,
  displayDate,
  formatAmount,
  formatPKR,
  normName,
  resolveParties,
  round2,
  sumBy,
  todayIso,
} from "../utils/accounting";

const TABS = ["vendor", "agent", "client"];
const balanceText = (balance) => {
  const b = balanceSide(balance);
  return b.side ? `PKR ${formatAmount(b.amount)} ${b.side}` : "PKR 0";
};

function PartyForm({ party, defaultType, existing, onClose, onSaved }) {
  const actions = useFinanceActions();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(party?.id) && !party.virtual;
  const [form, setForm] = useState({
    type: party?.type || defaultType,
    name: party?.name || "",
    phone: party?.phone || "",
    email: party?.email || "",
    address: party?.address || "",
    openingBalance: party?.openingBalance || "",
    openingType: party?.openingType || ((party?.type || defaultType) === "vendor" ? "cr" : "dr"),
    notes: party?.notes || "",
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim().replace(/\s+/g, " ");
    if (!name) return toast.error("Name is required");
    const clash = existing.find(
      (p) => !p.virtual && p.type === form.type && normName(p.name) === normName(name) && p.id !== party?.id
    );
    if (clash) return toast.error(`A ${PARTY_TYPES[form.type].label.toLowerCase()} named "${clash.name}" already exists`);

    setSaving(true);
    try {
      const saved = await actions.save(
        "parties",
        {
          type: form.type,
          name,
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          openingBalance: Math.abs(round2(form.openingBalance)),
          openingType: form.openingType,
          notes: form.notes.trim(),
        },
        editing ? party.id : undefined
      );
      toast.success(editing ? "Party updated" : "Party added");
      onSaved(saved);
    } catch (err) {
      toast.error(financeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Party" : "Add Party"} subtitle="Vendors supply you, agents and clients buy from you" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Type">
            <select
              value={form.type}
              disabled={editing}
              onChange={(e) => set({ type: e.target.value, openingType: e.target.value === "vendor" ? "cr" : "dr" })}
              className={inputCls}
            >
              {TABS.map((t) => (
                <option key={t} value={t}>{PARTY_TYPES[t].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Name *">
            <input type="text" required autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="Company or person" />
          </Field>
          <Field label="Phone">
            <input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputCls} placeholder="0300 0000000" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} placeholder="Optional" />
          </Field>
        </div>
        <Field label="Address">
          <input type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} placeholder="Optional" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Opening balance (PKR)" hint="Balance carried in from before you started using ledgers">
            <input type="number" min="0" step="any" inputMode="decimal" value={form.openingBalance} onChange={(e) => set({ openingBalance: e.target.value })} className={inputCls} placeholder="0" />
          </Field>
          <Field label="Opening balance is">
            <select value={form.openingType} onChange={(e) => set({ openingType: e.target.value })} className={inputCls}>
              <option value="dr">They owe us (Dr)</option>
              <option value="cr">We owe them (Cr)</option>
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows="2" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
        </Field>
        <FormActions onCancel={onClose} saving={saving} label={editing ? "Save Changes" : "Add Party"} />
      </form>
    </Modal>
  );
}

export default function Ledgers() {
  const { data, isLoading, isFetching, error } = useFinanceData();
  const actions = useFinanceActions();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("party");

  const [tabState, setTab] = useState("vendor");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [partyForm, setPartyForm] = useState(null);
  const [txnForm, setTxnForm] = useState(null);
  const paperRef = useRef(null);

  const resolved = useMemo(() => resolveParties(data), [data]);
  const balances = useMemo(() => new Map(resolved.map((p) => [p.id, buildLedger(p).closing])), [resolved]);
  const selected = resolved.find((p) => p.id === selectedId) || null;
  const tab = selected?.type || tabState;
  const ledger = useMemo(() => (selected ? buildLedger(selected, range) : null), [selected, range]);

  const inTab = useMemo(() => resolved.filter((p) => p.type === tab), [resolved, tab]);
  const visible = useMemo(() => {
    const q = normName(search);
    return inTab
      .filter((p) => !q || normName(`${p.name} ${p.phone || ""}`).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inTab, search]);
  const totals = useMemo(() => ({
    receivable: sumBy(inTab, (p) => Math.max(0, balances.get(p.id))),
    payable: sumBy(inTab, (p) => Math.max(0, -balances.get(p.id))),
  }), [inTab, balances]);

  const selectParty = (id) => setParams(id ? { party: id } : {});
  const switchTab = (t) => {
    setTab(t);
    selectParty(null);
  };

  const closing = ledger ? balanceSide(ledger.closing) : null;
  const typeLabel = selected ? PARTY_TYPES[selected.type].label : "";
  const period = range.from || range.to
    ? `${range.from ? displayDate(range.from) : "Start"} to ${range.to ? displayDate(range.to) : "date"}`
    : "All transactions";

  const handleDeleteParty = async () => {
    if (!window.confirm(`Delete ${selected.name}? Their invoices and payments are kept and will still appear under this name.`)) return;
    try {
      await actions.remove("parties", selected.id);
      toast.success("Party deleted");
      selectParty(null);
    } catch (err) {
      toast.error(financeErrorMessage(err));
    }
  };

  const handleDeleteTxn = async (txn) => {
    if (!window.confirm(`Delete this ${formatPKR(txn.amount)} ${txn.type}? Any invoice it settled will be re-opened.`)) return;
    try {
      await actions.removeTransaction(txn);
      toast.success("Transaction deleted");
    } catch (err) {
      toast.error(financeErrorMessage(err));
    }
  };

  const handlePdf = async () => {
    try {
      await downloadStatementPdf({
        title: `${typeLabel.toUpperCase()} LEDGER`,
        meta: [`${typeLabel}: ${selected.name}`, `Period: ${period}`, `Printed: ${displayDate(todayIso())}`],
        details: [
          `${typeLabel.toUpperCase()}: ${selected.name.toUpperCase()}`,
          [selected.phone && `Phone: ${selected.phone}`, selected.email && `Email: ${selected.email}`].filter(Boolean).join("   "),
          selected.address,
        ].filter(Boolean),
        summary: [
          { label: "Brought forward", value: balanceText(ledger.broughtForward) },
          { label: "Total debit", value: formatPKR(ledger.totalDebit) },
          { label: "Total credit", value: formatPKR(ledger.totalCredit) },
          { label: `Closing — ${closing.meaning}`, value: balanceText(ledger.closing), tone: closing.side ? "unpaid" : "profit" },
        ],
        head: ["Date", "Type", "Ref #", "Particulars", "Debit", "Credit", "Balance"],
        body: ledger.rows.map((r) => [
          displayDate(r.date), r.type, r.ref || "-", r.description,
          r.debit ? formatAmount(r.debit) : "", r.credit ? formatAmount(r.credit) : "", balanceText(r.balance).replace("PKR ", ""),
        ]),
        foot: [["", "", "", "Totals / Closing balance", formatAmount(ledger.totalDebit), formatAmount(ledger.totalCredit), balanceText(ledger.closing).replace("PKR ", "")]],
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" } },
        fileName: `RS_Ledger_${selected.name.replace(/[^\w]+/g, "_")}_${todayIso()}.pdf`,
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not generate the PDF. Use Print instead.");
    }
  };

  const txnById = useMemo(() => new Map((selected?.transactions || []).map((t) => [t.id, t])), [selected]);

  return (
    <FinancePage
      title="Ledgers"
      subtitle="Vendor, agent and client statements of account — RS Travels and Tours"
      Icon={MdMenuBook}
      error={error}
      actions={
        <>
          <button onClick={() => actions.refresh()} className={btnCls.ghost} title="Refresh data">
            <MdRefresh size={18} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setPartyForm({})} className={btnCls.primary}>
            <MdAdd size={20} /> Add Party
          </button>
        </>
      }
    >
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 mb-5 bg-white border border-neutral-200 p-1.5 rounded-2xl">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${tab === t ? "bg-neutral-900 text-white shadow" : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"}`}
          >
            {PARTY_TYPES[t].plural}
            <span className="ml-1.5 text-xs font-medium opacity-70">{resolved.filter((p) => p.type === t).length}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={`${PARTY_TYPES[tab].plural}`} value={inTab.length} hint="With a ledger" />
        <StatCard label="Receivable (they owe us)" value={formatPKR(totals.receivable)} tone={totals.receivable ? "unpaid" : "neutral"} hint="Unpaid to us" />
        <StatCard label="Payable (we owe them)" value={formatPKR(totals.payable)} tone={totals.payable ? "unpaid" : "neutral"} hint="Unpaid by us" />
      </div>

      {isLoading ? (
        <Spinner label="Loading ledgers..." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Party list */}
          <aside className={`lg:col-span-4 bg-white border border-neutral-200 rounded-3xl overflow-hidden ${selected ? "hidden lg:block" : ""}`}>
            <div className="p-3 border-b border-neutral-200">
              <div className="relative">
                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 text-lg" />
                <input
                  type="search"
                  placeholder={`Search ${PARTY_TYPES[tab].plural.toLowerCase()}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
            {visible.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                No {PARTY_TYPES[tab].plural.toLowerCase()} yet.
                <button onClick={() => setPartyForm({})} className="block mx-auto mt-3 text-blue-700 font-semibold cursor-pointer">
                  Add one
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200 max-h-[70vh] overflow-y-auto">
                {visible.map((p) => {
                  const b = balanceSide(balances.get(p.id));
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => selectParty(p.id)}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition cursor-pointer ${p.id === selectedId ? "bg-blue-600/15" : "hover:bg-neutral-100"}`}
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-neutral-900 truncate">{p.name}</span>
                          <span className="block text-[11px] text-neutral-500">
                            {p.virtual ? "From invoices — not registered" : p.phone || "No phone"}
                          </span>
                        </span>
                        <span className={`text-sm font-bold whitespace-nowrap ${b.side ? TONE.unpaid.dark : TONE.profit.dark}`}>
                          {b.side ? `${formatAmount(b.amount)} ${b.side}` : "Settled"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Statement */}
          <section className="lg:col-span-8 min-w-0">
            {!selected ? (
              <div className="hidden lg:flex bg-white border border-dashed border-neutral-200 rounded-3xl p-16 items-center justify-center text-neutral-500 text-sm">
                Select a party to open its ledger.
              </div>
            ) : (
              <>
                <button onClick={() => selectParty(null)} className={`${btnCls.ghost} lg:hidden mb-4`}>
                  <MdArrowBack size={18} /> All {PARTY_TYPES[tab].plural.toLowerCase()}
                </button>

                <div className="bg-white border border-neutral-200 rounded-2xl p-3 sm:p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                    <Field label="From">
                      <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="To">
                      <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} className={inputCls} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setTxnForm({ preset: { type: selected.type === "vendor" ? "payment" : "receipt", partyId: selected.id } })}
                      className={btnCls.primary}
                    >
                      <MdPayments size={18} /> {selected.type === "vendor" ? "Pay Vendor" : "Receive Payment"}
                    </button>
                    <Link to={`/invoices?new=${selected.type}&party=${encodeURIComponent(selected.id)}`} className={btnCls.ghost}>
                      <MdReceiptLong size={18} /> {selected.type === "vendor" ? "New Bill" : "New Invoice"}
                    </Link>
                    <button onClick={() => printElement(paperRef.current)} className={btnCls.ghost}>
                      <MdPrint size={18} /> Print
                    </button>
                    <button onClick={handlePdf} className={btnCls.ghost}>
                      <MdDownload size={18} /> PDF
                    </button>
                    {selected.virtual ? (
                      <button onClick={() => setPartyForm(selected)} className={btnCls.ghost}>
                        <MdPersonAdd size={18} /> Register
                      </button>
                    ) : (
                      <>
                        <button onClick={() => setPartyForm(selected)} className={btnCls.ghost} title="Edit party">
                          <MdEdit size={18} />
                        </button>
                        <button onClick={handleDeleteParty} className={`${btnCls.ghost} text-rose-700`} title="Delete party">
                          <MdDelete size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <Paper
                  innerRef={paperRef}
                  title={`${typeLabel} Ledger`}
                  meta={[`${typeLabel}: ${selected.name}`, `Period: ${period}`, `Printed: ${displayDate(todayIso())}`]}
                >
                  <div className="avoid-break border-2 border-slate-900 rounded-xl p-4 mb-5">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{typeLabel} name</p>
                    <p className="text-2xl font-black text-slate-900 uppercase tracking-tight break-words">{selected.name}</p>
                    <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-5 gap-y-0.5">
                      <span>Statement of account</span>
                      {selected.phone && <span>Phone: {selected.phone}</span>}
                      {selected.email && <span>Email: {selected.email}</span>}
                      {selected.address && <span>Address: {selected.address}</span>}
                    </div>
                  </div>

                  <PaperSummary
                    items={[
                      { label: "Brought forward", value: balanceText(ledger.broughtForward) },
                      { label: "Total debit", value: formatPKR(ledger.totalDebit) },
                      { label: "Total credit", value: formatPKR(ledger.totalCredit) },
                      { label: `Closing — ${closing.meaning}`, value: balanceText(ledger.closing), tone: closing.side ? "unpaid" : "profit" },
                    ]}
                  />

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[640px] text-xs border-collapse">
                      <thead>
                        <tr className="bg-neutral-900 text-white uppercase text-[10px] tracking-wider">
                          <th className={paperTh}>Date</th>
                          <th className={paperTh}>Type</th>
                          <th className={paperTh}>Ref #</th>
                          <th className={paperTh}>Particulars</th>
                          <th className={`${paperTh} text-right`}>Debit</th>
                          <th className={`${paperTh} text-right`}>Credit</th>
                          <th className={`${paperTh} text-right`}>Balance</th>
                          <th className={`${paperTh} no-print`} />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {range.from && (
                          <tr className="bg-slate-50 font-semibold">
                            <td className={paperTd}>{displayDate(range.from)}</td>
                            <td className={paperTd} colSpan={5}>Balance brought forward</td>
                            <td className={`${paperTd} text-right whitespace-nowrap`}>{balanceText(ledger.broughtForward).replace("PKR ", "")}</td>
                            <td className={`${paperTd} no-print`} />
                          </tr>
                        )}
                        {ledger.rows.length === 0 && (
                          <tr>
                            <td className={`${paperTd} text-center text-neutral-500 py-8`} colSpan={8}>No entries in this period.</td>
                          </tr>
                        )}
                        {ledger.rows.map((r, i) => {
                          const txn = r.order === 3 ? txnById.get(r.sourceId) : null;
                          return (
                            <tr key={`${r.seq}-${i}`} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                              <td className={`${paperTd} whitespace-nowrap`}>{displayDate(r.date)}</td>
                              <td className={`${paperTd} font-semibold`}>{r.type}</td>
                              <td className={`${paperTd} font-mono`}>{r.ref || "—"}</td>
                              <td className={paperTd}>{r.description}</td>
                              <td className={`${paperTd} text-right whitespace-nowrap`}>{r.debit ? formatAmount(r.debit) : ""}</td>
                              <td className={`${paperTd} text-right whitespace-nowrap`}>{r.credit ? formatAmount(r.credit) : ""}</td>
                              <td className={`${paperTd} text-right font-bold whitespace-nowrap`}>{balanceText(r.balance).replace("PKR ", "")}</td>
                              <td className={`${paperTd} no-print whitespace-nowrap text-right`}>
                                {txn && (
                                  <>
                                    <button onClick={() => setTxnForm({ txn })} className="p-1 text-neutral-600 hover:text-blue-600 cursor-pointer" title="Edit"><MdEdit size={15} /></button>
                                    <button onClick={() => handleDeleteTxn(txn)} className="p-1 text-neutral-600 hover:text-red-600 cursor-pointer" title="Delete"><MdDelete size={15} /></button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-900">
                          <td className={paperTd} colSpan={4}>Totals / Closing balance</td>
                          <td className={`${paperTd} text-right whitespace-nowrap`}>{formatAmount(ledger.totalDebit)}</td>
                          <td className={`${paperTd} text-right whitespace-nowrap`}>{formatAmount(ledger.totalCredit)}</td>
                          <td className={`${paperTd} text-right whitespace-nowrap ${closing.side ? TONE.unpaid.paper : TONE.profit.paper}`}>
                            {balanceText(ledger.closing).replace("PKR ", "")}
                          </td>
                          <td className={`${paperTd} no-print`} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <p className="text-[11px] text-neutral-500 mt-3">
                    Dr = amount receivable by RS Travels and Tours from the party. Cr = amount payable by RS Travels and Tours to the party.
                  </p>
                </Paper>
              </>
            )}
          </section>
        </div>
      )}

      {partyForm && (
        <PartyForm
          party={partyForm.id ? partyForm : null}
          defaultType={tab}
          existing={resolved}
          onClose={() => setPartyForm(null)}
          onSaved={(saved) => {
            setPartyForm(null);
            selectParty(saved.id);
          }}
        />
      )}
      {txnForm && (
        <TransactionForm
          txn={txnForm.txn}
          preset={txnForm.preset}
          types={["receipt", "payment"]}
          parties={resolved}
          accounts={data.accounts}
          onClose={() => setTxnForm(null)}
        />
      )}
    </FinancePage>
  );
}
