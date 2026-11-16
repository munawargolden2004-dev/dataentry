import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  MdReceiptLong,
  MdAccountBalanceWallet,
  MdMenuBook,
  MdAccountBalance,
  MdAssessment,
  MdPayments,
  MdExpandMore,
} from "react-icons/md";

// Bank balances and the month-end sheet are the owner's view of the whole
// business, so only admins get those two.
const LINKS = [
  { to: "/invoices", label: "Invoices", Icon: MdReceiptLong },
  { to: "/expenses", label: "Expenses", Icon: MdAccountBalanceWallet },
  { to: "/ledgers", label: "Ledgers", Icon: MdMenuBook },
  { to: "/bank-accounts", label: "Bank & Cash", Icon: MdAccountBalance, adminOnly: true },
  { to: "/balance-sheet", label: "Balance Sheet", Icon: MdAssessment, adminOnly: true },
];

export const financeLinks = (isAdmin) => LINKS.filter((l) => isAdmin || !l.adminOnly);

/** Desktop "Finance" dropdown shared by the admin and employee navbars. */
export default function FinanceMenu({ isAdmin, activeClass }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  const links = financeLinks(isAdmin);
  const active = links.some((l) => l.to === pathname);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${active ? activeClass : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"}`}
      >
        <MdPayments className="text-base flex-shrink-0" />
        Finance
        <MdExpandMore className={`text-base transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-52 bg-white border border-neutral-200 rounded-xl shadow-md p-1.5 z-50">
          {links.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${pathname === to ? activeClass : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"}`}
            >
              <Icon className="text-base flex-shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
