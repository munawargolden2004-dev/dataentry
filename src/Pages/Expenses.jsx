import { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { jsPDF } from "jspdf";
import toast from "react-hot-toast";
import {
  MdAccountBalanceWallet,
  MdAdd,
  MdSearch,
  MdPrint,
  MdDownload,
  MdDelete,
  MdEdit,
  MdClose,
  MdAttachMoney,
  MdFilterList,
  MdRefresh,
  MdPerson,
  MdCategory,
  MdEvent,
  MdPayment,
  MdReceipt,
  MdTrendingUp,
  MdTrendingDown,
  MdCalendarToday,
  MdDescription,
  MdStorefront,
} from "react-icons/md";
import { FaMoneyBillWave, FaFileInvoiceDollar, FaFileCsv } from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import { useFinanceData, useFinanceActions, financeErrorMessage } from "../services/financeService";
import { COMPANY_INFO } from "../utils/company";
import { printElement, downloadStatementPdf } from "../utils/print";
import { isoDate, round2, sumBy, todayIso } from "../utils/accounting";

const DEFAULT_CATEGORIES = [
  "Office Rent",
  "Electricity & Utilities",
  "Staff Salaries & Commission",
  "Airline Ticket Vendor Payment",
  "Visa Processing Fee & Vendor",
  "Hotel Vendor Payment",
  "Umrah Transport & Ground Handling",
  "Marketing & Advertising",
  "Fuel & Transportation",
  "Office Supplies & Stationery",
  "Tea & Refreshments",
  "IT, Software & Hosting",
  "Taxes & Government Fees",
  "Maintenance & Repairs",
  "Miscellaneous Expense",
  "Custom Category",
];

const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "JazzCash / EasyPaisa",
  "Credit / Debit Card",
  "Cheque",
  "Company Account",
];

