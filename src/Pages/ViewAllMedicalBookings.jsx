import { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, getDocs, doc, updateDoc ,query, where} from "firebase/firestore";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { formatCNIC } from "../utils/validation";
import Pagination from "../Components/Pagination";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';


// Correct import for jspdf-autotable
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Icons for a richer UI
import { FaEdit, FaSpinner, FaFilePdf, FaSearch, FaFilter, FaCalendarAlt, FaCalendarWeek, FaCalendarDay, FaUser, FaBuilding, FaPassport, FaIdCard, FaGlobe, FaPhone, FaDollarSign, FaEye } from "react-icons/fa";
import { MdClose } from "react-icons/md";
import { BiCalculator } from "react-icons/bi";


export default function ViewAllMedicalBookings() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState([]);
    const [filteredBookings, setFilteredBookings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [currentBooking, setCurrentBooking] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("all-time");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Memoize the form fields to prevent unnecessary re-renders
    const formFields = useMemo(() => [
        { label: "Company Name", name: "NameofCompany", type: "text", required: true, icon: FaBuilding },
        { label: "Insured's Name", name: "NameofInsured", type: "text", required: true, icon: FaUser },
        { label: "Age", name: "age", type: "number", required: true, icon: FaUser },
        { label: "Passport Number", name: "passportNumber", type: "text", required: true, icon: FaPassport },
        { label: "NIC", name: "Nic", type: "text", required: true, icon: FaIdCard },
        { label: "Country of Travel", name: "countryofTravel", type: "text", required: true, icon: FaGlobe },
        { label: "Contact Number", name: "contactNumber", type: "text", required: true, icon: FaPhone },
        { label: "Number of Days", name: "noOfdays", type: "number", required: true, icon: BiCalculator },
        { label: "Effective Date", name: "EffectiveDate", type: "date", required: true, icon: FaCalendarAlt },
        { label: "Expiry Date", name: "ExpiryDate", type: "date", required: true, icon: FaCalendarAlt },
        { label: "Issued At", name: "IssuedAt", type: "text", required: false, icon: FaGlobe },
        { label: "Total Received Amount", name: "totalReceivedAmount", type: "number", required: true, icon: FaDollarSign, disabled: true },
        { label: "Total Payable Amount", name: "totalPayableAmount", type: "number", required: true, icon: FaDollarSign, disabled: true },
        { label: "Total Profit", name: "totalProfit", type: "number", required: false, icon: FaDollarSign, disabled: true },
    ], []);

    const queryClient = useQueryClient();

    // Per-user cached fetch: only THIS employee's medical bookings, downloaded
    // once and cached to IndexedDB (instant on revisit). Re-fetch after edits.
    const { data: rawBookings = [], isLoading: queryLoading } = useQuery({
        queryKey: ['my-medical', user?.email],
        queryFn: () => dataService.fetchMyMedical(user.email),
        enabled: !!user?.email,
        staleTime: 1000 * 30,
    });

    const refreshBookings = async () => {
        await dataService.clearMine('medical', user.email);
        queryClient.invalidateQueries({ queryKey: ['my-medical', user?.email] });
    };

    useEffect(() => {
        setBookings(rawBookings);
        setIsLoading(queryLoading);
    }, [rawBookings, queryLoading]);

    // Filter and Search Logic
    useEffect(() => {
        let tempBookings = bookings;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filterPeriod === "today") {
            tempBookings = tempBookings.filter(b => {
                const bookingDate = b.createdAt?.toDate?.() || (b.createdAt ? new Date(b.createdAt) : null);
                return bookingDate && bookingDate.toDateString() === today.toDateString();
            });
        } else if (filterPeriod === "this-week") {
            const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
            tempBookings = tempBookings.filter(b => {
                const bookingDate = b.createdAt?.toDate?.() || (b.createdAt ? new Date(b.createdAt) : null);
                return bookingDate && bookingDate >= firstDayOfWeek;
            });
        } else if (filterPeriod === "this-month") {
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            tempBookings = tempBookings.filter(b => {
                const bookingDate = b.createdAt?.toDate?.() || (b.createdAt ? new Date(b.createdAt) : null);
                return bookingDate && bookingDate >= firstDayOfMonth;
            });
        }

        if (searchTerm) {
            const lowerCaseSearch = searchTerm.toLowerCase();
            tempBookings = tempBookings.filter(b =>
                (b.NameofInsured && b.NameofInsured.toLowerCase().includes(lowerCaseSearch)) ||
                (b.NameofCompany && b.NameofCompany.toLowerCase().includes(lowerCaseSearch)) ||
                (b.countryofTravel && b.countryofTravel.toLowerCase().includes(lowerCaseSearch)) ||
                (b.passportNumber && b.passportNumber.toLowerCase().includes(lowerCaseSearch)) ||
                (b.Nic && b.Nic.toLowerCase().includes(lowerCaseSearch)) ||
                (b.contactNumber && b.contactNumber.toLowerCase().includes(lowerCaseSearch))
            );
        }

        setFilteredBookings(tempBookings);
    }, [bookings, searchTerm, filterPeriod]);

    // Reset to first page when the filter/search changes.
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterPeriod]);

    const totalPages = Math.max(1, Math.ceil(filteredBookings.length / itemsPerPage));
    const pagedBookings = filteredBookings.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Calculate totals
    const totalReceived = filteredBookings.reduce((sum, b) => sum + (Number(b.totalReceivedAmount) || 0), 0);
    const totalPayable = filteredBookings.reduce((sum, b) => sum + (Number(b.totalPayableAmount) || 0), 0);
    const totalProfit = filteredBookings.reduce((sum, b) => sum + (Number(b.totalProfit) || 0), 0);

    // Chart Data
    const { monthlyData, companyData } = useMemo(() => {
        const months = {};
        const companies = {};

        filteredBookings.forEach((b) => {
            // Monthly Financials
            if (b.createdAt) {
                const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                const m = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                if (!months[m]) months[m] = { month: m, Profit: 0, Received: 0, Payable: 0, sortKey: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
                months[m].Profit += (Number(b.totalProfit) || 0);
                months[m].Received += (Number(b.totalReceivedAmount) || 0);
                months[m].Payable += (Number(b.totalPayableAmount) || 0);
            }

            // Top Companies
            if (b.NameofCompany) {
                const comp = b.NameofCompany.trim().toUpperCase();
                if (!companies[comp]) companies[comp] = { name: comp, value: 0 };
                companies[comp].value += 1;
            }
        });

        const mData = Object.values(months)
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(x => ({ month: x.month, Profit: x.Profit, Received: x.Received, Payable: x.Payable }));
        
        const cData = Object.values(companies)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return { monthlyData: mData, companyData: cData };
    }, [filteredBookings]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    // New and Improved PDF Generation Function
    const generatePDF = (booking) => {
        const doc = new jsPDF();
        
        // Header Section
        doc.setFontSize(22);
        doc.setFont("times", "bold");
        doc.setTextColor(30);
        doc.text("Medical Insurance Booking Report", doc.internal.pageSize.width / 2, 25, { align: "center" });

        doc.setFontSize(11);
        doc.setFont("times", "normal");
        doc.setTextColor(100);
        doc.text(`Report for: ${booking.NameofInsured || "N/A"}`, 14, 40);
        doc.text(`Passport No.: ${booking.passportNumber || "N/A"}`, 14, 46);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, doc.internal.pageSize.width - 14, 46, { align: "right" });

        const tableData = [
            ["Company Name", booking.NameofCompany || "N/A"],
            ["Insured's Name", booking.NameofInsured || "N/A"],
            ["Age", booking.age || "N/A"],
            ["Passport Number", booking.passportNumber || "N/A"],
            ["NIC", booking.Nic || "N/A"],
            ["Country of Travel", booking.countryofTravel || "N/A"],
            ["Contact Number", booking.contactNumber || "N/A"],
            ["No. of Days", booking.noOfdays || "N/A"],
            ["Effective Date", booking.EffectiveDate || "N/A"],
            ["Expiry Date", booking.ExpiryDate || "N/A"],
            ["Issued At", booking.IssuedAt || "N/A"],
            ["Total Received Amount", `$${Number(booking.totalReceivedAmount || 0).toFixed(2)}`],
            ["Total Payable Amount", `$${Number(booking.totalPayableAmount || 0).toFixed(2)}`],
            ["Total Profit", `$${Number(booking.totalProfit || 0).toFixed(2)}`],
            ["Created At", booking.createdAt?.toDate?.().toLocaleString?.() || "N/A"],
            ["Created By", booking.userEmail || "N/A"],
        ];

        autoTable(doc, {
            startY: 55,
            head: [["Field", "Details"]],
            body: tableData,
            theme: "striped",
            headStyles: { fillColor: [52, 73, 94], textColor: 255, fontSize: 10 },
            bodyStyles: { fontSize: 9 },
            alternateRowStyles: { fillColor: [241, 245, 249] },
        });

        doc.save(`Medical_Insurance_${booking.passportNumber || "record"}.pdf`);
        toast.success("PDF generated successfully!");
    };

    const handleEditClick = (booking) => {
        setCurrentBooking(booking);
        setEditModalOpen(true);
    };

    const handleViewClick = (booking) => {
        setCurrentBooking(booking);
        setViewModalOpen(true);
    };

    const handleSaveEdit = async (dataToUpdate) => {
        setIsSaving(true);
        try {
            const docRef = doc(db, "medical_insurance", currentBooking.id);
            await updateDoc(docRef, dataToUpdate);
            await refreshBookings();
            toast.success("Record updated successfully!");
            setEditModalOpen(false);
        } catch (error) {
            console.error("Error updating document: ", error);
            toast.error("Failed to update record. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // New component to display details
    const ViewModal = ({ booking, formFields, onClose }) => {
        return (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-white bg-opacity-70 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 w-full max-w-4xl p-8 transform transition-all duration-300 scale-95 animate-scale-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-bold text-neutral-900">Medical Insurance Details</h3>
                        <button onClick={onClose} className="text-neutral-600 hover:text-neutral-900 transition-colors duration-200">
                            <MdClose className="text-2xl" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm md:text-base">
                        {formFields.map((field) => (
                            <div key={field.name} className="flex flex-col">
                                <span className="font-semibold text-neutral-600">{field.label}:</span>
                                <span className="text-neutral-900 mt-1">
                                    {booking[field.name] || "N/A"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // EditModal component (unchanged)
    const EditModal = ({ booking, formFields, onClose, onSave, isSaving }) => {
        const [editFormData, setEditFormData] = useState(booking || {});
        const [errors, setErrors] = useState({});

        useEffect(() => {
            setEditFormData(booking);
        }, [booking]);

        const handleEditChange = (e) => {
            const { name } = e.target;
            const value = name === "Nic" ? formatCNIC(e.target.value) : e.target.value;
            setEditFormData(prev => ({ ...prev, [name]: value }));
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            const dataToUpdate = { ...editFormData };
            const fieldsToConvert = ["age", "noOfdays", "totalReceivedAmount", "totalPayableAmount", "totalProfit"];
            fieldsToConvert.forEach(field => {
                if (dataToUpdate[field] !== undefined && dataToUpdate[field] !== null) {
                    dataToUpdate[field] = Number(dataToUpdate[field]);
                }
            });
            onSave(dataToUpdate);
        };

        return (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-white bg-opacity-70 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 w-full max-w-4xl p-8 transform transition-all duration-300 scale-95 animate-scale-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-bold text-neutral-900">Edit Medical Insurance Record</h3>
                        <button onClick={onClose} className="text-neutral-600 hover:text-neutral-900 transition-colors duration-200">
                            <MdClose className="text-2xl" />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {formFields.map((field) => (
                            <div key={field.name} className="relative group">
                                <label htmlFor={field.name} className="block text-sm font-semibold text-neutral-700 mb-2 transition-colors duration-300 group-focus-within:text-blue-400">
                                    {field.label}
                                </label>
                                <div className="relative">
                                    {field.icon && <field.icon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-blue-400 transition-colors" />}
                                    <input
                                        type={field.type}
                                        name={field.name}
                                        id={field.name}
                                        value={editFormData[field.name] || ''}
                                        onChange={handleEditChange}
                                        disabled={field.disabled || isSaving}
                                        className={`w-full ${field.icon ? 'pl-12' : 'pl-4'} pr-4 py-3 rounded-xl border border-neutral-200 shadow-md focus:ring-4 focus:ring-neutral-300 focus:border-neutral-900 outline-none transition-all duration-300 ${
                                            (field.disabled || isSaving) ? "bg-white text-neutral-600 cursor-not-allowed" : "bg-white text-neutral-900 placeholder-neutral-500"
                                        }`}
                                    />
                                    {errors[field.name] && <span className="text-red-700 text-xs mt-2 ml-1">{errors[field.name]}</span>}
                                </div>
                            </div>
                        ))}
                        <div className="md:col-span-2 mt-6">
                            <button
                                type="submit"
                                disabled={isSaving}
                                className={`w-full py-4 rounded-full font-bold text-lg shadow-sm transform transition-all duration-300 ease-in-out hover:shadow-md flex items-center justify-center gap-3 ${
                                    isSaving ? "bg-neutral-100 text-neutral-500 cursor-not-allowed" : "bg-gradient-to-r from-neutral-900 to-neutral-900 text-white hover:from-neutral-700 hover:to-neutral-700"
                                }`}
                            >
                                {isSaving ? (
                                    <>
                                        <FaSpinner className="animate-spin h-5 w-5" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <span>Save Changes</span>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };


    return (
        <div className="relative min-h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900 p-8">
             {/* Background Animations */}
             <div className="absolute inset-0 z-0 bg-travel-grid">
                <div className="hidden"></div>
                <div className="hidden absolute inset-0 z-10 animate-pulse-light"></div>
                <div className="hidden"></div>
                <div className="hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] border-2 border-dashed border-blue-500/30 rounded-full animate-rotate-slow"></div>
                <div className="hidden absolute top-1/4 left-1/4 w-40 h-40 bg-blue-500/20 blur-3xl animate-blob-pulse-1"></div>
                <div className="hidden absolute bottom-1/4 right-1/4 w-40 h-40 bg-green-500/20 blur-3xl animate-blob-pulse-2"></div>
            </div>

            {/* Main Content */}
            <div className="relative z-20 w-full max-w-7xl mx-auto">
                <div className="flex items-center justify-center gap-4 mb-12 text-center">
                    <FaBuilding className="text-teal-700 text-5xl animate-pulse-slow" />
                    <h1 className="text-4xl font-extrabold text-neutral-900 tracking-wider">
                        Medical Insurance Records
                    </h1>
                </div>

                {/* Stat Boxes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white rounded-xl p-6 text-neutral-900 shadow-sm border border-neutral-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold">Total Received</h3>
                            <FaDollarSign className="text-3xl opacity-50" />
                        </div>
                        <p className="mt-2 text-4xl font-bold">{totalReceived.toFixed(2)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 text-neutral-900 shadow-sm border border-neutral-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold">Total Payable</h3>
                            <FaDollarSign className="text-3xl opacity-50" />
                        </div>
                        <p className="mt-2 text-4xl font-bold">{totalPayable.toFixed(2)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-6 text-neutral-900 shadow-sm border border-neutral-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold">Total Profit</h3>
                            <FaDollarSign className="text-3xl opacity-50" />
                        </div>
                        <p className="mt-2 text-4xl font-bold">{totalProfit.toFixed(2)}</p>
                    </div>
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {monthlyData.length > 0 && (
                        <div className="bg-white backdrop-blur-xl border border-neutral-200 rounded-xl shadow-md p-6">
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

                    {companyData.length > 0 && (
                        <div className="bg-white backdrop-blur-xl border border-neutral-200 rounded-xl shadow-md p-6">
                            <h2 className="text-lg font-extrabold text-neutral-900 mb-4">Top Insurance Companies</h2>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={companyData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        >
                                            {companyData.map((entry, index) => (
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

                {/* Filter and Search */}
                <div className="bg-white backdrop-blur-xl border border-neutral-200 shadow-md rounded-xl p-4 flex flex-col md:flex-row items-center gap-4 mb-8">
                    <div className="relative w-full md:w-1/2">
                        <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                        <input
                            type="text"
                            placeholder="Search by name, company, passport..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-2 rounded-lg bg-white text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                        />
                    </div>
                    <div className="flex-grow flex flex-wrap gap-2 md:gap-4 justify-center md:justify-end">
                        <button
                            onClick={() => setFilterPeriod("all-time")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${filterPeriod === "all-time" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                        >
                            <FaFilter /> All Time
                        </button>
                        <button
                            onClick={() => setFilterPeriod("today")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${filterPeriod === "today" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                        >
                            <FaCalendarDay /> Today
                        </button>
                        <button
                            onClick={() => setFilterPeriod("this-week")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${filterPeriod === "this-week" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                        >
                            <FaCalendarWeek /> This Week
                        </button>
                        <button
                            onClick={() => setFilterPeriod("this-month")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors duration-200 ${filterPeriod === "this-month" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                        >
                            <FaCalendarAlt /> This Month
                        </button>
                    </div>
                </div>

                {/* Bookings Table */}
                <div className="bg-white backdrop-blur-xl border border-neutral-200 shadow-md rounded-3xl p-6 md:p-10 animate-fade-in-up">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <FaSpinner className="animate-spin text-4xl text-blue-600" />
                            <span className="ml-4 text-xl text-neutral-700">Loading bookings...</span>
                        </div>
                    ) : filteredBookings.length === 0 ? (
                        <div className="text-center text-neutral-600 text-lg py-12">
                            <p>No medical insurance records found for the selected criteria.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-neutral-200 table-auto">
                                <thead className="bg-white">
                                    <tr>
                                        {['#', 'Company', 'Insured Name', 'Passport No.', 'Travel Country', 'Contact No.',  'Rec. Amount', 'Pay. Amount', 'Profit', 'Actions'].map(header => (
                                            <th key={header} className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                                                {header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-transparent divide-y divide-neutral-200">
                                    {pagedBookings.map((booking,index) => (
                                        <tr key={booking.id} className="hover:bg-neutral-100 transition-colors duration-200">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{booking.NameofCompany}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{booking.NameofInsured}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{booking.passportNumber}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{booking.countryofTravel}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{booking.contactNumber}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-teal-700">{Number(booking.totalReceivedAmount).toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-700">{Number(booking.totalPayableAmount).toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700">{Number(booking.totalProfit).toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <div className="flex space-x-2">
                                                    <button onClick={() => handleViewClick(booking)} className="text-purple-700 hover:text-purple-800 transition-colors p-2 rounded-full hover:bg-neutral-100" aria-label="View details">
                                                        <FaEye />
                                                    </button>
                                                    <button onClick={() => handleEditClick(booking)} className="text-blue-700 hover:text-blue-800 transition-colors p-2 rounded-full hover:bg-neutral-100" aria-label="Edit booking">
                                                        <FaEdit />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
            </div>
            {viewModalOpen && (
                <ViewModal
                    booking={currentBooking}
                    formFields={formFields}
                    onClose={() => setViewModalOpen(false)}
                />
            )}
            {editModalOpen && (
                <EditModal
                    booking={currentBooking}
                    formFields={formFields}
                    onClose={() => setEditModalOpen(false)}
                    onSave={handleSaveEdit}
                    isSaving={isSaving}
                />
            )}

            {/* Tailwind CSS keyframes for animation */}
            <style jsx>{`hidden 
                .bg-travel-grid {
                    background-image: none;
                    background-size: 50px 50px, 50px 50px;
                }
                @keyframes grid-pan {
                    from { background-position: 0 0, 0 0; }
                    to { background-position: 50px 50px, 50px 50px; }
                }
                .animate-pulse-light { animation: pulse-light 10s ease-in-out infinite; }
                @keyframes pulse-light {
                    0%, 100% { box-shadow: none; }
                    50% { box-shadow: none; }
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
                .animate-pulse-slow { animation: pulse-slow 3s infinite; }
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.05); }
                }
                 .animate-scale-in { animation: scale-in 0.3s ease-out forwards; }
                @keyframes scale-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
