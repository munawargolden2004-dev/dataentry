import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

import {
  FaUserTie,
  FaGlobe,
  FaSearch,
  FaFileCsv,
  FaDownload,
  FaUsers,
  FaChartBar,
  FaBolt,
  FaArrowRight,
  FaArrowUp,
  FaCalendarDay,
  FaChevronRight,
} from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";

// --- 1. CLEANED UP COUNTRY_TO_ISO (REMOVED DUPLICATES) ---
const COUNTRY_TO_ISO = {
  Pakistan: "PK",
  Saudi: "SA",
  "Saudi Arabia": "SA",
  UAE: "AE",
  "United Arab Emirates": "AE",
  Thailand: "TH",
  "United Kingdom": "GB",
  UK: "GB",
  England: "GB",
  USA: "US",
  "United States": "US",
  Canada: "CA",
  Turkey: "TR",
  Malaysia: "MY",
  India: "IN",
  Germany: "DE",
  France: "FR",
  Italy: "IT",
  Spain: "ES",
  Zambia: "zm",
  Australia: "AU",
  China: "CN",
  Japan: "JP",
  Singapore: "SG",
  Brazil: "BR",
  Mexico: "MX",
  Russia: "RU",
  Egypt: "EG",
  Nigeria: "NG",
  Kenya: "KE",
  SouthAfrica: "ZA",
  "South Africa": "ZA",
  Vietnam: "VN",
  Indonesia: "ID",
  Philippines: "PH",
  Argentina: "AR",
  Chile: "CL",
  Colombia: "CO",
  Peru: "PE",
  Netherlands: "NL",
  Belgium: "BE",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Denmark: "DK",
  Switzerland: "CH",
  Austria: "AT",
  Poland: "PL",
  Portugal: "PT",
  Greece: "GR",
  Ireland: "IE",
  NewZealand: "NZ",
  "New Zealand": "NZ",
  Hungary: "HU",
  Czechia: "CZ",
  "Czech Republic": "CZ",
  Romania: "RO",
  Bulgaria: "BG",
  Croatia: "HR",
  Serbia: "RS",
  Ukraine: "UA",
  Belarus: "BY",
  Lithuania: "LT",
  Latvia: "LV",
  Estonia: "EE",
  Iceland: "IS",
  Luxembourg: "LU",
  Slovenia: "SI",
  Slovakia: "SK",
  Cyprus: "CY",
  Malta: "MT",
  Bangladesh: "BD",
  SriLanka: "LK",
  "Sri Lanka": "LK",
  Nepal: "NP",
  Myanmar: "MM",
  Cambodia: "KH",
  Laos: "LA",
  Mongolia: "MN",
  Iran: "IR",
  Iraq: "IQ",
  Afghanistan: "AF",
  Azerbaijan: "AZ",
  Armenia: "AM",
  Georgia: "GE",
  Kazakhstan: "KZ",
  Uzbekistan: "UZ",
  Turkmenistan: "TM",
  Kyrgyzstan: "KG",
  Tajikistan: "TJ",
  Kuwait: "KW",
  Qatar: "QA",
  Bahrain: "BH",
  Oman: "OM",
  Yemen: "YE",
};
// --- END OF FIX ---

/** Convert ISO code (2 letters) to flag emoji */
function isoToFlagEmoji(iso) {
  if (!iso || iso.length !== 2) return "🌐";
  const codePoints = [...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

/** Try to get a flag emoji from a country name */
function getFlag(country) {
  if (!country) return null;
  const clean = country.trim().toLowerCase();

  // exact match
  for (const [name, iso] of Object.entries(COUNTRY_TO_ISO)) {
    if (name.toLowerCase() === clean) {
      return (
        <img
          src={`https://flagcdn.com/w40/${iso.toLowerCase()}.png`}
          alt={country}
          className="w-8 h-6 object-cover rounded shadow-sm"
        />
      );
    }
  }

  // fallback: globe icon
  return <span className="text-xl">🌐</span>;
}

/** Export list of items to CSV and trigger download */
function exportToCSV(filename, rows) {
  if (!rows || !rows.length) {
    toast.error("Nothing to export");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? "";
          // escape quotes
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.success("Export started");
}

/** Small inline sparkline (bars) - takes array of numbers */
function SparkBars({ data = [] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-[6px] rounded-sm bg-blue-100 transition-colors hover:bg-neutral-900"
          style={{
            height: `${Math.max((v / max) * 100, 15)}%`,
          }}
        />
      ))}
    </div>
  );
}

