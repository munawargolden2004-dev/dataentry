import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  MdAccountBalance,
  MdAdd,
  MdPrint,
  MdDownload,
  MdEdit,
  MdDelete,
  MdRefresh,
  MdSwapHoriz,
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
import { printElement, downloadStatementPdf, PDF_TONES } from "../utils/print";
import {
  accountBalances,
  accountStatement,
  buildMovements,
  combinedStatement,
  displayDate,
  formatAmount,
  formatPKR,
  monthLabel,
  monthOf,
  monthlyCash,
  resolveParties,
  round2,
  sumBy,
  todayIso,
} from "../utils/accounting";

const ACCOUNT_TYPES = ["Bank Account", "Cash in Hand", "Mobile Wallet"];
const ALL = "all";
const UNASSIGNED = "unassigned";

function AccountForm({ account, onClose }) {
  const actions = useFinanceActions();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: account?.name || "",
    type: account?.type || ACCOUNT_TYPES[0],
    bankName: account?.bankName || "",
    accountTitle: account?.accountTitle || "",
    accountNumber: account?.accountNumber || "",
    iban: account?.iban || "",
    openingBalance: account?.openingBalance ?? "",
    notes: account?.notes || "",
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Account name is required");
    setSaving(true);
    try {
      await actions.save(
        "accounts",
        {
          name: form.name.trim(),
          type: form.type,
          bankName: form.bankName.trim(),
          accountTitle: form.accountTitle.trim(),
          accountNumber: form.accountNumber.trim(),
          iban: form.iban.trim(),
          openingBalance: round2(form.openingBalance),
          notes: form.notes.trim(),
        },
        account?.id
      );
      toast.success(account ? "Account updated" : "Account added");
      onClose();
    } catch (err) {
      toast.error(financeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={account ? "Edit Account" : "Add Account"} subtitle="Bank account, cash drawer or mobile wallet" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Account name *">
            <input type="text" required autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="e.g. HBL Current / Office Cash" />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => set({ type: e.target.value })} className={inputCls}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Bank / provider">
            <input type="text" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} className={inputCls} placeholder="e.g. Habib Bank Limited" />
          </Field>
          <Field label="Account title">
            <input type="text" value={form.accountTitle} onChange={(e) => set({ accountTitle: e.target.value })} className={inputCls} placeholder="RS Travels and Tours" />
          </Field>
          <Field label="Account number">
            <input type="text" value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} className={inputCls} />
          </Field>
          <Field label="IBAN">
            <input type="text" value={form.iban} onChange={(e) => set({ iban: e.target.value })} className={inputCls} placeholder="PK00 XXXX ..." />
          </Field>
        </div>
        <Field label="Opening balance (PKR)" hint="What was in the account before the first entry recorded here">
          <input type="number" step="any" inputMode="decimal" value={form.openingBalance} onChange={(e) => set({ openingBalance: e.target.value })} className={inputCls} placeholder="0" />
        </Field>
        <Field label="Notes">
          <textarea rows="2" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
        </Field>
        <FormActions onCancel={onClose} saving={saving} label={account ? "Save Changes" : "Add Account"} />
      </form>
    </Modal>
  );
}

