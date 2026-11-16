import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { MdAssessment, MdPrint, MdDownload, MdRefresh, MdChevronLeft, MdChevronRight } from "react-icons/md";
import {
  FinancePage,
  StatCard,
  Field,
  Spinner,
  Paper,
  PaperSummary,
  inputCls,
  btnCls,
  paperTh,
  paperTd,
  TONE,
} from "../Components/FinanceUI";
import { useFinanceData, useFinanceActions, useAllBookings } from "../services/financeService";
import { printElement, downloadStatementPdf, PDF_TONES } from "../utils/print";
import {
  SHEET_SOURCES,
  buildMonthSheet,
  displayDate,
  formatAmount,
  formatPKR,
  localIso,
  monthLabel,
  monthOf,
  todayIso,
} from "../utils/accounting";

const SOURCE_KEY = "rs_sheet_source";
const FILTERS = {
  all: "All entries",
  unpaid: "Unpaid",
  expense: "Expenses",
  profit: "Profit",
};

// Red when anything on the entry is still unpaid, otherwise blue for a
// cost/expense and green for an entry that earned profit.
const rowTone = (e) => (e.unpaid > 0 ? "unpaid" : e.tone === "expense" ? "expense" : "profit");
const profitTone = (e) => (e.profit > 0 ? "profit" : e.profit < 0 ? (e.tone === "expense" ? "expense" : "unpaid") : "neutral");
const ROW_BG = { unpaid: "bg-red-50/70", expense: "bg-blue-50/70", profit: "bg-green-50/60" };
const ROW_EDGE = { unpaid: "border-l-red-500", expense: "border-l-blue-500", profit: "border-l-green-500" };
const amt = (v) => (v ? formatAmount(v) : "");
const signed = (v) => (v ? `${v < 0 ? "-" : ""}${formatAmount(v)}` : "0");

const shiftMonth = (month, by) => {
  const [y, m] = month.split("-").map(Number);
  return monthOf(localIso(new Date(y, m - 1 + by, 1)));
};

