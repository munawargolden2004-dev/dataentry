import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FaSearch,
  FaEnvelope,
  FaFileCsv,
  FaFilePdf,
  FaChevronDown,
  FaChevronUp,
  FaPhone,
  FaGlobe,
} from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* -------------------------------------------------------------------------- */
/* ----------------------------- FLAG HELPERS -------------------------------- */
/* -------------------------------------------------------------------------- */

// STEP 1: A map of standardized country names to their flag code.
const STANDARD_NAME_TO_CODE = {
  Afghanistan: "af",
  Albania: "al",
  Algeria: "dz",
  Andorra: "ad",
  Angola: "ao",
  Argentina: "ar",
  Armenia: "am",
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Bahamas: "bs",
  Bahrain: "bh",
  Bangladesh: "bd",
  Barbados: "bb",
  Belarus: "by",
  Belgium: "be",
  Belize: "bz",
  Benin: "bj",
  Bhutan: "bt",
  Bolivia: "bo",
  "Bosnia and Herzegovina": "ba",
  Botswana: "bw",
  Brazil: "br",
  Brunei: "bn",
  Bulgaria: "bg",
  "Burkina Faso": "bf",
  Burundi: "bi",
  Cambodia: "kh",
  Cameroon: "cm",
  Canada: "ca",
  Chad: "td",
  Chile: "cl",
  China: "cn",
  Colombia: "co",
  Comoros: "km",
  "Costa Rica": "cr",
  Croatia: "hr",
  Cuba: "cu",
  Cyprus: "cy",
  Czechia: "cz",
  Denmark: "dk",
  Djibouti: "dj",
  Dominica: "dm",
  "Dominican Republic": "do",
  Ecuador: "ec",
  Egypt: "eg",
  "El Salvador": "sv",
  Estonia: "ee",
  Eswatini: "sz",
  Ethiopia: "et",
  Fiji: "fj",
  Finland: "fi",
  France: "fr",
  Gabon: "ga",
  Gambia: "gm",
  Georgia: "ge",
  Germany: "de",
  Ghana: "gh",
  Greece: "gr",
  Grenada: "gd",
  Guatemala: "gt",
  Guinea: "gn",
  Guyana: "gy",
  Haiti: "ht",
  Honduras: "hn",
  Hungary: "hu",
  Iceland: "is",
  India: "in",
  Indonesia: "id",
  Iran: "ir",
  Iraq: "iq",
  Ireland: "ie",
  Israel: "il",
  Italy: "it",
  Jamaica: "jm",
  Japan: "jp",
  Jordan: "jo",
  Kazakhstan: "kz",
  Kenya: "ke",
  "South Korea": "kr",
  Kuwait: "kw",
  Kyrgyzstan: "kg",
  Laos: "la",
  Latvia: "lv",
  Lebanon: "lb",
  Lesotho: "ls",
  Liberia: "lr",
  Libya: "ly",
  Lithuania: "lt",
  Luxembourg: "lu",
  Madagascar: "mg",
  Malawi: "mw",
  Malaysia: "my",
  Maldives: "mv",
  Mali: "ml",
  Malta: "mt",
  Mauritania: "mr",
  Mauritius: "mu",
  Mexico: "mx",
  Moldova: "md",
  Monaco: "mc",
  Mongolia: "mn",
  Montenegro: "me",
  Morocco: "ma",
  Mozambique: "mz",
  Myanmar: "mm",
  Namibia: "na",
  Nepal: "np",
  Netherlands: "nl",
  "New Zealand": "nz",
  Nicaragua: "ni",
  Niger: "ne",
  Nigeria: "ng",
  "North Macedonia": "mk",
  Norway: "no",
  Oman: "om",
  Pakistan: "pk",
  Palestine: "ps",
  Panama: "pa",
  Paraguay: "py",
  Peru: "pe",
  Philippines: "ph",
  Poland: "pl",
  Portugal: "pt",
  Qatar: "qa",
  Romania: "ro",
  Russia: "ru",
  Rwanda: "rw",
  "Saudi Arabia": "sa",
  Senegal: "sn",
  Serbia: "rs",
  Seychelles: "sc",
  Singapore: "sg",
  Slovakia: "sk",
  Slovenia: "si",
  Somalia: "so",
  "South Africa": "za",
  Spain: "es",
  "Sri Lanka": "lk",
  Sudan: "sd",
  Suriname: "sr",
  Sweden: "se",
  Switzerland: "ch",
  Syria: "sy",
  Taiwan: "tw",
  Tajikistan: "tj",
  Tanzania: "tz",
  Thailand: "th",
  Togo: "tg",
  Tonga: "to",
  Tunisia: "tn",
  Turkey: "tr",
  Turkmenistan: "tm",
  Uganda: "ug",
  Ukraine: "ua",
  "United Arab Emirates": "ae",
  "United Kingdom": "gb",
  "United States": "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
  Vanuatu: "vu",
  Venezuela: "ve",
  Vietnam: "vn",
  Yemen: "ye",
  Zambia: "zm",
  Zimbabwe: "zw",
};

// STEP 2: A map of common variations (lowercase) to the standard name.
const COUNTRY_VARIATIONS_TO_STANDARD = {
  saudi: "Saudi Arabia",
  "saudi arabia": "Saudi Arabia",
  ksa: "Saudi Arabia",
  uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  dubai: "United Arab Emirates", // Common variation
  usa: "United States",
  "united states": "United States",
  "u.s.a": "United States",
  "america": "United States",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  england: "United Kingdom",
  britain: "United Kingdom",
  "south africa": "South Africa",
  "new zealand": "New Zealand",
  srilanka: "Sri Lanka",
  "sri lanka": "Sri Lanka",
};

