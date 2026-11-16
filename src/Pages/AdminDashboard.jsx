
import { useState, useEffect, useMemo, useCallback } from "react";
import DebouncedSearchInput from "../Components/DebouncedSearchInput";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { effectiveProfit } from "../utils/finance";
import { normalizeBooking } from "../utils/accounting";

// Each service keeps its records in a different shape; this maps the
// dashboard's service label to the shared normaliser and to the admin page
// where that service's records are managed.
const SERVICE_KIND = { Visa: "visa", Hotel: "hotel", Umrah: "umrah", Ticket: "ticket", Insurance: "medical" };
const SERVICE_ROUTE = {
  Hotel: "/adminHotelDet",
  Umrah: "/umrahbookings",
  Ticket: "/AdminTicketBookings",
  Insurance: "/medicalInsurancedet",
};

import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  MdDashboard,
  MdPeople,
  MdSearch,
  MdBarChart,
  MdEdit,
  MdDelete,
  MdVisibility,
  MdDownload,
  MdFilterList,
  MdRefresh,
  MdLogout,
  MdBusiness,
  MdEmail,
  MdPhone,
  MdCalendarToday,
  MdAttachMoney,
  MdTrendingUp,
  MdTrendingDown,
  MdWarning,
  MdCheckCircle,
  MdSchedule,
} from "react-icons/md";
import toast from "react-hot-toast";
// jsPDF loaded dynamically when needed
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "../Components/AdminLayout";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";

