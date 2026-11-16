// Shared building blocks for the finance screens (Ledgers, Bank & Cash,
// Balance Sheet): page shell, stat cards, modal, form fields and the white
// "paper" statement that is both the on-screen view and what gets printed.

import { useEffect } from "react";
import { MdClose, MdErrorOutline } from "react-icons/md";
import { useAuth } from "../context/AuthContext";
import AdminNavbar from "./AdminNavbar";
import Footer from "./Footer";
import { COMPANY_INFO } from "../utils/company";
import { financeErrorMessage } from "../services/financeService";

export const inputCls =
  "w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-500 outline-none focus:border-neutral-900 transition";
export const btnCls = {
  primary:
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-neutral-900 text-sm font-semibold border border-neutral-200 transition cursor-pointer disabled:opacity-50",
  icon: "p-2 rounded-lg border transition cursor-pointer",
};

// The three colours the owner asked for, in both themes.
export const TONE = {
  unpaid: { dark: "text-rose-700", paper: "text-red-600", chip: "bg-red-50 text-red-700 border-red-200" },
  expense: { dark: "text-blue-700", paper: "text-blue-600", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  profit: { dark: "text-emerald-700", paper: "text-green-600", chip: "bg-green-50 text-green-700 border-green-200" },
  neutral: { dark: "text-neutral-900", paper: "text-slate-900", chip: "bg-slate-100 text-slate-700 border-slate-200" },
};

export function FinancePage({ title, subtitle, Icon, actions, error, children }) {
  const { isAdmin } = useAuth();
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
      {/* Employees already get their navbar from the app layout (App.jsx). */}
      {isAdmin && <AdminNavbar />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 bg-white p-4 sm:p-6 rounded-3xl border border-neutral-200 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="p-3 bg-neutral-100 text-neutral-900 rounded-2xl border border-neutral-200 shrink-0">
                <Icon className="text-2xl sm:text-3xl" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">{title}</h1>
              <p className="text-neutral-600 text-xs sm:text-sm font-medium">{subtitle}</p>
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4">
            <MdErrorOutline className="text-xl shrink-0 mt-0.5" />
            <span>{financeErrorMessage(error)}</span>
          </div>
        )}
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral" }) {
  return (
    <div className="bg-white border border-neutral-200 p-4 sm:p-5 rounded-2xl min-w-0">
      <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg sm:text-2xl font-extrabold break-words ${TONE[tone].dark}`}>{value}</p>
      {hint && <span className="text-xs text-neutral-500 mt-1.5 block">{hint}</span>}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, wide = false, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"} max-h-[92vh] overflow-y-auto shadow-md p-5 sm:p-7 text-neutral-900`}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-neutral-900">{title}</h2>
            {subtitle && <p className="text-xs text-neutral-600 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full bg-white text-neutral-600 hover:text-neutral-900 transition cursor-pointer shrink-0"
          >
            <MdClose size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-neutral-600 uppercase mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-500 mt-1">{hint}</span>}
    </label>
  );
}

export function FormActions({ onCancel, saving, label }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-neutral-200">
      <button type="button" onClick={onCancel} disabled={saving} className={btnCls.ghost}>
        Cancel
      </button>
      <button type="submit" disabled={saving} className={btnCls.primary}>
        {saving && <span className="w-4 h-4 border-2 border-neutral-200 border-t-transparent rounded-full animate-spin" />}
        {saving ? "Saving..." : label}
      </button>
    </div>
  );
}

export function Spinner({ label = "Loading..." }) {
  return (
    <div className="p-12 text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900 mx-auto mb-4" />
      <p className="text-neutral-600 text-sm">{label}</p>
    </div>
  );
}

/**
 * White A4-style document. Give it a ref and pass that element to
 * printElement() — what you see here is what comes out of the printer.
 */
export function Paper({ innerRef, title, meta = [], children }) {
  return (
    <div
      ref={innerRef}
      className="print-sheet bg-white text-slate-800 rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-8 font-sans"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-5 mb-5">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">{COMPANY_INFO.name}</h2>
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mt-0.5">{COMPANY_INFO.subtext}</p>
          <div className="mt-2 text-xs text-slate-600 space-y-0.5">
            <p>{COMPANY_INFO.address}</p>
            <p>
              Phone: {COMPANY_INFO.phone} &nbsp;|&nbsp; Email: {COMPANY_INFO.email}
            </p>
          </div>
        </div>
        <div className="sm:text-right shrink-0">
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-wide uppercase">{title}</h3>
          <div className="mt-1.5 text-xs text-slate-600 space-y-0.5">
            {meta.filter(Boolean).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>
      {children}
      <div className="avoid-break mt-10 pt-5 border-t border-slate-200 flex justify-between items-end gap-6 text-xs text-neutral-500">
        <div>
          <p className="font-semibold text-slate-700">{COMPANY_INFO.name}</p>
          <p>Computer generated statement &middot; {new Date().toLocaleDateString()}</p>
        </div>
        <div className="text-center">
          <div className="w-36 border-b border-slate-400 mb-1" />
          <p className="font-semibold text-slate-600">Authorized Signature</p>
        </div>
      </div>
    </div>
  );
}

/** Summary boxes inside a Paper. */
export function PaperSummary({ items }) {
  return (
    <div className="avoid-break grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {items.map((s) => (
        <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-0">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{s.label}</p>
          <p className={`text-sm sm:text-base font-extrabold break-words ${TONE[s.tone || "neutral"].paper}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

export const paperTh = "py-2.5 px-3 font-bold text-left whitespace-nowrap";
export const paperTd = "py-2 px-3 align-top";