export default function BalanceSheet() {
  const { data, isLoading, isFetching, error } = useFinanceData();
  const actions = useFinanceActions();
  const [month, setMonth] = useState(() => monthOf(todayIso()));
  const [source, setSourceState] = useState(() => {
    try {
      const saved = localStorage.getItem(SOURCE_KEY);
      return SHEET_SOURCES[saved] ? saved : "all";
    } catch {
      return "all";
    }
  });
  const [filter, setFilter] = useState("all");
  const paperRef = useRef(null);

  const bookingsQuery = useAllBookings(source !== "invoices");
  const setSource = (value) => {
    setSourceState(value);
    try { localStorage.setItem(SOURCE_KEY, value); } catch { /* storage unavailable */ }
  };

  const sheet = useMemo(
    () => buildMonthSheet({ month, source, bookings: bookingsQuery.bookings, ...data }),
    [month, source, bookingsQuery.bookings, data]
  );
  const { totals, position } = sheet;
  const entries = useMemo(
    () => (filter === "all" ? sheet.entries : sheet.entries.filter((e) => rowTone(e) === filter)),
    [sheet.entries, filter]
  );
  const counts = useMemo(() => {
    const c = { all: sheet.entries.length, unpaid: 0, expense: 0, profit: 0 };
    sheet.entries.forEach((e) => { c[rowTone(e)] += 1; });
    return c;
  }, [sheet.entries]);

  const loading = isLoading || (source !== "invoices" && bookingsQuery.isLoading);
  const label = monthLabel(month);

  const handlePdf = async () => {
    try {
      await downloadStatementPdf({
        landscape: true,
        title: "MONTHLY BALANCE SHEET",
        meta: [label, `Basis: ${SHEET_SOURCES[source]}`, `Printed: ${displayDate(todayIso())}`],
        summary: [
          { label: "Income / sales", value: formatPKR(totals.income), tone: "profit" },
          { label: "Costs + expenses", value: formatPKR(totals.cost + totals.expenses), tone: "expense" },
          { label: "Unpaid", value: formatPKR(totals.unpaid), tone: "unpaid" },
          { label: "Net profit", value: formatPKR(totals.netProfit), tone: totals.netProfit < 0 ? "unpaid" : "profit" },
          { label: `Net position ${displayDate(position.asOf)}`, value: formatPKR(position.net) },
        ],
        head: ["Date", "Type", "Ref #", "Party / Particulars", "Income", "Cost / Expense", "Paid", "Unpaid", "Profit"],
        body: entries.map((e) => [
          displayDate(e.date), e.type, e.ref || "-", [e.party, e.description].filter(Boolean).join(" — "),
          amt(e.income), amt(e.cost + e.expense), amt(e.settled), amt(e.unpaid), signed(e.profit),
        ]),
        foot: filter === "all"
          ? [["", "", "", "Month totals", formatAmount(totals.income), formatAmount(totals.cost + totals.expenses), "", formatAmount(totals.unpaid), signed(totals.netProfit)]]
          : undefined,
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right", fontStyle: "bold" } },
        didParseCell: (cell) => {
          if (cell.section !== "body") return;
          const e = entries[cell.row.index];
          const col = cell.column.index;
          if (col === 1) cell.cell.styles.textColor = PDF_TONES[rowTone(e)];
          if (col === 4) cell.cell.styles.textColor = PDF_TONES.profit;
          if (col === 5) cell.cell.styles.textColor = PDF_TONES.expense;
          if (col === 7) cell.cell.styles.textColor = PDF_TONES.unpaid;
          if (col === 8) cell.cell.styles.textColor = PDF_TONES[profitTone(e)] || PDF_TONES.ink;
        },
        fileName: `RS_Balance_Sheet_${month}.pdf`,
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not generate the PDF. Use Print instead.");
    }
  };

  return (
    <FinancePage
      title="Month-End Balance Sheet"
      subtitle="Every transaction of the month — red unpaid, blue expenses, green profit"
      Icon={MdAssessment}
      error={error || bookingsQuery.error}
      actions={
        <>
          <button onClick={() => actions.refresh()} className={btnCls.ghost} title="Refresh data">
            <MdRefresh size={18} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button onClick={() => printElement(paperRef.current)} className={btnCls.ghost}>
            <MdPrint size={18} /> Print
          </button>
          <button onClick={handlePdf} className={btnCls.primary}>
            <MdDownload size={18} /> PDF
          </button>
        </>
      }
    >
      <div className="bg-white border border-neutral-200 rounded-2xl p-3 sm:p-4 mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Month">
          <div className="flex gap-2">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className={btnCls.ghost} aria-label="Previous month"><MdChevronLeft size={20} /></button>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputCls} />
            <button onClick={() => setMonth(shiftMonth(month, 1))} className={btnCls.ghost} aria-label="Next month"><MdChevronRight size={20} /></button>
          </div>
        </Field>
        <Field label="Profit is counted from" hint="Pick one basis if you both record a booking and raise an invoice for the same sale, so it is not counted twice">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
            {Object.entries(SHEET_SOURCES).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Income / sales" value={formatPKR(totals.income)} tone="profit" hint={`${totals.count} entries in ${label}`} />
        <StatCard label="Expenses" value={formatPKR(totals.expenses)} tone="expense" hint={totals.cost ? `+ ${formatPKR(totals.cost)} vendor bills` : "Office & running costs"} />
        <StatCard label="Unpaid" value={formatPKR(totals.unpaid)} tone={totals.unpaid ? "unpaid" : "neutral"} hint={`${formatPKR(totals.unpaidReceivable)} to receive · ${formatPKR(totals.unpaidPayable)} to pay`} />
        <StatCard label="Net profit" value={formatPKR(totals.netProfit)} tone={totals.netProfit < 0 ? "unpaid" : "profit"} hint={`Gross ${formatPKR(totals.grossProfit)} − expenses`} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(FILTERS).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${filter === key ? "bg-neutral-900 border-blue-500 text-white" : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400"}`}
          >
            {key !== "all" && <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${key === "unpaid" ? "bg-red-500" : key === "expense" ? "bg-neutral-100" : "bg-green-500"}`} />}
            {text} <span className="opacity-70">({counts[key]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Building the balance sheet..." />
      ) : (
        <Paper
          innerRef={paperRef}
          title="Monthly Balance Sheet"
          meta={[label, `Basis: ${SHEET_SOURCES[source]}`, `Printed: ${displayDate(todayIso())}`]}
        >
          <PaperSummary
            items={[
              { label: "Income / sales", value: formatPKR(totals.income), tone: "profit" },
              { label: "Costs + expenses", value: formatPKR(totals.cost + totals.expenses), tone: "expense" },
              { label: "Unpaid", value: formatPKR(totals.unpaid), tone: "unpaid" },
              { label: "Net profit", value: formatPKR(totals.netProfit), tone: totals.netProfit < 0 ? "unpaid" : "profit" },
            ]}
          />

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600 mb-3">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 mr-1.5 align-middle" />Unpaid — still to receive or to pay</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-neutral-900 mr-1.5 align-middle" />Expense / cost</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500 mr-1.5 align-middle" />Profit — fully settled</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[860px] text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-white uppercase text-[10px] tracking-wider">
                  <th className={paperTh}>Date</th>
                  <th className={paperTh}>Type</th>
                  <th className={paperTh}>Ref #</th>
                  <th className={paperTh}>Party / Particulars</th>
                  <th className={`${paperTh} text-right`}>Income</th>
                  <th className={`${paperTh} text-right`}>Cost / Expense</th>
                  <th className={`${paperTh} text-right`}>Paid</th>
                  <th className={`${paperTh} text-right`}>Unpaid</th>
                  <th className={`${paperTh} text-right`}>Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {entries.length === 0 && (
                  <tr>
                    <td className={`${paperTd} text-center text-neutral-500 py-10`} colSpan={9}>
                      No {filter === "all" ? "" : `${FILTERS[filter].toLowerCase()} `}entries in {label}.
                    </td>
                  </tr>
                )}
                {entries.map((e) => {
                  const tone = rowTone(e);
                  return (
                    <tr key={e.seq} className={`${ROW_BG[tone]} border-l-4 ${ROW_EDGE[tone]}`}>
                      <td className={`${paperTd} whitespace-nowrap`}>{displayDate(e.date)}</td>
                      <td className={`${paperTd} font-bold whitespace-nowrap ${TONE[tone].paper}`}>{e.type}</td>
                      <td className={`${paperTd} font-mono`}>{e.ref || "—"}</td>
                      <td className={paperTd}>
                        <span className="font-semibold text-slate-900">{e.party || e.description || "—"}</span>
                        {e.party && e.description && <span className="block text-[11px] text-neutral-500">{e.description}</span>}
                      </td>
                      <td className={`${paperTd} text-right whitespace-nowrap ${TONE.profit.paper}`}>{amt(e.income)}</td>
                      <td className={`${paperTd} text-right whitespace-nowrap ${TONE.expense.paper}`}>{amt(e.cost + e.expense)}</td>
                      <td className={`${paperTd} text-right whitespace-nowrap`}>{amt(e.settled)}</td>
                      <td className={`${paperTd} text-right whitespace-nowrap font-bold ${TONE.unpaid.paper}`}>{amt(e.unpaid)}</td>
                      <td className={`${paperTd} text-right whitespace-nowrap font-bold ${TONE[profitTone(e)].paper}`}>{signed(e.profit)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filter === "all" && (
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-900">
                    <td className={paperTd} colSpan={4}>Month totals</td>
                    <td className={`${paperTd} text-right whitespace-nowrap ${TONE.profit.paper}`}>{formatAmount(totals.income)}</td>
                    <td className={`${paperTd} text-right whitespace-nowrap ${TONE.expense.paper}`}>{formatAmount(totals.cost + totals.expenses)}</td>
                    <td className={paperTd} />
                    <td className={`${paperTd} text-right whitespace-nowrap ${TONE.unpaid.paper}`}>{formatAmount(totals.unpaid)}</td>
                    <td className={`${paperTd} text-right whitespace-nowrap ${totals.netProfit < 0 ? TONE.unpaid.paper : TONE.profit.paper}`}>{signed(totals.netProfit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="avoid-break border border-slate-200 rounded-xl overflow-hidden">
              <p className="bg-white text-neutral-900 text-[10px] font-bold uppercase tracking-wider px-4 py-2">Profit &amp; loss — {label}</p>
              <dl className="text-xs divide-y divide-slate-200">
                <div className="flex justify-between px-4 py-2"><dt>Income / sales</dt><dd className={`font-bold ${TONE.profit.paper}`}>{formatPKR(totals.income)}</dd></div>
                <div className="flex justify-between px-4 py-2"><dt>Gross profit</dt><dd className={`font-bold ${totals.grossProfit < 0 ? TONE.unpaid.paper : TONE.profit.paper}`}>{formatPKR(totals.grossProfit)}</dd></div>
                <div className="flex justify-between px-4 py-2"><dt>Less: expenses</dt><dd className={`font-bold ${TONE.expense.paper}`}>{formatPKR(totals.expenses)}</dd></div>
                <div className="flex justify-between px-4 py-2.5 bg-slate-50 text-sm font-extrabold">
                  <dt>Net profit</dt>
                  <dd className={totals.netProfit < 0 ? TONE.unpaid.paper : TONE.profit.paper}>{formatPKR(totals.netProfit)}</dd>
                </div>
              </dl>
            </div>

            <div className="avoid-break border border-slate-200 rounded-xl overflow-hidden">
              <p className="bg-white text-neutral-900 text-[10px] font-bold uppercase tracking-wider px-4 py-2">Position as of {displayDate(position.asOf)}</p>
              <dl className="text-xs divide-y divide-slate-200">
                {position.cashByAccount.map((a) => (
                  <div key={a.id} className="flex justify-between px-4 py-2"><dt>{a.name}</dt><dd className={`font-bold ${a.balance < 0 ? TONE.unpaid.paper : ""}`}>{formatPKR(a.balance)}</dd></div>
                ))}
                {position.unassignedCash !== 0 && (
                  <div className="flex justify-between px-4 py-2"><dt>Cash not assigned to an account</dt><dd className="font-bold">{formatPKR(position.unassignedCash)}</dd></div>
                )}
                <div className="flex justify-between px-4 py-2 bg-slate-50 font-bold"><dt>Cash &amp; bank</dt><dd>{formatPKR(position.cash)}</dd></div>
                <div className="flex justify-between px-4 py-2"><dt>Receivable on ledgers</dt><dd className={`font-bold ${TONE.unpaid.paper}`}>{formatPKR(position.receivables)}</dd></div>
                {position.bookingDues !== 0 && (
                  <div className="flex justify-between px-4 py-2"><dt>Unpaid on bookings</dt><dd className={`font-bold ${TONE.unpaid.paper}`}>{formatPKR(position.bookingDues)}</dd></div>
                )}
                <div className="flex justify-between px-4 py-2"><dt>Less: payable on ledgers</dt><dd className={`font-bold ${TONE.unpaid.paper}`}>{formatPKR(position.payables)}</dd></div>
                <div className="flex justify-between px-4 py-2.5 bg-slate-50 text-sm font-extrabold">
                  <dt>Net position</dt>
                  <dd className={position.net < 0 ? TONE.unpaid.paper : TONE.profit.paper}>{formatPKR(position.net)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Paper>
      )}
    </FinancePage>
  );
}
