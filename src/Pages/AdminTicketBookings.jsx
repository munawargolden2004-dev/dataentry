import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { effectiveProfit } from "../utils/finance";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase"; // your firebase config
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  FaDollarSign,
  FaCreditCard,
  FaChartLine,
  FaSearch,
  FaTimes,
  FaEdit,
  FaTrash,
  FaSpinner,
  FaDownload,
  FaFilter,
  FaCheck,
  FaEye,
  FaSortAmountDown,
  FaSortAmountUp,
  FaFileCsv,
  FaCalendarAlt, // Added
  FaAngleDoubleLeft, // Added
  FaAngleLeft, // Added
  FaAngleRight, // Added
  FaAngleDoubleRight, // Added
} from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import { useNavigate } from "react-router-dom";

/**
 * AdminTicketDashboard
 * - Full admin dashboard page showing ticket bookings.
 * - Employee totals + bookings count (live with filters)
 * - Search, date range filters, employee filter
 * - Pagination for main table
 * - Export PDF & CSV
 * - View/Edit/Delete booking modals
 * - Simple SVG mini-bar in employee table
 */

// ---------- Helper functions ----------
const moneyFmt = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// (Other helpers like toTwoDecimals, stripTime, inSameDay, generateCSV remain unchanged)
const toTwoDecimals = (n) =>
  (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const inSameDay = (a, b) => stripTime(a).getTime() === stripTime(b).getTime();

// simple CSV generator
const generateCSV = (rows, filename = "export.csv") => {
  const keys = Object.keys(rows[0] || {});
  const csv =
    [keys.join(",")]
      .concat(
        rows.map((r) =>
          keys
            .map((k) => {
              const v = r[k] ?? "";
              const s = String(v).replace(/"/g, '""');
              if (s.includes(",") || s.includes("\n")) return `"${s}"`;
              return s;
            })
            .join(",")
        )
      )
      .join("\n") + "\n";

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// --- NEW: Helper to format Date object for <input type="date"> ---
const formatDateForInput = (date) => {
  if (!date) return "";
  // Creates a YYYY-MM-DD string in the local timezone
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
};

// ---------- Modal component ----------
const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-2xl" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white bg-opacity-60 p-4">
      <div
        className={`bg-white text-neutral-900 rounded-lg shadow-md w-full ${maxWidth} max-h-[90vh] overflow-y-auto transform transition-all duration-300`}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-neutral-600 hover:text-neutral-900">
            <FaTimes />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

// ---------- Small SVG Bar (pure css/svg) ----------
const MiniBar = ({ value, max = 1 }) => {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div className="h-2 w-28 bg-white rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${w}%`,
          background:
            "linear-gradient(90deg, rgba(59,130,246,1) 0%, rgba(16,185,129,1) 100%)",
        }}
      />
    </div>
  );
};

