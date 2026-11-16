import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  MdLogout,
  MdMenu,
  MdClose,
  MdHome,
  MdDashboard,
  MdCheckCircle,
  MdFlight,
  MdPublic,
  MdSearch,
  MdBarChart,
} from "react-icons/md";
import logo from "../assets/logo.png";
import FinanceMenu, { financeLinks } from "./FinanceMenu";

const NAV_LINKS = [
  { to: "/home", label: "Home", Icon: MdHome },
  { to: "/bookings", label: "Bookings", Icon: MdDashboard },
  { to: "/approved-visas", label: "Visa Records", Icon: MdCheckCircle },
  { to: "/tickiting", label: "Ticketing", Icon: MdFlight },
  { to: "/countries", label: "Countries", Icon: MdPublic },
  { to: "/search", label: "Search", Icon: MdSearch },
  { to: "/reports", label: "Reports", Icon: MdBarChart },
];
const MOBILE_LINKS = [...NAV_LINKS, ...financeLinks(false)];

export default function Navbar({ userName }) {
  const { logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white backdrop-blur-md border-b border-neutral-200 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo and Brand */}
          <Link to="/home" className="flex items-center group flex-shrink-0">
            <div className="transition-transform">
              <img src={logo} alt="Logo" className="w-20 sm:w-30 h-auto object-contain" />
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap ${isActive(to)
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"
                  }`}
              >
                <Icon className="text-base flex-shrink-0" />
                {label}
              </Link>
            ))}
            <FinanceMenu isAdmin={false} activeClass="bg-neutral-900 text-white shadow-sm" />
          </div>

          {/* User Section & Mobile Menu Button */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex lg:hidden xl:flex items-center px-3 py-1 bg-white rounded-full border border-neutral-200 mr-2">
              <span className="text-xs font-semibold text-neutral-700 pr-2 border-r border-neutral-200 mr-2">Employee</span>
              <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">{userName?.split("@")[0]}</span>
            </div>

            <button
              onClick={logout}
              className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600/10 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-500/25 hover:border-rose-600 text-sm font-semibold transition-all duration-150 cursor-pointer"
            >
              <MdLogout className="text-base" />
              Logout
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              {isMenuOpen ? <MdClose size={22} /> : <MdMenu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-4 flex flex-col gap-1 shadow-md max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-2 mb-2 bg-white rounded-xl border border-neutral-200 md:hidden">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Signed in as</p>
            <p className="text-sm font-bold text-neutral-900 truncate">{userName}</p>
          </div>

          {MOBILE_LINKS.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setIsMenuOpen(false)}
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
