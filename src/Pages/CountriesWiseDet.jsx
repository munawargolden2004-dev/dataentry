// CountriesWiseDet.jsx
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { FaSearch, FaFilePdf, FaFileCsv, FaUsers } from "react-icons/fa";
import { MdAttachMoney, MdCheckCircle, MdWarning } from "react-icons/md";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";

// --- Flag Helper ---
const countryCodes = {
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
  Bosnia: "ba",
  Botswana: "bw",
  Brazil: "br",
  Brunei: "bn",
  Bulgaria: "bg",
  BurkinaFaso: "bf",
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
  Korea: "kr",
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
  SriLanka: "lk",
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

const getFlagUrl = (country) => {
  const code = countryCodes[country] || "";
  return code ? `https://flagcdn.com/w80/${code}.png` : "";
};

function CountriesWiseDet() {
  const { countryName } = useParams();
  const [bookings, setBookings] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [displayLimit, setDisplayLimit] = useState(20);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
  });

  // 🔹 Global cache fetch
  const { data: rawBookings = [], isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => dataService.fetchAll('bookings'),
    staleTime: 1000 * 30,
  });

  // Filter by country
  useEffect(() => {
    const filtered = rawBookings.filter(
      (b) => (b.country || "").toLowerCase() === countryName.toLowerCase()
    );
    setBookings(filtered);
    setFiltered(filtered);
    calculateStats(filtered);
  }, [countryName, rawBookings]);

  // Handle search + date filters
  useEffect(() => {
    let results = bookings;

    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter((b) =>
        [b.fullName, b.passport, b.userEmail, b.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (fromDate || toDate) {
      results = results.filter((b) => {
        if (!b.date) return false;
        const d = new Date(b.date);
        const from = fromDate ? new Date(fromDate) : null;
        const to = toDate ? new Date(toDate) : null;
        return (!from || d >= from) && (!to || d <= to);
      });
    }

    setFiltered(results);
    calculateStats(results);
  }, [search, fromDate, toDate, bookings]);

  // Calculate stats
  const calculateStats = (data) => {
    let totalRevenue = 0;
    let pendingRevenue = 0;
    let approved = 0;
    let profit = 0;

    data.forEach((b) => {
      totalRevenue += Number(b.receivedFee || 0);
      pendingRevenue += Number(b.remainingFee || 0);
      profit += Number(b.profit || 0)
      if (b.visaStatus?.toLowerCase() === "approved") approved++;
    });

    setStats({
      total: data.length,
      approved,
      totalRevenue,
      pendingRevenue,
      profit,
    });
  };

  // Export CSV
  const exportCSV = () => {
    const headers = [
      "Full Name",
      "Passport",
      "Visa Type",
      "Date",
      "Added By",
      "Email",
      "Phone",
    ];
    const rows = filtered.map((b) => [
      b.fullName,
      b.passport,
      b.visaType,
      b.date,
      b.userEmail,
      b.email,
      b.phone,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `${countryName}_customers.csv`;
    link.click();
  };

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(14);
    doc.text(`${countryName} – Customers Report`, 105, 15, { align: "center" });

    autoTable(doc, {
      startY: 25,
      head: [["Full Name", "Passport", "Visa Type", "Date", "Added By", "Email", "Phone"]],
      body: filtered.map((b) => [
        b.fullName || "-",
        b.passport || "-",
        b.visaType || "-",
        b.date || "-",
        b.userEmail || "-",
        b.email || "-",
        b.phone || "-",
      ]),
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      styles: { fontSize: 8 },
    });

    doc.save(`${countryName}_customers.pdf`);
  };

  return (
    <>
    <AdminNavbar/>
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-neutral-50 to-neutral-50 text-neutral-900 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 animate-fadeIn">
        <img
          src={getFlagUrl(countryName)}
          alt={countryName}
          className="w-12 h-12 rounded shadow-md"
        />
        <h1 className="text-3xl font-bold tracking-wide">
          {countryName} – Customers
        </h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition duration-300">
          <div>
            <p className="text-sm text-neutral-600">Total Customers</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <FaUsers className="text-blue-700 text-3xl" />
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition duration-300">
          <div>
            <p className="text-sm text-neutral-600">Approved Visas</p>
            <p className="text-2xl font-bold text-green-700">{stats.approved}</p>
          </div>
          <MdCheckCircle className="text-green-700 text-3xl" />
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition duration-300">
          <div>
            <p className="text-sm text-neutral-600">Total Revenue</p>
            <p className="text-2xl font-bold text-emerald-700">
              PKR: {stats.totalRevenue + stats.pendingRevenue}
            </p>
          </div>
          <MdAttachMoney className="text-emerald-700 text-3xl" />
        </div>
       <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition duration-300">
          <div>
            <p className="text-sm text-neutral-600">Received Revenue</p>
            <p className="text-2xl font-bold text-green-700">
             PKR:  {stats.totalRevenue.toFixed(2)}
            </p>
          </div>
          <MdAttachMoney className="text-emerald-700 text-3xl" />
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition duration-300">
          <div>
            <p className="text-sm text-neutral-600">Pending Revenue</p>
            <p className="text-2xl font-bold text-orange-700">
             PKR:  {stats.pendingRevenue.toFixed(2)}
            </p>
          </div>
          <MdWarning className="text-orange-700 text-3xl" />
        </div>
         <div className="bg-white p-6 rounded-xl shadow-md flex items-center justify-between transition duration-300">
          <div>
            <p className="text-sm text-neutral-600">Profit</p>
            <p className="text-2xl font-bold text-orange-700">
             PKR:  {stats.profit}
            </p>
          </div>
         <MdAttachMoney className="text-emerald-700 text-3xl" />
        </div>
      </div>

      {/* Filters + Export */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-3 text-neutral-600" />
            <input
              type="text"
              placeholder="Search by name, passport, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </div>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg bg-white border border-neutral-200 px-3 py-2 text-neutral-900"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg bg-white border border-neutral-200 px-3 py-2 text-neutral-900"
          />
        </div>

      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white shadow rounded-lg animate-slideUp">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-neutral-900">
            <tr>
              <th className="p-3 text-left">#</th>
              <th className="p-3 text-left">Full Name</th>
              <th className="p-3 text-left">Passport</th>
              <th className="p-3 text-left">Added By</th>
              <th className="p-3 text-left">Total Fee</th>
              <th className="p-3 text-left">Reciveable</th>
              
              <th className="p-3 text-left">Remaining </th>
              <th className="p-3 text-left">Profit</th>

            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, displayLimit).map((b,index) => (
              <tr
                key={b.id}
                className="border-b border-neutral-200 hover:bg-neutral-100 transition duration-200"
              >
                <th className="p-3">{index + 1}</th>
                <td className="p-3">{b.fullName}</td>
                <td className="p-3">{b.passport}</td>
  
           
                <td className="p-3">{b.userEmail}</td>
                <td className="p-3">{b.totalFee}</td>
                <td className="p-3">{b.receivedFee}</td>
                <td className="p-3">{b.remainingFee}</td>
                <td className="p-3">{b.profit}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan="7" className="text-center p-6 text-neutral-600">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {displayLimit < filtered.length && (
          <div className="mt-6 flex justify-center mb-6">
            <button
              onClick={() => setDisplayLimit((prev) => prev + 20)}
              className="bg-neutral-900 hover:bg-neutral-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
    <Footer/>
    </>
  );
}

export default CountriesWiseDet;
