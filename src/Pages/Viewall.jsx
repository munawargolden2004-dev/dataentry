import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { effectiveProfit } from "../utils/finance";
import { formatCNIC } from "../utils/validation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { MdSearch, MdClear, MdDownload, MdEdit, MdSave, MdClose, MdVisibility } from "react-icons/md";
import Footer from "../Components/Footer";
import Pagination from "../Components/Pagination";
import toast from "react-hot-toast";

const TRAVEL_CLASSES = ["Economy", "Premium Economy", "Business", "First"];
const BOOKING_STATUS = ["Booked", "Approved", "Cancelled"];

export default function Viewall() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchRef, setSearchRef] = useState("");
  const [searchId, setSearchId] = useState("");
  const [filter, setFilter] = useState("alltime");
  const [currentPage, setCurrentPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [specificDate, setSpecificDate] = useState("");
  const [financeMode, setFinanceMode] = useState("view"); // view | reissue | refund
  const itemsPerPage = 10;

  const [editingBooking, setEditingBooking] = useState(null);
  const [formData, setFormData] = useState({});

  const [viewingBooking, setViewingBooking] = useState(null);

  // 🔹 Global cache fetch
  const { data: allTicketBookings = [], isLoading } = useQuery({
    queryKey: ['my-tickets', user?.uid], // only this employee's tickets, downloaded once
    queryFn: () => dataService.fetchMyTickets(user.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchRef, searchId, specificDate]);

  // 🔹 Filter bookings
  const displayData = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let filtered = allTicketBookings;

    // Apply global search if search terms exist, otherwise restrict to user's own bookings
    if (searchRef || searchId) {
      filtered = filtered.filter(b => {
        if (searchRef && b.pnr?.toUpperCase() === searchRef.trim().toUpperCase()) return true;
        if (searchId) {
          const sid = searchId.trim();
          const sidDigits = sid.replace(/\D/g, "");
          const cnicDigits = String(b.passenger?.cnic || "").replace(/\D/g, "");
          if (b.passenger?.passport === sid) return true;
          if (b.passenger?.cnic === sid) return true;
          // CNIC match ignoring dashes (so 4210112345678 finds 42101-1234567-8)
          if (sidDigits.length === 13 && cnicDigits === sidDigits) return true;
        }
        return false;
      });
    } else {
      filtered = filtered.filter(b => b.createdByUid === user?.uid);
    }

    // Apply date filter. A specific calendar date (if chosen) takes precedence
    // over the preset range; otherwise fall back to the Today/7-days/Month preset.
    const ymd = (dt) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

    filtered = filtered.filter((booking) => {
      const bookingDate = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      if (!bookingDate || isNaN(bookingDate.getTime())) return false;

      if (specificDate) {
        return ymd(bookingDate) === specificDate;
      }

      switch (filter) {
        case "today":
          return bookingDate >= today;
        case "last7days":
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(now.getDate() - 7);
          return bookingDate >= sevenDaysAgo;
        case "thismonth":
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return bookingDate >= startOfMonth;
        case "alltime":
        default:
          return true;
      }
    });

    // Sort descending by date
    return filtered.sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
      const db = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
      return (db || 0) - (da || 0);
    });
  }, [allTicketBookings, user?.uid, filter, searchRef, searchId, specificDate]);

  // Replace manual doSearch (since it's dynamically filtered now)
  const doSearch = (e) => {
    e.preventDefault();
    // Reactively handled by useMemo
  };

  // 📄 Download PDF
  const downloadPDF = (data, filename, title) => {
    const doc = new jsPDF();
    doc.setFontSize(14).text(title, 14, 16);

    autoTable(doc, {
      startY: 22,
      head: [["PNR", "Route", "Dates", "Pax", "Class", "Passenger", "Price", "Payable", "Profit", "Status", "Added By"]],
      body: data.map((r) => [
        r.pnr,
        `${r.from} → ${r.to}`,
        r.returnDate ? `${r.departure} • ${r.returnDate}` : r.departure,
        r.totalPax,
        r.travelClass,
        `${r.passenger?.fullName}\n${r.passenger?.passport} | ${r.passenger?.cnic}`,
        r.price,
        r.payable,
        r.profit,
        r.status,
        r.createdByEmail,
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
    });

    doc.save(`${filename}.pdf`);
  };

  // 📊 Download CSV
  const downloadCSV = (data, filename) => {
    const headers = [
      "PNR,Route,Dates,Pax,Class,Passenger,Price,Payable,Profit,Status,Added By",
    ];
    const rows = data.map((r) =>
      [
        r.pnr,
        `${r.from} → ${r.to}`,
        r.returnDate ? `${r.departure} • ${r.returnDate}` : r.departure,
        r.totalPax,
        r.travelClass,
        `"${r.passenger?.fullName} (${r.passenger?.passport} | ${r.passenger?.cnic} | ${r.passenger?.phone})"`,
        r.price,
        r.payable,
        r.profit,
        r.status,
        r.createdByEmail,
      ].join(",")
    );

    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle Edit Button Click — opens modal
  const handleEdit = (booking) => {
    setEditingBooking(booking);
    setFinanceMode("view");
    setFormData({ ...booking, companyRefundFee: "", refundFeePayable: "" });
  };

  // Handle View Button Click — opens view modal
  const handleView = (booking) => {
    setViewingBooking(booking);
  };

  // Handle Form Field Change
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setFormData((prev) => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Handle Save Button Click
  const handleSave = async () => {
    setSaving(true);
    try {
      const bookingRef = doc(db, "ticketBookings", editingBooking.id);
      const updateData = {
        pnr: formData.pnr,
        from: formData.from,
        to: formData.to,
        departure: formData.departure,
        returnDate: formData.returnDate,
        totalPax: formData.totalPax,
        travelClass: formData.travelClass,
        airlinePref: formData.airlinePref,
        promo: formData.promo,
        status: formData.status,
        vendor: formData.vendor,
        note: formData.note,
        passenger: {
          fullName: formData.passenger?.fullName,
          passport: formData.passenger?.passport,
          cnic: formData.passenger?.cnic,
          phone: formData.passenger?.phone,
          email: formData.passenger?.email,
        },
      };

      const nowIso = new Date().toISOString();
      const by = user?.email || "";

      if (financeMode === "reissue") {
        // Reissue = re-enter the new fare; profit auto-recalculates.
        const price = Number(formData.price) || 0;
        const payable = Number(formData.payable) || 0;
        updateData.price = price;
        updateData.payable = payable;
        updateData.profit = price - payable;
        updateData.lastAction = "reissue";
        updateData.reissueLog = [
          ...(editingBooking.reissueLog || []),
          {
            prevPrice: Number(editingBooking.price) || 0,
            prevPayable: Number(editingBooking.payable) || 0,
            prevProfit: Number(editingBooking.profit) || 0,
            newPrice: price,
            newPayable: payable,
            at: nowIso,
            by,
          },
        ];
      } else if (financeMode === "refund") {
        // Refund = add the two refund fees; profit stays the retained margin on
        // the record, but the payable is later deducted from company-wide profit.
        const companyFee = Number(formData.companyRefundFee) || 0;
        const feePayable = Number(formData.refundFeePayable) || 0;
        const basePrice = Number(editingBooking.price) || 0;
        const basePayable = Number(editingBooking.payable) || 0;
        const newPrice = basePrice + companyFee;
        const newPayable = basePayable + feePayable;
        updateData.price = newPrice;
        updateData.payable = newPayable;
        updateData.profit = newPrice - newPayable; // retained margin (display)
        updateData.status = "Refunded";
        updateData.refunded = true;
        updateData.companyRefundFee = companyFee;
        updateData.refundFeePayable = feePayable;
        updateData.lastAction = "refund";
        updateData.refundLog = [
          ...(editingBooking.refundLog || []),
          {
            prevPrice: basePrice,
            prevPayable: basePayable,
            prevProfit: Number(editingBooking.profit) || 0,
            prevStatus: editingBooking.status || "",
            companyRefundFee: companyFee,
            refundFeePayable: feePayable,
            newPrice,
            newPayable,
            at: nowIso,
            by,
          },
        ];
      }

      await updateDoc(bookingRef, updateData);

      // Update cache instantly
      await dataService.clearMine('tickets', user.uid);
      queryClient.invalidateQueries({ queryKey: ['my-tickets', user?.uid] });

      toast.success(
        financeMode === "refund" ? "Booking refunded ✓"
          : financeMode === "reissue" ? "Booking reissued ✓"
            : "Booking updated successfully!"
      );
      setEditingBooking(null);
      setFinanceMode("view");
    } catch (error) {
      console.error("Error updating document: ", error);
      toast.error("Failed to update booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const displayList = displayData;
  const totalPages = Math.max(1, Math.ceil(displayList.length / itemsPerPage));
  const pagedList = displayList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Chart Data
  const { monthlyData, destinationData } = useMemo(() => {
    const months = {};
    const dests = {};

    displayList.forEach((b) => {
      if (b.createdAt) {
        const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        const m = d.toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!months[m]) months[m] = { month: m, Profit: 0, Earnings: 0, Payable: 0, sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
        months[m].Profit += effectiveProfit(b);
        months[m].Earnings += (Number(b.price) || 0);
        months[m].Payable += (Number(b.payable) || 0);
      }

      if (b.to) {
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
      .slice(0, 10);

    return { monthlyData: mData, destinationData: dData };
  }, [displayList]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <>
      <div className="pt-20 p-6 min-h-screen bg-neutral-50 text-neutral-900">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900 mb-2">
              All Booked Tickets 📜
            </h1>
            <p className="text-neutral-600 text-lg">
              Search or view all your flight booking records.
            </p>
          </div>

          {/* Search & Filter Section */}
          <div className="bg-white backdrop-blur-md rounded-xl shadow-md border border-neutral-200 p-6 md:p-8 mb-8">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">Find a Booking</h2>
            <form onSubmit={doSearch} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="md:col-span-1">
                <label htmlFor="filter" className="block text-sm font-medium text-neutral-600 mb-2">Filter by</label>
                <select
                  id="filter"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                  }}
                  className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent border border-neutral-200"
                >
                  <option value="today">Today</option>
                  <option value="last7days">Last 7 Days</option>
                  <option value="thismonth">This Month</option>
                  <option value="alltime">All Time</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label htmlFor="specific-date" className="block text-sm font-medium text-neutral-600 mb-2">Specific Date</label>
                <div className="flex gap-2">
                  <input
                    id="specific-date"
                    type="date"
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent border border-neutral-200"
                  />
                  {specificDate && (
                    <button
                      type="button"
                      onClick={() => setSpecificDate("")}
                      title="Clear date"
                      className="p-3 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-colors flex-shrink-0"
                    >
                      <MdClear size={20} />
                    </button>
                  )}
                </div>
              </div>
              <div className="md:col-span-1">
                <label htmlFor="pnr-search" className="block text-sm font-medium text-neutral-600 mb-2">Search by PNR</label>
                <input
                  id="pnr-search"
                  type="text"
                  value={searchRef}
                  onChange={(e) => setSearchRef(e.target.value)}
                  placeholder="e.g. OS-XYZ123"
                  className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
                />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="id-search" className="block text-sm font-medium text-neutral-600 mb-2">Search by ID</label>
                <input
                  id="id-search"
                  type="text"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  placeholder="Passport / CNIC"
                  className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
                />
              </div>
              <div className="flex gap-4 md:col-span-1 mt-auto">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-700 transition-colors"
                >
                  <MdSearch className="inline-block mr-2 text-xl" />
                  Search
                </button>
                {(searchRef || searchId) && (
                  <button
                    type="button"
                    onClick={() => { setSearchRef(""); setSearchId(""); }}
                    className="p-3 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-colors"
                    title="Clear Results"
                  >
                    <MdClear size={24} />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-md p-6 text-center border border-neutral-200">
              <div className="text-3xl font-bold text-neutral-900">{displayList.length}</div>
              <div className="text-sm text-neutral-600 mt-1">Total Bookings</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 text-center border border-neutral-200">
              <div className="text-3xl font-bold text-green-700">{displayList.filter((b) => b.status === "Approved").length}</div>
              <div className="text-sm text-neutral-600 mt-1">Approved</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 text-center border border-neutral-200">
              <div className="text-3xl font-bold text-red-700">{displayList.filter((b) => b.status === "Cancelled").length}</div>
              <div className="text-sm text-neutral-600 mt-1">Cancelled</div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 text-center border border-neutral-200">
              <div className="text-3xl font-bold text-emerald-700">
                {displayList.reduce((sum, b) => sum + effectiveProfit(b), 0).toLocaleString()}
              </div>
              <div className="text-sm text-neutral-600 mt-1">Total Profit</div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {monthlyData.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6">
                <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Monthly Financials</h2>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                      <XAxis dataKey="month" stroke="#525252" />
                      <YAxis stroke="#525252" />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }} itemStyle={{ color: '#171717' }} />
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
                <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Top Destinations</h2>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie isAnimationActive={false} data={destinationData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {destinationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Bookings Table */}
          <div className="bg-white backdrop-blur-md rounded-xl shadow-md border border-neutral-200 p-6 md:p-8">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <h2 className="text-xl font-bold text-neutral-900">
                {searchRef || searchId ? "Search Results" : "All Bookings"}
              </h2>
            </div>

            {displayList.length === 0 ? (
              <div className="text-neutral-500 text-sm py-4 px-2">No bookings found for the selected criteria.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-white">
                    <tr className="text-left text-neutral-600">
                      <th className="py-3 px-4 font-semibold">#</th>
                      <th className="py-3 px-4 font-semibold">PNR</th>
                      <th className="py-3 px-4 font-semibold">Route</th>
                      <th className="py-3 px-4 font-semibold">Dates</th>
                      <th className="py-3 px-4 font-semibold">Pax</th>
                      <th className="py-3 px-4 font-semibold">Class</th>
                      <th className="py-3 px-4 font-semibold">Passenger</th>
                      <th className="py-3 px-4 font-semibold">Price</th>
                      <th className="py-3 px-4 font-semibold">Payable</th>
                      <th className="py-3 px-4 font-semibold">Profit</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Added By</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {pagedList.map((b, index) => (
                      <tr key={b.id} className="bg-white transition-colors hover:bg-neutral-100">
                        <td className="py-4 px-4">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                        <td className="py-4 px-4 font-semibold">{b.pnr}</td>
                        <td className="py-4 px-4">{b.from} → {b.to}</td>
                        <td className="py-4 px-4">
                          {b.departure}{b.returnDate ? ` • ${b.returnDate}` : ""}
                        </td>
                        <td className="py-4 px-4">{b.totalPax}</td>
                        <td className="py-4 px-4">{b.travelClass}</td>
                        <td className="py-4 px-4">
                          <div className="font-medium">{b.passenger?.fullName}</div>
                          <div className="text-xs text-neutral-500">{b.passenger?.passport} | {b.passenger?.cnic}</div>
                        </td>
                        <td className="py-4 px-4">{b.price}</td>
                        <td className="py-4 px-4">{b.payable}</td>
                        <td className="py-4 px-4 text-green-700 font-semibold">{b.profit}</td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                            b.status === "Approved" ? "bg-green-600/20 text-green-700"
                            : b.status === "Cancelled" ? "bg-red-600/20 text-red-700"
                            : "bg-yellow-600/20 text-yellow-700"
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs text-neutral-500">{b.createdByEmail}</td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => handleView(b)}
                              className="text-neutral-600 hover:text-neutral-900 transition-colors"
                              title="View Details"
                            >
                              <MdVisibility size={20} />
                            </button>
                            <button
                              onClick={() => handleEdit(b)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Edit Booking"
                            >
                              <MdEdit size={20} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {displayList.length > 0 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={displayList.length}
                    itemsPerPage={itemsPerPage}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── VIEW MODAL ─── */}
      {viewingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div>
                <h2 className="text-xl font-bold text-neutral-900">Booking Details</h2>
                <p className="text-sm text-neutral-600 mt-0.5">PNR: <span className="text-blue-700 font-semibold">{viewingBooking.pnr}</span></p>
              </div>
              <button onClick={() => setViewingBooking(null)} className="text-neutral-600 hover:text-neutral-900 transition-colors p-1">
                <MdClose size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${
                  viewingBooking.status === "Approved" ? "bg-green-600/20 text-green-700 border border-green-600/30"
                  : viewingBooking.status === "Cancelled" ? "bg-red-600/20 text-red-700 border border-red-600/30"
                  : "bg-yellow-600/20 text-yellow-700 border border-yellow-600/30"
                }`}>
                  {viewingBooking.status}
                </span>
                <span className="text-neutral-500 text-sm">{viewingBooking.travelClass}</span>
              </div>

              {/* Flight Info */}
              <div className="bg-white rounded-xl p-4">
                <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Flight Info</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-neutral-500">Route</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.from} → {viewingBooking.to}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Departure</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.departure}</div>
                  </div>
                  {viewingBooking.returnDate && (
                    <div>
                      <div className="text-xs text-neutral-500">Return</div>
                      <div className="text-neutral-900 font-medium">{viewingBooking.returnDate}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-neutral-500">Passengers</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.totalPax}</div>
                  </div>
                  {viewingBooking.airlinePref && (
                    <div>
                      <div className="text-xs text-neutral-500">Airline Preference</div>
                      <div className="text-neutral-900 font-medium">{viewingBooking.airlinePref}</div>
                    </div>
                  )}
                  {viewingBooking.vendor && (
                    <div>
                      <div className="text-xs text-neutral-500">Vendor</div>
                      <div className="text-neutral-900 font-medium">{viewingBooking.vendor}</div>
                    </div>
                  )}
                  {viewingBooking.promo && (
                    <div>
                      <div className="text-xs text-neutral-500">Promo</div>
                      <div className="text-neutral-900 font-medium">{viewingBooking.promo}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Passenger Info */}
              <div className="bg-white rounded-xl p-4">
                <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Passenger</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-neutral-500">Full Name</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.passenger?.fullName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Passport</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.passenger?.passport}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">CNIC</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.passenger?.cnic}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Phone</div>
                    <div className="text-neutral-900 font-medium">{viewingBooking.passenger?.phone}</div>
                  </div>
                  {viewingBooking.passenger?.email && (
                    <div className="col-span-2">
                      <div className="text-xs text-neutral-500">Email</div>
                      <div className="text-neutral-900 font-medium">{viewingBooking.passenger?.email}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Financials */}
              <div className="bg-white rounded-xl p-4">
                <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Financials</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-neutral-100 rounded-lg p-3 text-center">
                    <div className="text-xs text-neutral-600 mb-1">Price</div>
                    <div className="text-neutral-900 font-bold text-lg">{viewingBooking.price}</div>
                  </div>
                  <div className="bg-neutral-100 rounded-lg p-3 text-center">
                    <div className="text-xs text-neutral-600 mb-1">Payable</div>
                    <div className="text-neutral-900 font-bold text-lg">{viewingBooking.payable}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-emerald-700 mb-1">Profit</div>
                    <div className="text-emerald-700 font-bold text-lg">{viewingBooking.profit}</div>
                  </div>
                </div>
              </div>

              {/* Note */}
              {viewingBooking.note && (
                <div className="bg-white rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-2">Note</h3>
                  <p className="text-neutral-700 text-sm">{viewingBooking.note}</p>
                </div>
              )}

              <div className="text-xs text-neutral-500">Added by: {viewingBooking.createdByEmail}</div>
            </div>
            <div className="p-6 pt-0">
              <button
                onClick={() => { setViewingBooking(null); handleEdit(viewingBooking); }}
                className="w-full py-3 bg-neutral-900 hover:bg-neutral-700 text-white rounded-xl font-semibold transition-colors"
              >
                <MdEdit className="inline-block mr-2" />Edit This Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT MODAL ─── */}
      {editingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-md w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div>
                <h2 className="text-xl font-bold text-neutral-900">Edit Booking</h2>
                <p className="text-sm text-neutral-600 mt-0.5">PNR: <span className="text-blue-700 font-semibold">{editingBooking.pnr}</span></p>
              </div>
              <button onClick={() => setEditingBooking(null)} className="text-neutral-600 hover:text-neutral-900 transition-colors p-1">
                <MdClose size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Financials — Reissue / Refund */}
              <div className="bg-white border border-neutral-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Financials{financeMode === "view" ? " (read-only)" : financeMode === "reissue" ? " — Reissue" : " — Refund"}
                  </h3>
                  <div className="flex gap-2">
                    {financeMode === "view" ? (
                      <>
                        <button type="button" onClick={() => setFinanceMode("reissue")}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-700 border border-amber-600/40 hover:bg-amber-600/30 transition-colors">Reissue</button>
                        <button type="button" onClick={() => setFinanceMode("refund")}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-700 border border-rose-600/40 hover:bg-rose-600/30 transition-colors">Refund</button>
                      </>
                    ) : (
                      <button type="button"
                        onClick={() => { setFinanceMode("view"); setFormData((p) => ({ ...p, price: editingBooking.price, payable: editingBooking.payable, companyRefundFee: "", refundFeePayable: "" })); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200 transition-colors">Cancel</button>
                    )}
                  </div>
                </div>

                {financeMode === "view" && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-neutral-100 rounded-lg p-3 text-center"><div className="text-xs text-neutral-600 mb-1">Price</div><div className="text-neutral-700 font-bold text-lg">{editingBooking.price}</div></div>
                      <div className="bg-neutral-100 rounded-lg p-3 text-center"><div className="text-xs text-neutral-600 mb-1">Payable</div><div className="text-neutral-700 font-bold text-lg">{editingBooking.payable}</div></div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center"><div className="text-xs text-emerald-700 mb-1">Profit</div><div className="text-emerald-700 font-bold text-lg">{editingBooking.profit}</div></div>
                    </div>
                    {editingBooking.refunded && (
                      <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        Refunded — <b>{Number(editingBooking.payable) || 0}</b> deducted from company-wide profit totals.
                      </div>
                    )}
                  </>
                )}

                {financeMode === "reissue" && (
                  <>
                    <p className="text-xs text-neutral-600 mb-3">Enter the new fare. Profit recalculates automatically (Price − Payable).</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div><label className="block text-xs text-neutral-600 mb-1">New Price</label>
                        <input type="number" name="price" value={formData.price ?? ""} onChange={handleChange} className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300" /></div>
                      <div><label className="block text-xs text-neutral-600 mb-1">New Payable</label>
                        <input type="number" name="payable" value={formData.payable ?? ""} onChange={handleChange} className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300" /></div>
                      <div><div className="text-xs text-emerald-700 mb-1">New Profit</div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-700 font-bold text-lg text-center">{(Number(formData.price) || 0) - (Number(formData.payable) || 0)}</div></div>
                    </div>
                  </>
                )}

                {financeMode === "refund" && (() => {
                  const basePrice = Number(editingBooking.price) || 0;
                  const basePayable = Number(editingBooking.payable) || 0;
                  const cf = Number(formData.companyRefundFee) || 0;
                  const fp = Number(formData.refundFeePayable) || 0;
                  const np = basePrice + cf, npay = basePayable + fp, nprofit = np - npay;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div><label className="block text-xs text-neutral-600 mb-1">Company Refund Fee <span className="text-neutral-500">(→ Price)</span></label>
                          <input type="number" name="companyRefundFee" value={formData.companyRefundFee ?? ""} onChange={handleChange} placeholder="0" className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300" /></div>
                        <div><label className="block text-xs text-neutral-600 mb-1">Refund Fee Payable <span className="text-neutral-500">(→ Payable)</span></label>
                          <input type="number" name="refundFeePayable" value={formData.refundFeePayable ?? ""} onChange={handleChange} placeholder="0" className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300" /></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-neutral-100 rounded-lg p-3 text-center"><div className="text-xs text-neutral-600 mb-1">New Price</div><div className="text-neutral-700 font-bold text-lg">{np}</div></div>
                        <div className="bg-neutral-100 rounded-lg p-3 text-center"><div className="text-xs text-neutral-600 mb-1">New Payable</div><div className="text-neutral-700 font-bold text-lg">{npay}</div></div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center"><div className="text-xs text-emerald-700 mb-1">Profit</div><div className="text-emerald-700 font-bold text-lg">{nprofit}</div></div>
                      </div>
                      <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        On save: status becomes <b>Refunded</b>, and <b>{npay}</b> (payable) is deducted from company-wide profit.
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Booking Info */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Booking Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">PNR</label>
                    <input type="text" name="pnr" value={formData.pnr || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Status</label>
                    <select name="status" value={formData.status || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent">
                      {BOOKING_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">From</label>
                    <input type="text" name="from" value={formData.from || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">To</label>
                    <input type="text" name="to" value={formData.to || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Departure</label>
                    <input type="date" name="departure" value={formData.departure || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Return Date</label>
                    <input type="date" name="returnDate" value={formData.returnDate || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Passengers</label>
                    <input type="number" name="totalPax" value={formData.totalPax || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Travel Class</label>
                    <select name="travelClass" value={formData.travelClass || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent">
                      {TRAVEL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Airline Preference</label>
                    <input type="text" name="airlinePref" value={formData.airlinePref || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Vendor</label>
                    <input type="text" name="vendor" value={formData.vendor || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Promo</label>
                    <input type="text" name="promo" value={formData.promo || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                </div>
              </div>

              {/* Passenger Info */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Passenger Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Full Name</label>
                    <input type="text" name="passenger.fullName" value={formData.passenger?.fullName || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Passport</label>
                    <input type="text" name="passenger.passport" value={formData.passenger?.passport || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">CNIC</label>
                    <input type="text" name="passenger.cnic" inputMode="numeric" maxLength={15} placeholder="42101-1234567-8" value={formData.passenger?.cnic || ""}
                      onChange={(e) => handleChange({ target: { name: "passenger.cnic", value: formatCNIC(e.target.value) } })}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-600 mb-1">Phone</label>
                    <input type="text" name="passenger.phone" value={formData.passenger?.phone || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-neutral-600 mb-1">Email</label>
                    <input type="email" name="passenger.email" value={formData.passenger?.email || ""} onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent" />
                  </div>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm text-neutral-600 mb-1">Note</label>
                <textarea name="note" value={formData.note || ""} onChange={handleChange} rows={3}
                  className="w-full bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200 focus:ring-2 focus:ring-neutral-300 focus:border-transparent resize-none" />
              </div>
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={() => setEditingBooking(null)}
                className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-700 disabled:bg-neutral-200 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
              >
                <MdSave className="inline-block mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
}