export default function BankAccounts() {
  const { data, isLoading, isFetching, error } = useFinanceData();
  const actions = useFinanceActions();
  const { accounts } = data;

  const [scope, setScope] = useState(ALL);
  const [range, setRange] = useState(() => ({ from: `${monthOf(todayIso())}-01`, to: todayIso() }));
  const [accountForm, setAccountForm] = useState(null);
  const [txnForm, setTxnForm] = useState(null);
  const paperRef = useRef(null);

  const movements = useMemo(() => buildMovements(data), [data]);
  const balances = useMemo(() => accountBalances(accounts, movements), [accounts, movements]);
  const resolved = useMemo(() => resolveParties(data), [data]);
  const txnById = useMemo(() => new Map(data.transactions.map((t) => [t.id, t])), [data.transactions]);

  const account = accounts.find((a) => a.id === scope) || null;
  // A deleted account's id can linger in state; fall back to "all".
  const activeScope = account ? scope : scope === UNASSIGNED ? UNASSIGNED : ALL;
  const unassigned = balances.get(null);
  const hasUnassigned = useMemo(() => movements.some((m) => m.accountId === null), [movements]);
  const totalBalance = round2(sumBy(accounts, (a) => balances.get(a.id)) + unassigned);

  const statement = useMemo(() => {
    if (activeScope === ALL) return combinedStatement(accounts, movements, range);
    return accountStatement(account, movements, range);
  }, [activeScope, account, accounts, movements, range]);

  const months = useMemo(
    () => monthlyCash(movements, activeScope === ALL ? undefined : account ? account.id : null),
    [movements, activeScope, account]
  );
  const thisMonth = useMemo(() => {
    const key = monthOf(todayIso());
    return monthlyCash(movements).find((m) => m.month === key) || { income: 0, costs: 0, expenses: 0, netProfit: 0 };
  }, [movements]);

  const scopeName = activeScope === ALL ? "All accounts" : account ? account.name : "Unassigned entries";
  const period = range.from || range.to
    ? `${range.from ? displayDate(range.from) : "Start"} to ${range.to ? displayDate(range.to) : "date"}`
    : "All transactions";

  const handleDeleteAccount = async (a) => {
    if (!window.confirm(`Delete "${a.name}"? Its entries are kept and move to "Unassigned".`)) return;
    try {
      await actions.remove("accounts", a.id);
      toast.success("Account deleted");
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

  const outTone = (row) => (row.kind === "expense" ? "expense" : "neutral");

  const handlePdf = async () => {
    try {
      await downloadStatementPdf({
        title: "ACCOUNT STATEMENT",
        meta: [`Period: ${period}`, `Printed: ${displayDate(todayIso())}`],
        details: [
          scopeName,
          account && [account.type, account.bankName].filter(Boolean).join(" — "),
          account && [account.accountTitle && `Title: ${account.accountTitle}`, account.accountNumber && `A/C: ${account.accountNumber}`, account.iban && `IBAN: ${account.iban}`].filter(Boolean).join("   "),
        ].filter(Boolean),
        summary: [
          { label: "Opening balance", value: formatPKR(statement.broughtForward) },
          { label: "Money in", value: formatPKR(statement.totalIn), tone: "profit" },
          { label: "Money out", value: formatPKR(statement.totalOut), tone: "expense" },
          { label: "Closing balance", value: formatPKR(statement.closing), tone: statement.closing < 0 ? "unpaid" : "ink" },
        ],
        head: ["Date", "Particulars", "Party", "Ref #", "Money in", "Money out", "Balance"],
        body: statement.rows.map((r) => [
          displayDate(r.date), r.description, r.party || "-", r.ref || "-",
          r.in ? formatAmount(r.in) : "", r.out ? formatAmount(r.out) : "", formatPKR(r.balance).replace("PKR ", ""),
        ]),
        foot: [["", "Totals / Closing balance", "", "", formatAmount(statement.totalIn), formatAmount(statement.totalOut), formatPKR(statement.closing).replace("PKR ", "")]],
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right", fontStyle: "bold" } },
        didParseCell: (cell) => {
          if (cell.section !== "body") return;
          const row = statement.rows[cell.row.index];
          if (cell.column.index === 4) cell.cell.styles.textColor = PDF_TONES.profit;
          if (cell.column.index === 5 && row.kind === "expense") cell.cell.styles.textColor = PDF_TONES.expense;
          if (cell.column.index === 6 && row.balance < 0) cell.cell.styles.textColor = PDF_TONES.unpaid;
        },
        fileName: `RS_Statement_${scopeName.replace(/[^\w]+/g, "_")}_${todayIso()}.pdf`,
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not generate the PDF. Use Print instead.");
    }
  };

  const scopeBtn = (active) =>
    `text-left rounded-2xl border p-4 transition cursor-pointer min-w-0 ${active ? "bg-blue-600/15 border-blue-500/60" : "bg-white border-neutral-200 hover:border-neutral-400"}`;

  return (
    <FinancePage
      title="Bank & Cash"
      subtitle="Account balances, money in and out, monthly income, expenses and net profit"
      Icon={MdAccountBalance}
      error={error}
      actions={
        <>
          <button onClick={() => actions.refresh()} className={btnCls.ghost} title="Refresh data">
            <MdRefresh size={18} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setAccountForm({})} className={btnCls.ghost}>
            <MdAdd size={18} /> Add Account
          </button>
          <button onClick={() => setTxnForm({ preset: { accountId: account?.id } })} className={btnCls.primary}>
            <MdSwapHoriz size={20} /> Record Transaction
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total balance" value={formatPKR(totalBalance)} tone={totalBalance < 0 ? "unpaid" : "neutral"} hint={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`} />
        <StatCard label="Income this month" value={formatPKR(thisMonth.income)} tone="profit" hint="Money received" />
        <StatCard label="Expenses this month" value={formatPKR(thisMonth.expenses)} tone="expense" hint={`+ ${formatPKR(thisMonth.costs)} paid to vendors`} />
        <StatCard label="Net profit this month" value={formatPKR(thisMonth.netProfit)} tone={thisMonth.netProfit < 0 ? "unpaid" : "profit"} hint="Cash basis" />
      </div>

      {isLoading ? (
        <Spinner label="Loading accounts..." />
      ) : (
        <>
          {/* Accounts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <button onClick={() => setScope(ALL)} className={scopeBtn(activeScope === ALL)}>
              <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wider">All accounts</p>
              <p className={`text-xl font-extrabold mt-1 ${totalBalance < 0 ? TONE.unpaid.dark : "text-neutral-900"}`}>{formatPKR(totalBalance)}</p>
              <p className="text-xs text-neutral-500 mt-1">Combined cash position</p>
            </button>
            {accounts.map((a) => {
              const balance = balances.get(a.id);
              return (
                <div key={a.id} className={`${scopeBtn(activeScope === a.id)} flex flex-col`} onClick={() => setScope(a.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setScope(a.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wider">{a.type}</p>
                      <p className="font-bold text-neutral-900 truncate">{a.name}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setAccountForm(a); }} className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 cursor-pointer" title="Edit account"><MdEdit size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAccount(a); }} className="p-1.5 rounded-lg text-neutral-600 hover:text-rose-800 hover:bg-neutral-100 cursor-pointer" title="Delete account"><MdDelete size={16} /></button>
                    </div>
                  </div>
                  <p className={`text-xl font-extrabold mt-2 ${balance < 0 ? TONE.unpaid.dark : "text-neutral-900"}`}>{formatPKR(balance)}</p>
                  <p className="text-xs text-neutral-500 mt-1 truncate">
                    {[a.bankName, a.accountNumber].filter(Boolean).join(" · ") || "No bank details"}
                  </p>
                </div>
              );
            })}
            {hasUnassigned && (
              <button onClick={() => setScope(UNASSIGNED)} className={scopeBtn(activeScope === UNASSIGNED)}>
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Unassigned</p>
                <p className={`text-xl font-extrabold mt-1 ${unassigned < 0 ? TONE.unpaid.dark : "text-neutral-900"}`}>{formatPKR(unassigned)}</p>
                <p className="text-xs text-neutral-500 mt-1">Invoices / expenses saved without an account</p>
              </button>
            )}
          </div>
          {accounts.length === 0 && (
            <p className="text-sm text-neutral-600 mb-6">
              No accounts yet. Add your bank accounts and cash drawer, then pick one on each invoice, expense and payment to track its balance.
            </p>
          )}

          {/* Month by month */}
          <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden mb-6">
            <div className="px-4 sm:px-6 py-4 border-b border-neutral-200">
              <h2 className="font-bold text-neutral-900">Month by month — {scopeName}</h2>
              <p className="text-xs text-neutral-600">Net profit = income received − vendor payments − expenses (owner deposits, withdrawals and transfers are not profit)</p>
            </div>
            {months.length === 0 ? (
              <p className="p-8 text-center text-sm text-neutral-500">No money has moved yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-[11px] tracking-wider text-right">
                      <th className="py-3 px-4 font-bold text-left">Month</th>
                      <th className="py-3 px-4 font-bold">Money in</th>
                      <th className="py-3 px-4 font-bold">Money out</th>
                      <th className="py-3 px-4 font-bold">Income</th>
                      <th className="py-3 px-4 font-bold">Vendor payments</th>
                      <th className="py-3 px-4 font-bold">Expenses</th>
                      <th className="py-3 px-4 font-bold">Net profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {months.map((m) => (
                      <tr key={m.month} className="text-right hover:bg-neutral-100">
                        <td className="py-3 px-4 text-left font-semibold text-neutral-900 whitespace-nowrap">{monthLabel(m.month)}</td>
                        <td className="py-3 px-4 text-neutral-700">{formatAmount(m.moneyIn)}</td>
                        <td className="py-3 px-4 text-neutral-700">{formatAmount(m.moneyOut)}</td>
                        <td className={`py-3 px-4 font-semibold ${TONE.profit.dark}`}>{formatAmount(m.income)}</td>
                        <td className="py-3 px-4 text-neutral-700">{formatAmount(m.costs)}</td>
                        <td className={`py-3 px-4 font-semibold ${TONE.expense.dark}`}>{formatAmount(m.expenses)}</td>
                        <td className={`py-3 px-4 font-extrabold whitespace-nowrap ${m.netProfit < 0 ? TONE.unpaid.dark : TONE.profit.dark}`}>{formatPKR(m.netProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Statement */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-3 sm:p-4 mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="grid grid-cols-2 gap-3 flex-1 sm:max-w-md">
              <Field label="From">
                <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} className={inputCls} />
              </Field>
              <Field label="To">
                <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setRange({ from: "", to: "" })} className={btnCls.ghost}>All time</button>
              <button onClick={() => printElement(paperRef.current)} className={btnCls.ghost}><MdPrint size={18} /> Print</button>
              <button onClick={handlePdf} className={btnCls.ghost}><MdDownload size={18} /> PDF</button>
            </div>
          </div>

          <Paper innerRef={paperRef} title="Account Statement" meta={[`Period: ${period}`, `Printed: ${displayDate(todayIso())}`]}>
            <div className="avoid-break bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Account</p>
              <p className="text-lg font-bold text-slate-900">{scopeName}</p>
              {account && (
                <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-x-5 gap-y-0.5">
                  <span>{account.type}</span>
                  {account.bankName && <span>{account.bankName}</span>}
                  {account.accountTitle && <span>Title: {account.accountTitle}</span>}
                  {account.accountNumber && <span>A/C: {account.accountNumber}</span>}
                  {account.iban && <span>IBAN: {account.iban}</span>}
                </div>
              )}
            </div>

            <PaperSummary
              items={[
                { label: "Opening balance", value: formatPKR(statement.broughtForward) },
                { label: "Money in", value: formatPKR(statement.totalIn), tone: "profit" },
                { label: "Money out", value: formatPKR(statement.totalOut), tone: "expense" },
                { label: "Closing balance", value: formatPKR(statement.closing), tone: statement.closing < 0 ? "unpaid" : "neutral" },
              ]}
            />

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[680px] text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-900 text-white uppercase text-[10px] tracking-wider">
                    <th className={paperTh}>Date</th>
                    <th className={paperTh}>Particulars</th>
                    <th className={paperTh}>Party</th>
                    <th className={paperTh}>Ref #</th>
                    <th className={`${paperTh} text-right`}>Money in</th>
                    <th className={`${paperTh} text-right`}>Money out</th>
                    <th className={`${paperTh} text-right`}>Balance</th>
                    <th className={`${paperTh} no-print`} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-slate-50 font-semibold">
                    <td className={paperTd}>{range.from ? displayDate(range.from) : "—"}</td>
                    <td className={paperTd} colSpan={5}>Opening balance</td>
                    <td className={`${paperTd} text-right whitespace-nowrap`}>{formatAmount(statement.broughtForward)}</td>
                    <td className={`${paperTd} no-print`} />
                  </tr>
                  {statement.rows.length === 0 && (
                    <tr>
                      <td className={`${paperTd} text-center text-neutral-500 py-8`} colSpan={8}>No entries in this period.</td>
                    </tr>
                  )}
                  {statement.rows.map((r, i) => {
                    const txn = r.sourceId ? txnById.get(r.sourceId) : null;
                    return (
                      <tr key={`${r.seq}-${i}`} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                        <td className={`${paperTd} whitespace-nowrap`}>{displayDate(r.date)}</td>
                        <td className={paperTd}>
                          {r.description}
                          {r.kind === "expense" && <span className={`ml-1.5 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${TONE.expense.chip}`}>Expense</span>}
                        </td>
                        <td className={paperTd}>{r.party || "—"}</td>
                        <td className={`${paperTd} font-mono`}>{r.ref || "—"}</td>
                        <td className={`${paperTd} text-right whitespace-nowrap font-semibold ${TONE.profit.paper}`}>{r.in ? formatAmount(r.in) : ""}</td>
                        <td className={`${paperTd} text-right whitespace-nowrap font-semibold ${TONE[outTone(r)].paper}`}>{r.out ? formatAmount(r.out) : ""}</td>
                        <td className={`${paperTd} text-right font-bold whitespace-nowrap ${r.balance < 0 ? TONE.unpaid.paper : ""}`}>{formatPKR(r.balance).replace("PKR ", "")}</td>
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
                    <td className={`${paperTd} text-right whitespace-nowrap`}>{formatAmount(statement.totalIn)}</td>
                    <td className={`${paperTd} text-right whitespace-nowrap`}>{formatAmount(statement.totalOut)}</td>
                    <td className={`${paperTd} text-right whitespace-nowrap ${statement.closing < 0 ? TONE.unpaid.paper : ""}`}>{formatPKR(statement.closing).replace("PKR ", "")}</td>
                    <td className={`${paperTd} no-print`} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Paper>
        </>
      )}

      {accountForm && <AccountForm account={accountForm.id ? accountForm : null} onClose={() => setAccountForm(null)} />}
      {txnForm && (
        <TransactionForm
          txn={txnForm.txn}
          preset={txnForm.preset}
          parties={resolved}
          accounts={accounts}
          onClose={() => setTxnForm(null)}
        />
      )}
    </FinancePage>
  );
}
