import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { toDateSafe } from "../utils/dates";
import { db } from "../firebase";
import {
    collection,
    query,
    orderBy,
    updateDoc,
    deleteDoc,
    doc,
} from "firebase/firestore";
import toast from "react-hot-toast";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import {
    FaSearch,
    FaEdit,
    FaTrash,
    FaUserTie,
    FaMoneyBillWave,
    FaChartLine,
    FaCheck,
    FaTimes,
    FaChevronLeft,
    FaChevronRight,
    FaSpinner,
    FaDollarSign,
    FaFilter,
    FaCalendarAlt,
    FaEye
} from "react-icons/fa";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';

// A reusable modal component
const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100 opacity-100">
                <div className="flex justify-between items-center p-5 border-b border-neutral-200 sticky top-0 bg-white">
                    <h3 className="text-xl font-bold text-neutral-900">{title}</h3>
                    <button onClick={onClose} className="text-neutral-600 hover:text-neutral-900 transition-colors">
                        <FaTimes size={20} />
                    </button>
                </div>
                <div className="p-5">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default function UmmrahBookingDet() {
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState("");
    const [filterVendor, setFilterVendor] = useState("all");
    const [filterEmployee, setFilterEmployee] = useState("all");
    const [editingBooking, setEditingBooking] = useState(null);
    const [viewingBooking, setViewingBooking] = useState(null);
    const [editData, setEditData] = useState({});
    const [summaryFilter, setSummaryFilter] = useState("all");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [page, setPage] = useState(1);
    const rowsPerPage = 10;

    // 🔹 Global cache fetch
    const { data: bookings = [], isLoading: loading } = useQuery({
        queryKey: ['ummrahBookings'],
        queryFn: () => dataService.fetchAll('ummrahBookings'),
        staleTime: 1000 * 30,
    });

    const filterByDateRange = (data) => {
        const now = new Date();
        const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

        return data.filter((b) => {
            if (!b.createdAt) return false;
            const created = toDateSafe(b.createdAt) || new Date(0);
            const createdStartOfDay = startOfDay(created);

            switch (summaryFilter) {
                case "today":
                    return createdStartOfDay.getTime() === startOfDay(now).getTime();
                case "yesterday":
                    const yesterday = new Date(now);
                    yesterday.setDate(now.getDate() - 1);
                    return createdStartOfDay.getTime() === startOfDay(yesterday).getTime();
                case "last7days":
                    const sevenDaysAgo = new Date(now);
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    return created >= sevenDaysAgo;
                case "last30days":
                    const thirtyDaysAgo = new Date(now);
                    thirtyDaysAgo.setDate(now.getDate() - 30);
                    return created >= thirtyDaysAgo;
                case "all":
                default:
                    return true;
            }
        });
    };

    const vendors = useMemo(() => [...new Set(bookings.map((b) => b.vendor).filter(Boolean))], [bookings]);
    const employees = useMemo(() => [...new Set(bookings.map((b) => b.createdByEmail).filter(Boolean))], [bookings]);

    const activeFilteredBookings = useMemo(() => {
        let result = bookings;

        // Custom Date Range filter
        if (startDate && endDate) {
            result = result.filter(b => {
                if (!b.createdAt) return false;
                const created = toDateSafe(b.createdAt) || new Date(0);
                const st = new Date(startDate);
                st.setHours(0, 0, 0, 0);
                const en = new Date(endDate);
                en.setHours(23, 59, 59, 999);
                return created >= st && created <= en;
            });
        } else {
            result = filterByDateRange(result);
        }

        result = result.filter((b) => {
            const q = search.toLowerCase();
            const matchesSearch =
                b.fullName?.toLowerCase().includes(q) ||
                b.passportNumber?.toLowerCase().includes(q) ||
                b.phone?.toLowerCase().includes(q);
            const matchesVendor = filterVendor === "all" || b.vendor === filterVendor;
            const matchesEmp = filterEmployee === "all" || b.createdByEmail === filterEmployee;
            return matchesSearch && matchesVendor && matchesEmp;
        });

        return result;
    }, [bookings, search, filterVendor, filterEmployee, summaryFilter, startDate, endDate]);

    const paginated = useMemo(() => activeFilteredBookings.slice((page - 1) * rowsPerPage, page * rowsPerPage), [activeFilteredBookings, page]);
    const totalPages = Math.ceil(activeFilteredBookings.length / rowsPerPage);

    const totalReceived = activeFilteredBookings.reduce((acc, b) => acc + Number(b.received || 0), 0);
    const totalPayable = activeFilteredBookings.reduce((acc, b) => acc + Number(b.payable || 0), 0);
    const totalProfit = totalReceived - totalPayable;

    // Charts Data
    const { monthlyData, vendorData } = useMemo(() => {
        const months = {};
        const vends = {};

        activeFilteredBookings.forEach((b) => {
            if (b.createdAt) {
                const d = toDateSafe(b.createdAt) || new Date(0);
                const m = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                if (!months[m]) months[m] = { month: m, Profit: 0, Received: 0, Payable: 0, sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
                months[m].Profit += (Number(b.profit) || (Number(b.received || 0) - Number(b.payable || 0)));
                months[m].Received += (Number(b.received) || 0);
                months[m].Payable += (Number(b.payable) || 0);
            }

            if (b.vendor) {
                const vndr = b.vendor.trim().toUpperCase();
                if (!vends[vndr]) vends[vndr] = { name: vndr, value: 0 };
                vends[vndr].value += 1;
            }
        });

        const mData = Object.values(months)
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(x => ({ month: x.month, Profit: x.Profit, Received: x.Received, Payable: x.Payable }));
        
        const vData = Object.values(vends)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return { monthlyData: mData, vendorData: vData };
    }, [activeFilteredBookings]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    const startEdit = (b) => {
        setEditingBooking(b);
        setEditData({ ...b });
    };

    const startView = (b) => {
        setViewingBooking(b);
    };

    const saveEdit = async () => {
        if (!editingBooking) return;
        setSaving(true);
        try {
            const docRef = doc(db, "ummrahBookings", editingBooking.id);
            const payload = {
                ...editData,
                profit: Number(editData.received || 0) - Number(editData.payable || 0),
            };
            await updateDoc(docRef, payload);
            dataService.clearCache('ummrahBookings');
            queryClient.invalidateQueries({ queryKey: ['ummrahBookings'] });
            toast.success("Booking updated!");
            setEditingBooking(null);
            setEditData({});
        } catch (err) {
            toast.error("Update failed");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const deleteBooking = async (id) => {
        if (!window.confirm("Are you sure you want to delete this booking?")) return;
        try {
            await deleteDoc(doc(db, "ummrahBookings", id));
            dataService.clearCache('ummrahBookings');
            queryClient.invalidateQueries({ queryKey: ['ummrahBookings'] });
            toast.success("Booking deleted successfully!");
        } catch (err) {
            toast.error("Delete failed");
            console.error(err);
        }
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900">
            <AdminNavbar />
            <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <h1 className="text-3xl font-extrabold text-neutral-900 drop-shadow">
                        📊 Umrah Bookings Dashboard
                    </h1>
                    <div className="relative w-full sm:w-auto">
                        <FaCalendarAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                        <select
                            value={summaryFilter}
                            onChange={(e) => setSummaryFilter(e.target.value)}
                            className="py-2 pl-9 pr-4 rounded-lg border border-neutral-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 transition-colors w-full text-neutral-700"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="last7days">Last 7 Days</option>
                            <option value="last30days">Last 30 Days</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-md border border-neutral-200">
                    <span className="text-neutral-700 font-semibold flex items-center gap-2"><FaCalendarAlt /> Custom Range:</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="py-2 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-300" />
                    <span className="text-neutral-600">to</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="py-2 px-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-300" />
                    {(startDate || endDate) && (
                        <button onClick={() => { setStartDate(""); setEndDate(""); }} className="text-red-700 hover:text-red-800 transition-colors px-3 py-1 bg-red-50 rounded-lg">Clear Dates</button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="p-6 rounded-2xl shadow-md bg-green-50 border border-neutral-200 transition-transform duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-neutral-600 uppercase">Total Received</h3>
                            <div className="p-2 rounded-full bg-white text-green-700">
                                <FaMoneyBillWave size={20} />
                            </div>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-neutral-900">
                            PKR {totalReceived.toLocaleString()}
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl shadow-md bg-white border border-neutral-200 transition-transform duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-neutral-600 uppercase">Total Payable</h3>
                            <div className="p-2 rounded-full bg-red-50 text-red-400">
                                <FaDollarSign size={20} />
                            </div>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-neutral-900">
                            PKR {totalPayable.toLocaleString()}
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl shadow-md bg-yellow-50 border border-neutral-200 transition-transform duration-200">
                        <div className="flex items-center justify-between ">
                            <h3 className="text-sm font-semibold text-neutral-600 uppercase">Profit</h3>
                            <div className="p-2 rounded-full bg-neutral-100 text-blue-400">
                                <FaChartLine size={20} />
                            </div>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-neutral-900">
                            PKR {totalProfit.toLocaleString()}
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl shadow-md bg-white border border-neutral-200 transition-transform duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-neutral-600 uppercase">Bookings</h3>
                            <div className="p-2 rounded-full bg-neutral-100 text-purple-400">
                                <FaUserTie size={20} />
                            </div>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-neutral-900">{activeFilteredBookings.length}</p>
                    </div>
                </div>

                {/* Charts Section */}
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
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-5 rounded-xl shadow-md border border-neutral-200">
                    <div className="relative flex-1 w-full">
                        <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                            type="text"
                            placeholder="Search by name, passport, phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-neutral-200 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300 transition-colors"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-red-500 transition-colors"
                            >
                                <FaTimes />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <FaFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                            <select
                                value={filterVendor}
                                onChange={(e) => setFilterVendor(e.target.value)}
                                className="pl-9 pr-4 py-3 rounded-lg border border-neutral-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 transition-colors w-full text-neutral-700"
                            >
                                <option value="all">All Vendors</option>
                                {vendors.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="relative w-full sm:w-auto">
                            <FaUserTie className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                            <select
                                value={filterEmployee}
                                onChange={(e) => setFilterEmployee(e.target.value)}
                                className="pl-9 pr-4 py-3 rounded-lg border border-neutral-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 transition-colors w-full text-neutral-700"
                            >
                                <option value="all">All Employees</option>
                                {employees.map((em) => (
                                    <option key={em} value={em}>
                                        {em}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden">
                    {loading ? (
                        <p className="text-center py-10 text-neutral-600">Loading...</p>
                    ) : paginated.length === 0 ? (
                        <p className="text-center py-10 text-neutral-500">No bookings found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left border-collapse">
                                <thead className="bg-white text-neutral-600 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">#</th>
                                        <th className="px-4 py-3 font-semibold">Name</th>
                                        <th className="px-4 py-3 font-semibold">Phone</th>
                                        <th className="px-4 py-3 font-semibold">Passport</th>
                                        <th className="px-4 py-3 font-semibold">Vendor</th>
                                        <th className="px-4 py-3 font-semibold">Employee</th>
                                        <th className="px-4 py-3 font-semibold">Payable</th>
                                        <th className="px-4 py-3 font-semibold">Received</th>
                                        <th className="px-4 py-3 font-semibold">Profit</th>
                                        <th className="px-4 py-3 font-semibold text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map((b, i) => (
                                        <tr key={b.id} className="border-t border-neutral-200 hover:bg-neutral-100 transition-colors">
                                            <td className="px-4 py-3 text-neutral-700">{i + 1 + (page - 1) * rowsPerPage}</td>
                                            <td className="px-4 py-3 font-medium text-neutral-900">{b.fullName}</td>
                                            <td className="px-4 py-3 text-neutral-700">{b.phone}</td>
                                            <td className="px-4 py-3 text-neutral-700">{b.passportNumber}</td>
                                            <td className="px-4 py-3 text-neutral-700">{b.vendor || "-"}</td>
                                            <td className="px-4 py-3 text-neutral-700">{b.createdByEmail || "-"}</td>
                                            <td className="px-4 py-3 text-red-700 font-medium">PKR {Number(b.payable || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-green-700 font-medium">PKR {Number(b.received || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-blue-700 font-bold">
                                                PKR {(b.profit ?? Number(b.received || 0) - Number(b.payable || 0)).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 flex gap-2 justify-center">
                                                <button onClick={() => startView(b)} className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors" title="View Details">
                                                    <FaEye />
                                                </button>
                                                <button onClick={() => startEdit(b)} className="p-2 text-blue-700 hover:text-blue-800 transition-colors" title="Edit Booking">
                                                    <FaEdit />
                                                </button>
                                                <button onClick={() => deleteBooking(b.id)} className="p-2 text-red-700 hover:text-red-800 transition-colors" title="Delete Booking">
                                                    <FaTrash />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {paginated.length > 0 && (
                    <div className="flex justify-between items-center p-4 bg-white rounded-xl shadow-md border border-neutral-200">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-2 px-4 py-2 text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors disabled:opacity-50"
                        >
                            <FaChevronLeft /> Previous
                        </button>
                        <span className="text-neutral-600">
                            Page <span className="font-semibold text-neutral-900">{page}</span> of <span className="font-semibold text-neutral-900">{totalPages}</span>
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-2 px-4 py-2 text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors disabled:opacity-50"
                        >
                            Next <FaChevronRight />
                        </button>
                    </div>
                )}
            </main>
            <Footer />

            {/* View Modal */}
            <Modal isOpen={!!viewingBooking} onClose={() => setViewingBooking(null)} title="Booking Details">
                {viewingBooking && (
                    <div className="space-y-4 text-neutral-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Full Name:</p>
                                <p>{viewingBooking.fullName}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Phone:</p>
                                <p>{viewingBooking.phone}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Passport Number:</p>
                                <p>{viewingBooking.passportNumber}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Visa Number:</p>
                                <p>{viewingBooking.visaNumber || 'N/A'}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Vendor:</p>
                                <p>{viewingBooking.vendor || 'N/A'}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Created By:</p>
                                <p>{viewingBooking.createdByEmail || 'N/A'}</p>
                            </div>
                        </div>

                        <h4 className="text-lg font-bold text-neutral-900 mt-6">Financials</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Payable:</p>
                                <p className="text-red-700">PKR {Number(viewingBooking.payable || 0).toLocaleString()}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Received:</p>
                                <p className="text-green-700">PKR {Number(viewingBooking.received || 0).toLocaleString()}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Profit:</p>
                                <p className="text-blue-700">PKR {(Number(viewingBooking.received || 0) - Number(viewingBooking.payable || 0)).toLocaleString()}</p>
                            </div>
                        </div>

                        <h4 className="text-lg font-bold text-neutral-900 mt-6">Hotel Details</h4>
                        <div className="space-y-4">
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Makkah Hotel:</p>
                                <p>{viewingBooking.makkahHotel || 'N/A'}</p>
                                <p>Check-in: {viewingBooking.makkahCheckIn || 'N/A'} | Check-out: {viewingBooking.makkahCheckOut || 'N/A'} | Nights: {viewingBooking.makkahNights || 'N/A'}</p>
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Madinah Hotel:</p>
                                <p>{viewingBooking.madinahHotel || 'N/A'}</p>
                                <p>Check-in: {viewingBooking.madinahCheckIn || 'N/A'} | Check-out: {viewingBooking.madinahCheckOut || 'N/A'} | Nights: {viewingBooking.madinahNights || 'N/A'}</p>
                            </div>
                            {viewingBooking.makkahagainhotel && (
                                <div className="p-3 bg-white rounded-md">
                                    <p className="font-bold text-neutral-600">Makkah Hotel (Again):</p>
                                    <p>{viewingBooking.makkahagainhotel}</p>
                                    <p>Check-in: {viewingBooking.makkahCheckInagain || 'N/A'} | Check-out: {viewingBooking.makkahCheckOutagain || 'N/A'} | Nights: {viewingBooking.makkahagainNights || 'N/A'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={!!editingBooking} onClose={() => setEditingBooking(null)} title="Edit Booking">
                {editingBooking && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="fullName">Full Name</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="fullName" type="text" name="fullName" value={editData.fullName || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="phone">Phone</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="phone" type="text" name="phone" value={editData.phone || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="passportNumber">Passport Number</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="passportNumber" type="text" name="passportNumber" value={editData.passportNumber || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="visaNumber">Visa Number</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="visaNumber" type="text" name="visaNumber" value={editData.visaNumber || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="vendor">Vendor</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="vendor" type="text" name="vendor" value={editData.vendor || ""} onChange={handleEditChange} />
                            </div>
                            <div className="p-3 bg-white rounded-md">
                                <p className="font-bold text-neutral-600">Created By:</p>
                                <p>{editingBooking.createdByEmail || 'N/A'}</p>
                            </div>
                        </div>

                        <h4 className="text-lg font-bold text-neutral-900 mt-6">Financials</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="payable">Payable</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="payable" type="number" name="payable" value={editData.payable || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="received">Received</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="received" type="number" name="received" value={editData.received || ""} onChange={handleEditChange} />
                            </div>
                        </div>

                        <h4 className="text-lg font-bold text-neutral-900 mt-6">Hotel Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahHotel">Makkah Hotel</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahHotel" type="text" name="makkahHotel" value={editData.makkahHotel || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahNights">Makkah Nights</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahNights" type="number" name="makkahNights" value={editData.makkahNights || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahCheckIn">Makkah Check-in</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahCheckIn" type="date" name="makkahCheckIn" value={editData.makkahCheckIn || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahCheckOut">Makkah Check-out</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahCheckOut" type="date" name="makkahCheckOut" value={editData.makkahCheckOut || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="madinahHotel">Madinah Hotel</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="madinahHotel" type="text" name="madinahHotel" value={editData.madinahHotel || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="madinahNights">Madinah Nights</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="madinahNights" type="number" name="madinahNights" value={editData.madinahNights || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="madinahCheckIn">Madinah Check-in</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="madinahCheckIn" type="date" name="madinahCheckIn" value={editData.madinahCheckIn || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="madinahCheckOut">Madinah Check-out</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="madinahCheckOut" type="date" name="madinahCheckOut" value={editData.madinahCheckOut || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahagainhotel">Makkah Hotel (Again)</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahagainhotel" type="text" name="makkahagainhotel" value={editData.makkahagainhotel || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahagainNights">Makkah Nights (Again)</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahagainNights" type="number" name="makkahagainNights" value={editData.makkahagainNights || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahCheckInagain">Makkah Check-in (Again)</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahCheckInagain" type="date" name="makkahCheckInagain" value={editData.makkahCheckInagain || ""} onChange={handleEditChange} />
                            </div>
                            <div>
                                <label className="block text-neutral-600 text-sm font-bold mb-2" htmlFor="makkahCheckOutagain">Makkah Check-out (Again)</label>
                                <input className="shadow appearance-none border border-neutral-200 rounded w-full py-2 px-3 bg-white text-neutral-900 leading-tight focus:outline-none focus:ring-neutral-300 focus:ring-2" id="makkahCheckOutagain" type="date" name="makkahCheckOutagain" value={editData.makkahCheckOutagain || ""} onChange={handleEditChange} />
                            </div>
                        </div>

                        <div className="flex justify-end gap-4 mt-6">
                            <button
                                onClick={() => setEditingBooking(null)}
                                className="px-4 py-2 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="px-4 py-2 bg-neutral-100 rounded-lg hover:bg-neutral-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {saving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>\
        </div>
    );
}
