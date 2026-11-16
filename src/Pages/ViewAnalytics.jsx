import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { effectiveProfit } from "../utils/finance";
import {
  MdBarChart,
  MdCalendarToday,
  MdRefresh,
  MdTrendingUp,
  MdPeople,
  MdBusiness,
  MdAttachMoney,
  MdCheckCircle,
  MdSchedule,
  MdInsights,
  MdFilterAlt,
  MdClose,
} from "react-icons/md";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";

const CHART_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function ViewAnalytics() {
  const { isAdmin } = useAuth();

  // ── Raw Data & Queries ───────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const qOptions = { staleTime: 1000 * 30 }; // 5 mins cache

  const { data: visaBookings = [], isLoading: vLoading } = useQuery({ queryKey:['all-visas'],    queryFn: () => dataService.fetchAll('bookings'),         ...qOptions });
  const { data: hotelBookings = [], isLoading: hLoading } = useQuery({ queryKey:['all-hotels'],   queryFn: () => dataService.fetchAll('HotelBookings'),    ...qOptions });
  const { data: umrahBookings = [], isLoading: uLoading } = useQuery({ queryKey:['all-umrah'],    queryFn: () => dataService.fetchAll('ummrahBookings'),   ...qOptions });
  const { data: ticketBookings = [], isLoading: tLoading } = useQuery({ queryKey:['all-tickets'],  queryFn: () => dataService.fetchAll('ticketBookings'),   ...qOptions });
  const { data: medicalBookings = [], isLoading: mLoading } = useQuery({ queryKey:['all-medical'],  queryFn: () => dataService.fetchAll('medical_insurance'), ...qOptions });

  const loading = vLoading || hLoading || uLoading || tLoading || mLoading;

  // ── Performance Optimization: Defer Heavy Calculations ────────────────────
  const [renderCharts, setRenderCharts] = useState(false);
  useEffect(() => {
    // Allows the page skeleton to render instantly before heavy Recharts / loops block the thread
    const timer = setTimeout(() => {
      requestAnimationFrame(() => setRenderCharts(true));
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");

  // Preset quick ranges
  const applyPreset = (preset) => {
    const now = new Date();
    const fmt = (d) => d.toISOString().split("T")[0];
    switch (preset) {
      case "7d": {
        const s = new Date(now); s.setDate(s.getDate() - 7);
        setStartDate(fmt(s)); setEndDate(fmt(now)); break;
      }
      case "30d": {
        const s = new Date(now); s.setDate(s.getDate() - 30);
        setStartDate(fmt(s)); setEndDate(fmt(now)); break;
      }
      case "90d": {
        const s = new Date(now); s.setDate(s.getDate() - 90);
        setStartDate(fmt(s)); setEndDate(fmt(now)); break;
      }
      case "ytd": {
        setStartDate(`${now.getFullYear()}-01-01`); setEndDate(fmt(now)); break;
      }
      default: setStartDate(""); setEndDate(""); break;
    }
  };

  const handleRefresh = useCallback(async () => {
    await dataService.clearCache(); // drop localforage cache so we pull fresh
    queryClient.invalidateQueries();
    toast.success("Refreshing data...");
  }, [queryClient]);

  // ── Date helpers ──────────────────────────────────────────────────────────
  const getFirestoreDate = (b) => {
    if (b?.createdAt?.toDate)    return b.createdAt.toDate();
    if (b?.createdAt?.seconds)   return new Date(b.createdAt.seconds * 1000);
    return b?.date ? new Date(b.date) : null;
  };

  const inRange = useMemo(() => (dateVal) => {
    if (!startDate && !endDate) return true;
    const d = dateVal instanceof Date ? dateVal : (dateVal ? new Date(dateVal) : null);
    if (!d || isNaN(d.getTime())) return false;
    if (startDate) { const s = new Date(startDate); s.setHours(0,0,0,0); if (d < s) return false; }
    if (endDate)   { const e = new Date(endDate);   e.setHours(23,59,59,999); if (d > e) return false; }
    return true;
  }, [startDate, endDate]);

  // ── Filtered collections ──────────────────────────────────────────────────
  const cfVisas   = useMemo(() => renderCharts ? visaBookings.filter(b => inRange(b.date ? new Date(b.date) : null)) : [], [renderCharts, visaBookings, inRange]);
  const cfHotels  = useMemo(() => renderCharts ? hotelBookings.filter(b  => inRange(getFirestoreDate(b) || b.arrivalDate)) : [], [renderCharts, hotelBookings, inRange]);
  const cfUmrah   = useMemo(() => renderCharts ? umrahBookings.filter(b  => inRange(getFirestoreDate(b) || b.departure)) : [],   [renderCharts, umrahBookings, inRange]);
  const cfTickets = useMemo(() => renderCharts ? ticketBookings.filter(b => inRange(getFirestoreDate(b) || b.departure)) : [],   [renderCharts, ticketBookings, inRange]);
  const cfMedical = useMemo(() => renderCharts ? medicalBookings.filter(b => inRange(getFirestoreDate(b))) : [],                 [renderCharts, medicalBookings, inRange]);

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!renderCharts) return { total: 0, revenue: 0, profit: 0, pending: 0 };
    const chk = (v) => Number(v) || 0;
    let revenue = 0, profit = 0, pending = 0;
    cfVisas.forEach(b   => { revenue += chk(b.receivedFee); pending += chk(b.remainingFee); profit += chk(b.profit); });
    cfHotels.forEach(b  => { revenue += chk(b.received);    profit  += chk(b.profit) || (chk(b.received) - chk(b.payable)); });
    cfUmrah.forEach(b   => { revenue += chk(b.received);    pending += chk(b.remaining); profit += chk(b.profit) || (chk(b.received) - chk(b.payable)); });
    cfTickets.forEach(b => { revenue += chk(b.received);    pending += chk(b.remainingAmount); profit += b.refunded ? effectiveProfit(b) : (chk(b.profit) || (chk(b.received) - chk(b.payable))); });
    cfMedical.forEach(b => { revenue += chk(b.totalReceivedAmount); profit += chk(b.totalProfit) || (chk(b.totalReceivedAmount) - chk(b.totalPayableAmount)); });
    const total = cfVisas.length + cfHotels.length + cfUmrah.length + cfTickets.length + cfMedical.length;
    return { total, revenue, profit, pending };
  }, [renderCharts, cfVisas, cfHotels, cfUmrah, cfTickets, cfMedical]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const allServicesData = useMemo(() => [
    { name: "Visas",     value: cfVisas.length,   color: "#6366f1" },
    { name: "Hotels",    value: cfHotels.length,  color: "#3b82f6" },
    { name: "Umrah",     value: cfUmrah.length,   color: "#f59e0b" },
    { name: "Tickets",   value: cfTickets.length, color: "#8b5cf6" },
    { name: "Insurance", value: cfMedical.length, color: "#10b981" },
  ].filter(d => d.value > 0), [cfVisas, cfHotels, cfUmrah, cfTickets, cfMedical]);

  const visaStatusData = useMemo(() => [
    { name: "Approved",   value: cfVisas.filter(b => b.visaStatus === "Approved").length,   color: "#10b981" },
    { name: "Processing", value: cfVisas.filter(b => b.visaStatus === "Processing").length, color: "#f59e0b" },
    { name: "Rejected",   value: cfVisas.filter(b => b.visaStatus === "Rejected").length,   color: "#ef4444" },
  ].filter(d => d.value > 0), [cfVisas]);

  const paymentStatusData = useMemo(() => [
    { name: "Paid",    value: cfVisas.filter(b => b.paymentStatus === "Paid").length,             color: "#10b981" },
    { name: "Unpaid",  value: cfVisas.filter(b => b.paymentStatus === "Unpaid").length,            color: "#ef4444" },
    { name: "Partial", value: cfVisas.filter(b => b.paymentStatus === "Partially Paid").length,   color: "#f59e0b" },
  ].filter(d => d.value > 0), [cfVisas]);

  const monthlyBookingsData = useMemo(() => {
    const monthMap = {};
    const add = (date, type) => {
      if (!date) return;
      const d = new Date(date);
      if (isNaN(d.getTime())) return;
      const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      if (!monthMap[key]) monthMap[key] = { key, month: label, visa: 0, hotel: 0, umrah: 0, ticket: 0, insurance: 0, total: 0 };
      monthMap[key][type]++;
      monthMap[key].total++;
    };
    cfVisas.forEach(b   => add(b.date, "visa"));
    cfHotels.forEach(b  => add(getFirestoreDate(b) || b.arrivalDate, "hotel"));
    cfUmrah.forEach(b   => add(getFirestoreDate(b) || b.departure,   "umrah"));
    cfTickets.forEach(b => add(getFirestoreDate(b) || b.departure,   "ticket"));
    cfMedical.forEach(b => add(getFirestoreDate(b),                  "insurance"));
    return Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }, [cfVisas, cfHotels, cfUmrah, cfTickets, cfMedical]);

  const monthlyFinancialData = useMemo(() => {
    const monthMap = {};
    cfVisas.forEach(b => {
      if (!b.date) return;
      const d = new Date(b.date);
      if (isNaN(d.getTime())) return;
      const key   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      if (!monthMap[key]) monthMap[key] = { key, month: label, revenue: 0, profit: 0, pending: 0 };
      monthMap[key].revenue += Number(b.receivedFee)  || 0;
      monthMap[key].profit  += Number(b.profit)        || 0;
      monthMap[key].pending += Number(b.remainingFee)  || 0;
    });
    return Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  }, [cfVisas]);

  const topCountriesData = useMemo(() => {
    const map = {};
    cfVisas.forEach(b => { if (b.country) map[b.country] = (map[b.country] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [cfVisas]);

  const topEmployeesData = useMemo(() => {
    const empMap = {};
    const add = (email, profit) => {
      if (!email) return;
      if (!empMap[email]) empMap[email] = { name: email.split("@")[0], email, bookings: 0, profit: 0 };
      empMap[email].bookings++;
      empMap[email].profit += Number(profit) || 0;
    };
    cfVisas.forEach(b   => add(b.userEmail, b.profit));
    cfHotels.forEach(b  => add(b.userEmail, (Number(b.received)||0) - (Number(b.payable)||0)));
    cfUmrah.forEach(b   => add(b.userEmail || b.createdByEmail, b.profit));
    cfTickets.forEach(b => add(b.userEmail || b.createdByEmail, effectiveProfit(b)));
    return Object.values(empMap).sort((a, b) => b.bookings - a.bookings).slice(0, 6);
  }, [cfVisas, cfHotels, cfUmrah, cfTickets]);

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <p className="text-red-700 font-semibold text-lg">Access Denied — Admins Only</p>
    </div>
  );

  const tooltipStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #334155",
    borderRadius: "10px",
    color: "#171717",
    boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
  };

  const legendFmt = (v) => <span style={{ color: "#525252", fontWeight: 600, fontSize: 13 }}>{v}</span>;
  const hasDateFilter = startDate || endDate;

  return (
    <>
      <AdminNavbar />
      <div className="min-h-screen bg-neutral-50">

        {/* ── Page Header ────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-neutral-200 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-r from-neutral-100 to-neutral-100 rounded-xl flex items-center justify-center shadow-md">
                  <MdInsights className="text-neutral-900 text-2xl" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">View Analytics</h1>
                  <p className="text-sm text-neutral-600 mt-0.5">Live charts across all services</p>
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "7 Days",  key: "7d"  },
                  { label: "30 Days", key: "30d" },
                  { label: "90 Days", key: "90d" },
                  { label: "YTD",     key: "ytd" },
                  { label: "All",     key: "all" },
                ].map(p => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      p.key === "all" && !hasDateFilter
                        ? "bg-neutral-900 text-white border-indigo-600 shadow-sm"
                        : "text-neutral-700 border-neutral-200 hover:bg-neutral-100 hover:text-neutral-900"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* ── Calendar Filter Bar ────────────────────────────────────────── */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 mb-8 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-center gap-2 text-neutral-900 font-semibold text-sm">
                <MdFilterAlt className="text-indigo-700 text-lg" />
                Filter by Date Range
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 flex-1">
                {/* Start Date */}
                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 w-full sm:w-auto hover:border-indigo-500/50 transition-colors">
                  <MdCalendarToday className="text-neutral-900 text-base flex-shrink-0" />
                  <div>
                    <p className="text-xs text-neutral-500 leading-none mb-0.5">From</p>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="text-sm text-neutral-900 border-none outline-none bg-transparent [color-scheme:dark] w-36"
                    />
                  </div>
                </div>

                <span className="text-neutral-500 font-bold text-lg hidden sm:block">→</span>

                {/* End Date */}
                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 w-full sm:w-auto hover:border-indigo-500/50 transition-colors">
                  <MdCalendarToday className="text-neutral-900 text-base flex-shrink-0" />
                  <div>
                    <p className="text-xs text-neutral-500 leading-none mb-0.5">To</p>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="text-sm text-neutral-900 border-none outline-none bg-transparent [color-scheme:dark] w-36"
                    />
                  </div>
                </div>

                {hasDateFilter && (
                  <button
                    onClick={() => { setStartDate(""); setEndDate(""); }}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 hover:border-rose-600 rounded-xl transition-all"
                  >
                    <MdClose className="text-base" />
                    Clear Filter
                  </button>
                )}
              </div>

              {/* Active range badge */}
              {hasDateFilter && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-700 font-medium whitespace-nowrap">
                  <MdCalendarToday className="text-neutral-900" />
                  {startDate || "∞"} → {endDate || "∞"}
                </div>
              )}
            </div>
          </div>

          {/* ── KPI Summary Row ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Records",    value: kpis.total.toLocaleString(),                                               Icon: MdBusiness,      color: "indigo",  fmt: false },
              { label: "Total Received",   value: `PKR ${kpis.revenue.toLocaleString(undefined,{maximumFractionDigits:0})}`, Icon: MdAttachMoney,   color: "emerald", fmt: false },
              { label: "Net Profit",       value: `PKR ${kpis.profit.toLocaleString(undefined,{maximumFractionDigits:0})}`,  Icon: MdTrendingUp,    color: "green",   fmt: false },
              { label: "Pending Amount",   value: `PKR ${kpis.pending.toLocaleString(undefined,{maximumFractionDigits:0})}`, Icon: MdSchedule,      color: "orange",  fmt: false },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className={`bg-white rounded-xl border border-neutral-200 p-5 hover:border-${color}-500/40 transition-all group`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-neutral-600">{label}</p>
                  <div className={`w-9 h-9 bg-${color}-500/10 rounded-lg flex items-center justify-center border border-${color}-500/20`}>
                    <Icon className={`text-${color}-400 text-base`} />
                  </div>
                </div>
                <p className={`text-xl font-bold text-${color}-400 truncate`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Global Loading Indicator (Non-blocking) */}
          {loading && (
            <div className="flex items-center gap-3 mb-6 bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 px-4 py-2 rounded-xl w-fit">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Syncing latest data...</span>
            </div>
          )}

          <>
              {/* ── Row 1 : Pie charts ───────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <ChartCard title="All Services Breakdown" sub="Visas • Hotels • Umrah • Tickets • Insurance">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie isAnimationActive={false} data={allServicesData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" stroke="none">
                        {allServicesData.map((e, i) => <Cell key={`svc-${i}`} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend verticalAlign="bottom" formatter={legendFmt} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Visa Status" sub="Approved • Processing • Rejected">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie isAnimationActive={false} data={visaStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" stroke="none"
                        label={({ name, value }) => `${name}: ${value}`}>
                        {visaStatusData.map((e, i) => <Cell key={`vs-${i}`} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend verticalAlign="bottom" formatter={legendFmt} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* ── Row 2 : Monthly bookings bar ────────────────────────── */}
              <ChartCard title="Monthly Bookings by Service" sub="All services combined — last 12 months" className="mb-6">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={monthlyBookingsData} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fill: "#525252", fontSize: 12 }} axisLine={{ stroke: "#d4d4d4" }} />
                    <YAxis tick={{ fill: "#525252", fontSize: 12 }} axisLine={{ stroke: "#d4d4d4" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend formatter={legendFmt} />
                    <Bar isAnimationActive={false} dataKey="visa"      name="Visas"     stackId="a" fill="#6366f1" />
                    <Bar isAnimationActive={false} dataKey="hotel"     name="Hotels"    stackId="a" fill="#3b82f6" />
                    <Bar isAnimationActive={false} dataKey="umrah"     name="Umrah"     stackId="a" fill="#f59e0b" />
                    <Bar isAnimationActive={false} dataKey="ticket"    name="Tickets"   stackId="a" fill="#8b5cf6" />
                    <Bar isAnimationActive={false} dataKey="insurance" name="Insurance" stackId="a" fill="#10b981" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* ── Row 3 : Financial area + Top countries ───────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <ChartCard title="Revenue, Profit & Pending" sub="Financial trends — last 12 months">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={monthlyFinancialData}>
                      <defs>
                        <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="month" tick={{ fill: "#525252", fontSize: 12 }} axisLine={{ stroke: "#d4d4d4" }} />
                      <YAxis tick={{ fill: "#525252", fontSize: 12 }} axisLine={{ stroke: "#d4d4d4" }}
                        tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                      <Tooltip contentStyle={tooltipStyle} formatter={v => `PKR ${Number(v).toLocaleString()}`} />
                      <Legend formatter={legendFmt} />
                      <Area isAnimationActive={false} type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#gR)" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
                      <Area isAnimationActive={false} type="monotone" dataKey="profit"  name="Profit"  stroke="#10b981" fillOpacity={1} fill="url(#gP)" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981" }} />
                      <Area isAnimationActive={false} type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" fillOpacity={1} fill="url(#gN)" strokeWidth={2}   strokeDasharray="5 5" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Top Countries" sub="By visa booking count">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topCountriesData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis type="number" tick={{ fill: "#525252", fontSize: 12 }} axisLine={{ stroke: "#d4d4d4" }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#404040", fontSize: 13, fontWeight: 500 }} width={85} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar isAnimationActive={false} dataKey="count" name="Bookings" radius={[0,8,8,0]} barSize={22}>
                        {topCountriesData.map((_, i) => <Cell key={`bc-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* ── Row 4 : Top employees + Payment status ───────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <ChartCard title="Top Employees" sub="By total bookings across all services">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topEmployeesData} margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="name" tick={{ fill: "#404040", fontSize: 12, fontWeight: 500 }} axisLine={{ stroke: "#d4d4d4" }} />
                      <YAxis tick={{ fill: "#525252", fontSize: 12 }} axisLine={{ stroke: "#d4d4d4" }} />
                      <Tooltip contentStyle={tooltipStyle}
                        formatter={(val, nm) => nm === "Profit" ? `PKR ${Number(val).toLocaleString()}` : val} />
                      <Legend formatter={legendFmt} />
                      <Bar isAnimationActive={false} dataKey="bookings" name="Bookings" fill="#6366f1" radius={[6,6,0,0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Payment Status" sub="Paid • Unpaid • Partially Paid">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie isAnimationActive={false} data={paymentStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value" stroke="none"
                        label={({ name, value }) => `${name}: ${value}`}>
                        {paymentStatusData.map((e, i) => <Cell key={`ps-${i}`} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend verticalAlign="bottom" formatter={legendFmt} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </>
        </div>
      </div>
      <Footer />
    </>
  );
}

// ── Reusable chart card wrapper ───────────────────────────────────────────────
function ChartCard({ title, sub, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl p-6 border border-neutral-200 hover:border-neutral-400 transition-colors ${className}`}>
      <h3 className="text-base font-semibold text-neutral-900 mb-1">{title}</h3>
      {sub && <p className="text-xs text-neutral-600 mb-4">{sub}</p>}
      {children}
    </div>
  );
}