import ParticleMap from "../Components/ParticleMap";

export default function AdminHome() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [modalBooking, setModalBooking] = useState(null);

  const [showAllCountries, setShowAllCountries] = useState(false);

  const queryClient = useQueryClient();

  // ── useQuery Data Fetching ─────────────────────────────────────────────
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['all-visas'],
    queryFn: () => dataService.fetchAll('bookings'),
    staleTime: 1000 * 30, // 5 mins cache
  });

  const { data: hAll = [] } = useQuery({ queryKey: ['all-hotels'], queryFn: () => dataService.fetchAll('HotelBookings'), staleTime: 1000 * 30 });
  const { data: uAll = [] } = useQuery({ queryKey: ['all-umrah'], queryFn: () => dataService.fetchAll('ummrahBookings'), staleTime: 1000 * 30 });
  const { data: tAll = [] } = useQuery({ queryKey: ['all-tickets'], queryFn: () => dataService.fetchAll('ticketBookings'), staleTime: 1000 * 30 });
  const { data: mAll = [] } = useQuery({ queryKey: ['all-medical'], queryFn: () => dataService.fetchAll('medical_insurance'), staleTime: 1000 * 30 });

  useEffect(() => {
    if (bookingsData) {
      setBookings(bookingsData);
      setLoading(false);
    }
  }, [bookingsData]);

  const handleRefresh = useCallback(async () => {
    await dataService.clearCache(); // drop localforage cache so we pull fresh
    queryClient.invalidateQueries(['all-visas']);
    queryClient.invalidateQueries(['all-hotels']);
    queryClient.invalidateQueries(['all-umrah']);
    queryClient.invalidateQueries(['all-tickets']);
    queryClient.invalidateQueries(['all-medical']);
    toast.success("Refreshing home data...");
  }, [queryClient]);

  // Derived groups
  const employees = useMemo(() => {
    const allRecords = [...bookings, ...hAll, ...uAll, ...tAll, ...mAll];
    return allRecords.reduce((acc, b) => {
      const key = b.userEmail || b.createdByEmail || "unknown@os.com";
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    }, {});
  }, [bookings, hAll, uAll, tAll, mAll]);
  const countriesRef = useRef(null);

  const countries = useMemo(() => {
    return bookings.reduce((acc, b) => {
      const c = b.country || "Unknown";
      if (!acc[c]) acc[c] = [];
      acc[c].push(b);
      return acc;
    }, {});
  }, [bookings]);

  const totalBookings = bookings.length;
  const totalEmployees = Object.keys(employees).length;
  const totalCountries = Object.keys(countries).length;

  // quick stats for small sparkline: bookings per recent 7 days (approx)
  const bookingsByDay = useMemo(() => {
    const days = 7;
    const counts = Array(days).fill(0);
    const now = Date.now();
    for (const b of bookings) {
      let t = null;
      if (b.date) {
        t = new Date(b.date).getTime();
      } else if (b.createdAt && b.createdAt.seconds) {
        t = b.createdAt.seconds * 1000;
      } else if (b.createdAt && typeof b.createdAt === "string") {
        t = new Date(b.createdAt).getTime();
      }
      if (!t || isNaN(t)) continue;
      const diffDays = Math.floor((now - t) / (1000 * 60 * 60 * 24));
      if (diffDays < days) counts[days - 1 - diffDays] += 1;
    }
    return counts;
  }, [bookings]);

  // Small helpers to ensure clicking inside detail area doesn't close the card
  const stop = (e) => e.stopPropagation();

  const INITIAL_COUNTRY_LIMIT = 8;
  const countryKeys = Object.keys(countries);
  const countriesToShow = useMemo(() => {
    if (showAllCountries) {
      return countryKeys;
    }
    return countryKeys.slice(0, INITIAL_COUNTRY_LIMIT);
  }, [countryKeys, showAllCountries]);

  // Global filtered list (for maybe search page)
  const globalFiltered = useMemo(() => {
    if (!globalSearch.trim()) return bookings;
    const q = globalSearch.trim().toLowerCase();
    return bookings.filter((b) =>
      [
        b.fullName,
        b.passport,
        b.userEmail,
        b.country,
        b.visaType,
        b.phone,
        b.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [bookings, globalSearch]);

  const onEmployeeClick = (emp) => {
    setSelectedCountry(null);
    setSelectedEmployee((prev) => (prev === emp ? null : emp));
    setCountrySearch("");
  };
  const onCountryClick = (country) => {
    setSelectedEmployee(null);
    setSelectedCountry((prev) => (prev === country ? null : country));
    setCountrySearch("");
  };
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans relative overflow-x-hidden text-neutral-900">
      <ParticleMap />

      <div className="relative z-50">
        <AdminNavbar />
      </div>

      {/* Hero Welcome Banner */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 pt-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">Data Dash</h1>
        <p className="text-neutral-700 text-sm md:text-base max-w-xl font-light">
          Welcome back. Here's a real-time overview of your global operations,
          agent performance, and booking volumes today.
        </p>
      </div>

      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 mt-10">
        {/* Core Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Card 1: Total Bookings */}
          <Link to="/admin-dashboard" className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm hover:bg-neutral-100 transition-colors group">
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">Total Bookings</h3>
                <span className="px-2 py-0.5 bg-white rounded-md text-xs text-neutral-700 border border-neutral-200">+4y</span>
              </div>
              <div className="flex items-end gap-3 mt-1">
                <h2 className="text-4xl font-bold">{totalBookings}</h2>
                <span className="text-emerald-700 font-semibold text-sm mb-1">+{bookingsByDay.reduce((a, b) => a + b, 0)}</span>
              </div>
              <p className="text-[11px] text-neutral-600 mt-1 uppercase tracking-wider">Over the last 7 days</p>
            </div>
            <div className="mt-6 h-20 w-full relative -mx-2 -mb-2">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full text-cyan-700">
                <path d="M0 40 L0 30 Q 15 20, 25 30 T 50 20 T 75 10 T 100 20 L100 40 Z" fill="url(#gradient-chart)" opacity="0.4" />
                <path d="M0 30 Q 15 20, 25 30 T 50 20 T 75 10 T 100 20" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="75" cy="10" r="3" fill="white" className="" />
                <defs>
                  <linearGradient id="gradient-chart" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </Link>

          {/* Card 2: Employees */}
          <Link to="/employee-record" className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm hover:bg-neutral-100 transition-colors group">
            <div>
              <h3 className="text-neutral-700 font-medium mb-2 group-hover:text-neutral-900 transition-colors">Total Handlers</h3>
              <h2 className="text-4xl font-bold">{totalEmployees}</h2>
              <p className="text-[11px] text-neutral-600 mt-1 uppercase tracking-wider">Active Agents</p>
            </div>
            <div className="flex -space-x-3 mt-6">
              {[1, 2, 3, 4, 5].map(i => (
                <img key={i} src={`https://i.pravatar.cc/100?img=${i + 10}`} className={`w-10 h-10 rounded-full border-2 border-white relative`} style={{ zIndex: 5 - i }} alt="agent" />
              ))}
            </div>
          </Link>

          {/* Card 3: Global Reach */}
          <div onClick={() => countriesRef.current?.scrollIntoView({ behavior: "smooth" })} className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-neutral-100 transition-colors group">
            <div className="relative z-10">
              <h3 className="text-neutral-700 font-medium mb-2 group-hover:text-neutral-900 transition-colors">Global Reach</h3>
              <h2 className="text-4xl font-bold">{totalCountries}</h2>
              <p className="text-[11px] text-neutral-600 mt-1 uppercase tracking-wider">Activations</p>
            </div>
            <div className="absolute -bottom-4 -right-4 w-32 h-32 opacity-80">
              <div className="absolute inset-0 bg-neutral-100 rounded-full blur-2xl opacity-20"></div>
              <img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Globe.png" className="w-full h-full object-cover filter hue-rotate-[180deg] opacity-80" alt="globe" />
            </div>
          </div>

          {/* Card 4: Quick Search */}
          <Link to="/detailed-search" className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm hover:bg-neutral-100 transition-colors group">
            <div className="flex justify-between items-start">
              <h3 className="text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">Universal Search</h3>
              <button className="p-1.5 bg-white rounded-lg border border-neutral-200"><FaSearch className="text-xs text-neutral-600" /></button>
            </div>
            <div className="mt-4 relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600 text-sm" />
              <input type="text" placeholder="Find Anything" className="w-full bg-white border border-neutral-200 rounded-xl py-2.5 pl-9 pr-4 text-sm text-neutral-900 placeholder-neutral-500 outline-none focus:border-neutral-900 transition-colors" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-yellow-500/20 flex items-center justify-center text-yellow-600">
                <FaBolt className="text-xs" />
              </div>
              <span className="text-2xl font-bold">96%</span>
            </div>
          </Link>
        </div>

        {/* Countries Grid Section */}
        <section ref={countriesRef} className="bg-white rounded-[2rem] p-6 md:p-8 border border-neutral-200 shadow-sm relative backdrop-blur-md mb-20">
          <h2 className="text-xl md:text-2xl font-bold text-neutral-900 flex items-center gap-3 mb-6">
            <FaGlobe className="text-blue-600" /> Active Destinations
          </h2>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="w-10 h-10 border-4 border-neutral-200 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className={`gap-4 pb-8 ${showAllCountries ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'flex overflow-x-auto'}`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {countriesToShow.map((country) => {
                const list = countries[country];
                return (
                  <Link
                    key={country}
                    to={`/countrywise-det/${encodeURIComponent(country)}`}
                    className={`${showAllCountries ? 'w-full' : 'min-w-[180px]'} bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col hover:bg-neutral-100 transition-colors group`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-6 rounded overflow-hidden shrink-0 flex items-center justify-center">
                        {getFlag(country)}
                      </div>
                      <span className="font-medium text-sm truncate text-neutral-900 group-hover:text-neutral-900 transition-colors">{country}</span>
                    </div>
                    <h4 className="text-3xl font-bold">{list.length}</h4>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 z-20">
            <button
              onClick={() => setShowAllCountries(!showAllCountries)}
              className="px-6 py-2.5 bg-gradient-to-r from-neutral-50 to-neutral-50 border border-neutral-200 rounded-full text-sm font-medium hover:border-neutral-400 transition-colors shadow-md whitespace-nowrap"
            >
              {showAllCountries ? (
                <>Show Less <FaArrowUp className="inline ml-1" /></>
              ) : (
                <>View All {countryKeys.length} Destinations</>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* Modal for booking details */}
      {modalBooking && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalBooking(null)}
        >
          <div
            className="w-full max-w-2xl bg-white border border-neutral-200 rounded-2xl shadow-md p-6 text-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold">{modalBooking.fullName}</h3>
                <p className="text-sm text-neutral-600">{modalBooking.country} • {modalBooking.visaType}</p>
              </div>
              <div className="text-sm text-neutral-500">{modalBooking.date}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-neutral-100 rounded-xl border border-neutral-200">
              <div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Passport</div>
                <div className="font-medium text-neutral-900">{modalBooking.passport}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Phone / Email</div>
                <div className="font-medium text-neutral-900">{modalBooking.phone} • {modalBooking.email || "N/A"}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Fees</div>
                <div className="font-medium text-neutral-900">Total: {modalBooking.totalFee || "0"} • Received: {modalBooking.receivedFee || "0"}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Status</div>
                <div className="font-medium text-neutral-900">{modalBooking.visaStatus} • {modalBooking.paymentStatus}</div>
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-end">
              <button onClick={() => setModalBooking(null)} className="px-5 py-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-100 transition-colors font-medium text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
