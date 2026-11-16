/**
 * Pure accounting logic for the finance module (invoices, ledgers, bank
 * accounts, month-end balance sheet). No React and no Firestore in here, so
 * every number shown on a finance screen comes from one place and can be
 * checked in isolation.
 *
 * Conventions
 *   - Money is PKR. All sums are done in paisa (integers) so totals never
 *     drift by a floating-point fraction.
 *   - Ledgers are written from OUR books: Debit = the party owes us more (or
 *     we paid them), Credit = they paid us (or we owe them more). A positive
 *     balance is "Dr" (receivable), a negative one is "Cr" (payable).
 */
import { effectiveProfit } from "./finance.js";
import { toDateSafe } from "./dates.js";

// ── Money ────────────────────────────────────────────────────────────────────
export const num = (v) => {
  const n = Number(typeof v === "string" ? v.replace(/,/g, "").trim() : v);
  return Number.isFinite(n) ? n : 0;
};
const toMinor = (v) => Math.round(num(v) * 100);
export const round2 = (v) => toMinor(v) / 100;
export const sumBy = (list, pick) => {
  let total = 0;
  for (const item of list) total += toMinor(pick(item));
  return total / 100;
};
export const formatAmount = (v) =>
  Math.abs(round2(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const formatPKR = (v) => `${round2(v) < 0 ? "-" : ""}PKR ${formatAmount(v)}`;

// ── Dates ────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
export const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => localIso(new Date());
/** Any stored date (YYYY-MM-DD string, ISO string, Timestamp, Date) -> "YYYY-MM-DD" or "". */
export const isoDate = (v) => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = toDateSafe(v);
  return d ? localIso(d) : "";
};
/** "2026-09-05" -> "05 Sep 2026" for statements. */
export const displayDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
export const monthOf = (iso) => (iso ? iso.slice(0, 7) : "");
export const monthEnd = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
};
export const monthLabel = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

// ── Parties & invoices ───────────────────────────────────────────────────────
export const PARTY_TYPES = {
  client: { label: "Client", plural: "Clients", invoiceTitle: "INVOICE", prefix: "RS-INV" },
  agent: { label: "Agent", plural: "Agents", invoiceTitle: "AGENT INVOICE", prefix: "RS-AGT" },
  vendor: { label: "Vendor", plural: "Vendors", invoiceTitle: "VENDOR BILL", prefix: "RS-BILL" },
};
export const partyTypeOf = (doc) => (PARTY_TYPES[doc?.partyType] ? doc.partyType : "client");
/** A vendor invoice is a purchase bill (we owe); client/agent invoices are sales (they owe). */
export const isPurchase = (inv) => partyTypeOf(inv) === "vendor";

export const invoiceStatus = (total, paid) => {
  if (total > 0 && paid >= total) return "Paid";
  return paid > 0 ? "Partial" : "Unpaid";
};

/**
 * `paidAmount` is everything paid against the invoice. `linkedPaid` is the part
 * of it that arrived later as separate bank/cash transactions; the rest
 * ("directPaid") was paid on the invoice itself and is the only part the
 * invoice contributes to ledgers and bank balances (the transactions carry
 * the remainder), so nothing is ever counted twice.
 */
export const invoiceAmounts = (inv) => {
  const total = round2(inv?.totalPrice);
  const paid = Math.max(0, round2(inv?.paidAmount));
  const linkedPaid = Math.min(paid, Math.max(0, round2(inv?.linkedPaid)));
  return {
    total,
    paid,
    linkedPaid,
    directPaid: round2(paid - linkedPaid),
    balance: Math.max(0, round2(total - paid)),
    status: invoiceStatus(total, paid),
  };
};

