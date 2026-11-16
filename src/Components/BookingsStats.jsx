import { useEffect, useState, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";

export default function EmployeeBookingsLeaderboard() {
  const [employeeStats, setEmployeeStats] = useState([]);
  const [sortKey, setSortKey] = useState("bookings");
  const [sortDir, setSortDir] = useState("desc");
  
  // --- NEW: State for date range ---
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [loading, setLoading] = useState(false);

  // Req 1: one-time fetch (NOT a live listener) so opening this page reads the
  // collection once instead of continuously re-reading it. Big Firestore-read saving.
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "bookings"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // ---- DATE FILTER ----
      const filtered = data.filter((b) => {
        if (!b.createdAt) return true; // skip if missing

        const created = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);

        // Check if booking is before the start date
        if (startDate && created < startDate) {
          return false;
        }

        // Check if booking is after the end date
        if (endDate && created > endDate) {
          return false;
        }

        // Passes all filters
        return true;
      });

      // ---- GROUP BY EMPLOYEE ----
      const stats = {};
      filtered.forEach((b) => {
        const key = b.userId || b.userEmail;
        if (!stats[key]) {
          stats[key] = {
            userId: b.userId,
            userEmail: b.userEmail,
            bookings: 0,
            approved: 0,
            total: 0,
            received: 0,
            pending: 0,
            profit: 0,
          };
        }

        stats[key].bookings += 1;
        stats[key].total += Number(b.totalFee || 0);
        stats[key].received += Number(b.receivedFee || 0);
        stats[key].pending += Number(b.remainingFee || 0);
        stats[key].profit += Number(b.profit || 0);
        if (b.visaStatus?.toLowerCase() === "approved") {
          stats[key].approved += 1;
        }
      });

      setEmployeeStats(Object.values(stats));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Load once when the page opens and whenever the date filter changes (Req 1)
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ---- SORTING (No changes) ----
  const sorted = [...employeeStats].sort((a, b) => {
    let x = a[sortKey] || 0;
    let y = b[sortKey] || 0;
    if (sortDir === "asc") return x > y ? 1 : x < y ? -1 : 0;
    return x < y ? 1 : x > y ? -1 : 0;
  });

  // ---- SIMPLE FORMATTER (No changes) ----
  const numFmt = (val) => (val ? val.toLocaleString("en-PK") : "0");

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
  
  // --- NEW: Helper to format Date object for <input type="date"> ---
  const formatDateForInput = (date) => {
    if (!date) return "";
    // Creates a YYYY-MM-DD string in the local timezone
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split("T")[0];
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
      {/* Header + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-neutral-200">
        <h2 className="text-lg font-extrabold text-neutral-900">
          Employee Bookings Leaderboard
        </h2>

        <div className="flex items-center gap-3">
          {/* --- UPDATED: Filter Controls --- */}
          <div className="text-sm text-neutral-600">From:</div>
          <input
            type="date"
            value={formatDateForInput(startDate)}
            // Set start date to 00:00:00 on the selected day
            onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
            className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
          />
          <div className="text-sm text-neutral-600">To:</div>
          <input
            type="date"
            value={formatDateForInput(endDate)}
            onChange={handleEndDateChange}
            className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
          />
          
          <div className="w-px h-6 bg-neutral-100 mx-2"></div> {/* Separator */}

          {/* Sort (No changes) */}
          <div className="text-sm text-neutral-600">Sort by:</div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="py-1 px-2 rounded bg-white border border-neutral-200 text-neutral-900"
          >
            <option value="bookings">Bookings</option>
            <option value="approved">Approved</option>
            <option value="received">Received</option>
            <option value="pending">Pending</option>
            <option value="profit">Profit</option>
          </select>
          <button
            onClick={() => setSortDir((s) => (s === "desc" ? "asc" : "desc"))}
            title="Toggle direction"
            className="p-2 bg-white rounded border border-neutral-200 text-neutral-900"
          >
            {sortDir === "desc" ? <FaSortAmountDown /> : <FaSortAmountUp />}
          </button>

          {/* Req 1: manual refresh (data is fetched once on open, not live) */}
          <button
            onClick={fetchStats}
            disabled={loading}
            title="Refresh data"
            className="px-3 py-2 bg-neutral-900 hover:bg-neutral-700 rounded border border-blue-500 text-white text-sm disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Table (No changes) */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead className="bg-white text-neutral-600 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Bookings</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3">Profit</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length ? (
              sorted.map((emp, idx) => (
                <tr
                  key={emp.userId || emp.userEmail}
                  className="border-t border-neutral-200 hover:bg-neutral-100 transition-all duration-200"
                >
                  <td className="px-4 py-3 text-neutral-600 font-bold">
                    #{idx + 1}
                  </td>
                  <td className="px-4 py-3 text-neutral-900 font-medium">
                    {emp.userEmail || emp.userId}
                  </td>
                  <td className="px-4 py-3 text-purple-700 font-semibold">
                    {numFmt(emp.bookings)}
                  </td>
                  <td className="px-4 py-3 text-indigo-700 font-semibold">
                    {numFmt(emp.approved)}
                  </td>
                  <td className="px-4 py-3 text-blue-700 font-semibold">
                    ₨{numFmt(emp.total)}
                  </td>
                  <td className="px-4 py-3 text-blue-700 font-semibold">
                    ₨ {numFmt(emp.received)}
                  </td>
                  <td className="px-4 py-3 text-amber-700 font-semibold">
                    ₨ {numFmt(emp.pending)}
                  </td>
                  <td className="px-4 py-3 text-green-700 font-bold">
                    ₨ {numFmt(emp.profit)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-6 text-neutral-500">
                  No employee booking data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