// ---------- Main Component ----------
export default function AdminTicketDashboard() {
  const navigate = useNavigate();

  // Data
  const queryClient = useQueryClient();

  // 🔹 Global cache fetch
  const { data: rawBookings = [], isLoading: loading } = useQuery({
    queryKey: ['ticketBookings'],
    queryFn: () => dataService.fetchAll('ticketBookings'),
    staleTime: 1000 * 30,
  });

  // Resolve createdAt from any form: live Firestore Timestamp (.toDate),
  // the cached plain-object form (.seconds), or a string/date — else epoch.
  const resolveCreatedAt = (c) => {
    if (c?.toDate) return c.toDate();
    if (c?.seconds) return new Date(c.seconds * 1000);
    const d = new Date(c);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  const bookings = useMemo(() => {
    return rawBookings.map((b) => ({
      ...b,
      createdAt: resolveCreatedAt(b.createdAt),
    })).sort((a, b) => b.createdAt - a.createdAt);
  }, [rawBookings]);

  // UI state
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Sorting for employee list
  const [employeeSortKey, setEmployeeSortKey] = useState("bookings");
  const [employeeSortDir, setEmployeeSortDir] = useState("desc");

  // --- NEW: Pagination state ---
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // REMOVED: Date filter matcher (matchesDateFilter)

  // --- NEW: Handler for End Date (to include the full day) ---
  const handleEndDateChange = (e) => {
    if (!e.target.value) {
      setEndDate(null);
      return;
    }
    const date = new Date(e.target.value);
    date.setHours(23, 59, 59, 999); // Set to end of the day
    setEndDate(date);
  };

  const handleClearDates = () => {
    setStartDate(null);
    setEndDate(null);
  };

  // --- UPDATED: Filtered bookings based on search + date + employee ---
  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings.filter((b) => {
      // --- Date range check ---
      const bookingDate = b.createdAt; // Already a Date object from useEffect
      if (startDate && bookingDate < startDate) {
        return false;
      }
      if (endDate && bookingDate > endDate) {
        return false;
      }
      // --- End date check ---

      // employee filter
      const empKey = b.createdByEmail || b.createdByName || "Unknown";
      if (employeeFilter !== "All" && empKey !== employeeFilter) return false;

      if (!term) return true;

      const haystack = [
        b.pnr,
        b.passenger?.fullName,
        b.createdByEmail,
        b.createdByName,
        b.from,
        b.to,
        b.status,
        b.vendor,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [bookings, search, startDate, endDate, employeeFilter]); // <-- UPDATED dependencies

  // --- NEW: Reset page to 1 when filters change ---
  useEffect(() => {
    setCurrentPage(1);
  }, [search, startDate, endDate, employeeFilter, rowsPerPage]);

  // --- NEW: Paginated bookings ---
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredBookings.slice(start, end);
  }, [filteredBookings, currentPage, rowsPerPage]);

  // --- NEW: Total pages for pagination ---
  const totalPages = useMemo(() => {
    return Math.ceil(filteredBookings.length / rowsPerPage);
  }, [filteredBookings, rowsPerPage]);

  // Totals (based on filtered bookings) - (unchanged)
  const totals = useMemo(() => {
    const sum = (key) => filteredBookings.reduce((acc, b) => acc + (Number(b?.[key]) || 0), 0);
    return {
      earnings: sum("price"),
      payable: sum("payable"),
      profit: filteredBookings.reduce((acc, b) => acc + effectiveProfit(b), 0),
      bookings: filteredBookings.length,
    };
  }, [filteredBookings]);

  // Employee totals (unchanged)
  const employeeTotals = useMemo(() => {
    const totalsMap = {};
    filteredBookings.forEach((b) => {
      const key = b.createdByEmail || b.createdByName || "Unknown";
      if (!totalsMap[key]) totalsMap[key] = { bookings: 0, earnings: 0, payable: 0, profit: 0, name: key };
      totalsMap[key].bookings += 1;
      totalsMap[key].earnings += Number(b.price) || 0;
      totalsMap[key].payable += Number(b.payable) || 0;
      totalsMap[key].profit += effectiveProfit(b);
    });
    return totalsMap;
  }, [filteredBookings]);

  // --- NEW: Chart Data ---
  const { monthlyData, destinationData } = useMemo(() => {
    const months = {};
    const dests = {};

    filteredBookings.forEach((b) => {
      // Month calculation
      if (b.createdAt) {
        const d = new Date(b.createdAt);
        const m = d.toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!months[m]) months[m] = { month: m, Profit: 0, Earnings: 0, Payable: 0, sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
        months[m].Profit += effectiveProfit(b);
        months[m].Earnings += (Number(b.price) || 0);
        months[m].Payable += (Number(b.payable) || 0);
      }

      // Destination calculation
      if (b.to) {
        // Simple extraction logic for country/city if they entered 'City, Country'
        const parts = b.to.split(',');
        const dest = (parts.length > 1 ? parts[parts.length - 1] : b.to).trim().toUpperCase();
        if (!dests[dest]) dests[dest] = { name: dest, value: 0 };
        dests[dest].value += 1;
      }
    });

    const mData = Object.values(months)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(x => ({ month: x.month, Profit: x.Profit, Earnings: x.Earnings, Payable: x.Payable }));
    
    const dData = Object.values(dests)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // top 10

    return { monthlyData: mData, destinationData: dData };
  }, [filteredBookings]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  // Employee list sorted (unchanged)
  const employeeListSorted = useMemo(() => {
    const arr = Object.values(employeeTotals);
    if (!arr.length) return [];
    const maxEarnings = Math.max(...arr.map((a) => a.earnings));
    arr.sort((a, b) => {
      const k = employeeSortKey;
      const av = a[k] ?? 0;
      const bv = b[k] ?? 0;
      if (employeeSortDir === "asc") return av - bv;
      return bv - av;
    });
    return { arr, maxEarnings };
  }, [employeeTotals, employeeSortKey, employeeSortDir]);

  // unique employee options for filter dropdown (unchanged)
  const employeeOptions = useMemo(() => {
    const set = new Set(bookings.map((b) => b.createdByEmail || b.createdByName || "Unknown"));
    return Array.from(set).filter(Boolean);
  }, [bookings]);

  // ---------- Edit / View / Save / Delete (all unchanged) ----------
  const startEdit = (booking) => {
    setEditing(booking);
    setFormData({
      ...booking,
      price: booking.price ?? "",
      payable: booking.payable ?? "",
      profit: booking.profit ?? "",
      pnr: booking.pnr || "",
      status: booking.status || "",
    });
  };

  const startView = (booking) => {
    setViewing(booking);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const ref = doc(db, "ticketBookings", editing.id);
      await updateDoc(ref, {
        pnr: formData.pnr,
        vendor: formData.vendor, // Added vendor
        price: Number(formData.price) || 0,
        payable: Number(formData.payable) || 0,
        profit: Number(formData.profit) || 0,
        status: formData.status,
      });
      dataService.clearCache('ticketBookings');
      queryClient.invalidateQueries({ queryKey: ['ticketBookings'] });
      toast.success("Booking updated");
      setEditing(null);
      setFormData({});
    } catch (err) {
      console.error(err);
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const deleteBooking = async (id) => {
    if (!window.confirm("Delete booking? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "ticketBookings", id));
      dataService.clearCache('ticketBookings');
      queryClient.invalidateQueries({ queryKey: ['ticketBookings'] });
      toast.success("Booking deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete");
    }
  };

  // ---------- Export (unchanged, still uses full filteredBookings list) ----------
  const exportPDF = () => {
    const docPDF = new jsPDF();
    const title = "Ticket Bookings Report";
    // --- UPDATED: PDF Subtitle for new date filter ---
    let sub = "All records";
    if (startDate || endDate) {
      sub = `From: ${startDate ? formatDateForInput(startDate) : 'Start'} To: ${endDate ? formatDateForInput(endDate) : 'Today'}`;
    }
    // ---
    docPDF.setFontSize(14);
    docPDF.text(title, 14, 15);
    docPDF.setFontSize(10);
    docPDF.text(sub, 14, 21);
    docPDF.text(
      `Totals — Bookings: ${totals.bookings} | Earnings: ${moneyFmt(totals.earnings)} | Payable: ${moneyFmt(
        totals.payable
      )} | Profit: ${moneyFmt(totals.profit)}`,
      14,
      27
    );

    autoTable(docPDF, {
      startY: 32,
      head: [
        ["PNR", "Passenger", "Employee", "Route", "Price", "Payable", "Profit", "Status", "Date"],
      ],
      body: filteredBookings.map((b) => [
        b.pnr || "-",
        b.passenger?.fullName || "-",
        b.createdByEmail || b.createdByName || "-",
        `${b.from || "-"} → ${b.to || "-"}`,
        Number(b.price) || 0,
        Number(b.payable) || 0,
        Number(b.profit) || 0,
        b.status || "-",
        b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "-",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    docPDF.save("ticket-bookings-report.pdf");
  };

  const exportCSV = () => {
    if (!filteredBookings.length) {
      toast("No rows to export");
      return;
    }
    const rows = filteredBookings.map((b) => ({
      id: b.id,
      pnr: b.pnr || "",
      passenger: b.passenger?.fullName || "",
      employee: b.createdByEmail || b.createdByName || "",
      from: b.from || "",
      to: b.to || "",
      price: b.price || 0,
      payable: b.payable || 0,
      profit: b.profit || 0,
      status: b.status || "",
      createdAt: b.createdAt ? new Date(b.createdAt).toLocaleString() : "",
    }));
    generateCSV(rows, "ticket-bookings.csv");
  };

  // ---------- UI Render ----------
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
      <AdminNavbar />
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* header */}
        <div className="flex items-center justify-between gap-4 flex-col sm:flex-row">
          <div>
            <h1 className="text-3xl font-extrabold text-neutral-900">
              ✈️ Ticket Bookings Dashboard
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              Live bookings, employee leaderboard, and exports.
            </p>
          </div>

          {/* --- UPDATED: Header filter controls --- */}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-stretch">
            {/* employee filter */}
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="py-2 px-4 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            >
              <option value="All">All Employees</option>
              {employeeOptions.map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>

          </div>
        </div>

        {/* --- NEW: Date filter row --- */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200">
          <FaFilter className="text-neutral-600" />
          <span className="text-sm font-medium text-neutral-700">Filter by Date:</span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-600">From:</label>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
              className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-600">To:</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={handleEndDateChange}
              className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
            />
          </div>
          {(startDate || endDate) && (
            <button onClick={handleClearDates} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-neutral-100 hover:bg-neutral-200 rounded-md">
              <FaTimes /> Clear Dates
            </button>
          )}
        </div>


        {/* Totals cards (unchanged) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Bookings */}
          <div className="p-5 rounded-2xl shadow-md bg-gradient-to-r from-neutral-100 to-neutral-100 border border-purple-200 transform transition duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-purple-700 font-semibold uppercase">Bookings</div>
                <div className="mt-2 text-2xl font-extrabold">{totals.bookings}</div>
              </div>
              <div className="p-3 rounded-full bg-white text-purple-700">
                <FaCheck />
              </div>
            </div>
            <div className="mt-3 text-xs text-purple-700">Updated live</div>
          </div>
          {/* Card 2: Earnings */}
          <div className="p-5 rounded-2xl shadow-md bg-gradient-to-r from-neutral-100 to-neutral-100 border border-blue-200 transform transition duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-700 font-semibold uppercase">Earnings</div>
                <div className="mt-2 text-2xl font-extrabold">{moneyFmt(totals.earnings)}</div>
              </div>
              <div className="p-3 rounded-full bg-white text-blue-700">
                <FaDollarSign />
              </div>
            </div>
            <div className="mt-3 text-xs text-blue-700">Sum of Price</div>
          </div>
          {/* Card 3: Payable */}
          <div className="p-5 rounded-2xl shadow-md bg-gradient-to-r from-white to-white border border-amber-600 transform transition duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-amber-700 font-semibold uppercase">Payable</div>
                <div className="mt-2 text-2xl font-extrabold">{moneyFmt(totals.payable)}</div>
              </div>
              <div className="p-3 rounded-full bg-white text-amber-700">
                <FaCreditCard />
              </div>
            </div>
            <div className="mt-3 text-xs text-amber-700">Sum of Payable</div>
          </div>
          {/* Card 4: Profit */}
          <div className="p-5 rounded-2xl shadow-md bg-gradient-to-r from-white to-white border border-green-600 transform transition duration-300">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-green-700 font-semibold uppercase">Profit</div>
                <div className="mt-2 text-2xl font-extrabold">{moneyFmt(totals.profit)}</div>
              </div>
              <div className="p-3 rounded-full bg-white text-green-700">
                <FaChartLine />
              </div>
            </div>
            <div className="mt-3 text-xs text-green-700">Sum of Profit</div>
          </div>
        </div>

        {/* --- NEW: Charts Section --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {monthlyData.length > 0 && (
            <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6">
              <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Monthly Financials</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                    <XAxis dataKey="month" stroke="#525252" />
                    <YAxis stroke="#525252" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                      itemStyle={{ color: '#171717' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Bar isAnimationActive={false} dataKey="Earnings" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {destinationData.length > 0 && (
            <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6">
              <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Top 10 Destinations</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={destinationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {destinationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* search (unchanged) */}
        <div className="relative w-full">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            className="w-full pl-12 pr-4 py-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            placeholder="Search by PNR, passenger, employee, route..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-red-800"
            >
              <FaTimes />
            </button>
          )}
        </div>

        {/* Employee leaderboard (unchanged) */}
        <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-neutral-200">
            <h2 className="text-lg font-extrabold text-neutral-900">Employee Leaderboard</h2>
            <div className="flex items-center gap-3">
              <div className="text-sm text-neutral-600">Sort by:</div>
              <select
                value={employeeSortKey}
                onChange={(e) => setEmployeeSortKey(e.target.value)}
                className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
              >
                <option value="bookings">Bookings</option>
                <option value="earnings">Earnings</option>
                <option value="profit">Profit</option>
              </select>

              <button
                onClick={() => setEmployeeSortDir((s) => (s === "desc" ? "asc" : "desc"))}
                title="Toggle direction"
                className="p-2 bg-white rounded border border-neutral-200 text-neutral-900"
              >
                {employeeSortDir === "desc" ? <FaSortAmountDown /> : <FaSortAmountUp />}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left border-collapse">
              <thead className="bg-white text-neutral-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Bookings</th>
                  <th className="px-4 py-3">Earnings</th>
                  <th className="px-4 py-3">Payable</th>
                  <th className="px-4 py-3">Profit</th>
                  <th className="px-4 py-3">Spark</th>
                </tr>
              </thead>
              <tbody>
                {employeeListSorted.arr && employeeListSorted.arr.length ? (
                  employeeListSorted.arr.map((emp) => (
                    <tr
                      key={emp.name}
                      className="border-t border-neutral-200 hover:bg-neutral-100 transition-all duration-200"
                    >
                      <td className="px-4 py-3 text-neutral-900 font-medium">{emp.name}</td>
                      <td className="px-4 py-3 text-purple-700 font-semibold">{emp.bookings}</td>
                      <td className="px-4 py-3 text-blue-700 font-semibold">{moneyFmt(emp.earnings)}</td>
                      <td className="px-4 py-3 text-amber-700 font-semibold">{moneyFmt(emp.payable)}</td>
                      <td className="px-4 py-3 text-green-700 font-bold">{moneyFmt(emp.profit)}</td>
                      <td className="px-4 py-3">
                        <MiniBar value={emp.earnings} max={employeeListSorted.maxEarnings || emp.earnings || 1} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-neutral-500">
                      No employee data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- UPDATED: Bookings table --- */}
        <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-neutral-900">Bookings ({filteredBookings.length})</h2>
            <div className="text-sm text-neutral-600">Click view to see details</div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-neutral-600">Loading bookings...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-10 text-neutral-500">No bookings found for the selected filters.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left border-collapse">
                  <thead className="bg-white text-neutral-600 uppercase tracking-wider">
                    <tr>
                      {["#", "PNR", "Passenger", "Employee", "Route", "Price", "Payable", "Profit", "Status", "Date", "Actions"].map(
                        (head) => (
                          <th key={head} className="px-4 py-3 font-semibold whitespace-nowrap">
                            {head}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {/* --- USE paginatedBookings here --- */}
                    {paginatedBookings.map((b, i) => (
                      <tr key={b.id} className="border-t border-neutral-200 hover:bg-neutral-100 transition-all duration-150">
                        {/* --- UPDATED row number --- */}
                        <td className="px-4 py-3 text-neutral-700">{(currentPage - 1) * rowsPerPage + i + 1}</td>
                        <td className="px-4 py-3 text-neutral-700">{b.pnr || "-"}</td>
                        <td className="px-4 py-3 font-medium text-neutral-900">{b.passenger?.fullName || "-"}</td>
                        <td className="px-4 py-3 text-neutral-700">{b.createdByEmail || b.createdByName || "-"}</td>
                        <td className="px-4 py-3 text-neutral-700">{(b.from || "-") + " → " + (b.to || "-")}</td>
                        <td className="px-4 py-3 text-blue-700 font-medium">{moneyFmt(b.price)}</td>
                        <td className="px-4 py-3 text-amber-700 font-medium">{moneyFmt(b.payable)}</td>
                        <td className="px-4 py-3 text-green-700 font-bold">{moneyFmt(b.profit)}</td>
                        <td className="px-4 py-3 text-neutral-700">{b.status || "-"}</td>
                        <td className="px-4 py-3 text-neutral-700">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-center">
                            <button onClick={() => startView(b)} className="p-2 text-cyan-700 hover:text-cyan-800 transition-colors" title="View Details">
                              <FaEye />
                            </button>
                            <button onClick={() => startEdit(b)} className="p-2 text-blue-700 hover:text-blue-800 transition-colors" title="Edit Booking">
                              <FaEdit />
                            </button>
                            <button onClick={() => deleteBooking(b.id)} className="p-2 text-red-700 hover:text-red-800 transition-colors" title="Delete Booking">
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* --- NEW: Pagination Controls --- */}
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                setCurrentPage={setCurrentPage}
                rowsPerPage={rowsPerPage}
                setRowsPerPage={setRowsPerPage}
                totalRows={filteredBookings.length}
              />
            </>
          )}
        </div>
      </main>

      <Footer />

      {/* View Modal (unchanged) */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Booking Details">
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">PNR</div>
                <div className="font-medium mt-1">{viewing.pnr || "-"}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Trip Type</div>
                <div className="font-medium mt-1">{viewing.tripType || "-"}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Route</div>
                <div className="font-medium mt-1">{`${viewing.from || "-"} → ${viewing.to || "-"}`}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Vendor</div>
                <div className="font-medium mt-1">{viewing.vendor || "-"}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Departure</div>
                <div className="font-medium mt-1">{viewing.departure || "-"}</div>
              </div>
              {viewing.returnDate && (
                <div className="bg-neutral-100 p-3 rounded-md">
                  <div className="text-xs text-neutral-600">Return Date</div>
                  <div className="font-medium mt-1">{viewing.returnDate}</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Price (Earnings)</div>
                <div className="font-medium mt-1 text-blue-700">{moneyFmt(viewing.price)}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Payable</div>
                <div className="font-medium mt-1 text-amber-700">{moneyFmt(viewing.payable)}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Profit</div>
                <div className="font-medium mt-1 text-green-700">{moneyFmt(viewing.profit)}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Passengers</div>
                <div className="font-medium mt-1">{`Adults: ${viewing.adults || 0}, Children: ${viewing.children || 0}, Infants: ${viewing.infants || 0}`}</div>
              </div>
            </div>

            <div className="bg-neutral-100 p-3 rounded-md">
              <div className="text-xs text-neutral-600">Passenger Name</div>
              <div className="font-medium mt-1">{viewing.passenger?.fullName || "-"}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Passport</div>
                <div className="font-medium mt-1">{viewing.passenger?.passport || "-"}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">CNIC</div>
                <div className="font-medium mt-1">{viewing.passenger?.cnic || "-"}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Phone</div>
                <div className="font-medium mt-1">{viewing.passenger?.phone || "-"}</div>
              </div>
            </div>

            <div className="bg-neutral-100 p-3 rounded-md">
              <div className="text-xs text-neutral-600">Note</div>
              <div className="font-medium mt-1">{viewing.note || "-"}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Status</div>
                <div className="font-medium mt-1">{viewing.status || "-"}</div>
              </div>
              <div className="bg-neutral-100 p-3 rounded-md">
                <div className="text-xs text-neutral-600">Created By</div>
                <div className="font-medium mt-1">{viewing.createdByName || viewing.createdByEmail || "-"}</div>
              </div>
            </div>

            <div className="bg-neutral-100 p-3 rounded-md">
              <div className="text-xs text-neutral-600">Created On</div>
              <div className="font-medium mt-1">{viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : "-"}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal (Added 'Vendor' input) */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Booking" maxWidth="max-w-3xl">
        {editing && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm text-neutral-700 font-semibold">Read-only</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-white p-3 rounded-md">
                  <div className="text-xs text-neutral-600">Passenger</div>
                  <div className="font-medium mt-1">{editing.passenger?.fullName || "-"}</div>
                </div>
                <div className="bg-white p-3 rounded-md">
                  <div className="text-xs text-neutral-600">Route</div>
                  <div className="font-medium mt-1">{`${editing.from || "-"} → ${editing.to || "-"}`}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-600 text-sm font-semibold mb-1">PNR</label>
                <input
                  value={formData.pnr || ""}
                  onChange={(e) => setFormData({ ...formData, pnr: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>
              <div>
                <label className="block text-neutral-600 text-sm font-semibold mb-1">Status</label>
                <input
                  value={formData.status || ""}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>
              <div>
                <label className="block text-neutral-600 text-sm font-semibold mb-1">Vendor</label>
                <input
                  value={formData.vendor || ""}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>

              <div>
                <label className="block text-neutral-600 text-sm font-semibold mb-1">Price (Earnings)</label>
                <input
                  type="number"
                  value={formData.price ?? ""}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>
              <div>
                <label className="block text-neutral-600 text-sm font-semibold mb-1">Payable</label>
                <input
                  type="number"
                  value={formData.payable ?? ""}
                  onChange={(e) => setFormData({ ...formData, payable: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>
              <div>
                <label className="block text-neutral-600 text-sm font-semibold mb-1">Profit</label>
                <input
                  type="number"
                  value={formData.profit ?? ""}
                  onChange={(e) => setFormData({ ...formData, profit: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-neutral-100 rounded-lg hover:bg-neutral-200">
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-100 rounded-lg hover:bg-neutral-700 disabled:opacity-60"
              >
                {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- NEW: Pagination Component ----------
function PaginationControls({
  currentPage,
  totalPages,
  setCurrentPage,
  rowsPerPage,
  setRowsPerPage,
  totalRows,
}) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, totalRows);

  const PBtn = ({ onClick, disabled, children, title }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2 rounded-md bg-neutral-100 text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-200"
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-neutral-200 text-sm text-neutral-600">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <select
          value={rowsPerPage}
          onChange={(e) => setRowsPerPage(Number(e.target.value))}
          className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <div className="font-medium">
        Showing {startRow}–{endRow} of {totalRows}
      </div>

      <div className="flex items-center gap-2">
        <PBtn onClick={() => setCurrentPage(1)} disabled={!canGoPrev} title="First page">
          <FaAngleDoubleLeft />
        </PBtn>
        <PBtn onClick={() => setCurrentPage(currentPage - 1)} disabled={!canGoPrev} title="Previous page">
          <FaAngleLeft />
        </PBtn>

        <span className="font-semibold text-neutral-900">
          Page {currentPage} of {totalPages > 0 ? totalPages : 1}
        </span>

        <PBtn onClick={() => setCurrentPage(currentPage + 1)} disabled={!canGoNext} title="Next page">
          <FaAngleRight />
        </PBtn>
        <PBtn onClick={() => setCurrentPage(totalPages)} disabled={!canGoNext} title="Last page">
          <FaAngleDoubleRight />
        </PBtn>
      </div>
    </div>
  );
}
