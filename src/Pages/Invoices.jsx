import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import {
  MdReceiptLong,
  MdAdd,
  MdSearch,
  MdPrint,
  MdDownload,
  MdDelete,
  MdEdit,
  MdClose,
  MdAttachMoney,
  MdCheckCircle,
  MdHourglassEmpty,
  MdWarning,
  MdFilterList,
  MdRefresh,
  MdPerson,
  MdEmail,
  MdPhone,
  MdCategory,
  MdPayment,
  MdEvent,
  MdDescription,
  MdPayments,
} from "react-icons/md";
import { FaPlane, FaSuitcase, FaHotel, FaKaaba, FaFileInvoiceDollar, FaBuilding } from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import TransactionForm from "../Components/TransactionForm";
import { useFinanceData, useFinanceActions, financeErrorMessage } from "../services/financeService";
import { COMPANY_INFO } from "../utils/company";
import { printElement } from "../utils/print";
import {
  PARTY_TYPES,
  invoiceAmounts,
  isPurchase,
  isoDate,
  nextInvoiceNumber,
  partyTypeOf,
  resolveParties,
  round2,
  sumBy,
} from "../utils/accounting";

// Wording that changes with who the invoice is for. A vendor invoice is a
// bill we received (we pay it); client and agent invoices are ones we issue.
const PARTY_COPY = {
  client: { billed: "Billed To", paid: "Amount Paid", due: "Balance Due", payVerb: "Receive payment" },
  agent: { billed: "Billed To (Agent)", paid: "Amount Paid", due: "Balance Due", payVerb: "Receive payment" },
  vendor: { billed: "Bill From (Vendor)", paid: "Paid to Vendor", due: "Balance Payable", payVerb: "Pay vendor" },
};
const DEFAULT_NOTES = {
  client: "Thank you for choosing RS Travels and Tours. Payment is due within 7 days of invoice issue date.",
  agent: "Thank you for your business with RS Travels and Tours. Payment is due within 7 days of invoice issue date.",
  vendor: "Purchase bill recorded by RS Travels and Tours.",
};
const dateInDays = (days) => isoDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

const CATEGORIES = [
  "Flight Ticket",
  "Visa Application",
  "Umrah Package",
  "Hotel Booking",
  "Tour Package",
  "Medical Insurance",
  "Transport Service",
  "Custom Service",
];

const blankForm = (partyType = "client") => ({
  invoiceNumber: "",
  partyType,
  partyId: "",
  accountId: "",
  category: "Flight Ticket",
  customCategory: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  customerAddress: "",
  invoiceDate: dateInDays(0),
  dueDate: dateInDays(7),
  items: [{ description: "", quantity: 1, rate: 0, total: 0 }],
  totalPrice: 0,
  paidAmount: 0,
  linkedPaid: 0,
  paymentMethod: "Bank Transfer",
  notes: DEFAULT_NOTES[partyType],
});

