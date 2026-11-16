import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { db } from "../firebase";
import toast from "react-hot-toast";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { FaEdit, FaSave, FaTimes, FaSpinner, FaSearch, FaPassport, FaUser, FaEye, FaCalendarAlt, FaAngleDoubleLeft, FaAngleLeft, FaAngleRight, FaAngleDoubleRight, FaChartPie, FaTags } from "react-icons/fa";
import Footer from "../Components/Footer";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

// --- Moved to top level ---
const inputClass = "w-full bg-white text-neutral-900 rounded-lg px-4 py-3 mt-1 border border-neutral-200 focus:ring-2 focus:ring-neutral-300";

// --- NEW: Helper to format Date object for <input type="date"> ---
const formatDateForInput = (date) => {
  if (!date) return "";
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split("T")[0];
};

export default function ApprovedVisas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [filter, setFilter] = useState("All");
  // const [dateFilter, setDateFilter] = useState("All Time"); // REMOVED
  const [startDate, setStartDate] = useState(null); // NEW
  const [endDate, setEndDate] = useState(null);     // NEW
  const [selectedReference, setSelectedReference] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);

  // --- NEW: Pagination state ---
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const queryClient = useQueryClient();

  // 🔹 Global cache fetch
  const { data: rawBookings = [], isLoading } = useQuery({
    queryKey: ['my-visa-bookings', user?.uid], // shared with Countries + Search: only this user's visas, downloaded once
    queryFn: () => dataService.fetchMyBookings(user.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  // Filter to just this user's bookings and sort
  useEffect(() => {
    if (!user) return;
    const t = (b) => (b.createdAt ? new Date(b.createdAt).getTime() : (b.date ? new Date(b.date).getTime() : 0));
    const sortedData = rawBookings
      .filter((b) => b.userId === user.uid)
      .sort((a, b) => t(b) - t(a)); // newest-created first, so new entries land on top
    setBookings(sortedData);
  }, [rawBookings, user]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  // --- UPDATED: Filtering logic ---
  // --- UPDATED: Filtering logic ---
  useEffect(() => {
    let data = [...bookings]; // 'bookings' now has ALL sorted records

    // --- Apply status and date filters first ---
    if (filter !== "All") {
      data = data.filter((booking) => booking.visaStatus === filter);
    }

    if (startDate) {
      data = data.filter(b => {
        if (!b.date) return false;
        const bookingDate = new Date(b.date);
        bookingDate.setHours(0, 0, 0, 0);
        return bookingDate >= startDate;
      });
    }
    if (endDate) {
      data = data.filter(b => {
        if (!b.date) return false;
        const bookingDate = new Date(b.date);
        return bookingDate <= endDate;
      });
    }

    // --- NEW: Filter by Reference ---
    if (selectedReference) {
      data = data.filter(b => (b.reference || "").trim().toLowerCase() === selectedReference.toLowerCase());
    }

    // --- NEW: Conditional Search vs. De-duplication ---
    const isSearching = searchTerm.trim() !== "";

    if (isSearching) {
      // If searching, just filter by the search term
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      data = data.filter(
        (b) =>
          b.passport?.toLowerCase().includes(lowerCaseSearchTerm) ||
          b.fullName?.toLowerCase().includes(lowerCaseSearchTerm) ||
          b.country?.toLowerCase().includes(lowerCaseSearchTerm) ||
          b.reference?.toLowerCase().includes(lowerCaseSearchTerm)
      );
    } else {
      // If NOT searching, apply the de-duplication logic
      // 'data' is already sorted by date and filtered by status/date
      const unique = [];
      const seen = new Set();
      for (const b of data) {
        const key = `${b.passport || ""}-${b.country || ""}`;
        if (!seen.has(key)) {
          unique.push(b);
          seen.add(key);
        }
      }
      data = unique; // The final list is the unique, most recent entries
    }

    setFilteredBookings(data);
  }, [filter, startDate, endDate, searchTerm, selectedReference, bookings]);

  // --- NEW: Reset page to 1 when filters change ---
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, startDate, endDate, searchTerm, selectedReference, rowsPerPage]);

  const uniqueReferences = useMemo(() => {
    const refs = bookings.map(b => (b.reference || "").trim() || "N/A");
    return [...new Set(refs)].sort();
  }, [bookings]);

  const chartData = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    let processing = 0;
    filteredBookings.forEach(b => {
      if (b.visaStatus === "Approved") approved++;
      else if (b.visaStatus === "Rejected") rejected++;
      else processing++;
    });
    return [
      { name: "Approved", value: approved, color: "#10b981" },
      { name: "Processing", value: processing, color: "#f59e0b" },
      { name: "Rejected", value: rejected, color: "#ef4444" },
    ];
  }, [filteredBookings]);

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

  // --- NEW: Date filter handlers ---
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

  // (handleEditChange, startEdit, saveEdit, cancelEdit, viewDetails, closeView, getStatusColor... all unchanged)
  // ... (all other functions remain the same) ...
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    const updatedData = { ...editData, [name]: value };

    const total = Number(updatedData.totalFee) || 0;
    const received = Number(updatedData.receivedFee) || 0;
    const embassy = Number(updatedData.embassyFee) || 0;
    const vendor = Number(updatedData.vendorFee) || 0;

    // ✅ Prevent negative remaining fee
    updatedData.remainingFee = Math.max(0, total - received);
    updatedData.profit = total - embassy - vendor;

    setEditData(updatedData);
  };
  const startEdit = (booking) => {
    if (!user || booking.userId !== user.uid) {
      toast.error("You can only edit your own records.");
      return;
    }
    setEditing(booking.id);
    setEditData({ ...booking });
  };
  const saveEdit = async (id) => {
    if (!user) {
      toast.error("You must be logged in to update records.");
      return;
    }
    try {
      setSaving(true);
      const docRef = doc(db, "bookings", id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists() || docSnap.data().userId !== user.uid) {
        toast.error("You do not have permission to update this record.");
        return;
      }

      const oldData = docSnap.data();
      const oldStatus = oldData.visaStatus;
      const newStatus = editData.visaStatus;
      const emailSent = oldData.emailSent || false;

      const updateData = {
        ...editData,
        totalFee: Number(editData.totalFee) || 0,
        receivedFee: Number(editData.receivedFee) || 0,
        remainingFee: Number(editData.remainingFee) || 0,
        profit: Number(editData.profit) || 0,
        embassyFee: Number(editData.embassyFee) || 0,
        vendorFee: Number(editData.vendorFee) || 0,
        passport: (editData.passport || "").trim(),
        fullName: (editData.fullName || "").trim(),
        country: (editData.country || "").trim(),
        email: (editData.email || "").trim(),
        phone: (editData.phone || "").trim(),
        reference: (editData.reference || "").trim(),
        vendor: (editData.vendor || "").trim(),
        vendorContact: (editData.vendorContact || "").trim(),
      };
      delete updateData.id;

      // Appointment-type visas must NEVER trigger emails/follow-ups (Req 5)
      const isAppointment = editData.visaType === "Appointment";

      // ✅ Check if status changed to "Processing" - Schedule follow-ups 1 & 2
      const statusChangedToProcessing =
        newStatus === "Processing" &&
        oldStatus !== "Processing" &&
        !isAppointment;

      if (statusChangedToProcessing) {
        const processingDate = new Date();

        const followUp1Date = new Date(processingDate);
        followUp1Date.setDate(followUp1Date.getDate() + 2); // 2 days later

        const followUp2Date = new Date(processingDate);
        followUp2Date.setDate(followUp2Date.getDate() + 7); // 7 days later

        // Schedule follow-up emails (store as Date -> Firestore Timestamp for consistency)
        updateData["emailTracking.followUp1ScheduledDate"] = followUp1Date;
        updateData["emailTracking.followUp2ScheduledDate"] = followUp2Date;
        updateData.nextEmailDue = followUp1Date; // powers the efficient follow-up cron
      }

      // Stop follow-ups entirely for rejected or appointment records (Req 5 / cron pointer).
      if (isAppointment || newStatus === "Rejected") {
        updateData.nextEmailDue = null;
      }

      // Optimistic UI update
      const previousBookings = [...bookings];
      setBookings(prev => prev.map(b => b.id === docRef.id ? { ...b, ...updateData } : b));
      setEditing(null);
      setEditData({});

      try {
        await updateDoc(docRef, updateData);
        await dataService.clearMine('visa', user.uid);
        queryClient.invalidateQueries({ queryKey: ['my-visa-bookings', user?.uid] });
        toast.success("Booking updated successfully!");
      } catch (error) {
        setBookings(previousBookings); // Rollback on error
        throw error;
      }

    } catch (error) {
      console.error("Save error:", error);
      toast.error("Error updating booking: " + error.message);
    } finally {
      setSaving(false);
    }
  };
  const cancelEdit = () => {
    setEditing(null);
    setEditData({});
  };
  const viewDetails = (booking) => {
    setViewing(booking);
  };
  const closeView = () => {
    setViewing(null);
  };
  const getStatusColor = (status) => {
    switch (status) {
      case "Approved": return "bg-green-600";
      case "Rejected": return "bg-red-600";
      case "Processing": return "bg-yellow-600";
      default: return "bg-neutral-100";
    }
  };


  if (!user) {
    // (Unchanged)
    return (
      <div className="p-6 min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-md border border-neutral-200">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">
            Access Denied
          </h2>
          <p className="text-neutral-600">Please log in to view your visa records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900">
            My Visa Records 🛂
          </h1>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                placeholder="Search by name, passport, country..."
                className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-white text-neutral-900 rounded-lg px-4 py-3 shadow-sm border border-neutral-200 focus:ring-2 focus:ring-neutral-300 w-full sm:w-auto"
            >
              <option value="All">All Status</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Processing">Processing</option>
            </select>
          </div>
        </div>

        {/* --- NEW: Date Filter Row --- */}
        <div className="mb-6 flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200">
          <FaCalendarAlt className="text-neutral-600" />
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

        {/* --- NEW: Analytics & References Block --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Charts Widget */}
          <div className="md:col-span-1 bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
             <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
                <FaChartPie className="text-blue-600" /> Application Status
             </h3>
             <div className="h-56 w-full">
                {filteredBookings.length === 0 ? (
                   <div className="h-full flex items-center justify-center text-neutral-500">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: 'none', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
             </div>
             <div className="flex justify-between mt-2 px-2 text-xs font-semibold">
                <span className="text-emerald-700 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Approved: {chartData[0].value}</span>
                <span className="text-amber-700 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Process: {chartData[1].value}</span>
                <span className="text-red-700 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> Rejected: {chartData[2].value}</span>
             </div>
          </div>

          {/* Reference Search Box */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 flex flex-col">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <FaTags className="text-blue-600" /> Filter by Client Reference
               </h3>
               {selectedReference && (
                 <button onClick={() => setSelectedReference("")} className="text-xs text-red-700 hover:underline">
                   Clear Reference Filter
                 </button>
               )}
             </div>
             
             <p className="text-sm text-neutral-600 mb-4">
                Click on any reference below to isolate their associated clients in the table.
             </p>

             <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[160px] pr-2 custom-scrollbar">
                {uniqueReferences.length === 0 ? (
                  <span className="text-neutral-500 text-sm">No references found.</span>
                ) : (
                  uniqueReferences.map((ref, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedReference(selectedReference === ref.toLowerCase() ? "" : ref.toLowerCase())}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                        selectedReference === ref.toLowerCase() 
                          ? 'bg-blue-600/20 text-blue-700 border-blue-500' 
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100 hover:border-neutral-400'
                      }`}
                    >
                      {ref === "N/A" ? "No Reference Code" : ref}
                    </button>
                  ))
                )}
             </div>
          </div>

        </div>


        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-blue-600 text-4xl" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center p-10 bg-white rounded-xl border border-neutral-200">
            <p className="text-lg text-neutral-600">No visa records found for your account based on the selected filters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border-collapse">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-neutral-600">#</th>
                    <th className="px-4 py-3 text-neutral-600">Passport / Name</th>
                    <th className="px-4 py-3 text-neutral-600">Country / Visa Type</th>
                    <th className="px-4 py-3 text-neutral-600">Status</th>
                    <th className="px-4 py-3 text-neutral-600">Financials</th>
                    <th className="px-4 py-3 text-neutral-600">Embassy Info</th>
                    <th className="px-4 py-3 text-neutral-600">Vendor Info</th>
                    <th className="px-4 py-3 text-neutral-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* --- UPDATED: Map over paginatedBookings --- */}
                  {paginatedBookings.map((b, index) => (
                    <tr key={b.id} className="border-t border-neutral-200 hover:bg-neutral-100 transition-colors">
                      {/* --- UPDATED: Row number --- */}
                      <td className="px-4 py-4 align-top">{(currentPage - 1) * rowsPerPage + index + 1}</td>
                      <td className="px-4 py-4 align-top">
                        <div className="font-bold text-neutral-900">{b.fullName}</div>
                        <div className="text-neutral-600 text-xs">{b.passport}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="font-bold text-neutral-900">{b.country}</div>
                        <div className="text-neutral-600 text-xs">{b.visaType}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full text-neutral-900 ${getStatusColor(b.visaStatus)}`}>
                          {b.visaStatus}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="text-green-700">Total: {b.totalFee}</div>
                        <div className="text-blue-700">Received: {b.receivedFee}</div>
                        <div className="text-red-700">Remaining: {b.remainingFee}</div>
                        <div className="text-green-700">Profit: {b.profit}</div>
                        <div className="text-neutral-600 text-xs">{b.paymentStatus}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="text-neutral-700">Sent: {b.sentToEmbassy || "-"}</div>
                        <div className="text-neutral-700">Received: {b.receiveFromEmbassy || "-"}</div>
                        <div className="text-neutral-700">Ref: {b.reference || "-"}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="text-neutral-700">Vendor Contact: {b.vendorContact || "-"}</div>
                        <div className="text-neutral-700">Vendor Fee: {b.vendorFee || "-"}</div>
                        <div className="text-neutral-700">Embassy Fee: {b.embassyFee || "-"}</div>
                      </td>
                      <td className="px-4 py-4 align-top flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => viewDetails(b)}
                          className="bg-neutral-900 text-white px-3 py-1 rounded-lg flex items-center gap-2 hover:bg-neutral-700 transition-colors"
                        >
                          <FaEye /> View
                        </button>
                        <button
                          onClick={() => startEdit(b)}
                          className="bg-neutral-900 text-white px-3 py-1 rounded-lg flex items-center gap-2 hover:bg-neutral-700 transition-colors"
                        >
                          <FaEdit /> Edit
                        </button>
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

          </div>
        )}
      </div>

      {/* ===================== EDIT MODAL (CLEANED) ===================== */}
      {editing && (
        <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-8 w-full max-w-5xl relative my-8">
            <button
              onClick={cancelEdit}
              className="absolute top-4 right-4 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <FaTimes size={24} />
            </button>
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">Edit Visa Record</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Personal Info */}
              <div>
                <label className="block text-sm font-medium text-neutral-600">Full Name</label>
                <input type="text" name="fullName" value={editData.fullName || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Passport Number</label>
                <input type="text" name="passport" value={editData.passport || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Expiry Date</label>
                <input type="date" name="expiryDate" value={editData.expiryDate || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Email</label>
                <input type="email" name="email" value={editData.email || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Phone</label>
                <input type="text" name="phone" value={editData.phone || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Country</label>
                <input type="text" name="country" value={editData.country || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Visa Type</label>
                <input type="text" name="visaType" value={editData.visaType || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>

              {/* Embassy Info */}
              <div>
                <label className="block text-sm font-medium text-neutral-600">Sent to Embassy</label>
                <input type="text" name="sentToEmbassy" value={editData.sentToEmbassy || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Received from Embassy</label>
                <input type="text" name="receivedFromEmbassy" value={editData.receivedFromEmbassy || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Reference</label>
                <input type="text" name="reference" value={editData.reference || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>

              {/* Financials */}
              <div>
                <label className="block text-sm font-medium text-neutral-600">Total Fee</label>
                <input disabled type="number" name="totalFee" value={editData.totalFee || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Received Fee</label>
                <input type="number" name="receivedFee" value={editData.receivedFee || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Remaining Fee</label>
                <input type="number" readOnly value={editData.remainingFee || 0}
                  className="bg-neutral-100 text-neutral-700 rounded-lg px-4 py-3 mt-1 border border-neutral-200 cursor-not-allowed w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Embassy Fee</label>
                <input type="number" name="embassyFee" value={editData.embassyFee || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Vendor Fee</label>
                <input type="number" name="vendorFee" value={editData.vendorFee || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Profit</label>
                <input type="number" readOnly value={editData.profit || 0}
                  className="bg-neutral-100 text-neutral-700 rounded-lg px-4 py-3 mt-1 border border-neutral-200 cursor-not-allowed w-full" />
              </div>

              {/* Vendor Info */}
              <div>
                <label className="block text-sm font-medium text-neutral-600">Vendor Name</label>
                <input type="text" name="vendor" value={editData.vendor || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Vendor Contact</label>
                <input type="text" name="vendorContact" value={editData.vendorContact || ""} onChange={handleEditChange}
                  className={inputClass} />
              </div>

              {/* Statuses */}
              <div>
                <label className="block text-sm font-medium text-neutral-600">Visa Status</label>
                <select name="visaStatus" value={editData.visaStatus || "Processing"} onChange={handleEditChange}
                  className={inputClass}>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Processing">Processing</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600">Payment Status</label>
                <select name="paymentStatus" value={editData.paymentStatus || "Unpaid"} onChange={handleEditChange}
                  className={inputClass}>
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partially Paid">Partially Paid</option>
                </select>
              </div>

              {/* Remarks */}
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-neutral-600">Remarks</label>
                <textarea name="remarks" rows={3} value={editData.remarks || ""} onChange={handleEditChange}
                  className={`${inputClass} resize-none`} />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-4">
              <button onClick={cancelEdit}
                className="px-6 py-3 bg-neutral-100 text-neutral-900 rounded-xl font-semibold hover:bg-neutral-200 transition-colors"
                disabled={saving}>
                Cancel
              </button>
              <button onClick={() => saveEdit(editing)}
                className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-700 transition-colors disabled:bg-neutral-200 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={saving}>
                {saving ? <><FaSpinner className="animate-spin" /> Saving...</> : <><FaSave /> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== VIEW MODAL (CLEANED) ===================== */}
      {viewing && (
        <ViewModal record={viewing} onClose={closeView} getStatusColor={getStatusColor} />
      )}
      <Footer />
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

// ---------- NEW: View Modal Component (for cleanliness) ----------
function ViewModal({ record, onClose, getStatusColor }) {

  const DetailRow = ({ label, value, children }) => {
    const content = children || value;
    if (!content && content !== 0) return null; // Don't render if value is null/undefined/""
    return (
      <div className="py-2">
        <div className="text-sm font-medium text-neutral-600">{label}</div>
        <div className="text-md text-neutral-900">{content}</div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-8 w-full max-w-4xl relative my-8 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-neutral-600 hover:text-neutral-900 transition-colors">
          <FaTimes size={24} />
        </button>
        <h2 className="text-2xl font-bold text-neutral-900 mb-6">Visa Record Details</h2>

        {/* Financial Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg mb-6 text-center">
          <div>
            <div className="text-sm text-neutral-600">Total Fee</div>
            <div className="font-bold text-2xl text-neutral-900">{record.totalFee || 0}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600">Received</div>
            <div className="font-bold text-2xl text-green-700">{record.receivedFee || 0}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600">Remaining</div>
            <div className={`font-bold text-2xl ${record.remainingFee > 0 ? 'text-yellow-700' : 'text-neutral-600'}`}>
              {record.remainingFee || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-neutral-600">Profit</div>
            <div className={`font-bold text-2xl ${record.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {record.profit || 0}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
          {/* Column 1: Personal */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-neutral-900 border-b border-neutral-200 pb-2 mb-2">Personal Info</h3>
            <DetailRow label="Full Name" value={record.fullName} />
            <DetailRow label="Passport" value={record.passport} />
            <DetailRow label="Passport Expiry" value={record.expiryDate} />
            <DetailRow label="Email" value={record.email} />
            <DetailRow label="Phone" value={record.phone} />
          </div>

          {/* Column 2: Visa Details */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-neutral-900 border-b border-neutral-200 pb-2 mb-2">Visa Details</h3>
            <DetailRow label="Country" value={record.country} />
            <DetailRow label="Visa Type" value={record.visaType} />
            <DetailRow label="Date" value={record.date} />
            <DetailRow label="Visa Status">
              <span className={`px-2 py-1 text-xs font-semibold rounded-full text-neutral-900 ${getStatusColor(record.visaStatus)}`}>
                {record.visaStatus}
              </span>
            </DetailRow>
            <DetailRow label="Payment Status" value={record.paymentStatus} />
          </div>

          {/* Column 3: Vendor & Embassy */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-neutral-900 border-b border-neutral-200 pb-2 mb-2">Embassy & Vendor</h3>
            <DetailRow label="Sent to Embassy" value={record.sentToEmbassy} />
            <DetailRow label="Received from Embassy" value={record.receivedFromEmbassy} />
            <DetailRow label="Reference" value={record.reference} />
            <DetailRow label="Embassy Fee" value={record.embassyFee} />
            <DetailRow label="Vendor" value={record.vendor} />
            <DetailRow label="Vendor Contact" value={record.vendorContact} />
            <DetailRow label="Vendor Fee" value={record.vendorFee} />
          </div>

          {/* Full Width Remarks */}
          <div className="md:col-span-3 pt-2">
            <DetailRow label="Remarks" value={record.remarks} />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button onClick={onClose} className="px-6 py-3 bg-neutral-100 text-neutral-900 rounded-xl font-semibold hover:bg-neutral-200 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
