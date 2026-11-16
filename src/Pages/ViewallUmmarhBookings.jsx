import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { db } from "../firebase";
import { collection, query, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { FaSpinner, FaEdit, FaSave, FaDownload, FaTimes, FaSearch, FaTrash } from "react-icons/fa";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import Footer from "../Components/Footer";
import Pagination from "../Components/Pagination";
import { useAuth } from "../context/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

function ViewallUmmarhBookings() {
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 🔹 Global cache fetch
  const { data: rawBookings = [], isLoading: loading } = useQuery({
    queryKey: ['my-umrah', user?.uid], // only this employee's Umrah bookings, downloaded once
    queryFn: () => dataService.fetchMyUmrah(user.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (user && !loading) {
      const data = rawBookings
        .filter((doc) => doc.createdByUid === user.uid)
        .map((doc) => ({
          ...doc,
          createdAt: doc.createdAt?.toDate ? doc.createdAt.toDate() : (doc.createdAt ? new Date(doc.createdAt) : new Date()),
          profit: Number(doc.received || 0) - Number(doc.payable || 0),
        }));
      setBookings(data);
      setFilteredBookings(data);
    }
  }, [user, rawBookings, loading]);

  const handleFilterAndSearch = () => {
    let tempBookings = [...bookings];

    // Apply date filter first
    const now = new Date();
    let startDate;

    switch (activeFilter) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "yesterday":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case "thisWeek":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case "thisMonth":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "thisYear":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        // No date filter, use all bookings
        break;
    }

    if (startDate) {
      tempBookings = tempBookings.filter((booking) => {
        return booking.createdAt >= startDate;
      });
    }

    // Apply search filter
    if (searchTerm.trim() !== "") {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      tempBookings = tempBookings.filter((booking) =>
        Object.values(booking).some(
          (value) =>
            typeof value === "string" && value.toLowerCase().includes(lowerCaseSearchTerm)
        )
      );
    }

    setFilteredBookings(tempBookings);
  };

  useEffect(() => {
    handleFilterAndSearch();
  }, [activeFilter, searchTerm, bookings]);

  // Reset to first page when the filter/search changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / itemsPerPage));
  const pagedBookings = filteredBookings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totals = filteredBookings.reduce(
    (acc, booking) => {
      acc.received += Number(booking.received || 0);
      acc.payable += Number(booking.payable || 0);
      acc.profit += Number(booking.profit || 0);
      return acc;
    },
    { received: 0, payable: 0, profit: 0 }
  );

  const { monthlyData, vendorData } = useMemo(() => {
    const months = {};
    const vendors = {};

    filteredBookings.forEach((b) => {
        if (b.createdAt) {
            const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            const m = d.toLocaleString('default', { month: 'short', year: 'numeric' });
            if (!months[m]) months[m] = { month: m, Profit: 0, Received: 0, Payable: 0, sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
            months[m].Profit += (Number(b.profit) || 0);
            months[m].Received += (Number(b.received) || 0);
            months[m].Payable += (Number(b.payable) || 0);
        }

        if (b.vendor) {
            const vndr = b.vendor.trim().toUpperCase();
            if (!vendors[vndr]) vendors[vndr] = { name: vndr, value: 0 };
            vendors[vndr].value += 1;
        }
    });

    const mData = Object.values(months)
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(x => ({ month: x.month, Profit: x.Profit, Received: x.Received, Payable: x.Payable }));
    
    const vData = Object.values(vendors)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    return { monthlyData: mData, vendorData: vData };
  }, [filteredBookings]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  const calculateNights = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return "";
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    const diff = (outDate - inDate) / (1000 * 60 * 60 * 24);
    return diff > 0 ? diff : 0;
  };

  const startEdit = (b) => {
    setEditingId(b.id);
    setEditData({ ...b });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    let updated = { ...editData, [name]: value };

    if (name === "payable") {
      updated.profit = Number(updated.received || 0) - Number(value || 0);
    }

    if (name === "makkahCheckIn" || name === "makkahCheckOut") {
      updated.makkahNights = calculateNights(
        updated.makkahCheckIn,
        updated.makkahCheckOut
      );
    }

    if (name === "madinahCheckIn" || name === "madinahCheckOut") {
      updated.madinahNights = calculateNights(
        updated.madinahCheckIn,
        updated.madinahCheckOut
      );
    }

    if (name === "makkahCheckInagain" || name === "makkahCheckOutagain") {
      updated.makkahagainNights = calculateNights(
        updated.makkahCheckInagain,
        updated.makkahCheckOutagain
      );
    }
    setEditData(updated);
  };

  const saveEdit = async (id) => {
    try {
      setSaving(true);
      const docRef = doc(db, "ummrahBookings", id);
      const { ...updateFields } = editData;
      await updateDoc(docRef, updateFields);
      await dataService.clearMine('umrah', user.uid);
      queryClient.invalidateQueries({ queryKey: ['my-umrah', user?.uid] });
      toast.success("Booking updated!");
      setEditingId(null);
      setEditData({});
    } catch (err) {
      toast.error("Failed to update booking");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const generateUmrahPDF = (booking) => {
    if (!booking) return;

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    const startX = margin;
    const startY = margin;

    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.text("DATA DASH", pageWidth / 2, startY + 10, { align: "center" });

    doc.setFont("times", "italic");
    doc.setFontSize(10);
    doc.text("Your Trusted Umrah Partner", pageWidth / 2, startY + 16, { align: "center" });

    doc.setDrawColor(50, 50, 50);
    doc.line(margin, startY + 20, pageWidth - margin, startY + 20);

    doc.setFillColor(34, 139, 34);
    doc.rect(startX, startY + 25, contentWidth, 8, "F");
    doc.setFont("times", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("UMRAH BOOKING REPORT", pageWidth / 2, startY + 31, { align: "center" });

    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: startY + 38,
      margin: { left: startX, right: startX },
      tableWidth: contentWidth,
      head: [["Field", "Value", "Field", "Value"]],
      headStyles: {
        fillColor: [40, 40, 40],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      body: [
        ["Full Name", booking.fullName || "-", "Phone", booking.phone || "-"],
        ["Passport Number", booking.passportNumber || "-", "Visa Number", booking.visaNumber || "-"],
        ["Vendor", booking.vendor || "-", "Profit", `${booking.profit || 0}`],
        ["Payable", `PKR ${booking.payable || 0}`, "Received", `PKR ${booking.received || 0}`],
        ["Makkah Hotel", booking.makkahHotel || "-", "Nights", booking.makkahNights || "-"],
        ["Check In", booking.makkahCheckIn || "-", "Check Out", booking.makkahCheckOut || "-"],
        ["Madinah Hotel", booking.madinahHotel || "-", "Nights", booking.madinahNights || "-"],
        ["Check In", booking.madinahCheckIn || "-", "Check Out", booking.madinahCheckOut || "-"],
        ["2nd Makkah Hotel", booking.makkahagainhotel || "-", "Nights", booking.makkahagainNights || "-"],
        ["Check In", booking.makkahCheckInagain || "-", "Check Out", booking.makkahCheckOutagain || "-"],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    let finalY = doc.lastAutoTable.finalY + 20;
    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.text("Authorized by Data Dash", margin, finalY);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth - margin, finalY, {
      align: "right",
    });

    doc.save(`Umrah_Booking_${booking.passportNumber}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const getEditInputType = (key) => {
    if (key.includes("date")) return "date";
    if (key.includes("nights") || key.includes("payable")) return "number";
    return "text";
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900 mb-2">
            All Umrah Bookings 🕋
          </h1>
          <p className="text-neutral-600 text-lg">
            A comprehensive list of all Umrah booking records.
          </p>
        </div>

        {/* Search Bar and Filter */}
        <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6 md:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="relative flex-1 w-full">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                placeholder="Search by Name, Passport, or Phone..."
                className="w-full bg-white text-neutral-900 rounded-lg px-12 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
                title="Clear Search"
              >
                <FaTimes size={20} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-600 mr-2">Filter By:</span>
            {["all", "today", "yesterday", "thisWeek", "thisMonth", "thisYear"].map(
              (filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeFilter === filter
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              )
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-green-50 p-6 rounded-xl shadow-md border border-green-500">
            <p className="text-sm uppercase font-semibold text-neutral-600">Total Received</p>
            <p className="text-3xl font-bold text-neutral-900 mt-2">PKR {totals.received.toLocaleString()}</p>
          </div>
          <div className="bg-red-50 p-6 rounded-xl shadow-md border border-red-500">
            <p className="text-sm uppercase font-semibold text-neutral-600">Total Payable</p>
            <p className="text-3xl font-bold text-neutral-900 mt-2">PKR {totals.payable.toLocaleString()}</p>
          </div>
          <div className="bg-yellow-50 p-6 rounded-xl shadow-md border border-yellow-500">
            <p className="text-sm uppercase font-semibold text-neutral-600">Total Profit</p>
            <p className="text-3xl font-bold text-neutral-900 mt-2">PKR {totals.profit.toLocaleString()}</p>
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
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                                    itemStyle={{ color: '#171717' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                <Bar isAnimationActive={false} dataKey="Received" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar isAnimationActive={false} dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {vendorData.length > 0 && (
                <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6">
                    <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Top Vendors</h2>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={vendorData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {vendorData.map((entry, index) => (
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

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FaSpinner className="animate-spin text-blue-600 text-4xl" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center p-10 bg-white rounded-xl border border-neutral-200">
            <p className="text-lg text-neutral-600">No bookings found for the selected filter and search term.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    Client Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    Passport / Visa
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    Financials (PKR)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    Hotels & Nights
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {pagedBookings.map((booking, index) => (
                  <tr key={booking.id} className="hover:bg-neutral-100 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-neutral-900">{booking.fullName}</div>
                      <div className="text-xs text-neutral-600">{booking.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-neutral-700">
                        Passport: <span className="text-neutral-900">{booking.passportNumber}</span>
                      </div>
                      <div className="text-sm text-neutral-700">
                        Visa: <span className="text-neutral-900">{booking.visaNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="text-green-700">Received: {booking.received}</div>
                      <div className="text-red-700">Payable: {booking.payable}</div>
                      <div className="text-yellow-700 font-bold">Profit: {booking.profit}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-neutral-700">
                        <span className="font-semibold text-blue-700">Makkah:</span> {booking.makkahHotel} ({booking.makkahNights} nights)
                      </div>
                      <div className="text-sm text-neutral-700">
                        <span className="font-semibold text-green-700">Madinah:</span> {booking.madinahHotel} ({booking.madinahNights} nights)
                      </div>
                      {booking.makkahagainhotel && (
                        <div className="text-sm text-neutral-700">
                          <span className="font-semibold text-blue-700">2nd Makkah:</span> {booking.makkahagainhotel} ({booking.makkahagainNights} nights)
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(booking)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit"
                        >
                          <FaEdit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredBookings.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredBookings.length}
                itemsPerPage={itemsPerPage}
              />
            )}
          </div>
        )}
      </div>

      {editingId && (
        <div className="fixed inset-0 bg-neutral-50 bg-opacity-75 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-8 w-full max-w-3xl relative my-8">
            <button
              onClick={cancelEdit}
              className="absolute top-4 right-4 text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <FaTimes size={24} />
            </button>
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">Edit Booking</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.keys(editData).map((key) =>
                key === "id" ||
                key === "createdAt" ||
                key === "createdByUid" ||
                key === "createdByEmail" ||
                key === "createdByName" ||
                key === "profit" ||
                key === "received" ? (
                  key === "received" && (
                    <div key={key} className="flex flex-col">
                      <label className="text-sm font-medium text-neutral-600 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      <p className="bg-white text-neutral-500 rounded-lg px-4 py-3 border border-neutral-200 cursor-not-allowed">
                        {editData[key]}
                      </p>
                    </div>
                  )
                ) : (
                  <div key={key} className="flex flex-col">
                    <label className="text-sm font-medium text-neutral-600 capitalize mb-1">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <input
                      type={getEditInputType(key)}
                      value={editData[key] || ""}
                      onChange={handleEditChange}
                      name={key}
                      className="bg-white text-neutral-900 rounded-lg px-4 py-3 border border-neutral-200 focus:ring-2 focus:ring-neutral-300"
                    />
                  </div>
                )
              )}
            </div>
            <div className="mt-8 flex justify-end gap-4">
              <button
                onClick={cancelEdit}
                className="px-6 py-3 bg-neutral-100 text-neutral-900 rounded-xl font-semibold hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => saveEdit(editingId)}
                disabled={saving}
                className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-700 transition-colors disabled:bg-neutral-200 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <FaSpinner className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <FaSave /> Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
}

export default ViewallUmmarhBookings;
