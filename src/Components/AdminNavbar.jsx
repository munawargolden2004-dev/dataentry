import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  MdLogout,
  MdMenu,
  MdClose,
  MdDashboard,
  MdHome,
  MdFlight,
  MdHotel,
  MdHealthAndSafety,
  MdMosque,
  MdGroups,
  MdInsights,
  MdPeople,
} from "react-icons/md";
import FinanceMenu, { financeLinks } from "./FinanceMenu";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { dataService } from "../services/dataService";
import { listUsers, getAgency } from "../services/agencyService";
import logo from "../assets/logo.png";

const NAV_LINKS = [
  { to: "/adminhome", label: "Home", Icon: MdHome },
  { to: "/view-analytics", label: "Analytics", Icon: MdInsights },
  { to: "/admin-dashboard", label: "Dashboard", Icon: MdDashboard },
  { to: "/AdminTicketBookings", label: "Tickets", Icon: MdFlight },
  { to: "/umrahbookings", label: "Umrah", Icon: MdMosque },
  { to: "/adminHotelDet", label: "Hotels", Icon: MdHotel },
  { to: "/medicalInsurancedet", label: "Insurance", Icon: MdHealthAndSafety },
  { to: "/customer-country", label: "Customers", Icon: MdGroups },
  { to: "/manage-employees", label: "Employees", Icon: MdPeople },
];
// Invoices, Expenses, Ledgers, Bank & Cash and Balance Sheet sit under one
// "Finance" dropdown so the bar still fits on a laptop screen.
const MOBILE_LINKS = [...NAV_LINKS, ...financeLinks(true)];

function AdminNavbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white backdrop-blur-md border-b border-neutral-200 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Logo ── */}
          <Link to="/adminhome" className="flex items-center group flex-shrink-0">
            <div className="transition-transform">
              <img src={logo} alt="Logo" className="w-20 sm:w-30 h-auto object-contain" />
            </div>
          </Link>

          {/* ── Desktop Nav Links ── */}
          <div className="hidden xl:flex items-center gap-1">
            {NAV_LINKS.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                onMouseEnter={() => {
                  // Preload data aggressively when hovering over links to make clicks instant
                  if (label === 'Analytics' || label === 'Dashboard') {
                    dataService.fetchAll('bookings');
                    dataService.fetchAll('HotelBookings');
                    dataService.fetchAll('ummrahBookings');
                    dataService.fetchAll('ticketBookings');
                    dataService.fetchAll('medical_insurance');
                  } else if (label === 'Customers') {
                    dataService.fetchAll('bookings');
                  } else if (label === 'Hotels') {
                    dataService.fetchAll('HotelBookings');
                  } else if (label === 'Umrah') {
                    dataService.fetchAll('ummrahBookings');
                  } else if (label === 'Tickets') {
                    dataService.fetchAll('ticketBookings');
                  } else if (label === 'Insurance') {
                    dataService.fetchAll('medical_insurance');
                  } else if (label === 'Employees' && user?.agencyId) {
                    queryClient.prefetchQuery({
                      queryKey: ['adminEmployees', user.agencyId],
                      queryFn: async () => {
                        const [us, ag] = await Promise.all([listUsers(user.agencyId), getAgency(user.agencyId)]);
                        return {
                          employees: us.filter((u) => u.role === "employee"),
                          agencyName: ag?.name || ""
                        };
                      },
                      staleTime: 1000 * 30,
                    });
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap ${isActive(to)
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"
                  }`}
              >
                <Icon className="text-base flex-shrink-0" />
                {label}
              </Link>
            ))}
            <FinanceMenu isAdmin activeClass="bg-neutral-900 text-white shadow-sm" />
          </div>

          {/* ── Right: Logout (desktop) + Hamburger (mobile) ── */}
          <div className="flex items-center gap-3">
            {/* Logout — desktop only */}
            <button
              onClick={logout}
              className="hidden xl:flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600/10 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-500/25 hover:border-rose-600 text-sm font-semibold transition-all duration-150 cursor-pointer"
            >
              <MdLogout className="text-base" />
              Logout
            </button>

            {/* Hamburger — mobile / tablet */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="xl:hidden p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              {menuOpen ? <MdClose size={22} /> : <MdMenu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile / Tablet Dropdown ── */}
      {menuOpen && (
        <div className="xl:hidden border-t border-neutral-200 bg-white px-4 py-4 flex flex-col gap-1 shadow-md max-h-[calc(100vh-4rem)] overflow-y-auto">
          {MOBILE_LINKS.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${isActive(to)
                ? "bg-neutral-900 text-white"
                : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"
                }`}
            >
              <Icon className="text-lg flex-shrink-0" />
              {label}
            </Link>
          ))}
          <button
            onClick={logout}
            className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-600/10 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-500/25 text-sm font-semibold transition-all cursor-pointer"
          >
            <MdLogout className="text-lg" />
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}

export default AdminNavbar;
