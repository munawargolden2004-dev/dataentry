import { useEffect, useState, useRef } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";

/* -------------------------------------------------------------------------- */
/* ------------------ STANDARDIZED FLAG HELPERS ----------------------------- */
/* -------------------------------------------------------------------------- */

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

function normalizeCountryName(country) {
  const c = (country || "Unknown").toString().trim();
  // We'll use the original spelling to map in COUNTRY_TO_ISO.
  // If we want grouping to group 'Saudi' and 'Saudi Arabia' together visually, 
  // we can manually standardize main ones:
  const lower = c.toLowerCase();
  if (lower === "saudi") return "Saudi Arabia";
  if (lower === "uae" || lower === "dubai") return "United Arab Emirates";
  if (lower === "uk" || lower === "england" || lower === "britain") return "United Kingdom";
  if (lower === "usa" || lower === "america" || lower === "u.s.a") return "United States";
  if (lower === "srilanka") return "Sri Lanka";
  
  // Title case it
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function getFlagUrl(standardCountryName) {
  // exact match
  const c = (standardCountryName || "").trim().toLowerCase();
  for (const [name, iso] of Object.entries(COUNTRY_TO_ISO)) {
    if (name.toLowerCase() === c) {
      return `https://flagcdn.com/w40/${iso.toLowerCase()}.png`;
    }
  }
  // fallback image (transparent pixel or generic icon placeholder)
  return "https://upload.wikimedia.org/wikipedia/commons/e/ef/World_map_blank_gmt.png";
}
/* ---------------------- END OF FLAG HELPERS --------------------- */


export default function Countries() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const applicantsTableRef = useRef(null);

  // Shared cached query (SAME key as the Search page) — a heavy employee's
  // bookings download ONCE, are cached to IndexedDB, and every revisit + the
  // Search page reuse it instantly instead of re-downloading thousands of docs.
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ["my-visa-bookings", user?.uid],
    queryFn: () => dataService.fetchMyBookings(user.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (bookingsData) setBookings(bookingsData);
    setLoading(isLoading);
  }, [bookingsData, isLoading]);

  useEffect(() => {
    if (selectedCountry && applicantsTableRef.current) {
      applicantsTableRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedCountry]);

  // --- (FIXED) Grouping now uses the standardized name ---
  const groupedByCountry = bookings.reduce((acc, booking) => {
    const standardName = normalizeCountryName(booking.country); // Normalize here
    if (!acc[standardName]) acc[standardName] = [];
    acc[standardName].push(booking);
    return acc;
  }, {});

  // --- Applicants for the selected country: filtered + paginated (10 per page) ---
  const filteredApplicants = selectedCountry
    ? (groupedByCountry[selectedCountry] || []).filter((b) =>
        [b.passport, b.fullName, b.visaType]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      )
    : [];
  const totalPages = Math.max(1, Math.ceil(filteredApplicants.length / itemsPerPage));
  const pagedApplicants = filteredApplicants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to the first page whenever the country or search changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCountry, searchTerm]);

  if (!user) {
    return (
      <div className="p-6 min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-900">
        <div className="text-center bg-white p-10 rounded-2xl shadow-md backdrop-blur-md border border-neutral-200">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Access Denied</h2>
          <p className="text-neutral-600">Please log in to view your country statistics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900 mb-2">
          My Visa Applications by Country
        </h1>
        <p className="text-neutral-600 text-lg">
          An overview of your travel destinations and applications.
        </p>
        <div className="mt-4 p-4 bg-white rounded-xl shadow-md border border-neutral-200">
          <p className="text-neutral-700 text-sm">
            <strong>Logged in as:</strong> {user.email}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            You can only see your own visa applications grouped by country.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin h-12 w-12 border-4 border-neutral-900 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-blue-700 mt-4">Loading your data...</p>
        </div>
      ) : (
        <>
          {/* Country Cards */}
          <div className="grid md:grid-cols-3 sm:grid-cols-2 gap-6">
            {Object.keys(groupedByCountry).length === 0 ? (
              <div className="col-span-full text-center py-8 text-neutral-500">
                No country data found for your account.
              </div>
            ) : (
              // Now `country` is the standardized name
              Object.keys(groupedByCountry).map((country) => (
                <div
                  key={country}
                  onClick={() =>
                    setSelectedCountry(selectedCountry === country ? null : country)
                  }
                  className={`relative p-6 rounded-2xl shadow-sm transition-all duration-300 ease-in-out transform hover:-translate-y-0.5
                    bg-white backdrop-blur-md border border-neutral-200 text-neutral-900 overflow-hidden
                    group cursor-pointer
                    ${
                      selectedCountry === country
                        ? "ring-2 ring-offset-2 ring-blue-500 ring-offset-gray-950"
                        : ""
                    }`}
                >
                  <div className={`absolute inset-0 rounded-2xl transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${selectedCountry === country ? 'opacity-100 bg-gradient-to-br from-blue-600/30 to-green-600/30' : 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20'}`}></div>
                  <div className="relative z-10 flex flex-col items-center">
                    <img
                      // The flag URL is now retrieved correctly
                      src={getFlagUrl(country)}
                      alt={country}
                      className="w-16 h-12 object-cover rounded shadow mb-3 border border-neutral-200"
                    />
                    <h2 className="text-xl font-bold mb-1 text-neutral-900">
                      {country}
                    </h2>
                    <p className="text-neutral-600">
                      {groupedByCountry[country].length} Applicant
                      {groupedByCountry[country].length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Applicants Table */}
          {selectedCountry && (
            <div ref={applicantsTableRef} className="mt-12 p-6 rounded-2xl shadow-sm backdrop-blur-md border border-neutral-200 bg-white">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div className="flex items-center gap-3 mb-4 sm:mb-0">
                  <img
                    src={getFlagUrl(selectedCountry)}
                    alt={selectedCountry}
                    className="w-10 h-7 object-cover rounded shadow border border-neutral-200"
                  />
                  <h2 className="text-2xl font-bold text-neutral-900">
                    Applicants for {selectedCountry}
                  </h2>
                </div>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border rounded-xl shadow-sm bg-white text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                  />
                  <button
                    onClick={() => setSelectedCountry(null)}
                    className="flex-shrink-0 text-neutral-600 hover:text-neutral-900 text-sm px-3 py-2 bg-neutral-100 rounded-xl shadow-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-inner">
                <table className="min-w-full text-sm text-left border-collapse">
                  <thead className="bg-neutral-100 text-neutral-700">
                    <tr>
                      {[
                        "#",
                        "Passport",
                        "Name",
                        "Visa Type",
                        "Date",
                        "Fee",
                        "Payment",
                        "Visa Status",
                      ].map((header) => (
                        <th key={header} className="px-4 py-3 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {pagedApplicants
                      .map((b, index) => (
                        <tr
                          key={b.id}
                          className={`transition-colors hover:bg-neutral-100`}
                        >
                          <td className="px-4 py-3 font-medium text-neutral-600">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                          <td className="px-4 py-3 font-mono text-sm">{b.passport || "-"}</td>
                          <td className="px-4 py-3 font-semibold">{b.fullName || "-"}</td>
                          <td className="px-4 py-3">{b.visaType || "-"}</td>
                          <td className="px-4 py-3">{b.date || "-"}</td>
                          <td className="px-4 py-3 text-neutral-600">{b.totalFee || "-"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm ${
                                b.paymentStatus === "Paid"
                                  ? "bg-green-600/20 text-green-700 border border-green-600"
                                  : "bg-red-600/20 text-red-700 border border-red-600"
                              }`}
                            >
                              {b.paymentStatus || "Unpaid"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm ${
                                b.visaStatus === "Approved"
                                  ? "bg-green-600/20 text-green-700 border border-green-600"
                                  : b.visaStatus === "Rejected"
                                  ? "bg-red-600/20 text-red-700 border border-red-600"
                                  : "bg-yellow-600/20 text-yellow-700 border border-yellow-600"
                              }`}
                            >
                              {b.visaStatus || "Processing"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination — 10 records per page */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-neutral-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1}–
                    {Math.min(currentPage * itemsPerPage, filteredApplicants.length)} of{" "}
                    {filteredApplicants.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-md hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) pageNum = i + 1;
                      else if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            currentPage === pageNum
                              ? "bg-neutral-900 text-white shadow-md"
                              : "text-neutral-700 bg-neutral-100 border border-neutral-200 hover:bg-neutral-200"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-md hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