/** Next sequential number for the year, e.g. RS-INV-2026-0007 (no random collisions). */
export const nextInvoiceNumber = (invoices, partyType = "client", year = new Date().getFullYear()) => {
  const prefix = `${PARTY_TYPES[partyType]?.prefix || PARTY_TYPES.client.prefix}-${year}-`;
  let max = 0;
  for (const inv of invoices) {
    const no = String(inv.invoiceNumber || "");
    if (no.startsWith(prefix)) max = Math.max(max, parseInt(no.slice(prefix.length), 10) || 0);
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

export const normName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const nameKey = (type, name) => `name:${type}:${normName(name)}`;

/**
 * Attach every invoice / party transaction to its party. Documents saved
 * before parties existed (or whose party was deleted) are matched by name, and
 * if no registered party has that name a "virtual" one is created so the
 * money still shows up in a ledger instead of silently disappearing.
 */
export const resolveParties = ({ parties = [], invoices = [], transactions = [] }) => {
  const byId = new Map();
  const byName = new Map();
  const list = [];
  const add = (p) => {
    const entry = { ...p, type: partyTypeOf({ partyType: p.type }), invoices: [], transactions: [] };
    list.push(entry);
    byId.set(entry.id, entry);
    const key = nameKey(entry.type, entry.name);
    if (!byName.has(key)) byName.set(key, entry);
    return entry;
  };
  parties.forEach(add);

  const find = (id, type, name) => {
    if (id && byId.has(id)) return byId.get(id);
    if (!normName(name)) return null;
    const key = nameKey(type, name);
    return byName.get(key) || add({ id: key, type, name: String(name).trim(), virtual: true });
  };

  for (const inv of invoices) {
    find(inv.partyId, partyTypeOf(inv), inv.partyName || inv.customerName)?.invoices.push(inv);
  }
  for (const txn of transactions) {
    if (txn.type !== "receipt" && txn.type !== "payment") continue;
    find(txn.partyId, partyTypeOf(txn), txn.partyName)?.transactions.push(txn);
  }
  return list;
};

const byDateThenOrder = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order || a.seq - b.seq;

/** Applies a date window to chronological rows and adds the running balance. */
const runStatement = (allRows, { from = "", to = "" } = {}, startBalance = 0) => {
  let broughtForward = toMinor(startBalance);
  const rows = [];
  let debit = 0;
  let credit = 0;
  for (const row of allRows) {
    if (to && row.date > to) continue;
    if (from && row.date < from) {
      broughtForward += toMinor(row.debit) - toMinor(row.credit);
      continue;
    }
    debit += toMinor(row.debit);
    credit += toMinor(row.credit);
    rows.push({ ...row, balance: (broughtForward + debit - credit) / 100 });
  }
  return {
    broughtForward: broughtForward / 100,
    rows,
    totalDebit: debit / 100,
    totalCredit: credit / 100,
    closing: (broughtForward + debit - credit) / 100,
  };
};

/** Statement of account for one resolved party (see resolveParties). */
export const buildLedger = (party, range = {}) => {
  const rows = [];
  let seq = 0;
  const push = (row) => rows.push({ debit: 0, credit: 0, ...row, seq: seq++ });

  const opening = round2(party.openingBalance);
  if (opening) {
    const side = party.openingType || (party.type === "vendor" ? "cr" : "dr");
    push({ date: "", order: 0, type: "Opening", ref: "", description: "Opening balance", [side === "cr" ? "credit" : "debit"]: Math.abs(opening) });
  }

  for (const inv of party.invoices || []) {
    const { total, directPaid } = invoiceAmounts(inv);
    const date = isoDate(inv.invoiceDate) || isoDate(inv.createdAt);
    const purchase = isPurchase(inv);
    const ref = inv.invoiceNumber || "";
    if (total) {
      push({
        date, order: 1, ref, sourceId: inv.id,
        type: purchase ? "Bill" : "Invoice",
        description: inv.category || (purchase ? "Purchase" : "Sale"),
        [purchase ? "credit" : "debit"]: total,
      });
    }
    if (directPaid) {
      push({
        date: isoDate(inv.paymentDate) || date, order: 2, ref, sourceId: inv.id,
        type: purchase ? "Payment" : "Receipt",
        description: `${purchase ? "Paid" : "Received"} on ${purchase ? "bill" : "invoice"}${inv.paymentMethod ? ` (${inv.paymentMethod})` : ""}`,
        [purchase ? "debit" : "credit"]: directPaid,
      });
    }
  }

  for (const txn of party.transactions || []) {
    const amount = round2(txn.amount);
    if (!amount) continue;
    const incoming = txn.type === "receipt";
    push({
      date: isoDate(txn.date) || isoDate(txn.createdAt), order: 3, ref: txn.reference || "", sourceId: txn.id,
      type: incoming ? "Receipt" : "Payment",
      description: txn.notes || `${incoming ? "Payment received" : "Payment made"}${txn.method ? ` (${txn.method})` : ""}`,
      [incoming ? "credit" : "debit"]: amount,
    });
  }

  rows.sort(byDateThenOrder);
  return runStatement(rows, range);
};

/** { amount, side, meaning } for showing a ledger balance. */
export const balanceSide = (balance) => {
  const b = round2(balance);
  if (b > 0) return { amount: b, side: "Dr", meaning: "Receivable" };
  if (b < 0) return { amount: -b, side: "Cr", meaning: "Payable" };
  return { amount: 0, side: "", meaning: "Settled" };
};

// ── Bank / cash accounts ─────────────────────────────────────────────────────
export const TXN_TYPES = {
  receipt: { label: "Receipt from party", dir: "in", party: true },
  payment: { label: "Payment to party", dir: "out", party: true },
  income: { label: "Other income", dir: "in" },
  deposit: { label: "Capital / owner deposit", dir: "in" },
  withdrawal: { label: "Owner withdrawal", dir: "out" },
  transfer: { label: "Transfer between accounts", dir: "transfer" },
};
const INCOME_KINDS = new Set(["sale-receipt", "receipt", "income"]);
const COST_KINDS = new Set(["bill-payment", "payment"]);

/**
 * Every movement of money, in date order: what was paid on invoices/bills,
 * every expense, and every bank/cash transaction. `accountId` is null when
 * the record was never assigned to an account, or its account was deleted
 * ("Unassigned").
 */
export const buildMovements = ({ invoices = [], expenses = [], transactions = [], accounts = [] }) => {
  const rows = [];
  const known = new Set(accounts.map((a) => a.id));
  let seq = 0;
  const push = (row) =>
    rows.push({ in: 0, out: 0, ...row, accountId: known.has(row.accountId) ? row.accountId : null, seq: seq++ });

  for (const inv of invoices) {
    const { directPaid } = invoiceAmounts(inv);
    if (!directPaid) continue;
    const purchase = isPurchase(inv);
    push({
      date: isoDate(inv.paymentDate) || isoDate(inv.invoiceDate) || isoDate(inv.createdAt), order: 1,
      accountId: inv.accountId || null, kind: purchase ? "bill-payment" : "sale-receipt",
      ref: inv.invoiceNumber || "", party: inv.partyName || inv.customerName || "",
      description: `${purchase ? "Paid on bill" : "Received on invoice"} — ${inv.category || ""}`,
      [purchase ? "out" : "in"]: directPaid,
    });
  }

  for (const exp of expenses) {
    const amount = round2(exp.amount);
    if (!amount) continue;
    push({
      date: isoDate(exp.date) || isoDate(exp.createdAt), order: 2,
      accountId: exp.accountId || null, kind: "expense",
      ref: exp.referenceNo || "", party: exp.paidTo || "",
      description: `${exp.title || "Expense"}${exp.category ? ` — ${exp.category}` : ""}`,
      out: amount,
    });
  }

  for (const txn of transactions) {
    const amount = round2(txn.amount);
    const def = TXN_TYPES[txn.type];
    if (!amount || !def) continue;
    const base = {
      date: isoDate(txn.date) || isoDate(txn.createdAt), order: 3,
      ref: txn.reference || "", party: txn.partyName || "", kind: txn.type, sourceId: txn.id,
      description: txn.notes || def.label,
    };
    if (def.dir === "transfer") {
      push({ ...base, accountId: txn.accountId || null, out: amount, description: txn.notes || "Transfer out" });
      push({ ...base, accountId: txn.toAccountId || null, in: amount, description: txn.notes || "Transfer in" });
    } else {
      push({ ...base, accountId: txn.accountId || null, [def.dir]: amount });
    }
  }

  return rows.sort(byDateThenOrder);
};

/** Balance of every account (plus the unassigned bucket under key null) as of a date. */
export const accountBalances = (accounts, movements, asOf = "") => {
  const minor = new Map(accounts.map((a) => [a.id, toMinor(a.openingBalance)]));
  minor.set(null, 0);
  for (const m of movements) {
    if (asOf && m.date > asOf) continue;
    const key = minor.has(m.accountId) ? m.accountId : null;
    minor.set(key, minor.get(key) + toMinor(m.in) - toMinor(m.out));
  }
  const balances = new Map();
  minor.forEach((v, k) => balances.set(k, v / 100));
  return balances;
};

/** Statement for one account; pass `account = null` for the unassigned bucket. */
export const accountStatement = (account, movements, range = {}) => {
  const id = account ? account.id : null;
  const rows = movements.filter((m) => m.accountId === id).map((m) => ({ ...m, debit: m.in, credit: m.out }));
  const s = runStatement(rows, range, account ? round2(account.openingBalance) : 0);
  return { ...s, totalIn: s.totalDebit, totalOut: s.totalCredit };
};

/** One statement across every account. Transfers are left out: they net to zero. */
export const combinedStatement = (accounts, movements, range = {}) => {
  const rows = movements.filter((m) => m.kind !== "transfer").map((m) => ({ ...m, debit: m.in, credit: m.out }));
  const s = runStatement(rows, range, sumBy(accounts, (a) => a.openingBalance));
  return { ...s, totalIn: s.totalDebit, totalOut: s.totalCredit };
};

/**
 * Cash-basis month figures. Income = money actually received from customers
 * plus other income; costs = vendor payments; profit = income - costs -
 * expenses. Owner deposits/withdrawals and transfers move the balance but are
 * not income or expense. Pass `accountId` (or null for unassigned) to scope it
 * to one account, or leave undefined for the whole business.
 */
export const monthlyCash = (movements, accountId) => {
  const months = new Map();
  for (const m of movements) {
    if (accountId !== undefined && m.accountId !== accountId) continue;
    const key = monthOf(m.date);
    if (!key) continue;
    if (!months.has(key)) months.set(key, { month: key, moneyIn: 0, moneyOut: 0, income: 0, costs: 0, expenses: 0 });
    const row = months.get(key);
    // Across the whole business a transfer nets to zero, so it is not in/out.
    if (m.kind !== "transfer" || accountId !== undefined) {
      row.moneyIn += toMinor(m.in);
      row.moneyOut += toMinor(m.out);
    }
    if (INCOME_KINDS.has(m.kind)) row.income += toMinor(m.in) - toMinor(m.out);
    else if (COST_KINDS.has(m.kind)) row.costs += toMinor(m.out) - toMinor(m.in);
    else if (m.kind === "expense") row.expenses += toMinor(m.out);
  }
  return [...months.values()]
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((r) => ({
      month: r.month,
      moneyIn: r.moneyIn / 100,
      moneyOut: r.moneyOut / 100,
      income: r.income / 100,
      costs: r.costs / 100,
      expenses: r.expenses / 100,
      netProfit: (r.income - r.costs - r.expenses) / 100,
      netFlow: (r.moneyIn - r.moneyOut) / 100,
    }));
};

// ── Bookings (visa / ticket / hotel / umrah / insurance) ─────────────────────
const has = (v) => v !== undefined && v !== null && v !== "";

/** One common shape for the five booking collections, whose field names all differ. */
export const normalizeBooking = (kind, b) => {
  switch (kind) {
    case "visa": {
      const sale = round2(b.totalFee);
      const received = round2(b.receivedFee);
      return {
        id: b.id, kind: "Visa", date: isoDate(b.date) || isoDate(b.createdAt),
        name: b.fullName || "", ref: b.passport || "", detail: [b.country, b.visaType].filter(Boolean).join(" · "),
        sale, received,
        unpaid: Math.max(0, has(b.remainingFee) ? round2(b.remainingFee) : round2(sale - received)),
        profit: round2(b.profit),
      };
    }
    case "ticket": {
      const sale = round2(b.price);
      const unpaid = Math.max(0, round2(b.remainingAmount));
      const received = has(b.received) ? round2(b.received) : round2(sale - unpaid);
      const profit = b.refunded ? effectiveProfit(b) : has(b.profit) ? num(b.profit) : sale - num(b.payable);
      return {
        id: b.id, kind: "Ticket", date: isoDate(b.createdAt) || isoDate(b.departure),
        name: b.passenger?.fullName || "", ref: b.pnr || "",
        detail: `${[b.from, b.to].filter(Boolean).join(" → ")}${b.refunded ? " · Refunded" : ""}`,
        sale, received, unpaid, profit: round2(profit),
      };
    }
    case "hotel":
    case "umrah": {
      const received = round2(b.received);
      return {
        id: b.id, kind: kind === "hotel" ? "Hotel" : "Umrah",
        date: isoDate(b.createdAt) || isoDate(kind === "hotel" ? b.arrivalDate : b.departure),
        name: b.clientName || b.fullName || "", ref: b.bookingId || b.passportNumber || "",
        detail: b.property || b.makkahHotel || "",
        sale: received, received, unpaid: Math.max(0, round2(b.remaining)),
        profit: round2(has(b.profit) ? b.profit : received - num(b.payable)),
      };
    }
    case "medical": {
      const received = round2(b.totalReceivedAmount);
      return {
        id: b.id, kind: "Insurance", date: isoDate(b.createdAt),
        name: b.NameofInsured || "", ref: b.passportNumber || "", detail: b.NameofCompany || "",
        sale: received, received, unpaid: 0,
        profit: round2(has(b.totalProfit) ? b.totalProfit : received - num(b.totalPayableAmount)),
      };
    }
    default:
      return null;
  }
};

// ── Month-end balance sheet ──────────────────────────────────────────────────
export const SHEET_SOURCES = {
  all: "Bookings + invoices",
  bookings: "Bookings only",
  invoices: "Invoices & bills only",
};

/**
 * Every entry dated in `month` with its effect on profit, plus month totals
 * and the financial position at the last day of the month.
 *
 * `source` decides where gross profit comes from, so a sale is not counted
 * twice by an agency that records a booking AND raises an invoice for it:
 *   bookings -> booking profit;  invoices -> sales invoices minus vendor
 *   bills;  all -> both.
 * Expenses and other income are always included.
 */
export const buildMonthSheet = ({
  month, source = "all", bookings = [], invoices = [], expenses = [], transactions = [], parties = [], accounts = [],
}) => {
  const from = `${month}-01`;
  const to = monthEnd(month);
  const useBookings = source !== "invoices";
  const useInvoices = source !== "bookings";
  const entries = [];
  let seq = 0;
  const push = (e) => entries.push({ ref: "", party: "", description: "", income: 0, cost: 0, expense: 0, settled: 0, unpaid: 0, profit: 0, ...e, seq: seq++ });

  if (useBookings) {
    for (const b of bookings) {
      if (!b || !inRange(b.date, from, to)) continue;
      push({
        date: b.date, order: 1, type: b.kind, tone: "profit", ref: b.ref, party: b.name, description: b.detail,
        income: b.sale, settled: b.received, unpaid: b.unpaid, unpaidSide: "receivable", profit: b.profit,
      });
    }
  }

  if (useInvoices) {
    for (const inv of invoices) {
      const date = isoDate(inv.invoiceDate) || isoDate(inv.createdAt);
      if (!inRange(date, from, to)) continue;
      const { total, paid, balance } = invoiceAmounts(inv);
      const purchase = isPurchase(inv);
      push({
        date, order: 2, type: purchase ? "Vendor bill" : `${PARTY_TYPES[partyTypeOf(inv)].label} invoice`,
        tone: purchase ? "expense" : "profit", ref: inv.invoiceNumber || "",
        party: inv.partyName || inv.customerName || "", description: inv.category || "",
        income: purchase ? 0 : total, cost: purchase ? total : 0, settled: paid,
        unpaid: balance, unpaidSide: purchase ? "payable" : "receivable", profit: purchase ? -total : total,
      });
    }
  }

  for (const exp of expenses) {
    const date = isoDate(exp.date) || isoDate(exp.createdAt);
    const amount = round2(exp.amount);
    if (!amount || !inRange(date, from, to)) continue;
    push({
      date, order: 3, type: "Expense", tone: "expense", ref: exp.referenceNo || "", party: exp.paidTo || "",
      description: `${exp.title || ""}${exp.category ? ` — ${exp.category}` : ""}`,
      expense: amount, settled: amount, profit: -amount,
    });
  }

  for (const txn of transactions) {
    if (txn.type !== "income") continue;
    const date = isoDate(txn.date) || isoDate(txn.createdAt);
    const amount = round2(txn.amount);
    if (!amount || !inRange(date, from, to)) continue;
    push({
      date, order: 4, type: "Other income", tone: "profit", ref: txn.reference || "",
      description: txn.notes || "Other income", income: amount, settled: amount, profit: amount,
    });
  }

  entries.sort(byDateThenOrder);

  const receivable = (e) => (e.unpaidSide === "receivable" ? e.unpaid : 0);
  const payable = (e) => (e.unpaidSide === "payable" ? e.unpaid : 0);
  const expensesTotal = sumBy(entries, (e) => e.expense);
  const netProfit = sumBy(entries, (e) => e.profit);
  const totals = {
    income: sumBy(entries, (e) => e.income),
    cost: sumBy(entries, (e) => e.cost),
    expenses: expensesTotal,
    grossProfit: round2(netProfit + expensesTotal),
    netProfit,
    unpaidReceivable: sumBy(entries, receivable),
    unpaidPayable: sumBy(entries, payable),
    unpaid: sumBy(entries, (e) => e.unpaid),
    count: entries.length,
  };

  // Position on the last day of the month (everything up to that date).
  const balances = accountBalances(accounts, buildMovements({ invoices, expenses, transactions, accounts }), to);
  const cashByAccount = accounts.map((a) => ({ id: a.id, name: a.name, balance: balances.get(a.id) }));
  const unassignedCash = balances.get(null);
  const cash = round2(sumBy(cashByAccount, (a) => a.balance) + unassignedCash);
  let receivables = 0;
  let payables = 0;
  for (const party of resolveParties({ parties, invoices, transactions })) {
    const closing = toMinor(buildLedger(party, { to }).closing);
    if (closing > 0) receivables += closing;
    else payables -= closing;
  }
  const bookingDues = useBookings ? sumBy(bookings.filter((b) => b && b.date && b.date <= to), (b) => b.unpaid) : 0;
  const position = {
    asOf: to,
    cash, cashByAccount, unassignedCash,
    receivables: receivables / 100,
    bookingDues,
    payables: payables / 100,
    net: round2(cash + receivables / 100 + bookingDues - payables / 100),
  };

  return { month, from, to, entries, totals, position };
};