// STEP 3: A function to normalize any country name.
function normalizeCountryName(country) {
  const c = (country || "Unknown").toString().trim();
  const lower = c.toLowerCase();
  
  // Return the standard name if found, otherwise return the original (trimmed) name
  return COUNTRY_VARIATIONS_TO_STANDARD[lower] || c;
}

// STEP 4: A function to get the flag URL from the *standardized name*.
function getFlagUrl(standardCountryName) {
  const code = STANDARD_NAME_TO_CODE[standardCountryName];
  return code ? `https://flagcdn.com/w40/${code}.png` : "";
}


/* -------------------------------------------------------------------------- */
/* ------------------------- UTILITIES (CSV, PDF) ---------------------------- */
/* -------------------------------------------------------------------------- */
function exportToCSV(filename, rows) {
  if (!rows || rows.length === 0) {
    toast.error("No rows to export");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => {
    const val = r[h] == null ? "" : String(r[h]);
    return `"${val.replace(/"/g, '""')}"`;
  }).join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success("CSV exported");
}

function exportPDF(filename, title, rows, cols) {
  try {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [cols],
      body: rows.map((r) => cols.map((c) => r[c] ?? "")),
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9 },
    });
    doc.save(filename);
    toast.success("PDF exported");
  } catch (err) {
    console.error("PDF export failed", err);
    toast.error("PDF export failed");
  }
}

/* -------------------------------------------------------------------------- */
/* -------------------------- CUSTOMER COUNTRY PAGE -------------------------- */
/* -------------------------------------------------------------------------- */

export default function CustomerCountryPage() {
  const [grouped, setGrouped] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [searchGlobal, setSearchGlobal] = useState("");
  const navigate = useNavigate();

  // 🔹 Global cache fetch
  const { data: allBookings = [], isLoading: loading } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => dataService.fetchAll('bookings'),
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (!loading && allBookings.length >= 0) {
        // --- FIXED: Group by *standardized* country name ---
        const groups = allBookings.reduce((acc, b) => {
          const rawCountry = b.country || b.to || b.destination || b.nationality || b.countryName || "Unknown";
          // Normalize *before* grouping
          const standardName = normalizeCountryName(rawCountry);

          if (!acc[standardName]) acc[standardName] = [];
          acc[standardName].push(b);
          return acc;
        }, {});
        // --- END FIX ---
        setGrouped(groups);
    }
  }, [allBookings, loading]);

  // derived list of countries filtered by global search
  const countryList = useMemo(() => {
    const q = searchGlobal.trim().toLowerCase();
    // Sort by count (most customers first)
    const entries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
    if (!q) return entries;
    return entries.filter(([country]) => country.toLowerCase().includes(q));
  }, [grouped, searchGlobal]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-neutral-50 to-neutral-50 text-neutral-900">
        <AdminNavbar />
        <div className="p-10 flex flex-col items-center justify-center min-h-[50vh] gap-4">
            <div className="w-12 h-12 border-4 border-neutral-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-neutral-600 text-sm font-medium">Loading customers…</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-neutral-50 to-neutral-50 text-neutral-900">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between gap-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Customers by Country</h1>
            <p className="text-sm text-neutral-700">View customers grouped by country, filter, export, or email them.</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <FaSearch className="absolute left-3 top-3 text-neutral-600" />
              <input
                value={searchGlobal}
                onChange={(e) => setSearchGlobal(e.target.value)}
                placeholder="Search countries..."
                className="pl-10 pr-4 py-2 rounded-xl bg-white border border-neutral-200 text-neutral-900"
              />
            </div>

          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {countryList.map(([country, list]) => (
            <div key={country} className="bg-white rounded-2xl p-4 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                    {/* --- FIXED: Flag lookup now works --- */}
                    {getFlagUrl(country) ? (
                      <img
                        src={getFlagUrl(country)}
                        alt={`${country} flag`}
                        className="w-8 h-8 object-cover rounded"
                      />
                    ) : (
                      <FaGlobe className="text-xl text-sky-700" />
                    )}
                  </div>

                  <div>
                    {/* The country name is now standardized */}
                    <div className="font-semibold text-lg">{country}</div>
                    <div className="text-sm text-neutral-600">{list.length} customers</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpanded(expanded === country ? null : country)}
                    className="bg-white px-3 py-2 rounded-lg text-neutral-900"
                    aria-expanded={expanded === country}
                  >
                    {expanded === country ? <FaChevronUp /> : <FaChevronDown />}
                  </button>
                </div>
              </div>

              {expanded === country && (
                <div className="mt-4 border-t border-neutral-200 pt-4">
                  <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-2">
                    {list.map((c) => (
                      <div key={c.id} className="p-3 bg-white rounded-md flex items-center justify-between">
                        <div>
                          <div className="font-medium">{c.fullName || c.passenger?.fullName || "Unnamed"}</div>
                          {/* --- FIXED: Typo c.email || c.email --- */}
                          <div className="text-xs text-neutral-700 mt-1">{c.passport || c.passportNumber || "-"} • {c.email || "-"}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-xs text-neutral-700">{c.date || c.departure || "-"}</div>
                          <div className="flex items-center gap-2">
                            <a href={`tel:${c.phone || ''}`} className="text-xs text-sky-700 flex items-center gap-1"><FaPhone /> {c.phone ? c.phone : 'N/A'}</a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => navigate(`/countrywise-det/${encodeURIComponent(country)}`)}
                      className="ml-auto bg-white px-3 py-2 rounded-lg text-neutral-900"
                    >
                      View Full Details
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