export default function Invoices() {
  const { isAdmin } = useAuth();
  const { data: finance, isLoading: loading, error: loadError } = useFinanceData();
  const actions = useFinanceActions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSaving, setIsSaving] = useState(false);

  // Newest invoice first.
  const invoices = useMemo(
    () => [...finance.invoices].sort((a, b) => (isoDate(b.invoiceDate) || "").localeCompare(isoDate(a.invoiceDate) || "")),
    [finance.invoices]
  );
  const { accounts } = finance;
  const parties = useMemo(() => resolveParties(finance), [finance]);
  const registeredParties = useMemo(() => parties.filter((p) => !p.virtual), [parties]);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPartyType, setSelectedPartyType] = useState("All");

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [paymentFor, setPaymentFor] = useState(null);

  // Form State
  const [formData, setFormData] = useState(blankForm);

  // Open Form for Create
  const handleOpenCreateModal = (partyType = "client", partyId = "") => {
    const type = PARTY_TYPES[partyType] ? partyType : "client";
    const party = registeredParties.find((p) => p.id === partyId && p.type === type);
    setEditingInvoiceId(null);
    setFormData({
      ...blankForm(type),
      invoiceNumber: nextInvoiceNumber(invoices, type),
      accountId: accounts[0]?.id || "",
      ...(party && {
        partyId: party.id,
        customerName: party.name,
        customerEmail: party.email || "",
        customerPhone: party.phone || "",
        customerAddress: party.address || "",
      }),
    });
    setIsFormOpen(true);
  };

  // Ledgers links here with ?new=<type>&party=<id> to start an invoice for a party.
  const newParam = searchParams.get("new");
  useEffect(() => {
    if (!newParam || loading) return;
    handleOpenCreateModal(newParam, searchParams.get("party") || "");
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam, loading]);

  // Open Form for Edit
  const handleOpenEditModal = (inv) => {
    const amounts = invoiceAmounts(inv);
    setEditingInvoiceId(inv.id);
    setFormData({
      invoiceNumber: inv.invoiceNumber || nextInvoiceNumber(invoices, partyTypeOf(inv)),
      partyType: partyTypeOf(inv),
      partyId: registeredParties.some((p) => p.id === inv.partyId) ? inv.partyId : "",
      accountId: accounts.some((a) => a.id === inv.accountId) ? inv.accountId : "",
      category: CATEGORIES.includes(inv.category) ? inv.category : "Custom Service",
      customCategory: CATEGORIES.includes(inv.category) ? "" : inv.category,
      customerName: inv.customerName || "",
      customerEmail: inv.customerEmail || "",
      customerPhone: inv.customerPhone || "",
      customerAddress: inv.customerAddress || "",
      invoiceDate: inv.invoiceDate || dateInDays(0),
      dueDate: inv.dueDate || "",
      items: inv.items && inv.items.length > 0 ? inv.items : [{ description: inv.category, quantity: 1, rate: amounts.total, total: amounts.total }],
      totalPrice: amounts.total,
      // The form edits only what was paid on the invoice itself; payments
      // recorded later (linkedPaid) are kept and added back on save.
      paidAmount: amounts.directPaid,
      linkedPaid: amounts.linkedPaid,
      paymentMethod: inv.paymentMethod || "Bank Transfer",
      notes: inv.notes || "",
    });
    setIsFormOpen(true);
  };

  // Switching who the invoice is for renumbers a new invoice and clears the party.
  const handlePartyTypeChange = (partyType) => {
    setFormData((prev) => ({
      ...prev,
      partyType,
      partyId: "",
      invoiceNumber: editingInvoiceId ? prev.invoiceNumber : nextInvoiceNumber(invoices, partyType),
      notes: Object.values(DEFAULT_NOTES).includes(prev.notes) ? DEFAULT_NOTES[partyType] : prev.notes,
    }));
  };

  // Picking a saved party fills in its contact details.
  const handlePartySelect = (partyId) => {
    const party = registeredParties.find((p) => p.id === partyId);
    setFormData((prev) => ({
      ...prev,
      partyId,
      ...(party && {
        customerName: party.name,
        customerEmail: party.email || "",
        customerPhone: party.phone || "",
        customerAddress: party.address || "",
      }),
    }));
  };

  // Dynamic Item Row Management
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...formData.items];
    const item = { ...updatedItems[index], [field]: value };

    if (field === "quantity" || field === "rate") {
      item.total = round2((Number(item.quantity) || 0) * (Number(item.rate) || 0));
    }

    updatedItems[index] = item;

    const newTotalPrice = sumBy(updatedItems, (it) => it.total);

    setFormData((prev) => ({
      ...prev,
      items: updatedItems,
      totalPrice: newTotalPrice,
    }));
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, rate: 0, total: 0 }],
    }));
  };

  const handleRemoveItem = (index) => {
    if (formData.items.length === 1) return;
    const updatedItems = formData.items.filter((_, i) => i !== index);
    const newTotalPrice = sumBy(updatedItems, (it) => it.total);
    setFormData((prev) => ({
      ...prev,
      items: updatedItems,
      totalPrice: newTotalPrice,
    }));
  };

  // Save Invoice (Create or Update)
  const handleSubmitInvoice = async (e) => {
    e.preventDefault();

    const copy = PARTY_TYPES[formData.partyType];
    const customerName = formData.customerName.trim().replace(/\s+/g, " ");
    if (!customerName) {
      toast.error(`${copy.label} name is required`);
      return;
    }

    const total = round2(formData.totalPrice);
    const directPaid = round2(formData.paidAmount);
    const linkedPaid = editingInvoiceId ? round2(formData.linkedPaid) : 0;
    const paid = round2(directPaid + linkedPaid);
    if (total <= 0) {
      toast.error("Total must be greater than zero");
      return;
    }
    if (directPaid < 0 || paid > total) {
      toast.error(`Paid amount cannot be more than the total (PKR ${total.toLocaleString()})`);
      return;
    }
    const duplicate = invoices.find(
      (i) => i.id !== editingInvoiceId && i.invoiceNumber && i.invoiceNumber === formData.invoiceNumber.trim()
    );
    if (duplicate) {
      toast.error(`Invoice number ${duplicate.invoiceNumber} is already used`);
      return;
    }

    setIsSaving(true);

    const finalCategory = formData.category === "Custom Service" && formData.customCategory.trim()
      ? formData.customCategory.trim()
      : formData.category;
    const amounts = invoiceAmounts({ totalPrice: total, paidAmount: paid, linkedPaid });

    const payload = {
      invoiceNumber: formData.invoiceNumber.trim() || nextInvoiceNumber(invoices, formData.partyType),
      partyType: formData.partyType,
      partyId: formData.partyId || null,
      partyName: customerName,
      accountId: formData.accountId || null,
      category: finalCategory,
      customerName,
      customerEmail: formData.customerEmail.trim(),
      customerPhone: formData.customerPhone.trim(),
      customerAddress: formData.customerAddress.trim(),
      invoiceDate: formData.invoiceDate,
      dueDate: formData.dueDate,
      items: formData.items.map((it) => ({
        description: String(it.description || "").trim(),
        quantity: Number(it.quantity) || 0,
        rate: round2(it.rate),
        total: round2(it.total),
      })),
      totalPrice: total,
      paidAmount: paid,
      linkedPaid,
      remainingAmount: amounts.balance,
      status: amounts.status,
      paymentMethod: formData.paymentMethod,
      notes: formData.notes,
      companyName: COMPANY_INFO.name,
    };

    try {
      await actions.save("invoices", payload, editingInvoiceId || undefined);
      toast.success(editingInvoiceId ? "Invoice updated successfully!" : "Invoice created successfully!");
      setIsFormOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(financeErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Invoice
  const handleDeleteInvoice = async (id) => {
    if (!window.confirm("Are you sure you want to delete this invoice? Payments recorded against it stay in the party's ledger.")) return;
    try {
      await actions.removeInvoice(id);
      toast.success("Invoice deleted");
    } catch (err) {
      console.error(err);
      toast.error(financeErrorMessage(err));
    }
  };

  // Filter Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        !searchTerm.trim() ||
        [inv.invoiceNumber, inv.customerName, inv.customerEmail, inv.category, inv.createdByEmail]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.trim().toLowerCase());

      const matchCat = selectedCategory === "All" || inv.category === selectedCategory;
      const matchStatus = selectedStatus === "All" || invoiceAmounts(inv).status === selectedStatus;
      const matchParty = selectedPartyType === "All" || partyTypeOf(inv) === selectedPartyType;

      return matchSearch && matchCat && matchStatus && matchParty;
    });
  }, [invoices, searchTerm, selectedCategory, selectedStatus, selectedPartyType]);

  // Overall Statistics. Sales (client + agent invoices) and vendor bills are
  // opposite directions of money, so they are totalled separately.
  const stats = useMemo(() => {
    const sales = invoices.filter((i) => !isPurchase(i));
    const bills = invoices.filter(isPurchase);
    const count = (status) => sales.filter((i) => invoiceAmounts(i).status === status).length;

    return {
      totalInvoiced: sumBy(sales, (i) => invoiceAmounts(i).total),
      totalPaid: sumBy(sales, (i) => invoiceAmounts(i).paid),
      totalBalance: sumBy(sales, (i) => invoiceAmounts(i).balance),
      salesCount: sales.length,
      countPaid: count("Paid"),
      countPartial: count("Partial"),
      countUnpaid: count("Unpaid"),
      billsTotal: sumBy(bills, (i) => invoiceAmounts(i).total),
      billsPayable: sumBy(bills, (i) => invoiceAmounts(i).balance),
      billsCount: bills.length,
    };
  }, [invoices]);

  const copyFor = (inv) => PARTY_COPY[partyTypeOf(inv)];
  const titleFor = (inv) => PARTY_TYPES[partyTypeOf(inv)].invoiceTitle;
  const partyOfInvoice = (inv) => parties.find((p) => p.invoices.some((i) => i.id === inv.id));
  const preview = previewInvoice && invoiceAmounts(previewInvoice);

  // PDF Generation Download Helper
  const downloadPDF = (inv) => {
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
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(COMPANY_INFO.subtext, startX, 23);

      const splitAddress = doc.splitTextToSize(`Address: ${COMPANY_INFO.address}`, 105);
      doc.text(splitAddress, startX, 28);

      const addressLinesHeight = (splitAddress.length - 1) * 3.5;
      const phoneY = 32 + addressLinesHeight;
      doc.text(`Phone: ${COMPANY_INFO.phone}  |  Email: ${COMPANY_INFO.email}`, startX, phoneY);

      // 2. Invoice Meta (Top Right)
      doc.setTextColor(15, 23, 42);
      doc.setFont("times", "bold");
      doc.setFontSize(20);
      doc.text(titleFor(inv), rightX, 18, { align: "right" });

      doc.setFontSize(9.5);
      doc.setFont("times", "bold");
      doc.setTextColor(37, 99, 235); // blue-600
      doc.text(inv.invoiceNumber || "", rightX, 24, { align: "right" });

      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Invoice Date: ${inv.invoiceDate || "-"}`, rightX, 29, { align: "right" });
      doc.text(`Due Date: ${inv.dueDate || "-"}`, rightX, 34, { align: "right" });
      doc.text(`Generated By: ${inv.createdByEmail || inv.generatedBy || "Admin"}`, rightX, 39, { align: "right" });

      // 3. Customer Info Box (Billed To)
      const boxY = Math.max(phoneY + 6, 46);
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(startX, boxY, pageWidth - 30, 32, 2, 2, "FD");

      // Left column: Customer Details
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`${copyFor(inv).billed.toUpperCase()}:`, startX + 5, boxY + 6);

      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(inv.customerName || "Valued Customer", startX + 5, boxY + 12);

      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Email: ${inv.customerEmail || "-"}`, startX + 5, boxY + 17);
      doc.text(`Phone: ${inv.customerPhone || "-"}`, startX + 5, boxY + 22);
      if (inv.customerAddress) {
        const splitCustAddress = doc.splitTextToSize(`Address: ${inv.customerAddress}`, 95);
        doc.text(splitCustAddress, startX + 5, boxY + 27);
      }

      // Right column: Category & Status
      const rightColX = pageWidth - 20;
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text("SERVICE CATEGORY:", rightColX, boxY + 6, { align: "right" });

      doc.setFont("times", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(inv.category || "Travel Service", rightColX, boxY + 12, { align: "right" });

      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text("PAYMENT STATUS:", rightColX, boxY + 18, { align: "right" });

      const { total, paid, balance, status } = invoiceAmounts(inv);
      const statusText = status.toUpperCase();
      doc.setFont("times", "bold");
      doc.setFontSize(9.5);
      if (status === "Paid") {
        doc.setTextColor(16, 185, 129); // emerald-600
      } else if (status === "Partial") {
        doc.setTextColor(217, 119, 6); // amber-600
      } else {
        doc.setTextColor(225, 29, 72); // rose-600
      }
      doc.text(statusText, rightColX, boxY + 24, { align: "right" });

      // 4. Line Items Table
      const tableStartY = boxY + 36;
      const tableItems = (inv.items && inv.items.length > 0)
        ? inv.items.map((it, idx) => [
            idx + 1,
            it.description || inv.category || "Travel Service Booking",
            it.quantity || 1,
            `PKR ${Number(it.rate || 0).toLocaleString()}`,
            `PKR ${Number(it.total || 0).toLocaleString()}`,
          ])
        : [[1, inv.category || "Travel Service Booking", 1, `PKR ${Number(inv.totalPrice || 0).toLocaleString()}`, `PKR ${Number(inv.totalPrice || 0).toLocaleString()}`]];

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: startX, right: startX },
        head: [["#", "Particulars / Service Description", "Qty", "Rate (PKR)", "Total Amount (PKR)"]],
        body: tableItems,
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { font: "times", fontSize: 9, cellPadding: 3.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 18, halign: "center" },
          3: { cellWidth: 35, halign: "right" },
          4: { cellWidth: 40, halign: "right", fontStyle: "bold" },
        },
      });

      // Long invoices: move the totals to a new page rather than printing
      // them over the signature block.
      let finalY = doc.lastAutoTable.finalY + 8;
      if (finalY + 34 > 262) {
        doc.addPage();
        finalY = 20;
      }

      // 5. Payment Details & Totals Summary
      doc.setFont("times", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("PAYMENT INSTRUCTIONS & TERMS:", startX, finalY + 4);

      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Payment Method: ${inv.paymentMethod || "Bank Transfer"}`, startX, finalY + 9);

      const splitNotes = doc.splitTextToSize(inv.notes || "Thank you for doing business with RS Travels and Tours.", 95);
      doc.text(splitNotes, startX, finalY + 14);

      // Right side: Totals Box
      const summaryBoxWidth = 75;
      const summaryX = pageWidth - startX - summaryBoxWidth;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(summaryX, finalY, summaryBoxWidth, 30, 2, 2, "FD");

      doc.setFont("times", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("Total Amount:", summaryX + 5, finalY + 7);
      doc.text(`${copyFor(inv).paid}:`, summaryX + 5, finalY + 14);

      doc.setFont("times", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`PKR ${total.toLocaleString()}`, rightX - 5, finalY + 7, { align: "right" });
      doc.setTextColor(16, 185, 129);
      doc.text(`PKR ${paid.toLocaleString()}`, rightX - 5, finalY + 14, { align: "right" });

      doc.setDrawColor(203, 213, 225);
      doc.line(summaryX + 5, finalY + 18, rightX - 5, finalY + 18);

      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`${copyFor(inv).due}:`, summaryX + 5, finalY + 25);
      doc.setTextColor(balance > 0 ? 225 : 16, balance > 0 ? 29 : 185, balance > 0 ? 72 : 129);
      doc.text(`PKR ${balance.toLocaleString()}`, rightX - 5, finalY + 25, { align: "right" });

      // 6. Signatures & Footer
      doc.setDrawColor(226, 232, 240);
      doc.line(startX, 268, rightX, 268);

      doc.setFont("times", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Prepared by RS Travels and Tours System", startX, 275);

      const signX = pageWidth - startX - 45;
      doc.line(signX, 274, rightX, 274);
      doc.setFont("times", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Authorized Signature & Stamp", signX + 22.5, 278, { align: "center" });

      doc.setFontSize(7.5);
      doc.setFont("times", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("Official Invoice generated by RS Travels and Tours Management Portal.", startX, 285);
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.text(`Page ${page} of ${pageCount}`, rightX, 285, { align: "right" });
      }

      doc.save(`RS_Invoice_${inv.invoiceNumber}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF.");
    }
  };

  const handleTriggerPrint = () => {
    printElement(document.getElementById("invoice-printable-area"));
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col">
      {/* Employees already get their navbar from the app layout (App.jsx). */}
      {isAdmin && <AdminNavbar />}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        {loadError && (
          <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl p-4">
            {financeErrorMessage(loadError)}
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sm:mb-8 bg-white p-4 sm:p-6 rounded-3xl border border-neutral-200 backdrop-blur-md shadow-md">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600/20 text-blue-700 rounded-2xl border border-blue-500/30">
                <MdReceiptLong className="text-3xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight flex items-center gap-2">
                  <span className="text-blue-600">RS TRAVELS</span> and Tours
                </h1>
                <p className="text-neutral-600 text-sm font-medium">
                  Client, Agent &amp; Vendor Invoices
                </p>
                <div className="text-xs text-neutral-500 mt-1 flex flex-wrap items-center gap-x-4">
                  <span>Address: {COMPANY_INFO.address.split(",")[0]}, {COMPANY_INFO.address.split(",")[1]}</span>
                  <span>Phone: {COMPANY_INFO.phone}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={() => actions.refresh()}
              className="p-3 rounded-2xl bg-white text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition border border-neutral-200 cursor-pointer"
              title="Refresh Data"
            >
              <MdRefresh size={20} />
            </button>
            <button
              onClick={() => handleOpenCreateModal("vendor")}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-900 font-semibold border border-neutral-200 transition cursor-pointer text-sm"
            >
              <MdAdd size={20} />
              Vendor Bill
            </button>
            <button
              onClick={() => handleOpenCreateModal("agent")}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-900 font-semibold border border-neutral-200 transition cursor-pointer text-sm"
            >
              <MdAdd size={20} />
              Agent Invoice
            </button>
            <button
              onClick={() => handleOpenCreateModal("client")}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-900 hover:from-neutral-700 hover:to-neutral-700 text-white font-bold shadow-md transition cursor-pointer"
            >
              <MdAdd size={22} />
              Client Invoice
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6 sm:mb-8">
          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Total Invoiced (Sales)</p>
            <h3 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-neutral-900 break-words">PKR {stats.totalInvoiced.toLocaleString()}</h3>
            <span className="text-xs text-neutral-600 mt-2 block">{stats.salesCount} client &amp; agent invoices</span>
          </div>

          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Total Paid / Collected</p>
            <h3 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-emerald-700 break-words">PKR {stats.totalPaid.toLocaleString()}</h3>
            <span className="text-xs text-emerald-600 mt-2 block">{stats.countPaid} Fully Paid</span>
          </div>

          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-1">Unpaid — To Receive</p>
            <h3 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-rose-700 break-words">PKR {stats.totalBalance.toLocaleString()}</h3>
            <span className="text-xs text-rose-700 mt-2 block">{stats.countPartial} Partial | {stats.countUnpaid} Unpaid</span>
          </div>

          <div className="bg-white border border-neutral-200 p-5 rounded-2xl backdrop-blur-md">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Vendor Bills — To Pay</p>
            <h3 className="text-xl sm:text-2xl xl:text-3xl font-extrabold text-neutral-900 break-words">PKR {stats.billsPayable.toLocaleString()}</h3>
            <span className="text-xs text-blue-700 mt-2 block">
              {stats.billsCount} bills, PKR {stats.billsTotal.toLocaleString()} total
            </span>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 p-4 rounded-2xl mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-72">
            <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 text-xl" />
            <input
              type="text"
              placeholder="Search Invoice #, Name, Email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-neutral-900 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-xl text-sm">
              <span className="text-xs font-semibold text-neutral-600">For:</span>
              <select
                value={selectedPartyType}
                onChange={(e) => setSelectedPartyType(e.target.value)}
                className="bg-transparent text-neutral-900 text-sm outline-none cursor-pointer"
              >
                <option value="All" className="bg-white text-neutral-900">Everyone</option>
                {Object.entries(PARTY_TYPES).map(([type, def]) => (
                  <option key={type} value={type} className="bg-white text-neutral-900">{def.plural}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-xl text-sm">
              <MdFilterList className="text-blue-700" />
              <span className="text-xs font-semibold text-neutral-600">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-neutral-900 text-sm outline-none cursor-pointer"
              >
                <option value="All" className="bg-white text-neutral-900">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-white text-neutral-900">{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-xl text-sm">
              <span className="text-xs font-semibold text-neutral-600">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-neutral-900 text-sm outline-none cursor-pointer"
              >
                <option value="All" className="bg-white text-neutral-900">All Statuses</option>
                <option value="Paid" className="bg-white text-emerald-700">Paid</option>
                <option value="Partial" className="bg-white text-amber-700">Partial</option>
                <option value="Unpaid" className="bg-white text-rose-700">Unpaid</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm backdrop-blur-md">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-900 mx-auto mb-4"></div>
              <p className="text-neutral-600">Loading Invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center">
              <MdReceiptLong className="text-6xl text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-neutral-700">No Invoices Found</h3>
              <p className="text-neutral-500 text-sm mt-1 mb-6">
                Create a new invoice to get started.
              </p>
              <button
                onClick={() => handleOpenCreateModal()}
                className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-700 text-white rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                Create Invoice
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-[11px] tracking-wider">
                    <th className="py-4 px-5 font-bold">Invoice #</th>
                    <th className="py-4 px-5 font-bold">Name</th>
                    <th className="py-4 px-5 font-bold">Category</th>
                    <th className="py-4 px-5 font-bold">Generated By</th>
                    <th className="py-4 px-5 font-bold">Date</th>
                    <th className="py-4 px-5 font-bold">Total Amount</th>
                    <th className="py-4 px-5 font-bold">Paid</th>
                    <th className="py-4 px-5 font-bold">Unpaid</th>
                    <th className="py-4 px-5 font-bold">Status</th>
                    <th className="py-4 px-5 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {filteredInvoices.map((inv) => {
                    const { total, paid, balance, status } = invoiceAmounts(inv);
                    const generatedBy = inv.createdByEmail || inv.generatedBy || "Admin";
                    const partyType = partyTypeOf(inv);

                    return (
                      <tr key={inv.id} className="hover:bg-neutral-100 transition">
                        <td className="py-4 px-5 font-mono font-semibold text-blue-700 whitespace-nowrap">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-4 px-5 font-bold text-neutral-900">
                          <div className="flex items-center gap-2">
                            {inv.customerName}
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase border ${partyType === "vendor" ? "bg-blue-500/15 text-blue-700 border-blue-500/30" : partyType === "agent" ? "bg-purple-500/15 text-purple-700 border-purple-500/30" : "bg-white text-neutral-600 border-neutral-200"}`}>
                              {PARTY_TYPES[partyType].label}
                            </span>
                          </div>
                          {inv.customerPhone && (
                            <span className="text-[11px] font-normal text-neutral-600">{inv.customerPhone}</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <span className="px-2.5 py-1 bg-white text-neutral-700 rounded-lg text-xs font-medium border border-neutral-200">
                            {inv.category}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-xs text-neutral-700">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-medium">
                            {generatedBy}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-xs text-neutral-700">
                          {inv.invoiceDate || "-"}
                        </td>
                        <td className="py-4 px-5 font-bold text-neutral-900 whitespace-nowrap">
                          PKR {total.toLocaleString()}
                        </td>
                        <td className="py-4 px-5 text-emerald-700 font-semibold whitespace-nowrap">
                          PKR {paid.toLocaleString()}
                        </td>
                        <td className={`py-4 px-5 font-semibold whitespace-nowrap ${balance > 0 ? "text-rose-700" : "text-neutral-600"}`}>
                          PKR {balance.toLocaleString()}
                        </td>
                        <td className="py-4 px-5">
                          {status === "Paid" && (
                            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-500/30">
                              Paid
                            </span>
                          )}
                          {status === "Partial" && (
                            <span className="px-2.5 py-1 bg-amber-500/20 text-amber-700 text-xs font-bold rounded-lg border border-amber-500/30">
                              Partial
                            </span>
                          )}
                          {status === "Unpaid" && (
                            <span className="px-2.5 py-1 bg-rose-500/20 text-rose-700 text-xs font-bold rounded-lg border border-rose-500/30">
                              Unpaid
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {balance > 0 && (
                              <button
                                onClick={() => setPaymentFor(inv)}
                                className="p-2 rounded-lg bg-indigo-600/10 text-indigo-700 hover:bg-neutral-900 hover:text-white border border-indigo-500/20 transition cursor-pointer"
                                title={copyFor(inv).payVerb}
                              >
                                <MdPayments size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => setPreviewInvoice(inv)}
                              className="p-2 rounded-lg bg-blue-600/10 text-blue-700 hover:bg-neutral-900 hover:text-white border border-blue-500/20 transition cursor-pointer"
                              title="Printable View"
                            >
                              <MdPrint size={18} />
                            </button>
                            <button
                              onClick={() => downloadPDF(inv)}
                              className="p-2 rounded-lg bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-500/20 transition cursor-pointer"
                              title="Download PDF"
                            >
                              <MdDownload size={18} />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(inv)}
                              className="p-2 rounded-lg bg-amber-600/10 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-500/20 transition cursor-pointer"
                              title="Edit"
                            >
                              <MdEdit size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteInvoice(inv.id)}
                              className="p-2 rounded-lg bg-rose-600/10 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-500/20 transition cursor-pointer"
                              title="Delete"
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

      {/* CREATE / EDIT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto">
          <div className="bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-md p-4 sm:p-8 text-neutral-900 relative">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-full bg-white text-neutral-600 hover:text-neutral-900 transition cursor-pointer"
            >
              <MdClose size={20} />
            </button>

            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-1 flex items-center gap-2 pr-10">
              <MdReceiptLong className="text-blue-600" />
              {editingInvoiceId ? "Edit" : "New"} {formData.partyType === "vendor" ? "Vendor Bill" : `${PARTY_TYPES[formData.partyType].label} Invoice`}
            </h2>
            <p className="text-xs text-neutral-600 mb-6">
              {formData.partyType === "vendor"
                ? "A bill from a supplier — RS Travels and Tours owes this amount"
                : "Official Invoice for RS Travels and Tours"}
            </p>

            <form onSubmit={handleSubmitInvoice} className="space-y-4">
              {/* Who the invoice is for */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Invoice For
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-neutral-50 border border-neutral-200 rounded-xl p-1">
                    {Object.entries(PARTY_TYPES).map(([type, def]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handlePartyTypeChange(type)}
                        className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${formData.partyType === type ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}
                      >
                        {def.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Saved {PARTY_TYPES[formData.partyType].label}
                  </label>
                  <select
                    value={formData.partyId}
                    onChange={(e) => handlePartySelect(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  >
                    <option value="">New / type the name below</option>
                    {registeredParties.filter((p) => p.type === formData.partyType).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Invoice Number & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-mono text-blue-700 outline-none focus:border-neutral-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Category / Service Type
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.category === "Custom Service" && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Custom Category Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VIP Helicopter Tour"
                    value={formData.customCategory}
                    onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              )}

              {/* Customer Info */}
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-4">
                <h3 className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                  <MdPerson className="text-blue-700" /> {PARTY_TYPES[formData.partyType].label} Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      {PARTY_TYPES[formData.partyType].label} Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value, partyId: "" })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={formData.customerEmail}
                      onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="0344 0000000"
                      value={formData.customerPhone}
                      onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      placeholder="City, Pakistan"
                      value={formData.customerAddress}
                      onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                    />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {/* Dynamic Line Items */}
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-neutral-700">Particulars &amp; Services</h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20"
                  >
                    <MdAdd /> Add Item
                  </button>
                </div>

                {formData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-neutral-200">
                    <div className="col-span-12 sm:col-span-5">
                      <input
                        type="text"
                        placeholder="Description (e.g. Flight to Dubai / Umrah Visa)"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs text-neutral-900 outline-none"
                        required
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        aria-label="Quantity"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs text-neutral-900 text-center outline-none"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        aria-label="Rate"
                        placeholder="Rate"
                        value={item.rate}
                        onChange={(e) => handleItemChange(index, "rate", e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs text-neutral-900 text-center outline-none"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-center font-bold text-xs text-blue-700 break-words">
                      PKR {Number(item.total || 0).toLocaleString()}
                    </div>
                    <div className="col-span-1 text-right">
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-rose-700 hover:text-rose-800 p-1"
                        >
                          <MdClose size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Price & Payment Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-2xl border border-blue-200">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase mb-1">
                    Total Price (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={formData.totalPrice}
                    onChange={(e) => setFormData({ ...formData, totalPrice: e.target.value })}
                    className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-lg font-bold text-neutral-900 outline-none focus:border-neutral-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-700 uppercase mb-1">
                    {formData.partyType === "vendor" ? "Paid to Vendor Now (PKR)" : "Paid Amount (PKR)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={formData.paidAmount}
                    onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                    className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-lg font-bold text-emerald-700 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              {round2(formData.linkedPaid) > 0 && (
                <div className="flex items-center justify-between text-sm px-2">
                  <span className="text-neutral-600">Later payments recorded against this invoice:</span>
                  <span className="font-bold text-emerald-700">PKR {round2(formData.linkedPaid).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm px-2">
                <span className="text-neutral-600">Balance Remaining:</span>
                <span className="font-bold text-rose-700 text-lg">
                  PKR {Math.max(0, round2(round2(formData.totalPrice) - round2(formData.paidAmount) - round2(formData.linkedPaid))).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    Payment Method
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none"
                  >
                    <option value="Bank Transfer">Bank Transfer / Wire</option>
                    <option value="Cash">Cash Payment</option>
                    <option value="JazzCash / EasyPaisa">JazzCash / EasyPaisa</option>
                    <option value="Credit/Debit Card">Credit / Debit Card</option>
                    <option value="Online Wallet">Online Payment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                    {formData.partyType === "vendor" ? "Paid From Account" : "Received Into Account"}
                  </label>
                  <select
                    value={formData.accountId}
                    onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 outline-none"
                  >
                    <option value="">Unassigned</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Notes &amp; Terms
                </label>
                <textarea
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-xs text-neutral-900 outline-none"
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
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-neutral-900 to-neutral-900 hover:from-neutral-700 hover:to-neutral-700 text-white font-bold transition text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  {isSaving && (
                    <div className="w-4 h-4 border-2 border-neutral-200 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  <span>
                    {isSaving
                      ? editingInvoiceId
                        ? "Updating Invoice..."
                        : "Saving Invoice..."
                      : editingInvoiceId
                      ? "Save Changes"
                      : "Create Invoice"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE PREVIEW MODAL */}
      {previewInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto">
          <div className="bg-white border border-neutral-200 rounded-t-3xl sm:rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-md p-3 sm:p-8 text-slate-900 relative">

            <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-neutral-200">
              <h3 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
                <MdPrint className="text-blue-600" /> Printable Preview
              </h3>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleTriggerPrint}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-bold shadow-md transition cursor-pointer"
                >
                  <MdPrint size={18} /> Print
                </button>
                <button
                  onClick={() => downloadPDF(previewInvoice)}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-md transition cursor-pointer"
                >
                  <MdDownload size={18} /> PDF
                </button>
                <button
                  onClick={() => setPreviewInvoice(null)}
                  className="p-2 rounded-xl bg-white text-neutral-600 hover:text-neutral-900 transition cursor-pointer"
                >
                  <MdClose size={20} />
                </button>
              </div>
            </div>

            <div
              id="invoice-printable-area"
              className="print-sheet bg-white p-4 sm:p-12 rounded-2xl shadow-sm border border-slate-200 text-slate-800 font-sans"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    RS TRAVELS AND TOURS
                  </h1>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mt-0.5">
                    {COMPANY_INFO.subtext}
                  </p>
                  <div className="mt-3 text-xs text-slate-600 space-y-0.5">
                    <p><span className="font-semibold text-slate-700">Address:</span> {COMPANY_INFO.address}</p>
                    <p><span className="font-semibold text-slate-700">Phone:</span> {COMPANY_INFO.phone}</p>
                    <p><span className="font-semibold text-slate-700">Email:</span> {COMPANY_INFO.email}</p>
                  </div>
                </div>

                <div className="mt-4 sm:mt-0 text-left sm:text-right">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-wider">{titleFor(previewInvoice)}</h2>
                  <p className="text-sm font-mono font-bold text-slate-800 mt-1">
                    {previewInvoice.invoiceNumber}
                  </p>
                  <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                    <p><span className="font-semibold text-slate-700">Issue Date:</span> {previewInvoice.invoiceDate || "-"}</p>
                    <p><span className="font-semibold text-slate-700">Due Date:</span> {previewInvoice.dueDate || "-"}</p>
                    <p><span className="font-semibold text-slate-700">Generated By:</span> {previewInvoice.createdByEmail || previewInvoice.generatedBy || "Admin"}</p>
                  </div>
                </div>
              </div>

              <div className="avoid-break grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 mb-6">
                <div>
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
                    {copyFor(previewInvoice).billed}:
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">{previewInvoice.customerName}</h3>
                  {previewInvoice.customerEmail && (
                    <p className="text-xs text-slate-600 mt-0.5">Email: {previewInvoice.customerEmail}</p>
                  )}
                  {previewInvoice.customerPhone && (
                    <p className="text-xs text-slate-600">Phone: {previewInvoice.customerPhone}</p>
                  )}
                  {previewInvoice.customerAddress && (
                    <p className="text-xs text-slate-600">Address: {previewInvoice.customerAddress}</p>
                  )}
                </div>

                <div className="sm:text-right flex flex-col justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
                      Service Category
                    </p>
                    <span className="inline-block px-3 py-1 bg-slate-200 text-slate-900 font-semibold text-xs rounded-md">
                      {previewInvoice.category}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
                      Payment Status
                    </p>
                    {preview.status === "Paid" && (
                      <span className="inline-block px-4 py-1 bg-emerald-700 text-white font-extrabold text-xs rounded uppercase tracking-wider">
                        PAID IN FULL
                      </span>
                    )}
                    {preview.status === "Partial" && (
                      <span className="inline-block px-4 py-1 bg-amber-600 text-white font-extrabold text-xs rounded uppercase tracking-wider">
                        PARTIALLY PAID
                      </span>
                    )}
                    {preview.status === "Unpaid" && (
                      <span className="inline-block px-4 py-1 bg-rose-700 text-white font-extrabold text-xs rounded uppercase tracking-wider">
                        UNPAID
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[480px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-neutral-900 text-white uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 font-bold">#</th>
                      <th className="py-3 px-4 font-bold">Description</th>
                      <th className="py-3 px-4 font-bold text-center">Qty</th>
                      <th className="py-3 px-4 font-bold text-right">Rate</th>
                      <th className="py-3 px-4 font-bold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewInvoice.items && previewInvoice.items.length > 0 ? (
                      previewInvoice.items.map((it, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                          <td className="py-3 px-4 font-mono font-semibold text-neutral-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{it.description || previewInvoice.category}</td>
                          <td className="py-3 px-4 text-center font-medium text-slate-700">{it.quantity || 1}</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-700">PKR {Number(it.rate || 0).toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">PKR {Number(it.total || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-3 px-4 font-mono font-semibold text-neutral-500">1</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{previewInvoice.category}</td>
                        <td className="py-3 px-4 text-center font-medium text-slate-700">1</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">PKR {Number(previewInvoice.totalPrice).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">PKR {Number(previewInvoice.totalPrice).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="avoid-break flex flex-col sm:flex-row justify-between items-start gap-6 border-t border-slate-200 pt-6">
                <div className="max-w-md text-xs text-slate-600">
                  <h4 className="font-bold text-slate-900 mb-1">Payment Instructions:</h4>
                  <p>Method: <span className="font-semibold text-slate-800">{previewInvoice.paymentMethod || "Bank Transfer"}</span></p>
                  <p className="mt-1 font-medium">{previewInvoice.notes}</p>
                </div>

                <div className="w-full sm:w-80 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Price:</span>
                    <span className="font-bold text-slate-900">PKR {preview.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>{copyFor(previewInvoice).paid}:</span>
                    <span className="font-bold text-emerald-700">PKR {preview.paid.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-extrabold">
                    <span className="text-slate-900">{copyFor(previewInvoice).due}:</span>
                    <span className={preview.balance > 0 ? "text-red-600" : "text-emerald-700"}>
                      PKR {preview.balance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="avoid-break mt-12 pt-6 border-t border-slate-200 flex justify-between items-end gap-6 text-xs text-neutral-500">
                <div>
                  <p className="font-semibold text-slate-700">{COMPANY_INFO.name}</p>
                  <p>Thank you for choosing RS Travels and Tours!</p>
                </div>
                <div className="text-center">
                  <div className="w-36 border-b border-slate-400 mb-1"></div>
                  <p className="font-semibold text-slate-600">Authorized Signature</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* RECORD A PAYMENT AGAINST AN INVOICE */}
      {paymentFor && (
        <TransactionForm
          preset={{
            type: isPurchase(paymentFor) ? "payment" : "receipt",
            partyId: partyOfInvoice(paymentFor)?.id,
            invoiceId: paymentFor.id,
            amount: invoiceAmounts(paymentFor).balance,
            accountId: accounts.some((a) => a.id === paymentFor.accountId) ? paymentFor.accountId : undefined,
          }}
          types={["receipt", "payment"]}
          parties={parties}
          accounts={accounts}
          onClose={() => setPaymentFor(null)}
        />
      )}

      <Footer />
    </div>
  );
}