export default function AdminDashboard() {
  const { user, isAdmin, logout } = useAuth();
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    status: "All",
    payment: "All",
    country: "All",
    serviceType: "All",
  });

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [error, setError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const navigate = useNavigate();
  const HandleClick = () => {
    navigate("/AdminTicketBookings");
  };
  const queryClient = useQueryClient();

  // --- USEQUERY FEEDS ---
  const fetchOptions = { staleTime: 1000 * 30 }; // 5 mins cache

  const { data: vAll = [], isLoading: vLoading } = useQuery({ queryKey: ['all-visas'], queryFn: () => dataService.fetchAll('bookings'), ...fetchOptions });
  const { data: hAll = [], isLoading: hLoading } = useQuery({ queryKey: ['all-hotels'], queryFn: () => dataService.fetchAll('HotelBookings'), ...fetchOptions });
  const { data: uAll = [], isLoading: uLoading } = useQuery({ queryKey: ['all-umrah'], queryFn: () => dataService.fetchAll('ummrahBookings'), ...fetchOptions });
  const { data: tAll = [], isLoading: tLoading } = useQuery({ queryKey: ['all-tickets'], queryFn: () => dataService.fetchAll('ticketBookings'), ...fetchOptions });
  const { data: mAll = [], isLoading: mLoading } = useQuery({ queryKey: ['all-medical'], queryFn: () => dataService.fetchAll('medical_insurance'), ...fetchOptions });

  const loading = vLoading || hLoading || uLoading || tLoading || mLoading;

  const handleRefresh = useCallback(async () => {
    await dataService.clearCache(); // drop localforage cache so we pull fresh
    queryClient.invalidateQueries();
    toast.success("Refreshing data...");
  }, [queryClient]);

  // ====== HELPERS FOR MULTI-COLLECTION FILTERING ======
  const getFirestoreDate = useCallback((b) => {
    if (b.createdAt?.toDate) return b.createdAt.toDate();
    if (b.createdAt?.seconds) return new Date(b.createdAt.seconds * 1000);
    return b.date ? new Date(b.date) : null;
  }, []);

  const generalFilter = useMemo(() => {
    return (dateVal, item) => {
      // Apply search term using fast object value concatenation instead of slow JSON.stringify
      if (debouncedSearchTerm) {
        const q = debouncedSearchTerm.toLowerCase();
        const text = Object.values(item).filter(v => typeof v === 'string').join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }

      if (!startDate && !endDate) return true;
      const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (!d || isNaN(d.getTime())) return false;

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    };
  }, [startDate, endDate, debouncedSearchTerm]);

  // Apply filters and search to Visas (allBookings replaced by vAll)
  const filteredBookings = useMemo(() => {
    let filtered = vAll;
    if (filters.status !== "All") filtered = filtered.filter(b => b.visaStatus === filters.status);
    if (filters.payment !== "All") filtered = filtered.filter(b => b.paymentStatus === filters.payment);
    if (filters.country !== "All") filtered = filtered.filter(b => b.country === filters.country);

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(b => b.date && new Date(b.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(b => b.date && new Date(b.date) <= end);
    }

    if (debouncedSearchTerm) {
      const q = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(b =>
        b.fullName?.toLowerCase().includes(q) ||
        b.passport?.toLowerCase().includes(q) ||
        b.email?.toLowerCase().includes(q) ||
        b.country?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [vAll, filters, debouncedSearchTerm, startDate, endDate]);

  // Derived employees record
  const employees = useMemo(() => {
    const employeeMap = new Map();
    vAll.forEach((booking) => {
      const userEmail = booking.userEmail || "Unknown";
      if (!employeeMap.has(userEmail)) {
        employeeMap.set(userEmail, {
          email: userEmail,
          totalBookings: 0,
          approvedVisas: 0,
          pendingVisas: 0,
          rejectedVisas: 0,
          totalRevenue: 0,
          receivedRevenue: 0,
          pendingRevenue: 0,
          profit: 0,
          countries: new Set(),
          lastActivity: null,
          performance: 0,
        });
      }
      const employee = employeeMap.get(userEmail);
      employee.totalBookings++;
      if (booking.visaStatus === "Approved") employee.approvedVisas++;
      else if (["Processing", "Pending"].includes(booking.visaStatus)) employee.pendingVisas++;
      else if (booking.visaStatus === "Rejected") employee.rejectedVisas++;

      employee.totalRevenue += Number(booking.totalFee || 0);
      employee.receivedRevenue += Number(booking.receivedFee || 0);
      employee.pendingRevenue += Number(booking.remainingFee || 0);
      employee.profit += Number(booking.profit || 0);
      if (booking.country) employee.countries.add(booking.country);
      if (booking.date) {
        const d = new Date(booking.date);
        if (!employee.lastActivity || d > employee.lastActivity) employee.lastActivity = d;
      }
    });

    return Array.from(employeeMap.values()).map(emp => ({
      ...emp,
      countries: Array.from(emp.countries),
      performance: emp.totalBookings > 0 ? Math.round((emp.approvedVisas / emp.totalBookings) * 100) : 0,
    }));
  }, [vAll]);

  // Derive charts/filtered lists
  const cfVisas = filteredBookings;
  const cfHotels = useMemo(() => hAll.filter(b => generalFilter(getFirestoreDate(b) || b.arrivalDate, b)), [hAll, generalFilter]);
  const cfUmrah = useMemo(() => uAll.filter(b => generalFilter(getFirestoreDate(b) || b.departure, b)), [uAll, generalFilter]);
  const cfTickets = useMemo(() => tAll.filter(b => generalFilter(getFirestoreDate(b) || b.departure, b)), [tAll, generalFilter]);
  const cfMedical = useMemo(() => mAll.filter(b => generalFilter(getFirestoreDate(b), b)), [mAll, generalFilter]);

  // Derive Stats
  const stats = useMemo(() => {
    const checkNum = (val) => Number(val) || 0;
    // Counts and money cover every service. Approved / processing / rejected
    // stay visa-only because only visas have that status.
    const s = {
      total: cfVisas.length + cfHotels.length + cfUmrah.length + cfTickets.length + cfMedical.length,
      approved: cfVisas.filter(b => b.visaStatus === "Approved").length,
      processing: cfVisas.filter(b => ["Processing", "Pending"].includes(b.visaStatus)).length,
      rejected: cfVisas.filter(b => b.visaStatus === "Rejected").length,
      paid: cfVisas.filter(b => b.paymentStatus === "Paid").length,
      unpaid: cfVisas.filter(b => b.paymentStatus === "Unpaid").length,
      totalRevenue: 0, pendingRevenue: 0, profit: 0,
    };
    cfVisas.forEach(b => { s.totalRevenue += checkNum(b.receivedFee); s.pendingRevenue += checkNum(b.remainingFee); s.profit += checkNum(b.profit); });
    // The other services go through the shared normaliser, which knows each
    // one's field names (e.g. a ticket's sale is `price`, not `received`).
    const addService = (kind, list) => list.forEach(b => {
      const n = normalizeBooking(kind, b);
      s.totalRevenue += n.received;
      s.pendingRevenue += n.unpaid;
      s.profit += n.profit;
      if (n.unpaid > 0) s.unpaid += 1; else s.paid += 1;
    });
    addService("hotel", cfHotels);
    addService("umrah", cfUmrah);
    addService("ticket", cfTickets);
    addService("medical", cfMedical);
    return s;
  }, [cfVisas, cfHotels, cfUmrah, cfTickets, cfMedical]);

  // Get unique countries for filter
  const uniqueCountries = [
    ...new Set(vAll.map((b) => b.country).filter(Boolean)),
  ];

  // ====== CHART DATA (using date-filtered collections) ======
  const CHART_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

  const visaStatusData = useMemo(() => {
    const approved = cfVisas.filter(b => b.visaStatus === "Approved").length;
    const processing = cfVisas.filter(b => b.visaStatus === "Processing").length;
    const rejected = cfVisas.filter(b => b.visaStatus === "Rejected").length;
    return [
      { name: "Approved", value: approved, color: "#10b981" },
      { name: "Processing", value: processing, color: "#f59e0b" },
      { name: "Rejected", value: rejected, color: "#ef4444" },
    ].filter(d => d.value > 0);
  }, [cfVisas]);

  const allServicesData = useMemo(() => [
    { name: "Visas", value: cfVisas.length, color: "#6366f1" },
    { name: "Hotels", value: cfHotels.length, color: "#3b82f6" },
    { name: "Umrah", value: cfUmrah.length, color: "#f59e0b" },
    { name: "Tickets", value: cfTickets.length, color: "#8b5cf6" },
    { name: "Insurance", value: cfMedical.length, color: "#10b981" },
  ].filter(d => d.value > 0), [cfVisas, cfHotels, cfUmrah, cfTickets, cfMedical]);

  const monthlyBookingsData = useMemo(() => {
    const monthMap = {};
    const addToMonth = (date, type) => {
      if (!date) return;
      const d = new Date(date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      if (!monthMap[key]) monthMap[key] = { key, month: label, visa: 0, hotel: 0, umrah: 0, ticket: 0, insurance: 0, total: 0 };
      monthMap[key][type]++;
      monthMap[key].total++;
    };
    cfVisas.forEach(b => addToMonth(b.date, "visa"));
    cfHotels.forEach(b => addToMonth(getFirestoreDate(b) || b.arrivalDate, "hotel"));
    cfUmrah.forEach(b => addToMonth(getFirestoreDate(b) || b.departure, "umrah"));
    cfTickets.forEach(b => addToMonth(getFirestoreDate(b) || b.departure, "ticket"));
    cfMedical.forEach(b => addToMonth(getFirestoreDate(b), "insurance"));
    return Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }, [cfVisas, cfHotels, cfUmrah, cfTickets, cfMedical]);

  const monthlyFinancialData = useMemo(() => {
    const monthMap = {};
    cfVisas.forEach(b => {
      if (!b.date) return;
      const d = new Date(b.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      if (!monthMap[key]) monthMap[key] = { key, month: label, revenue: 0, profit: 0, pending: 0 };
      monthMap[key].revenue += Number(b.receivedFee) || 0;
      monthMap[key].profit += Number(b.profit) || 0;
      monthMap[key].pending += Number(b.remainingFee) || 0;
    });
    return Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }, [cfVisas]);

  const topCountriesData = useMemo(() => {
    const countryMap = {};
    cfVisas.forEach(b => {
      if (!b.country) return;
      countryMap[b.country] = (countryMap[b.country] || 0) + 1;
    });
    return Object.entries(countryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [cfVisas]);

  const paymentStatusData = useMemo(() => {
    const paid = cfVisas.filter(b => b.paymentStatus === "Paid").length;
    const unpaid = cfVisas.filter(b => b.paymentStatus === "Unpaid").length;
    const partial = cfVisas.filter(b => b.paymentStatus === "Partially Paid").length;
    return [
      { name: "Paid", value: paid, color: "#10b981" },
      { name: "Unpaid", value: unpaid, color: "#ef4444" },
      { name: "Partial", value: partial, color: "#f59e0b" },
    ].filter(d => d.value > 0);
  }, [cfVisas]);

  const topEmployeesData = useMemo(() => {
    const empMap = {};
    const addEmp = (email, profit) => {
      if (!email) return;
      if (!empMap[email]) empMap[email] = { name: email.split("@")[0], email, bookings: 0, profit: 0 };
      empMap[email].bookings++;
      empMap[email].profit += Number(profit) || 0;
    };
    cfVisas.forEach(b => addEmp(b.userEmail, b.profit));
    cfHotels.forEach(b => addEmp(b.userEmail, (Number(b.received) || 0) - (Number(b.payable) || 0)));
    cfUmrah.forEach(b => addEmp(b.userEmail || b.createdByEmail, b.profit));
    cfTickets.forEach(b => addEmp(b.userEmail || b.createdByEmail, effectiveProfit(b)));
    return Object.values(empMap).sort((a, b) => b.bookings - a.bookings).slice(0, 6);
  }, [cfVisas, cfHotels, cfUmrah, cfTickets]);

  // ── Normalize any raw record to a common shape ──────────────────────────
  const normalizeRecord = (raw, type, colName) => {
    // Tickets keep the traveller under `passenger`, so look there as well.
    const src = { ...raw, ...(raw.passenger || {}) };
    const pick = (...keys) => { for (const k of keys) if (src[k] != null && src[k] !== "") return src[k]; return "—"; };
    const money = normalizeBooking(SERVICE_KIND[type], raw);
    const route = [raw.from, raw.to].filter(Boolean).join(" → ");
    return {
      id: raw.id, type, colName,
      name: pick("fullName", "clientName", "NameofInsured", "guestName", "passengerName", "customerName", "name"),
      identifier: pick("passport", "passportNumber", "pnr", "bookingId", "email", "phone", "contactNumber"),
      destination: route || pick("country", "property", "makkahHotel", "countryofTravel", "hotelName", "destination", "city", "location"),
      serviceDetail: pick("visaType", "airlinePref", "vendor", "NameofCompany", "madinahHotel", "roomType", "packageName", "travelClass"),
      totalFee: money.sale,
      received: money.received,
      remaining: money.unpaid,
      status: pick("visaStatus", "status", "bookingStatus"),
      paymentStatus: pick("paymentStatus", "payment"),
      employee: pick("userEmail", "createdByEmail"),
      date: money.date || "—",
      raw,
    };
  };

  // ── Combined records from all services ───────────────────────────────────
  const combinedRecords = useMemo(() => [
    ...vAll.map(b => normalizeRecord(b, "Visa", "bookings")),
    ...hAll.map(b => normalizeRecord(b, "Hotel", "HotelBookings")),
    ...uAll.map(b => normalizeRecord(b, "Umrah", "ummrahBookings")),
    ...tAll.map(b => normalizeRecord(b, "Ticket", "ticketBookings")),
    ...mAll.map(b => normalizeRecord(b, "Insurance", "medical_insurance")),
    // Newest first across all services; undated records go last.
  ].sort((a, b) => (b.date === "—" ? "" : b.date).localeCompare(a.date === "—" ? "" : a.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vAll, hAll, uAll, tAll, mAll]);

  // ── Filtered combined records (search + filters) ──────────────────────────
  const filteredCombined = useMemo(() => {
    let recs = combinedRecords;
    if (filters.serviceType && filters.serviceType !== "All")
      recs = recs.filter(r => r.type === filters.serviceType);
    if (filters.status !== "All")
      recs = recs.filter(r => r.status === filters.status);
    if (filters.payment !== "All")
      recs = recs.filter(r => r.paymentStatus === filters.payment);
    if (filters.country !== "All")
      recs = recs.filter(r => r.destination === filters.country);
    if (startDate || endDate) {
      recs = recs.filter(r => {
        const d = r.date && r.date !== "—" ? new Date(r.date) : null;
        if (!d || isNaN(d.getTime())) return false;
        if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); if (d < s) return false; }
        if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); if (d > e) return false; }
        return true;
      });
    }
    if (debouncedSearchTerm) {
      const q = debouncedSearchTerm.toLowerCase();
      recs = recs.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.identifier?.toLowerCase().includes(q) ||
        r.destination?.toLowerCase().includes(q) ||
        r.serviceDetail?.toLowerCase().includes(q) ||
        r.type?.toLowerCase().includes(q) ||
        r.employee?.toLowerCase().includes(q)
      );
    }
    return recs;
  }, [combinedRecords, filters, startDate, endDate, debouncedSearchTerm]);

  // Pagination logic (all services)
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredCombined.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredCombined.length / itemsPerPage);

  // Handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, debouncedSearchTerm, startDate, endDate]);

  // Admin check — kept below every hook so the hook order never changes.
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-700 mb-4">Access Denied</h2>
          <p className="text-red-600">
            You must be an admin to access this dashboard.
          </p>
        </div>
      </div>
    );
  }

  // Handled by DebouncedSearchInput

  // Handle edit
  const handleEdit = (booking) => {
    setEditing(booking.id);
    setEditData({
      fullName: booking.fullName || "",
      visaType: booking.visaType || "",
      country: booking.country || "",
      totalFee: booking.totalFee || "",
      embassyFee: booking.embassyFee || "",
      receivedFee: booking.receivedFee || "",
      remainingFee: booking.remainingFee || "",
      paymentStatus: booking.paymentStatus || "Unpaid",
      visaStatus: booking.visaStatus || "Processing",
      remarks: booking.remarks || "",
      email: booking.email || "",
      passportNum: booking.passport || " ",
      profit: booking.profit || booking.totalFee - booking.embassyFee || "0",
      reference: booking.reference || "",
    });
  };

  // --- UPDATED Save Edit function with loading state ---
  const saveEdit = async (id) => {
    setIsSaving(true);
    
    // Optimistic UI update
    const previousVisas = queryClient.getQueryData(['all-visas']);
    queryClient.setQueryData(['all-visas'], old => old?.map(b => b.id === id ? { ...b, ...editData } : b));

    try {
      await updateDoc(doc(db, "bookings", id), editData);
      setEditing(null);
      setEditData({});
      toast.success("Booking updated successfully!");
    } catch (error) {
      queryClient.setQueryData(['all-visas'], previousVisas); // Rollback on error
      toast.error("Error updating booking: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (booking) => {
    if (
      window.confirm(
        `Are you sure you want to delete the booking for ${booking.fullName}?`
      )
    ) {
      // Optimistic UI update
      const previousVisas = queryClient.getQueryData(['all-visas']);
      queryClient.setQueryData(['all-visas'], old => old?.filter(b => b.id !== booking.id));

      try {
        await deleteDoc(doc(db, "bookings", booking.id));
        toast.success("Booking deleted successfully!");
      } catch (error) {
        queryClient.setQueryData(['all-visas'], previousVisas); // Rollback on error
        toast.error("Error deleting booking: " + error.message);
      }
    }
  };

  // Generate PDF report
  const generateReport = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("times", "bold");
    doc.text("DATA DASH - ADMIN REPORT", pageWidth / 2, 20, {
      align: "center",
    });
    doc.setFontSize(12);
    doc.text(
      `Generated on ${new Date().toLocaleDateString()}`,
      pageWidth / 2,
      30,
      {
        align: "center",
      }
    );

    // Statistics
    doc.setFillColor(255, 255, 255);
    doc.rect(10, 50, pageWidth - 20, 15, "F");
    doc.setTextColor(59, 130, 246);
    doc.setFontSize(14);
    doc.setFont("times", "bold");
    doc.text("SYSTEM STATISTICS", pageWidth / 2, 60, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    const dateFilterText =
      startDate || endDate
        ? `From: ${startDate || "N/A"} To: ${endDate || "N/A"}`
        : "All Time";

    doc.text(
      `Filters Applied: ${dateFilterText} (Date), ${filters.status} (Status), ${filters.payment} (Payment), ${filters.country} (Country)`,
      pageWidth / 2,
      65,
      { align: "center" }
    );

    // Stats table
    autoTable(doc, {
      startY: 70,
      head: [["Metric", "Count", "Value"]],
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      body: [
        ["Total Bookings", stats.total.toString(), ""],
        ["Approved Visas", stats.approved.toString(), ""],
        ["Processing", stats.processing.toString(), ""],
        ["Rejected", stats.rejected.toString(), ""],
        ["Paid", stats.paid.toString(), ""],
        ["Unpaid", stats.unpaid.toString(), ""],
        ["Total Revenue", "", `${stats.totalRevenue.toFixed(2)}`],
        ["Pending Revenue", "", `${stats.pendingRevenue.toFixed(2)}`],
        ["Total Profit", "", `${stats.profit.toFixed(2)}`],
      ],
      styles: {
        fontSize: 10,
        cellPadding: 5,
      },
    });

    // Recent bookings
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFillColor(248, 250, 252);
    doc.rect(10, finalY, pageWidth - 20, 8, "F");
    doc.setTextColor(59, 130, 246);
    doc.setFontSize(12);
    doc.setFont("times", "bold");
    doc.text("ALL FILTERED BOOKINGS", 15, finalY + 6);

    const recentBookings = filteredBookings;
    autoTable(doc, {
      startY: finalY + 10,
      head: [["Name", "Passport", "Status", "Country", "Fee"]],
      headStyles: {
        fillColor: [80, 80, 80],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      body: recentBookings.map((b) => [
        b.fullName || "-",
        b.passport || "-",
        b.visaStatus || "-",
        b.country || "-",
        `$${b.totalFee || "0"}`,
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
    });

    doc.save(`Admin_Report_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF report");
    }
  };

  // Export data to CSV
  const exportToCSV = async () => {
    try {
      setIsExporting(true);
      const headers = [
        "Name",
        "Passport",
        "Email",
        "Visa Type",
        "Country",
        "Status",
        "Payment",
        "Total Fee",
        "Received",
        "Remaining",
        "Date",
        "Employee",
      ];
      const csvContent = [
        headers.join(","),
        ...filteredBookings.map((b) =>
          [
            `"${b.fullName || ""}"`,
            `"${b.passport || ""}"`,
            `"${b.email || ""}"`,
            `"${b.visaType || ""}"`,
            `"${b.country || ""}"`,
            `"${b.visaStatus || ""}"`,
            `"${b.paymentStatus || ""}"`,
            b.totalFee || "",
            b.receivedFee || "",
            b.remainingFee || "",
            `"${b.date || ""}"`,
            `"${b.userEmail || ""}"`,
          ].join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OS_Travels_Bookings_${new Date().toISOString().split("T")[0]
        }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("CSV exported successfully!");
    } catch (error) {
      toast.error("Failed to export CSV: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Reset All Filters Function
  const resetAllFilters = () => {
    setDebouncedSearchTerm("");
    setFilters({
      status: "All",
      payment: "All",
      country: "All",
      serviceType: "All",
    });
    setStartDate("");
    setEndDate("");
  };

  return (
    <AdminLayout>
      {/* Main content area */}
      <div className="w-full text-neutral-900 pb-20">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ====== DATE FILTER ====== */}
          <div className="flex justify-end gap-3 mb-6">
            <div className="flex items-center gap-2 bg-white backdrop-blur-md border border-neutral-200 px-4 py-2 rounded-xl text-sm shadow-sm hover:bg-neutral-100 transition-colors">
              <MdCalendarToday className="text-neutral-600" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-neutral-900 outline-none cursor-pointer [color-scheme:dark]" />
              <span className="text-neutral-500">to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-neutral-900 outline-none cursor-pointer [color-scheme:dark]" />
            </div>
          </div>

          {/* ====== ENHANCED STATISTICS CARDS ====== */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
            {/* Total Bookings */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-neutral-100 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">Total Bookings</h3>
                <button className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <MdBusiness className="text-blue-700 text-sm" />
                </button>
              </div>
              <div>
                <h2 className="text-4xl font-bold text-neutral-900 mb-2">{stats.total.toLocaleString()}</h2>
                <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider font-semibold">
                  <span className="flex items-center gap-1 text-emerald-700"><MdCheckCircle className="text-[10px]" /> {stats.approved} Approved</span>
                  <span className="flex items-center gap-1 text-yellow-700"><MdSchedule className="text-[10px]" /> {stats.processing} Processing</span>
                  <span className="flex items-center gap-1 text-red-700">{stats.rejected} Rejected</span>
                </div>
                <div className="mt-4 w-full bg-white rounded-full h-1 overflow-hidden">
                  <div className="h-full flex">
                    <div className="bg-emerald-500 transition-all" style={{ width: `${stats.total ? (stats.approved / stats.total * 100) : 0}%` }}></div>
                    <div className="bg-yellow-400 transition-all" style={{ width: `${stats.total ? (stats.processing / stats.total * 100) : 0}%` }}></div>
                    <div className="bg-red-400 transition-all" style={{ width: `${stats.total ? (stats.rejected / stats.total * 100) : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* All Services */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-neutral-100 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">All Services</h3>
                <button className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <MdBarChart className="text-purple-700 text-sm" />
                </button>
              </div>
              <div>
                <h2 className="text-4xl font-bold text-neutral-900 mb-2">{(cfVisas.length + cfHotels.length + cfUmrah.length + cfTickets.length + cfMedical.length).toLocaleString()}</h2>
                <div className="grid grid-cols-2 gap-2 text-[11px] uppercase tracking-wider font-semibold mt-3">
                  <span className="text-neutral-600">🛂 Visas: <strong className="text-neutral-900">{cfVisas.length}</strong></span>
                  <span className="text-neutral-600">🏨 Hotels: <strong className="text-neutral-900">{cfHotels.length}</strong></span>
                  <span className="text-neutral-600">🕌 Umrah: <strong className="text-neutral-900">{cfUmrah.length}</strong></span>
                  <span className="text-neutral-600">✈️ Tickets: <strong className="text-neutral-900">{cfTickets.length}</strong></span>
                </div>
              </div>
            </div>

            {/* Total Receivable */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-neutral-100 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">Total Receivable</h3>
                <button className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <MdAttachMoney className="text-emerald-700 text-sm" />
                </button>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-emerald-700 mb-2 truncate">PKR {((stats.totalRevenue || 0) + (stats.pendingRevenue || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h2>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold mt-3">
                  <span className="text-neutral-600">Received: <strong className="text-emerald-700">PKR {(stats.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                  <span className="text-neutral-600">Pending: <strong className="text-orange-700">PKR {(stats.pendingRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                </div>
                <div className="mt-4 w-full bg-white rounded-full h-1 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${((stats.totalRevenue || 0) + (stats.pendingRevenue || 0)) ? ((stats.totalRevenue || 0) / ((stats.totalRevenue || 0) + (stats.pendingRevenue || 0)) * 100) : 0}%` }}></div>
                </div>
              </div>
            </div>

            {/* Profit */}
            <div className="bg-white border border-green-500/10 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-neutral-100 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">Net Profit</h3>
                <button className="p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                  <MdTrendingUp className="text-green-700 text-sm" />
                </button>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-green-700 mb-2 truncate">PKR {(stats.profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h2>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wider font-semibold mt-3">
                  <span className="text-neutral-600">Margin: <strong className="text-green-700">{((stats.totalRevenue || 0) + (stats.pendingRevenue || 0)) ? (((stats.profit || 0) / ((stats.totalRevenue || 0) + (stats.pendingRevenue || 0))) * 100).toFixed(1) : 0}%</strong></span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-700 border border-green-500/20 rounded-full font-bold tracking-widest"><MdTrendingUp className="text-[10px]" /> Healthy</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white backdrop-blur-md rounded-lg border border-neutral-200 p-4 flex items-center gap-3 hover:bg-neutral-100 transition-colors shadow-md">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
                <MdCheckCircle className="text-emerald-700 text-sm" />
              </div>
              <div>
                <p className="text-xs text-neutral-600">Paid</p>
                <p className="text-lg font-bold text-neutral-900">{stats.paid}</p>
              </div>
            </div>
            <div className="bg-white backdrop-blur-md rounded-lg border border-neutral-200 p-4 flex items-center gap-3 hover:bg-neutral-100 transition-colors shadow-md">
              <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center flex-shrink-0 border border-red-500/20">
                <MdWarning className="text-red-700 text-sm" />
              </div>
              <div>
                <p className="text-xs text-neutral-600">Unpaid</p>
                <p className="text-lg font-bold text-neutral-900">{stats.unpaid}</p>
              </div>
            </div>
            <div className="bg-white backdrop-blur-md rounded-lg border border-neutral-200 p-4 flex items-center gap-3 hover:bg-neutral-100 transition-colors shadow-md">
              <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center flex-shrink-0 border border-blue-500/20">
                <MdPeople className="text-blue-700 text-sm" />
              </div>
              <div>
                <p className="text-xs text-neutral-600">Employees</p>
                <p className="text-lg font-bold text-neutral-900">{employees.length}</p>
              </div>
            </div>
            <div className="bg-white backdrop-blur-md rounded-lg border border-neutral-200 p-4 flex items-center gap-3 hover:bg-neutral-100 transition-colors shadow-md">
              <div className="w-8 h-8 bg-orange-500/10 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-500/20">
                <MdSchedule className="text-orange-700 text-sm" />
              </div>
              <div>
                <p className="text-xs text-neutral-600">Pending Amount</p>
                <p className="text-lg font-bold text-orange-700">PKR {(stats.pendingRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>

          {/* ====== COMPACT SERVICE OVERVIEW CHART ====== */}
          <details className="bg-white backdrop-blur-md rounded-xl border border-neutral-200 p-6 mb-8 hover:bg-neutral-100 shadow-sm transition-colors group [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center justify-between cursor-pointer outline-none">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-neutral-100 to-neutral-100 rounded-lg flex items-center justify-center">
                  <MdBarChart className="text-neutral-900 text-lg" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 group-open:text-indigo-400 transition-colors">Services Overview Chart</h3>
                  <p className="text-xs text-neutral-600 mt-0.5 group-open:hidden">Click to expand detailed breakdown</p>
                  <p className="text-xs text-neutral-600 mt-0.5 hidden group-open:block">Click to collapse detailed breakdown</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 font-medium hidden sm:block">All time</span>
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-neutral-200 group-open:rotate-180 transition-transform">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-neutral-700"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </summary>
            
            <div className="pt-6 mt-6 border-t border-neutral-200 animate-fadeIn">
              {/* Horizontal bars */}
              <div className="space-y-3 mb-5">
                {[
                  { label: "Visas", count: cfVisas.length, from: "from-neutral-100", to: "to-neutral-900" },
                  { label: "Hotels", count: cfHotels.length, from: "from-neutral-100", to: "to-neutral-900" },
                  { label: "Umrah", count: cfUmrah.length, from: "from-white", to: "to-amber-400" },
                  { label: "Tickets", count: cfTickets.length, from: "from-neutral-100", to: "to-neutral-900" },
                  { label: "Insurance", count: cfMedical.length, from: "from-white", to: "to-emerald-400" },
                ].map(item => {
                  const total = cfVisas.length + cfHotels.length + cfUmrah.length + cfTickets.length + cfMedical.length;
                  const pct = total ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="w-20 text-xs font-semibold text-neutral-700 flex-shrink-0">{item.label}</span>
                      <div className="flex-1 bg-neutral-100 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${item.from} ${item.to} rounded-full flex items-center justify-end pr-2 transition-all duration-700`}
                          style={{ width: `${pct > 0 ? Math.max(pct, 5) : 0}%` }}
                        >
                          {pct > 12 && <span className="text-xs font-bold text-neutral-900">{item.count}</span>}
                        </div>
                      </div>
                      <span className="w-20 text-right text-xs font-bold text-neutral-900">{item.count} <span className="text-neutral-500">({pct}%)</span></span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-neutral-200">
                <div className="text-center">
                  <p className="text-xl font-bold text-neutral-900">{(cfVisas.length + cfHotels.length + cfUmrah.length + cfTickets.length + cfMedical.length).toLocaleString()}</p>
                  <p className="text-xs text-neutral-600">Total Records</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-emerald-700">PKR {(stats.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-neutral-600">Total Received</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-700">PKR {(stats.profit || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-neutral-600">Net Profit</p>
                </div>
              </div>
            </div>
          </details>


          {/* Filter Box */}
          <div className="bg-white rounded-xl p-4 md:p-6 border border-neutral-200 mb-8">
            <div className="flex flex-col lg:flex-row gap-4 justify-between">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                <DebouncedSearchInput 
                  value={debouncedSearchTerm} 
                  onChange={setDebouncedSearchTerm} 
                  placeholder="Search all services by name, destination, employee..."
                  className="flex-grow min-w-[200px] sm:min-w-[250px] lg:max-w-md" 
                />

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label htmlFor="startDate" className="text-sm font-medium text-neutral-700">From:</label>
                    <div className="date-picker-wrapper">
                      <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="premium-date-input" />
                      <MdCalendarToday className="date-picker-icon" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label htmlFor="endDate" className="text-sm font-medium text-neutral-700">To:</label>
                    <div className="date-picker-wrapper">
                      <input type="date" id="endDate" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                        className="premium-date-input" />
                      <MdCalendarToday className="date-picker-icon" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select value={filters.serviceType} onChange={(e) => setFilters({ ...filters, serviceType: e.target.value })}
                    className="px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 bg-white text-neutral-900 text-sm">
                    <option value="All">All Services</option>
                    <option value="Visa">Visa</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Umrah">Umrah</option>
                    <option value="Ticket">Ticket</option>
                    <option value="Insurance">Insurance</option>
                  </select>
                  <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 bg-white text-neutral-900 text-sm">
                    <option value="All">All Status</option>
                    <option value="Approved">Approved</option>
                    <option value="Processing">Processing</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                  <select value={filters.payment} onChange={(e) => setFilters({ ...filters, payment: e.target.value })}
                    className="px-3 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-neutral-300 bg-white text-neutral-900 text-sm">
                    <option value="All">All Payments</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                  <button onClick={resetAllFilters}
                    className="px-3 py-2 text-sm text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 hover:text-neutral-900 transition-colors">Reset</button>
                </div>
              </div>

            </div>
          </div>

          {/* Results Summary */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-sm text-neutral-600">
                Showing {filteredCombined.length === 0 ? 0 : indexOfFirstItem + 1}–{Math.min(indexOfLastItem, filteredCombined.length)} of {filteredCombined.length} records
              </p>
              {error && (<div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-md">⚠️ {error}</div>)}
            </div>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-3 py-1 text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
              <MdRefresh /> Refresh
            </button>
          </div>

          {/* All-Services Table */}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Destination / Detail</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Financial</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {loading ? (
                    <tr><td colSpan="8" className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                        <span className="text-neutral-600">Loading...</span>
                      </div>
                    </td></tr>
                  ) : filteredCombined.length === 0 ? (
                    <tr><td colSpan="8" className="px-6 py-8 text-center text-neutral-600">No records found matching your criteria</td></tr>
                  ) : (
                    currentItems.map((rec, index) => {
                      const typeColors = {
                        Visa: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
                        Hotel: "bg-blue-500/15  text-blue-700  border-blue-500/30",
                        Umrah: "bg-amber-500/15 text-amber-700 border-amber-500/30",
                        Ticket: "bg-purple-500/15 text-purple-700 border-purple-500/30",
                        Insurance: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
                      };
                      const statusColor = rec.status === "Approved" ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/20"
                        : rec.status === "Rejected" ? "bg-red-500/15 text-red-700 border border-red-500/20"
                          : "bg-yellow-500/15 text-yellow-700 border border-yellow-500/20";
                      const payColor = rec.paymentStatus === "Paid" ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/20"
                        : "bg-red-500/15 text-red-700 border border-red-500/20";
                      return (
                        <tr key={`${rec.type}-${rec.id}`} className="hover:bg-neutral-100 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-neutral-700">{indexOfFirstItem + index + 1}</td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-bold rounded-full border ${typeColors[rec.type] || "bg-neutral-100 text-neutral-700 border-neutral-200"}`}>
                              {rec.type}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-neutral-900">{rec.name}</div>
                            <div className="text-xs text-neutral-600">{rec.identifier}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-neutral-900">{rec.destination}</div>
                            <div className="text-xs text-neutral-600">{rec.serviceDetail}</div>
                            <div className="text-xs text-neutral-500">{rec.date}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-neutral-900">{rec.totalFee ? `PKR ${Number(rec.totalFee).toLocaleString()}` : "—"}</div>
                            <div className="text-xs text-neutral-600">Rcvd: {rec.received ? Number(rec.received).toLocaleString() : "0"}</div>
                            <div className="text-xs text-neutral-600">Rem: {rec.remaining ? Number(rec.remaining).toLocaleString() : "0"}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {rec.status !== "—" && <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusColor}`}>{rec.status}</span>}
                              {rec.paymentStatus !== "—" && <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${payColor}`}>{rec.paymentStatus}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-neutral-600">{rec.employee !== "—" ? rec.employee.split("@")[0] : "—"}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex gap-2">
                              {rec.type === "Visa" && (
                                <>
                                  <button onClick={() => { setSelectedBooking(rec.raw); setShowDetails(true); }}
                                    className="text-blue-700 hover:text-blue-800 hover:bg-blue-500/10 p-1.5 rounded-lg transition-colors" title="View Details">
                                    <MdVisibility size={16} />
                                  </button>
                                  <button onClick={() => handleEdit(rec.raw)}
                                    className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/10 p-1.5 rounded-lg transition-colors" title="Edit">
                                    <MdEdit size={16} />
                                  </button>
                                  <button onClick={() => handleDelete(rec.raw)}
                                    className="text-red-700 hover:text-red-800 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors" title="Delete">
                                    <MdDelete size={16} />
                                  </button>
                                </>
                              )}
                              {rec.type !== "Visa" && (
                                <button
                                  onClick={() => navigate(SERVICE_ROUTE[rec.type])}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-500/10 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  title={`Open ${rec.type} records`}
                                >
                                  <MdVisibility size={14} /> Open {rec.type}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-neutral-600">Page {currentPage} of {totalPages}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Previous</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  return (
                    <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === pageNum
                        ? "bg-neutral-900 text-white shadow-md"
                        : "text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-100"
                        }`}>{pageNum}</button>
                  );
                })}
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* --- PREMIUM Edit Modal --- */}
        {editing && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-md">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-neutral-100 to-neutral-100 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">Edit Booking</h3>
                  <p className="text-indigo-700 text-xs mt-0.5">{editData.fullName} • {editData.country}</p>
                </div>
                <button onClick={() => setEditing(null)} className="text-neutral-600 hover:text-neutral-900 text-2xl leading-none transition-colors">&times;</button>
              </div>

              <div className="overflow-y-auto max-h-[calc(90vh-140px)] px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {/* Customer Details */}
                  <h4 className="col-span-full text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 pb-1 border-b border-indigo-100 mb-1">
                    <MdPeople className="text-base" /> Customer Details
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Full Name</label>
                    <input type="text" value={editData.fullName} onChange={(e) => setEditData({ ...editData, fullName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Passport Number</label>
                    <input type="text" value={editData.passportNum} onChange={(e) => setEditData({ ...editData, passportNum: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm font-mono transition-colors" />
                  </div>
                  <div className="col-span-full">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Email</label>
                    <input type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                  </div>

                  {/* Visa Details */}
                  <h4 className="col-span-full text-sm font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 pb-1 border-b border-indigo-100 mb-1 mt-3">
                    <MdBusiness className="text-base" /> Visa Details
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Visa Type</label>
                    <input type="text" value={editData.visaType} onChange={(e) => setEditData({ ...editData, visaType: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Country</label>
                    <input type="text" value={editData.country} onChange={(e) => setEditData({ ...editData, country: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                  </div>
                  <div className="col-span-full">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Reference</label>
                    <input type="text" value={editData.reference} onChange={(e) => setEditData({ ...editData, reference: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                  </div>

                  {/* Financials */}
                  <h4 className="col-span-full text-sm font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2 pb-1 border-b border-emerald-100 mb-1 mt-3">
                    <MdAttachMoney className="text-base" /> Financials
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Total Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-600 font-medium">PKR</span>
                      <input type="number" value={editData.totalFee} onChange={(e) => setEditData({ ...editData, totalFee: e.target.value })} className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Embassy Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-600 font-medium">PKR</span>
                      <input type="number" value={editData.embassyFee || ""} onChange={(e) => setEditData({ ...editData, embassyFee: e.target.value })} className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Profit</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-600 font-medium">PKR</span>
                      <input type="number" value={editData.profit || "0"} onChange={(e) => setEditData({ ...editData, profit: e.target.value })} className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-gray-50 text-sm text-green-700 font-semibold transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Received Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-600 font-medium">PKR</span>
                      <input type="number" value={editData.receivedFee || "0"} onChange={(e) => setEditData({ ...editData, receivedFee: e.target.value })} className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" />
                    </div>
                  </div>
                  <div className="col-span-full">
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Remaining Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-600 font-medium">PKR</span>
                      <input type="number" value={editData.remainingFee} onChange={(e) => setEditData({ ...editData, remainingFee: e.target.value })} className="w-full pl-12 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-gray-50 text-sm text-red-600 font-semibold transition-colors" />
                    </div>
                  </div>

                  {/* Status */}
                  <h4 className="col-span-full text-sm font-bold text-amber-600 uppercase tracking-wider flex items-center gap-2 pb-1 border-b border-amber-100 mb-1 mt-3">
                    <MdSchedule className="text-base" /> Status
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Payment Status</label>
                    <select value={editData.paymentStatus} onChange={(e) => setEditData({ ...editData, paymentStatus: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors">
                      <option value="Paid">Paid</option>
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partially Paid">Partially Paid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Visa Status</label>
                    <select value={editData.visaStatus} onChange={(e) => setEditData({ ...editData, visaStatus: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors">
                      <option value="Approved">Approved</option>
                      <option value="Processing">Processing</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                {/* Remarks */}
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Remarks</label>
                  <textarea value={editData.remarks} onChange={(e) => setEditData({ ...editData, remarks: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-300 focus:border-transparent bg-white text-sm transition-colors" rows="2" placeholder="Add any notes..." />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                <button onClick={() => saveEdit(editing)} disabled={isSaving} className="flex-1 flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-wait transition-all shadow-sm">
                  {isSaving ? (
                    <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-neutral-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Saving...</>
                  ) : "Save Changes"}
                </button>
                <button onClick={() => setEditing(null)} disabled={isSaving} className="px-6 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 font-semibold text-sm disabled:opacity-50 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        )
        }

        {/* --- PREMIUM Details Modal --- */}
        {
          showDetails && selectedBooking && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-md">
                <div className="bg-gradient-to-r from-neutral-100 to-neutral-100 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Booking Details</h3>
                    <p className="text-blue-700 text-xs mt-0.5">{selectedBooking.fullName} • {selectedBooking.country}</p>
                  </div>
                  <button onClick={() => setShowDetails(false)} className="text-neutral-600 hover:text-neutral-900 text-2xl leading-none transition-colors">&times;</button>
                </div>

                <div className="overflow-y-auto max-h-[calc(90vh-80px)] px-6 py-5 space-y-5">
                  <section>
                    <h4 className="text-sm font-bold text-neutral-600 uppercase tracking-wider mb-3 flex items-center gap-2"><MdPeople className="text-base text-indigo-600" /> Customer</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Full Name</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.fullName}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Passport</p><p className="text-sm font-semibold text-gray-900 font-mono mt-0.5">{selectedBooking.passport}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Email</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.email}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Reference</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.reference || "N/A"}</p></div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-bold text-neutral-600 uppercase tracking-wider mb-3 flex items-center gap-2"><MdBusiness className="text-base text-indigo-600" /> Visa & Vendor</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Visa Type</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.visaType}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Country</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.country}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Vendor</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.vendor || "N/A"}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Vendor Contact</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.vendorContact || "N/A"}</p></div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-bold text-neutral-600 uppercase tracking-wider mb-3 flex items-center gap-2"><MdAttachMoney className="text-base text-emerald-600" /> Financials</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3"><p className="text-xs text-indigo-600 font-medium">Total Fee</p><p className="text-lg font-bold text-neutral-900 mt-0.5">PKR {Number(selectedBooking.totalFee || 0).toLocaleString()}</p></div>
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3"><p className="text-xs text-blue-600 font-medium">Embassy Fee</p><p className="text-lg font-bold text-neutral-900 mt-0.5">PKR {Number(selectedBooking.embassyFee || 0).toLocaleString()}</p></div>
                      <div className="bg-purple-50 border border-purple-100 rounded-lg p-3"><p className="text-xs text-purple-600 font-medium">Vendor Fee</p><p className="text-lg font-bold text-neutral-900 mt-0.5">PKR {Number(selectedBooking.vendorFee || 0).toLocaleString()}</p></div>
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3"><p className="text-xs text-green-600 font-medium">Profit</p><p className="text-lg font-bold text-green-700 mt-0.5">PKR {Number(selectedBooking.profit || 0).toLocaleString()}</p></div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3"><p className="text-xs text-emerald-600 font-medium">Received</p><p className="text-lg font-bold text-emerald-700 mt-0.5">PKR {Number(selectedBooking.receivedFee || 0).toLocaleString()}</p></div>
                      <div className="bg-red-50 border border-red-100 rounded-lg p-3"><p className="text-xs text-red-600 font-medium">Remaining</p><p className="text-lg font-bold text-red-700 mt-0.5">PKR {Number(selectedBooking.remainingFee || 0).toLocaleString()}</p></div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-bold text-neutral-600 uppercase tracking-wider mb-3 flex items-center gap-2"><MdSchedule className="text-base text-amber-600" /> Status & Metadata</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Visa Status</p><span className={`inline-flex px-2 py-0.5 text-xs font-bold rounded-full ${selectedBooking.visaStatus === "Approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{selectedBooking.visaStatus}</span></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Payment Status</p><span className={`inline-flex px-2 py-0.5 text-xs font-bold rounded-full ${selectedBooking.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{selectedBooking.paymentStatus}</span></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Sent to Embassy</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.sentToEmbassy}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Received from Embassy</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.receivedFromEmbassy}</p></div>
                      <div className="col-span-2 bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">Created At</p><p className="text-sm font-semibold text-gray-900 mt-0.5">{selectedBooking.createdAt?.toDate ? selectedBooking.createdAt.toDate().toLocaleString() : selectedBooking.createdAt?.seconds ? new Date(selectedBooking.createdAt.seconds * 1000).toLocaleString() : selectedBooking.createdAt || "N/A"}</p></div>
                      {selectedBooking.userId && <div className="col-span-2 bg-gray-50 rounded-lg p-3"><p className="text-xs text-neutral-500">User name</p><p className="text-xs font-mono text-gray-700 mt-0.5 break-all">{selectedBooking.userEmail}</p></div>}
                      {selectedBooking.remarks && <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-lg p-3"><p className="text-xs text-amber-600 font-medium">Remarks</p><p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{selectedBooking.remarks}</p></div>}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}
      </div>
    </AdminLayout>
  );
}

