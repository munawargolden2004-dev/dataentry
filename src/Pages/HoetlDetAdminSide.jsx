import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { toDateSafe } from "../utils/dates";
import {
    collection,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import AdminNavbar from "../Components/AdminNavbar";
import jsPDF from "jspdf";
import {
    FaSearch,
    FaEdit,
    FaTrash,
    FaCalendarDay,
    FaCalendarWeek,
    FaCalendarAlt,
    FaCalendar,
    FaDollarSign,
    FaArrowUp,
    FaArrowDown,
    FaBuilding,
    FaUser,
    FaInfoCircle,
    FaBed,
    FaCreditCard,
    FaTimes,
    FaSave,
    FaSpinner,
    FaEye,
    FaInfo,
} from "react-icons/fa";
import toast from "react-hot-toast";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';

const getStartOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getStartOfWeek = (date) => {
    const d = getStartOfDay(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
};

const getStartOfMonth = (date) => {
    const d = getStartOfDay(date);
    return new Date(d.getFullYear(), d.getMonth(), 1);
};

const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

function HoetlDetAdminSide() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [editingBooking, setEditingBooking] = useState(null);
    const [viewingBooking, setViewingBooking] = useState(null); // New state for viewing details
    const [deletingBookingId, setDeletingBookingId] = useState(null);
    const [saving, setSaving] = useState(false);
  
    const queryClient = useQueryClient();
    const [displayLimit, setDisplayLimit] = useState(20);

    // 🔹 Global cache fetch
    const { data: bookings = [], isLoading } = useQuery({
        queryKey: ['HotelBookings'],
        queryFn: () => dataService.fetchAll('HotelBookings'),
        staleTime: 1000 * 30,
    });

    const handleEdit = (booking) => {
        setEditingBooking(booking);
    };

    const handleView = (booking) => { // New function to handle view button click
        setViewingBooking(booking);
    };

    const handleDelete = async (id) => {
        try {
            setSaving(true);
            await deleteDoc(doc(db, "HotelBookings", id));
            dataService.clearCache('HotelBookings');
            queryClient.invalidateQueries({ queryKey: ['HotelBookings'] });
            toast.success("Booking deleted!");
            setDeletingBookingId(null);
        } catch (err) {
            toast.error("Error deleting booking");
        } finally {
            setSaving(false);
        }
    };

   useEffect(() => {
  if (editingBooking) {
    const received = parseFloat(editingBooking.received) || 0;
    const payable = parseFloat(editingBooking.payable) || 0;
    const profit = received - payable;
    setEditingBooking({ ...editingBooking, profit });
  }
}, [editingBooking?.received, editingBooking?.payable]);

const handleUpdate = async (e) => {
  e.preventDefault();
  try {
    setSaving(true);

    // Explicitly save all fields (to avoid missing care/contact etc.)
    const updatedBooking = {
      clientName: editingBooking.clientName || "",
      bookingId: editingBooking.bookingId || "",
      property: editingBooking.property || "",
      care: editingBooking.care || "",
      careContact: editingBooking.careContact || "",
      careEmail: editingBooking.careEmail || "",
      arrivalDate: editingBooking.arrivalDate || "",
      departureDate: editingBooking.departureDate || "",
      received: parseFloat(editingBooking.received) || 0,
      payable: parseFloat(editingBooking.payable) || 0,
      profit: parseFloat(editingBooking.profit) || 0,
      notes: editingBooking.notes || "",
      userEmail: editingBooking.userEmail || "",
      nightsStayed: editingBooking.nightsStayed || 0,
      numberOfRooms: editingBooking.numberOfRooms || 0,
      numberOfAdults: editingBooking.numberOfAdults || 0,
      numberOfChildren: editingBooking.numberOfChildren || 0,
      paymentMethod: editingBooking.paymentMethod || "",
    };
    await updateDoc(doc(db, "HotelBookings", editingBooking.id), updatedBooking);
    dataService.clearCache('HotelBookings');
    queryClient.invalidateQueries({ queryKey: ['HotelBookings'] });
    toast.success("Booking updated!");
    setEditingBooking(null);
    } catch (err) {
        toast.error("Error updating booking");
    } finally {
        setSaving(false);
    }
};

    const filterAndSearchBookings = useMemo(() => {
        let filteredList = bookings.filter((b) => {
            const createdAt = toDateSafe(b.createdAt);
            if (!createdAt) return false;

            const today = getStartOfDay(new Date());
            const yesterday = getStartOfDay(new Date(today));
            yesterday.setDate(today.getDate() - 1);

            switch (filter) {
                case "today":
                    return isSameDay(createdAt, today);
                case "yesterday":
                    return isSameDay(createdAt, yesterday);
                case "week":
                    return createdAt >= getStartOfWeek(today);
                case "month":
                    return createdAt >= getStartOfMonth(today);
                default:
                    return true;
            }
        });

        if (search) {
            const lowerCaseSearch = search.toLowerCase();
            filteredList = filteredList.filter(
                (b) =>
                    b.clientName?.toLowerCase().includes(lowerCaseSearch) ||
                    b.bookingId?.toLowerCase().includes(lowerCaseSearch) ||
                    b.property?.toLowerCase().includes(lowerCaseSearch)
            );
        }

        if (startDate && endDate) {
            const st = new Date(startDate);
            st.setHours(0, 0, 0, 0);
            const en = new Date(endDate);
            en.setHours(23, 59, 59, 999);
            filteredList = filteredList.filter(b => {
                const cAt = toDateSafe(b.createdAt);
                if (!cAt) return false;
                return cAt >= st && cAt <= en;
            });
        }

        return filteredList;
    }, [bookings, search, filter, startDate, endDate]);

    const searchedAndFilteredBookings = filterAndSearchBookings;
    
    const totalReceived = searchedAndFilteredBookings.reduce((a, b) => a + (Number(b.received) || 0), 0);
    const totalPayable = searchedAndFilteredBookings.reduce((a, b) => a + (Number(b.payable) || 0), 0);
    const totalProfit = searchedAndFilteredBookings.reduce((a, b) => a + (Number(b.profit) || 0), 0);

    // Charts Data
    const { monthlyData, propertyData } = useMemo(() => {
        const months = {};
        const props = {};

        searchedAndFilteredBookings.forEach((b) => {
            if (b.createdAt) {
                const d = toDateSafe(b.createdAt) || new Date(0);
                const m = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                if (!months[m]) months[m] = { month: m, Profit: 0, Received: 0, Payable: 0, sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
                months[m].Profit += (Number(b.profit) || (Number(b.received || 0) - Number(b.payable || 0)));
                months[m].Received += (Number(b.received) || 0);
                months[m].Payable += (Number(b.payable) || 0);
            }

            if (b.property) {
                const prop = b.property.trim().toUpperCase();
                if (!props[prop]) props[prop] = { name: prop, value: 0 };
                props[prop].value += 1;
            }
        });

        const mData = Object.values(months)
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(x => ({ month: x.month, Profit: x.Profit, Received: x.Received, Payable: x.Payable }));
        
        const pData = Object.values(props)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return { monthlyData: mData, propertyData: pData };
    }, [searchedAndFilteredBookings]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];


    return (
      <>
        <div>
            <AdminNavbar />
        </div>

        <div className="relative min-h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900">
           

            {/* Background Animations */}
            <div className="fixed inset-0 z-0 bg-travel-grid">
                <div className="hidden"></div>
                <div className="hidden"></div>
                <div className="hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] border-2 border-dashed border-blue-500/30 rounded-full animate-rotate-slow"></div>
                <div className="hidden absolute top-1/4 left-1/4 w-40 h-40 bg-blue-500/20 blur-3xl animate-blob-pulse-1"></div>
                <div className="hidden absolute bottom-1/4 right-1/4 w-40 h-40 bg-green-500/20 blur-3xl animate-blob-pulse-2"></div>
            </div>

            <div className="relative z-20 max-w-7xl mx-auto w-full p-6">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 mb-8 text-center">
                    Hotel Bookings Admin Dashboard 🏨
                </h2>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-md border border-neutral-200 flex items-center justify-between transition-all duration-300 hover:shadow-md animate-fade-in-up">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-600/20 text-green-700 rounded-full">
                                <FaArrowDown size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-neutral-600 font-medium">Total Received</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    PKR {totalReceived.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border border-neutral-200 flex items-center justify-between transition-all duration-300 hover:shadow-md animate-fade-in-up delay-100">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-red-600/20 text-red-700 rounded-full">
                                <FaArrowUp size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-neutral-600 font-medium">Total Payable</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    PKR {totalPayable.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md border border-neutral-200 flex items-center justify-between transition-all duration-300 hover:shadow-md animate-fade-in-up delay-200">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-600/20 text-blue-700 rounded-full">
                                <FaDollarSign size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-neutral-600 font-medium">Total Profit</p>
                                <p className="text-2xl font-bold text-neutral-900">
                                    PKR {totalProfit.toFixed(2)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                    <div className="relative w-full md:w-1/2 rounded-xl shadow-md">
                        <input
                            type="text"
                            placeholder="Search by name, ID, or hotel..."
                            className="w-full pl-5 pr-14 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 transition-all duration-200"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button
                            className="absolute right-0 top-0 h-full px-5 bg-neutral-900 text-white rounded-r-xl hover:bg-neutral-700 transition-colors"
                        >
                            <FaSearch />
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${filter === "all" ? "bg-neutral-900 text-white shadow-md" : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"}`}
                            onClick={() => setFilter("all")}
                        >
                            All
                        </button>
                        <button
                            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${filter === "today" ? "bg-neutral-900 text-white shadow-md" : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"}`}
                            onClick={() => setFilter("today")}
                        >
                            <FaCalendarDay /> Today
                        </button>
                        <button
                            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${filter === "yesterday" ? "bg-neutral-900 text-white shadow-md" : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"}`}
                            onClick={() => setFilter("yesterday")}
                        >
                            <FaCalendarAlt /> Yesterday
                        </button>
                        <button
                            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${filter === "week" ? "bg-neutral-900 text-white shadow-md" : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"}`}
                            onClick={() => setFilter("week")}
                        >
                            <FaCalendarWeek /> This Week
                        </button>
                        <button
                            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 ${filter === "month" ? "bg-neutral-900 text-white shadow-md" : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"}`}
                            onClick={() => setFilter("month")}
                        >
                            <FaCalendar /> This Month
                        </button>

                    </div>
                    
                </div>
                
                <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-md border border-neutral-200 mb-6">
                    <span className="text-neutral-700 font-semibold flex items-center gap-2"><FaCalendarAlt /> Custom Range:</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="py-2 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-300" />
                    <span className="text-neutral-600">to</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="py-2 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-300" />
                    {(startDate || endDate) && (
                        <button onClick={() => { setStartDate(""); setEndDate(""); }} className="text-red-700 hover:text-red-800 transition-colors px-3 py-1 bg-red-50 rounded-lg">Clear Dates</button>
                    )}
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
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                                            itemStyle={{ color: '#171717' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                        <Bar isAnimationActive={false} dataKey="Received" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        <Bar isAnimationActive={false} dataKey="Payable" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                        <Bar isAnimationActive={false} dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {propertyData.length > 0 && (
                        <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6">
                            <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Top Properties</h2>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={propertyData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        >
                                            {propertyData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bookings Table */}
                <div className="bg-white rounded-2xl shadow-md border border-neutral-200 overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-neutral-100 text-neutral-700">
                            <tr>
                                <th className="p-3 text-center">S. No.</th>
                                <th className="p-3">Booking Details</th>
                                <th className="p-3">Client</th>
                                <th className="p-3">Financials</th>
                                <th className="p-3 text-center">Employee</th>
                                <th className="p-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {searchedAndFilteredBookings.length > 0 ? (
                                searchedAndFilteredBookings.slice(0, displayLimit).map((b, index) => (
                                    <tr key={b.id} className="border-b border-neutral-200 hover:bg-neutral-100 transition-colors">
                                        <td className="p-3 text-center font-medium text-neutral-700">{index + 1}</td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2 text-neutral-900 font-medium"><FaBuilding className="text-neutral-600" /> {b.property}</div>
                                            <div className="text-xs text-neutral-500 mt-1">ID: {b.bookingId}</div>
                                            <div className="text-xs text-neutral-500">
                                                Arrival: {b.arrivalDate}
                                            </div>
                                            <div className="text-xs text-neutral-500">
                                                Departure: {b.departureDate}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2 font-medium text-neutral-900"><FaUser className="text-neutral-600"/> {b.clientName}</div>
                                            <div className="text-xs text-neutral-500 flex items-center gap-2 mt-1">
                                                <FaBed /> Nights: {b.nightsStayed}
                                            </div>
                                            <div className="text-xs text-neutral-500 flex items-center gap-2">
                                                <FaInfoCircle /> Rooms: {b.numberOfRooms}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <div className="text-green-700 flex items-center gap-2">
                                                <FaArrowDown /> PKR {b.received}
                                            </div>
                                            <div className="text-red-700 flex items-center gap-2">
                                                <FaArrowUp /> PKR {b.payable}
                                            </div>
                                            <div className="text-blue-700 font-bold flex items-center gap-2">
                                                <FaDollarSign /> PKR {Number(b.profit).toFixed(2)}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center text-neutral-600">{b.userEmail || "N/A"}</td>
                                        <td className="p-3 flex gap-3 justify-center">
                                            {/* New "View" button */}
                                            <button
                                                onClick={() => handleView(b)}
                                                className="text-neutral-900 hover:text-blue-800 transition-colors p-2 rounded-full hover:bg-neutral-100"
                                                title="View Details"
                                            >
                                                <FaEye />
                                            </button>
                                            <button
                                                onClick={() => handleEdit(b)}
                                                className="text-blue-600 hover:text-blue-800 transition-colors p-2 rounded-full hover:bg-neutral-100"
                                                title="Edit"
                                            >
                                                <FaEdit />
                                            </button>
                                            <button
                                                onClick={() => setDeletingBookingId(b.id)}
                                                className="text-red-600 hover:text-red-800 transition-colors p-2 rounded-full hover:bg-neutral-100"
                                                title="Delete"
                                            >
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center py-6 text-neutral-500">
                                        No bookings found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {displayLimit < searchedAndFilteredBookings.length && (
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

            {/* Edit Modal */}
            {editingBooking && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-white bg-opacity-70 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-md p-6 sm:p-8 w-full max-w-2xl relative border border-neutral-200 transform transition-all duration-300 scale-95 animate-scale-in">
                        <h3 className="text-2xl font-bold text-neutral-900 mb-6">Edit Booking</h3>
                        <button
                            onClick={() => setEditingBooking(null)}
                            className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-900 transition-colors"
                        >
                            <FaTimes size={24} />
                        </button>
                        <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Client Name</label>
                                <input
                                    type="text"
                                    value={editingBooking.clientName}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, clientName: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Booking ID</label>
                                <input
                                    type="text"
                                    value={editingBooking.bookingId}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, bookingId: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Property</label>
                                <input
                                    type="text"
                                    value={editingBooking.property}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, property: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Care Name</label>
                                <input
                                    type="text"
                                    value={editingBooking.care}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, care: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Care Contact</label>
                                <input
                                    type="text"
                                    value={editingBooking.careContact}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, careContact: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                                <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Care Email</label>
                                <input
                                    type="text"
                                    value={editingBooking.careEmail}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, careEmail: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Arrival Date</label>
                                <input
                                    type="date"
                                    value={editingBooking.arrivalDate}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, arrivalDate: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Departure Date</label>
                                <input
                                    type="date"
                                    value={editingBooking.departureDate}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, departureDate: e.target.value })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Received</label>
                                <input
                                    type="number"
                                    value={editingBooking.received}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, received: parseFloat(e.target.value) || 0 })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Payable</label>
                                <input
                                    type="number"
                                    value={editingBooking.payable}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, payable: parseFloat(e.target.value) || 0 })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-neutral-600">Profit</label>
                                <input
                                    type="number"
                                    value={editingBooking.profit}
                                    onChange={(e) => setEditingBooking({ ...editingBooking, profit: parseFloat(e.target.value) || 0 })}
                                    className="p-3 bg-white text-neutral-900 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 outline-none transition-colors"
                                />
                            </div>
                            {/* Add other fields here if needed */}
                            <div className="col-span-1 md:col-span-2 flex justify-end gap-4 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingBooking(null)}
                                    className="px-6 py-2 rounded-lg text-neutral-600 border border-neutral-200 hover:bg-neutral-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <FaSpinner className="animate-spin" /> Updating...
                                        </>
                                    ) : (
                                        <>
                                            <FaSave /> Save
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Details Modal - New addition */}
            {viewingBooking && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-white bg-opacity-70 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-md p-6 sm:p-8 w-full max-w-2xl relative border border-neutral-200 transform transition-all duration-300 scale-95 animate-scale-in">
                        <h3 className="text-2xl font-bold text-neutral-900 mb-6 flex items-center gap-3">
                            <FaInfoCircle /> Booking Details
                        </h3>
                        <button
                            onClick={() => setViewingBooking(null)}
                            className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-900 transition-colors"
                        >
                            <FaTimes size={24} />
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-neutral-700">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Client Name</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.clientName}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Booking ID</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.bookingId}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Property</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.property}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Arrival Date</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.arrivalDate}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Departure Date</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.departureDate}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Nights Stayed</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.nightsStayed}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Number of Rooms</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.numberOfRooms}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Number of Adults</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.numberOfAdults}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Number of Children</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.numberOfChildren}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Payment Method</label>
                                <p className="text-lg font-semibold text-neutral-900 flex items-center gap-2"><FaCreditCard /> {viewingBooking.paymentMethod}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Total Received</label>
                                <p className="text-lg font-semibold text-green-700">PKR {viewingBooking.received}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Total Payable</label>
                                <p className="text-lg font-semibold text-red-700">PKR {viewingBooking.payable}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Profit</label>
                                <p className="text-lg font-semibold text-neutral-900"> PKR {Number(viewingBooking.profit).toFixed(2)}</p>
                            </div>
                            <div className="flex justify-between gap-4">
                                 <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Care Name</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.care || "N/A"}</p>
                            </div>
                             <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Care Contact</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.careContact || "N/A"}</p>
                            </div>
                            
                            </div>
                             <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Care Email</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.careEmail || "N/A"}</p>
                            </div>
                           
                                  <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                                <label className="text-sm font-medium text-neutral-600">Notes</label>
                                <p className="text-lg font-semibold text-neutral-900">{viewingBooking.notes || "N/A"}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingBookingId && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-white bg-opacity-70 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-md p-6 w-full max-w-md relative text-center border border-neutral-200 transform transition-all duration-300 scale-95 animate-scale-in">
                        <FaTrash className="mx-auto text-red-600 text-4xl mb-4" />
                        <h3 className="text-xl font-bold text-neutral-900 mb-2">Confirm Deletion</h3>
                        <p className="text-neutral-600 mb-6">
                            Are you sure you want to delete this booking? This action cannot be undone.
                        </p>
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={() => setDeletingBookingId(null)}
                                className="px-6 py-2 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deletingBookingId)}
                                disabled={saving}
                                className="px-6 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <FaSpinner className="animate-spin" /> Deleting...
                                    </>
                                ) : (
                                    <>
                                        <FaTrash /> Delete
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`hidden 
                .bg-travel-grid {
                    background-image: none;
                    background-size: 50px 50px, 50px 50px;
                }
                @keyframes grid-pan {
                    from { background-position: 0 0, 0 0; }
                    to { background-position: 50px 50px, 50px 50px; }
                }
                .animate-rotate-slow { animation: rotate-slow 120s linear infinite; }
                @keyframes rotate-slow {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                .animate-blob-pulse-1 { animation: blob-pulse 20s ease-in-out infinite; }
                .animate-blob-pulse-2 { animation: blob-pulse 18s ease-in-out infinite reverse; }
                @keyframes blob-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.2); }
                }
                .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-scale-in { animation: scale-in 0.3s ease-out forwards; }
                @keyframes scale-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .delay-100 { animation-delay: 0.1s; }
                .delay-200 { animation-delay: 0.2s; }
            `}</style>
        </div>
        </>
    );
}

export default HoetlDetAdminSide;
