import React, { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { effectiveProfit } from "../utils/finance";
import {
  FaSearch,
  FaFilter,
  FaSortAmountDown,
  FaSortAmountUp,
  FaCheck,
} from "react-icons/fa";

// REMOVED: const stripTime = (d) => ...
// REMOVED: const inSameDay = (a, b) => ...

const moneyFmt = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });

// --- NEW: Helper to format Date object for <input type="date"> ---
const formatDateForInput = (date) => {
  if (!date) return "";
  // Creates a YYYY-MM-DD string in the local timezone
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
};

export default function EmployeeLeaderboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  // REMOVED: const [dateFilter, setDateFilter] = useState("All");
  const [startDate, setStartDate] = useState(null); // ADDED
  const [endDate, setEndDate] = useState(null);     // ADDED
  const [search, setSearch] = useState("");

  // Sorting
  const [sortKey, setSortKey] = useState("bookings"); // bookings | earnings | profit
  const [sortDir, setSortDir] = useState("desc");

  // Load once when opened (not a live listener) to cut Firestore reads.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "ticketBookings"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        if (!active) return;
        const arr = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data?.createdAt?.toDate?.() || new Date(0),
          };
        });
        setBookings(arr);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load bookings");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // REMOVED: const matchesDateFilter = (date) => { ... };

  // --- NEW: Handler for End Date (to include the full day) ---
  const handleEndDateChange = (e) => {
    if (!e.target.value) {
      setEndDate(null);
      return;
    }
    // Create date at 00:00 local time
    const date = new Date(e.target.value);
    // Set to 23:59:59.999 local time to include the entire day
    date.setHours(23, 59, 59, 999);
    setEndDate(date);
  };

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings.filter((b) => {
      
      // --- UPDATED: Date range logic ---
      const createdAt = new Date(b.createdAt);
      if (startDate && createdAt < startDate) {
        return false;
      }
      if (endDate && createdAt > endDate) {
        return false;
      }
      // --- End of date logic ---

      if (!term) return true;
      const haystack = (b.createdByEmail || b.createdByName || "").toLowerCase();
      return haystack.includes(term);
    });
  }, [bookings, startDate, endDate, search]); // <-- UPDATED dependencies

  // Employee totals (No changes)
  const employeeTotals = useMemo(() => {
    const map = {};
    filteredBookings.forEach((b) => {
      const key = b.createdByEmail || b.createdByName || "Unknown";
      if (!map[key]) map[key] = { bookings: 0, earnings: 0, payable: 0, profit: 0, name: key };
      map[key].bookings += 1;
      map[key].earnings += Number(b.price) || 0;
      map[key].payable += Number(b.payable) || 0;
      map[key].profit += effectiveProfit(b);
    });
    return Object.values(map);
  }, [filteredBookings]);

  // Sorted employee list (No changes)
  const sortedEmployees = useMemo(() => {
    const arr = [...employeeTotals];
    arr.sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [employeeTotals, sortKey, sortDir]);

  return (
    <div className="mt-5 p-6 bg-white text-neutral-900 rounded-xl">
      <h1 className="text-3xl font-bold mb-6 text-neutral-900">Ticketing</h1>

      {/* --- UPDATED: Filters --- */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        
        {/* --- Date Range Inputs --- */}
        <div className="flex items-center gap-2">
            <span className="text-neutral-600 text-sm">From:</span>
            <input
              type="date"
              value={formatDateForInput(startDate)}
              // Set start date to 00:00:00 on the selected day
              onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
              className="px-2 py-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-900"
            />
            <span className="text-neutral-600 text-sm">To:</span>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={handleEndDateChange}
              className="px-2 py-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-900"
            />
        </div>

        {/* Search Input (No changes) */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-4 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-900"
          />
        </div>

        {/* Sort Controls (No changes) */}
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
          >
            <option value="bookings">Bookings</option>
            <option value="earnings">Earnings</option>
            <option value="payable">Payable</option>
            <option value="profit">Profit</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="p-2 bg-white rounded border border-neutral-200 text-neutral-900"
          >
            {sortDir === "desc" ? <FaSortAmountDown /> : <FaSortAmountUp />}
          </button>
        </div>
      </div>

      {/* Leaderboard Table (No changes) */}
      {loading ? (
        <div>Loading...</div>
      ) : sortedEmployees.length === 0 ? (
        <div>No employees found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-neutral-200 text-left">
            <thead className="bg-white text-neutral-600 uppercase">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2">Bookings</th>
                <th className="px-4 py-2">Earnings</th>
                <th className="px-4 py-2">Payable</th>
                <th className="px-4 py-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp) => (
                <tr
                  key={emp.name}
                  className="border-t border-neutral-200 hover:bg-neutral-100 transition-all duration-150"
                >
                  <td className="px-4 py-2 font-medium">{emp.name}</td>
                  <td className="px-4 py-2 text-purple-700 font-semibold">{emp.bookings}</td>
                  <td className="px-4 py-2 text-blue-700 font-semibold">{moneyFmt(emp.earnings)}</td>
                  <td className="px-4 py-2 text-amber-700 font-semibold">{moneyFmt(emp.payable)}</td>
                  <td className="px-4 py-2 text-green-700 font-bold">{moneyFmt(emp.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