export default function Expenses() {
  const { user, isAdmin } = useAuth();
  const { data: finance, isLoading: loading, error: loadError } = useFinanceData();
  const actions = useFinanceActions();
  const { accounts } = finance;
  // Newest expense first.
  const expenses = useMemo(
    () => [...finance.expenses].sort((a, b) => (isoDate(b.date) || "").localeCompare(isoDate(a.date) || "")),
    [finance.expenses]
  );
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "";
  const [isSaving, setIsSaving] = useState(false);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedMethod, setSelectedMethod] = useState("All");
  const [dateFilter, setDateFilter] = useState("All"); // All, Today, ThisMonth, ThisYear, Custom
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [previewExpense, setPreviewExpense] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    category: "Office Rent",
    customCategory: "",
    amount: 0,
    date: todayIso(),
    paidTo: "",
    paymentMethod: "Cash",
    accountId: "",
    referenceNo: "",
    notes: "",
  });

  // Open Form for Create
  const handleOpenCreateModal = () => {
    setEditingExpenseId(null);
    setFormData({
      title: "",
      category: "Office Rent",
      customCategory: "",
      amount: "",
      date: todayIso(),
      paidTo: "",
      paymentMethod: "Cash",
      accountId: accounts[0]?.id || "",
      referenceNo: `EXP-${Date.now().toString().slice(-6)}`,
      notes: "",
    });
    setIsFormOpen(true);
  };

  // Open Form for Edit
  const handleOpenEditModal = (exp) => {
    setEditingExpenseId(exp.id);
    const isCustom = !DEFAULT_CATEGORIES.includes(exp.category);
    setFormData({
      title: exp.title || "",
      category: isCustom ? "Custom Category" : exp.category,
      customCategory: isCustom ? exp.category : "",
      amount: exp.amount || 0,
      date: exp.date || todayIso(),
      paidTo: exp.paidTo || "",
      paymentMethod: exp.paymentMethod || "Cash",
      accountId: accounts.some((a) => a.id === exp.accountId) ? exp.accountId : "",
      referenceNo: exp.referenceNo || "",
      notes: exp.notes || "",
    });
    setIsFormOpen(true);
  };

  // Save Expense (Create or Update)
  const handleSubmitExpense = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Expense Title is required");
      return;
    }
    const numAmount = round2(formData.amount);
    if (numAmount <= 0) {
      toast.error("Please enter a valid expense amount in PKR");
      return;
    }

    setIsSaving(true);

    const finalCategory =
      formData.category === "Custom Category" && formData.customCategory.trim()
        ? formData.customCategory.trim()
        : formData.category;

    const payload = {
      title: formData.title.trim(),
      category: finalCategory,
      amount: numAmount,
      date: formData.date || todayIso(),
      paidTo: formData.paidTo.trim(),
      paymentMethod: formData.paymentMethod,
      accountId: formData.accountId || null,
      referenceNo: formData.referenceNo.trim(),
      notes: formData.notes.trim(),
      // Keep the original recorder when someone else edits the expense.
      ...(!editingExpenseId && { generatedBy: user?.email || "Admin" }),
    };

    try {
      await actions.save("expenses", payload, editingExpenseId || undefined);
      toast.success(editingExpenseId ? "Expense updated successfully!" : "Expense recorded successfully!");
      setIsFormOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(financeErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense record?")) return;
    try {
      await actions.remove("expenses", id);
      toast.success("Expense deleted successfully");
    } catch (err) {
      console.error(err);
      toast.error(financeErrorMessage(err));
    }
  };

  // Filter Expenses
  const filteredExpenses = useMemo(() => {
    const today = todayIso();
    const currentYearMonth = today.slice(0, 7);
    const currentYear = today.slice(0, 4);

    return expenses.filter((exp) => {
      // Search
      const matchSearch =
        !searchTerm.trim() ||
        [exp.title, exp.category, exp.paidTo, exp.generatedBy, exp.referenceNo, exp.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.trim().toLowerCase());

      // Category
      const matchCat = selectedCategory === "All" || exp.category === selectedCategory;

      // Payment Method
      const matchMethod = selectedMethod === "All" || exp.paymentMethod === selectedMethod;

      // Date Range
      let matchDate = true;
      if (dateFilter === "Today") {
        matchDate = exp.date === today;
      } else if (dateFilter === "ThisMonth") {
        matchDate = exp.date && exp.date.startsWith(currentYearMonth);
      } else if (dateFilter === "ThisYear") {
        matchDate = exp.date && exp.date.startsWith(currentYear);
      } else if (dateFilter === "Custom") {
        if (customStartDate && exp.date < customStartDate) matchDate = false;
        if (customEndDate && exp.date > customEndDate) matchDate = false;
      }

      return matchSearch && matchCat && matchMethod && matchDate;
    });
  }, [expenses, searchTerm, selectedCategory, selectedMethod, dateFilter, customStartDate, customEndDate]);

  // Overall KPI Statistics
  const stats = useMemo(() => {
    const amountOf = (e) => e.amount;
    const totalExpenses = sumBy(expenses, amountOf);

    const today = todayIso();
    const currentYearMonth = today.slice(0, 7);

    const todayExpenses = sumBy(expenses.filter((e) => e.date === today), amountOf);

    const thisMonthExpenses = sumBy(expenses.filter((e) => e.date && e.date.startsWith(currentYearMonth)), amountOf);

    // Calculate Top Category
    const categoryTotals = {};
    expenses.forEach((e) => {
      const cat = e.category || "Miscellaneous";
      categoryTotals[cat] = round2((categoryTotals[cat] || 0) + round2(e.amount));
    });

    let topCategory = "None";
    let topCategoryAmount = 0;
    Object.entries(categoryTotals).forEach(([cat, sum]) => {
      if (sum > topCategoryAmount) {
        topCategoryAmount = sum;
        topCategory = cat;
      }
    });

    return {
      totalExpenses,
      todayExpenses,
      thisMonthExpenses,
      topCategory,
      topCategoryAmount,
      totalCount: expenses.length,
    };
  }, [expenses]);

  // Export to CSV
  const exportToCSV = () => {
    if (filteredExpenses.length === 0) {
      toast.error("No expense records to export");
      return;
    }

    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Reference #", "Title / Particulars", "Category", "Amount (PKR)", "Date", "Paid To", "Payment Method", "Account", "Generated By", "Notes"];
    const rows = filteredExpenses.map((exp) => [
      cell(exp.referenceNo),
      cell(exp.title),
      cell(exp.category),
      round2(exp.amount),
      cell(exp.date),
      cell(exp.paidTo),
      cell(exp.paymentMethod),
      cell(accountName(exp.accountId)),
      cell(exp.generatedBy),
      cell(exp.notes),
    ]);
    rows.push(["", cell("Total"), "", sumBy(filteredExpenses, (e) => e.amount)]);

    // A Blob (not a data: URI) so "#" and line breaks in the data survive,
    // with a BOM so Excel opens it as UTF-8.
    const csv = [headers.map(cell).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `RS_Expenses_Report_${todayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Expenses CSV exported successfully!");
  };

  // Download PDF Report
  const downloadExpenseReportPDF = async () => {
    if (filteredExpenses.length === 0) {
      toast.error("No expense records to export");
      return;
    }
    try {
      const filteredTotal = sumBy(filteredExpenses, (e) => e.amount);
      await downloadStatementPdf({
        title: "EXPENSE REPORT",
        meta: [
          `Generated: ${new Date().toLocaleDateString()}`,
          `Generated By: ${user?.email || "Admin"}`,
          `Total Records: ${filteredExpenses.length}`,
        ],
        details: ["Expense statement", `Category: ${selectedCategory}  |  Method: ${selectedMethod}  |  Period: ${dateFilter}`],
        summary: [{ label: "Total filtered expenses", value: `PKR ${filteredTotal.toLocaleString()}`, tone: "expense" }],
        head: ["#", "Ref #", "Particulars / Title", "Category", "Date", "Paid To", "Method", "Amount (PKR)"],
        body: filteredExpenses.map((exp, idx) => [
          idx + 1,
          exp.referenceNo || "-",
          exp.title,
          exp.category,
          exp.date || "-",
          exp.paidTo || "-",
          exp.paymentMethod || "Cash",
          round2(exp.amount).toLocaleString(),
        ]),
        foot: [["", "", "Total", "", "", "", "", filteredTotal.toLocaleString()]],
        columnStyles: { 0: { halign: "center", cellWidth: 9 }, 7: { halign: "right", fontStyle: "bold" } },
        fileName: `RS_Expenses_Report_${todayIso()}.pdf`,
      });
      toast.success("Expense Report PDF downloaded successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF. You can use Print View instead.");
    }
  };

  // Download Single Expense Voucher PDF
  const downloadSingleExpensePDF = (exp) => {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const startX = 15;
      const rightX = pageWidth - 15;

      // 1. Company Brand Header
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont("times", "bold");
      doc.setFontSize(20);
      doc.text(COMPANY_INFO.name.toUpperCase(), startX, 18);

      doc.setFontSize(8.5);
      doc.setFont("times", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(COMPANY_INFO.subtext, startX, 23);

      const splitAddress = doc.splitTextToSize(`Address: ${COMPANY_INFO.address}`, 105);
      doc.text(splitAddress, startX, 28);

      const addressLinesHeight = (splitAddress.length - 1) * 3.5;
      const phoneY = 32 + addressLinesHeight;
      doc.text(`Phone: ${COMPANY_INFO.phone}  |  Email: ${COMPANY_INFO.email}`, startX, phoneY);

      // 2. Voucher Meta (Top Right)
      doc.setTextColor(225, 29, 72); // rose-600
      doc.setFont("times", "bold");
      doc.setFontSize(20);
      doc.text("EXPENSE VOUCHER", rightX, 18, { align: "right" });

      doc.setFontSize(9.5);
      doc.setFont("times", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`Ref #: ${exp.referenceNo || "-"}`, rightX, 24, { align: "right" });

      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Date: ${exp.date || "-"}`, rightX, 29, { align: "right" });
      doc.text(`Recorded By: ${exp.generatedBy || "Admin"}`, rightX, 34, { align: "right" });

      // 3. Particulars Details Box
      const boxY = Math.max(phoneY + 6, 46);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(startX, boxY, pageWidth - 30, 48, 2, 2, "FD");

      doc.setFont("times", "bold");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("EXPENSE DETAILS & VENDOR INFORMATION", startX + 6, boxY + 7);

      doc.setFont("times", "bold");
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(exp.title || "Operational Expense", startX + 6, boxY + 15);

      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Expense Category: ${exp.category}`, startX + 6, boxY + 22);
      doc.text(`Paid To / Beneficiary: ${exp.paidTo || "—"}`, startX + 6, boxY + 28);
      doc.text(
        `Payment Method: ${exp.paymentMethod || "Cash"}${accountName(exp.accountId) ? `  |  Paid From: ${accountName(exp.accountId)}` : ""}`,
        startX + 6,
        boxY + 34
      );

      if (exp.notes) {
        const splitNotes = doc.splitTextToSize(`Notes: ${exp.notes}`, pageWidth - 42);
        doc.text(splitNotes, startX + 6, boxY + 40);
      }

      // 4. Amount Box
      const amountY = boxY + 54;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(startX, amountY, pageWidth - 30, 24, 2, 2, "FD");

      doc.setFont("times", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("TOTAL AMOUNT DISBURSED (AUTHORIZED OUTFLOW):", startX + 6, amountY + 9);

      doc.setFontSize(16);
      doc.setTextColor(225, 29, 72); // rose-600
      doc.text(`PKR ${Number(exp.amount || 0).toLocaleString()}`, rightX - 6, amountY + 16, { align: "right" });

      // 5. Signatures & Approvals
      const sigY = 240;
      doc.setDrawColor(203, 213, 225);
      doc.line(startX, sigY, rightX, sigY);

      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);

      const halfW = (pageWidth - 30) / 2;
      doc.line(startX + 10, sigY + 24, startX + halfW - 10, sigY + 24);
      doc.text("Prepared / Recorded By", startX + 10 + (halfW - 20) / 2, sigY + 29, { align: "center" });
      doc.text(exp.generatedBy || "Staff", startX + 10 + (halfW - 20) / 2, sigY + 33, { align: "center" });

      doc.line(startX + halfW + 10, sigY + 24, rightX - 10, sigY + 24);
      doc.text("Authorized Signature & Office Stamp", startX + halfW + 10 + (halfW - 20) / 2, sigY + 29, { align: "center" });
      doc.text(COMPANY_INFO.name, startX + halfW + 10 + (halfW - 20) / 2, sigY + 33, { align: "center" });

      // 6. Footer
      doc.setDrawColor(226, 232, 240);
      doc.line(startX, 280, rightX, 280);

      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Official Expense Voucher generated by RS Travels and Tours Management Portal.", startX, 285);
      doc.text("Page 1 of 1", rightX, 285, { align: "right" });

      doc.save(`RS_Voucher_${exp.referenceNo || exp.id}.pdf`);
      toast.success("Expense Voucher PDF downloaded successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate voucher PDF.");
    }
  };

  // Browser Print handler
  const handleTriggerPrint = () => {
    printElement(document.getElementById("expense-printable-area"));
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
      {/* Employees already get their navbar from the app layout (App.jsx). */}
      {isAdmin && <AdminNavbar />}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        {loadError && (
          <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4">
            {financeErrorMessage(loadError)}
          </div>
        )}
        {/* Brand Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sm:mb-8 bg-white p-4 sm:p-6 rounded-3xl border border-neutral-200 backdrop-blur-md shadow-md">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-600/20 text-rose-700 rounded-2xl border border-rose-500/30">
                <MdAccountBalanceWallet className="text-3xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight flex items-center gap-2">
                  <span className="text-rose-600">RS TRAVELS</span> and Tours
                </h1>
                <p className="text-neutral-600 text-sm font-medium">
                  Expense Management, Vendor Payouts &amp; Cost Tracking Module
                </p>
                <div className="text-xs text-neutral-500 mt-1 flex flex-wrap items-center gap-x-4">
                  <span>Address: {COMPANY_INFO.address.split(",")[0]}, {COMPANY_INFO.address.split(",")[1]}</span>
                  <span>Phone: {COMPANY_INFO.phone}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => actions.refresh()}
              className="p-3 rounded-2xl bg-white text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition border border-neutral-200 cursor-pointer"
              title="Refresh Data"
            >
              <MdRefresh size={20} />
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-900 font-semibold border border-neutral-200 transition cursor-pointer text-sm"
              title="Export CSV"
            >
              <FaFileCsv className="text-emerald-700 text-base" />
              <span>CSV</span>
            </button>
            <button
              onClick={downloadExpenseReportPDF}
              className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-900 font-semibold border border-neutral-200 transition cursor-pointer text-sm"
              title="Export PDF Report"
            >
              <MdDownload className="text-blue-700 text-base" />
              <span>PDF Report</span>
            </button>
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-700 text-white font-bold shadow-md transition cursor-pointer"
            >
              <MdAdd size={22} />
              Add New Expense
            </button>
          </div>
        </div>

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6 sm:mb-8">
          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Total Expenses</p>
              <span className="p-2 bg-rose-500/10 text-rose-700 rounded-xl text-lg"><MdAccountBalanceWallet /></span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-neutral-900">PKR {stats.totalExpenses.toLocaleString()}</h3>
            <span className="text-xs text-neutral-600 mt-2 block">{stats.totalCount} Total Recorded Expenses</span>
          </div>

          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">This Month's Spending</p>
              <span className="p-2 bg-amber-500/10 text-amber-700 rounded-xl text-lg"><MdCalendarToday /></span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-700">PKR {stats.thisMonthExpenses.toLocaleString()}</h3>
            <span className="text-xs text-amber-600 mt-2 block">Current Month Total Outflow</span>
          </div>

          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Today's Expenses</p>
              <span className="p-2 bg-blue-500/10 text-blue-700 rounded-xl text-lg"><MdEvent /></span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-neutral-900">PKR {stats.todayExpenses.toLocaleString()}</h3>
            <span className="text-xs text-blue-700 mt-2 block">Today's Daily Outflow</span>
          </div>

          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">Top Expense Category</p>
              <span className="p-2 bg-purple-500/10 text-purple-700 rounded-xl text-lg"><MdCategory /></span>
            </div>
            <h3 className="text-xl font-extrabold text-neutral-900 truncate" title={stats.topCategory}>
              {stats.topCategory}
            </h3>
            <span className="text-xs text-purple-700 mt-2 block">
              PKR {stats.topCategoryAmount.toLocaleString()} total spent
            </span>
          </div>
        </div>

        {/* Filters & Search Bar */}
        <div className="bg-white border border-neutral-200 p-4 rounded-2xl mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 text-xl" />
            <input
              type="text"
              placeholder="Search expenses by title, vendor, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-neutral-900 placeholder-neutral-500 outline-none focus:border-neutral-900 transition"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600 hidden sm:inline">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none focus:border-neutral-900"
              >
                <option value="All">All Categories</option>
                {DEFAULT_CATEGORIES.filter((c) => c !== "Custom Category").map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600 hidden sm:inline">Method:</span>
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none focus:border-neutral-900"
              >
                <option value="All">All Methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600 hidden sm:inline">Date:</span>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none focus:border-neutral-900"
              >
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="ThisMonth">This Month</option>
                <option value="ThisYear">This Year</option>
                <option value="Custom">Custom Range</option>
              </select>
            </div>

            {dateFilter === "Custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-1 text-xs text-neutral-900"
                />
                <span className="text-neutral-500 text-xs">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-1 text-xs text-neutral-900"
                />
              </div>
            )}
          </div>
        </div>

        {/* Expenses Table */}
        <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden backdrop-blur-md shadow-md">
          {loading ? (
            <div className="text-center py-20">
              <div className="w-10 h-10 border-4 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-neutral-600">Loading Expense Records...</p>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-neutral-500 mx-auto mb-4">
                <MdAccountBalanceWallet size={32} />
              </div>
              <h3 className="text-xl font-bold text-neutral-700">No Expenses Found</h3>
              <p className="text-neutral-500 text-sm mt-1 mb-6">
                {searchTerm || selectedCategory !== "All" || dateFilter !== "All"
                  ? "No expense records matching your search filters."
                  : "Start recording agency operational costs and vendor payouts."}
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-md transition cursor-pointer"
              >
                Add First Expense
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-[11px] tracking-wider">
                    <th className="py-4 px-5 font-bold">Ref #</th>
                    <th className="py-4 px-5 font-bold">Expense Title</th>
                    <th className="py-4 px-5 font-bold">Category</th>
                    <th className="py-4 px-5 font-bold">Price / Amount</th>
                    <th className="py-4 px-5 font-bold">Date</th>
                    <th className="py-4 px-5 font-bold">Paid To / Vendor</th>
                    <th className="py-4 px-5 font-bold">Payment Method</th>
                    <th className="py-4 px-5 font-bold">Generated By</th>
                    <th className="py-4 px-5 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {filteredExpenses.map((exp) => {
                    const amount = Number(exp.amount) || 0;
                    const generatedBy = exp.generatedBy || "Admin";

                    return (
                      <tr key={exp.id} className="hover:bg-neutral-100 transition">
                        <td className="py-4 px-5 font-mono font-semibold text-rose-700 text-xs">
                          {exp.referenceNo || "-"}
                        </td>
                        <td className="py-4 px-5 font-bold text-neutral-900">
                          <div>{exp.title}</div>
                          {exp.notes && (
                            <span className="text-[11px] font-normal text-neutral-600 truncate max-w-xs block">
                              {exp.notes}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <span className="px-2.5 py-1 bg-white text-neutral-700 rounded-lg text-xs font-medium border border-neutral-200 whitespace-nowrap">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-bold text-rose-700 text-base">
                          PKR {amount.toLocaleString()}
                        </td>
                        <td className="py-4 px-5 text-xs text-neutral-700 whitespace-nowrap">
                          {exp.date || "-"}
                        </td>
                        <td className="py-4 px-5 text-xs text-neutral-700 font-medium">
                          {exp.paidTo || "-"}
                        </td>
                        <td className="py-4 px-5 text-xs">
                          <span className="px-2 py-0.5 bg-white text-neutral-700 border border-neutral-200 rounded-md">
                            {exp.paymentMethod || "Cash"}
                          </span>
                          {accountName(exp.accountId) && (
                            <span className="block text-[11px] text-neutral-500 mt-1">{accountName(exp.accountId)}</span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-xs text-neutral-700">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-medium">
                            {generatedBy}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setPreviewExpense(exp)}
                              className="p-2 rounded-lg bg-blue-600/10 text-blue-700 hover:bg-neutral-900 hover:text-white border border-blue-500/20 transition cursor-pointer"
                              title="Print / View Receipt"
                            >
                              <MdPrint size={18} />
                            </button>
                            <button
                              onClick={() => downloadSingleExpensePDF(exp)}
                              className="p-2 rounded-lg bg-rose-600/10 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-500/20 transition cursor-pointer"
                              title="Download PDF Voucher"
                            >
                              <MdDownload size={18} />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(exp)}
                              className="p-2 rounded-lg bg-amber-600/10 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-500/20 transition cursor-pointer"
                              title="Edit Expense"
                            >
                              <MdEdit size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-2 rounded-lg bg-rose-600/10 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-500/20 transition cursor-pointer"
                              title="Delete Expense"
                            >
                              <MdDelete size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ADD / EDIT EXPENSE MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto">
          <div className="bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-md p-4 sm:p-8 text-neutral-900 relative">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white text-neutral-600 hover:text-neutral-900 transition cursor-pointer"
            >
              <MdClose size={20} />
            </button>

            <h2 className="text-2xl font-bold text-neutral-900 mb-1 flex items-center gap-2">
              <MdAccountBalanceWallet className="text-rose-600" />
              {editingExpenseId ? "Edit Expense" : "Record New Expense"}
            </h2>
            <p className="text-xs text-neutral-600 mb-6">
              Track operational costs, vendor payments, and office expenses for RS Travels and Tours
            </p>

            <form onSubmit={handleSubmitExpense} className="space-y-4">
              {/* Title / Name */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Expense Title / Particulars *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Office Rent Mezzanine Floor / PIA Ticket Advance"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  required
                />
              </div>

              {/* Category Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  >
                    {DEFAULT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Price / Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-bold text-rose-700 outline-none focus:border-neutral-900"
                    required
                  />
                </div>
              </div>

              {/* Custom Category Input */}
              {formData.category === "Custom Category" && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Enter Custom Category Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Airport Meet & Greet Vendor"
                    value={formData.customCategory}
                    onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                    required
                  />
                </div>
              )}

              {/* Date & Ref */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Expense Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Reference # / Voucher #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EXP-100234 or Receipt #"
                    value={formData.referenceNo}
                    onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Paid To & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Paid To / Vendor / Beneficiary
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rata Mansion Management / PIA GSA"
                    value={formData.paidTo}
                    onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Payment Method
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Account the money left from */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Paid From Account
                </label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                >
                  <option value="">Unassigned</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Description / Additional Notes
                </label>
                <textarea
                  rows="2"
                  placeholder="Optional details, invoice breakdown, or approval notes..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-xs text-neutral-900 outline-none focus:border-neutral-900"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-100 transition text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-700 text-white font-bold transition text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  {isSaving && (
                    <div className="w-4 h-4 border-2 border-neutral-200 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <span>
                    {isSaving
                      ? editingExpenseId
                        ? "Updating Expense..."
                        : "Saving Expense..."
                      : editingExpenseId
                      ? "Save Changes"
                      : "Save Expense"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE RECEIPT / DETAILS MODAL (No stickers/emojis on print) */}
      {previewExpense && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto">
          <div className="bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-md p-3 sm:p-8 text-slate-900 relative">
            {/* Modal Controls (Hidden in Print) */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-neutral-200">
              <h3 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
                <MdPrint className="text-rose-600" /> Expense Voucher
              </h3>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleTriggerPrint}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-md transition cursor-pointer"
                >
                  <MdPrint size={18} /> Print
                </button>
                <button
                  onClick={() => downloadSingleExpensePDF(previewExpense)}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white hover:bg-neutral-100 text-rose-700 text-sm font-bold shadow-md border border-neutral-200 transition cursor-pointer"
                >
                  <MdDownload size={18} /> PDF
                </button>
                <button
                  onClick={() => setPreviewExpense(null)}
                  className="p-2 rounded-xl bg-white text-neutral-600 hover:text-neutral-900 transition cursor-pointer"
                >
                  <MdClose size={20} />
                </button>
              </div>
            </div>

            {/* PRINTABLE AREA (Clean Business Template - No Emojis/Stickers) */}
            <div
              id="expense-printable-area"
              className="print-sheet bg-white p-4 sm:p-10 rounded-2xl shadow-sm border border-slate-200 text-slate-800 font-sans"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    RS TRAVELS AND TOURS
                  </h1>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mt-0.5">
                    {COMPANY_INFO.subtext}
                  </p>
                  <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                    <p><span className="font-semibold text-slate-700">Address:</span> {COMPANY_INFO.address}</p>
                    <p><span className="font-semibold text-slate-700">Phone:</span> {COMPANY_INFO.phone}</p>
                    <p><span className="font-semibold text-slate-700">Email:</span> {COMPANY_INFO.email}</p>
                  </div>
                </div>

                <div className="mt-4 sm:mt-0 text-left sm:text-right">
                  <h2 className="text-2xl font-black text-slate-900 tracking-wider">EXPENSE VOUCHER</h2>
                  <p className="text-xs font-mono font-bold text-slate-700 mt-1">
                    Ref #: {previewExpense.referenceNo || "-"}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Date: <span className="font-semibold text-slate-800">{previewExpense.date || "-"}</span>
                  </p>
                </div>
              </div>

              {/* Expense Details Card */}
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-neutral-500 uppercase">Expense Title</p>
                    <p className="text-base font-bold text-slate-900">{previewExpense.title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-500 uppercase">Category</p>
                    <p className="text-sm font-semibold text-slate-800">{previewExpense.category}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-500 uppercase">Paid To / Beneficiary</p>
                    <p className="text-sm font-semibold text-slate-800">{previewExpense.paidTo || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-500 uppercase">Payment Method</p>
                    <p className="text-sm font-semibold text-slate-800">{previewExpense.paymentMethod || "Cash"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-500 uppercase">Recorded By</p>
                    <p className="text-sm font-semibold text-slate-800">{previewExpense.generatedBy || "Admin"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-500 uppercase">Date of Record</p>
                    <p className="text-sm font-semibold text-slate-800">{previewExpense.date || "—"}</p>
                  </div>
                </div>

                {previewExpense.notes && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-xs font-bold text-neutral-500 uppercase">Particulars / Notes</p>
                    <p className="text-xs text-slate-600 mt-1">{previewExpense.notes}</p>
                  </div>
                )}
              </div>

              {/* Amount Box */}
              <div className="bg-slate-100 p-6 rounded-xl border border-slate-300 flex items-center justify-between mb-8">
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Total Amount Paid</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Authorized Cash / Bank Outflow</p>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900">
                  PKR {Number(previewExpense.amount || 0).toLocaleString()}
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-center">
                <div>
                  <div className="w-40 border-b border-slate-400 mx-auto mb-1"></div>
                  <p className="text-xs font-bold text-slate-600 uppercase">Prepared / Recorded By</p>
                  <p className="text-[10px] text-neutral-500">{previewExpense.generatedBy || "Staff"}</p>
                </div>
                <div>
                  <div className="w-40 border-b border-slate-400 mx-auto mb-1"></div>
                  <p className="text-xs font-bold text-slate-600 uppercase">Authorized Signature / Stamp</p>
                  <p className="text-[10px] text-neutral-500">RS Travels and Tours</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
