import { useEffect, useMemo, useState, useRef, memo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import {
    FaUserTie,
    FaSearch,
    FaPlane,
    FaPassport,
    FaKaaba,
    FaDownload,
    FaTimes,
    FaCalendarAlt,
    FaChevronDown,
    FaEye, // Icon for the view details button
} from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import AdminLayout from "../Components/AdminLayout";
import toast from "react-hot-toast";
import EmployeeBookingsLeaderboard from "../Components/BookingsStats";
import jsPDF from "jspdf";
import "jspdf-autotable"; // optional if you want tables
import TicketingStates from "../Components/TicketingStates";

function toISODate(item) {
    if (!item) return null;

    // NEW: For tickets, always prioritize the creation date for sorting/grouping.
    if (item.__type === 'ticket' && item.createdAt) {
        if (item.createdAt.toDate) {
            return item.createdAt.toDate().toISOString().slice(0, 10);
        }
        if (item.createdAt.seconds) {
            return new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10);
        }
        if (typeof item.createdAt === "string") {
            try {
                return new Date(item.createdAt).toISOString().slice(0, 10);
            } catch {
                // Fallback if string is invalid
            }
        }
    }

    // --- Original logic for other record types or as a fallback ---
    if (item.date && typeof item.date === "string") {
        // already "YYYY-MM-DD"
        return item.date;
    }
    if (item.departure && typeof item.departure === "string") {
        return item.departure.slice(0, 10);
    }
    if (item.createdAt) {
        if (typeof item.createdAt === "string") {
            try {
                return new Date(item.createdAt).toISOString().slice(0, 10);
            } catch {
                return null;
            }
        }
        if (item.createdAt.toDate) {
            return item.createdAt.toDate().toISOString().slice(0, 10);
        }
        if (item.createdAt.seconds) {
            return new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10);
        }
    }
    return null;
}

const exportToPDF = (filename, rows) => {
    if (!rows || rows.length === 0) return;

    const doc = new jsPDF("p", "pt"); // portrait, points
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const rowHeight = 35; // increased for multi-line clarity
    let y = 60;

    // Title
    doc.setFontSize(18);
    doc.setFont("times", "bold");
    doc.text("Employee Report", pageWidth / 2, 30, { align: "center" });

    const formatMoney = (val) =>
        typeof val === "number" ? val.toFixed(2) : val === "-" ? "-" : "0.00";

    const getColumns = (type) => {
        if (type === "ticket") {
            return [
                { key: "No", header: "#" },
                { key: "FullName", header: "Full Name" },
                { key: "From", header: "From" },
                { key: "To", header: "To" },
                { key: "Date", header: "Date" },
                { key: "Vendor", header: "Vendor" },
                { key: "Payable", header: "Payable" },
                { key: "Received", header: "Received" },
                { key: "Remaining", header: "Remaining" },
                { key: "Profit", header: "Profit" },
            ];
        } else {
            return [
                { key: "No", header: "#" },
                { key: "FullName", header: "Full Name" },
                { key: "Passport", header: "Passport" },
                { key: "Phone", header: "Phone" },
                { key: "Date", header: "Date" },
                { key: "Country", header: "Country" },
                { key: "Payable", header: "Payable" },
                { key: "Received", header: "Received" },
                { key: "Remaining", header: "Remaining" },
                { key: "Profit", header: "Profit" },
                { key: "EmbassyFee", header: "Embassy Fee" },
            ];
        }
    };

    const drawTable = (columns, dataRows) => {
        const colWidth = (pageWidth - margin * 2) / columns.length;

        // Header
        doc.setFontSize(10);
        doc.setFont("times", "bold");
        let x = margin;
        columns.forEach((col) => {
            doc.setFillColor(200, 200, 200);
            doc.rect(x, y, colWidth, rowHeight, "F"); // filled header
            doc.setDrawColor(0); // black border
            doc.setLineWidth(1);
            doc.rect(x, y, colWidth, rowHeight); // border
            doc.setTextColor(0, 0, 0);
            doc.text(col.header, x + 2, y + 17, { maxWidth: colWidth - 4 });
            x += colWidth;
        });
        y += rowHeight;

        // Data
        doc.setFont("times", "normal");
        dataRows.forEach((row, rowIndex) => {
            x = margin;

            // Alternate row color
            if (rowIndex % 2 === 0) {
                doc.setFillColor(245, 245, 245);
                doc.rect(margin, y, pageWidth - margin * 2, rowHeight, "F");
            }

            columns.forEach((col) => {
                doc.setDrawColor(0);
                doc.setLineWidth(0.8);
                doc.rect(x, y, colWidth, rowHeight); // border

                let text = row[col.key];
                if (col.key === "No") text = rowIndex + 1;
                if (["Payable", "Received", "Remaining", "Profit", "EmbassyFee"].includes(col.key)) {
                    text = formatMoney(text);
                    doc.text(text, x + colWidth - 2, y + 17, { align: "right", maxWidth: colWidth - 4 });
                } else if (col.key === "FullName") {
                    const splitName = doc.splitTextToSize(String(text ?? ""), colWidth - 4);
                    doc.text(splitName.slice(0, 2), x + 2, y + 17); // max 2 lines
                } else {
                    doc.text(String(text ?? ""), x + 2, y + 17, { maxWidth: colWidth - 4 });
                }
                x += colWidth;
            });

            y += rowHeight;

            // Add new page if overflow
            if (y + rowHeight > pageHeight - margin) {
                doc.addPage();
                y = 60;

                // Redraw header
                x = margin;
                columns.forEach((col) => {
                    doc.setFillColor(200, 200, 200);
                    doc.rect(x, y, colWidth, rowHeight, "F");
                    doc.setDrawColor(0);
                    doc.setLineWidth(1);
                    doc.rect(x, y, colWidth, rowHeight);
                    doc.setTextColor(0, 0, 0);
                    doc.setFont("times", "bold");
                    doc.text(col.header, x + 2, y + 17, { maxWidth: colWidth - 4 });
                    x += colWidth;
                });
                y += rowHeight;
                doc.setFont("times", "normal");
            }
        });
    };

    const ticketRows = rows.filter((r) => r.__type === "ticket");
    const otherRows = rows.filter((r) => r.__type !== "ticket");

    if (ticketRows.length > 0) drawTable(getColumns("ticket"), ticketRows);
    if (otherRows.length > 0) {
        if (ticketRows.length > 0) doc.addPage();
        drawTable(getColumns("other"), otherRows);
    }

    doc.save(filename);
};


// CSV export utility (array of objects)
function exportToCSV(filename, rows) {
    if (!rows || rows.length === 0) {
        toast.error("No rows to export");
        return;
    }
    try {
        const headers = Object.keys(
            rows.reduce((acc, r) => ({ ...acc, ...r }), {})
        );
        const csv = [
            headers.join(","),
            ...rows.map((r) =>
                headers
                    .map((h) => {
                        const val = r[h] == null ? "" : String(r[h]);
                        return `"${val.replace(/"/g, '""')}"`;
                    })
                    .join(",")
            ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success("Export started");
    } catch (err) {
        console.error("CSV export failed", err);
        toast.error("Export failed");
    }
}

/* ------------------------------- Component ------------------------------- */

export default function EmployeeRecord() {
    const [groupedByEmail, setGroupedByEmail] = useState({});

    // UI state
    const [globalSearch, setGlobalSearch] = useState("");
    const [selectedEmployee, setSelectedEmployee] = useState(null); // email string
    const [showOnlyWithRecords, setShowOnlyWithRecords] = useState(false);
    const [modalRecord, setModalRecord] = useState(null); // <-- NEW: State for the details modal
    const detailsRef = useRef(null);

    useEffect(() => {
        if (selectedEmployee && detailsRef.current) {
            detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [selectedEmployee]);

    // Fetch all records with aggressive caching
    const fetchOptions = { staleTime: 1000 * 30 }; // 5 mins memory cache
    
    const { data: visaData = [], isLoading: loadingVisas } = useQuery({ 
        queryKey: ['all-visas'], 
        queryFn: () => dataService.fetchAll('bookings'), 
        ...fetchOptions 
    });
    
    const { data: ticketData = [], isLoading: loadingTickets } = useQuery({ 
        queryKey: ['all-tickets'], 
        queryFn: () => dataService.fetchAll('ticketBookings'), 
        ...fetchOptions 
    });
    
    const { data: umrahData = [], isLoading: loadingUmrah } = useQuery({ 
        queryKey: ['all-umrah'], 
        queryFn: () => dataService.fetchAll('ummrahBookings'), 
        ...fetchOptions 
    });

    const loading = loadingVisas || loadingTickets || loadingUmrah;

    useEffect(() => {
        const grouped = {};
        const all = [
            ...visaData.map(d => ({ ...d, __type: 'visa' })),
            ...ticketData.map(d => ({ ...d, __type: 'ticket' })),
            ...umrahData.map(d => ({ ...d, __type: 'umrah' }))
        ];

        for (const item of all) {
            const email = (item.userEmail || item.createdByEmail || "unknown@os.com").toLowerCase();
            if (!grouped[email]) grouped[email] = { visa: [], ticket: [], umrah: [] };
            
            if (item.__type === "visa") grouped[email].visa.push(item);
            else if (item.__type === "ticket") grouped[email].ticket.push(item);
            else grouped[email].umrah.push(item);
        }

        setGroupedByEmail(grouped);
    }, [visaData, ticketData, umrahData]);

    // derived employees list (sorted by total records desc)
    const employeeEntries = useMemo(() => {
        const arr = Object.entries(groupedByEmail).map(([email, data]) => {
            const counts = {
                visa: (data.visa || []).length,
                ticket: (data.ticket || []).length,
                umrah: (data.umrah || []).length,

            };
            return {
                email,
                data,
                counts,
                total: counts.visa + counts.ticket + counts.umrah,
            };
        });
        arr.sort((a, b) => b.total - a.total || a.email.localeCompare(b.email));
        return arr;
    }, [groupedByEmail]);

    const filteredEmployees = useMemo(() => {
        const q = globalSearch.trim().toLowerCase();
        return employeeEntries.filter((e) => {
            if (showOnlyWithRecords && e.total === 0) return false;
            if (!q) return true;
            return e.email.includes(q);
        });
    }, [employeeEntries, globalSearch, showOnlyWithRecords]);


    return (
        <AdminLayout>
            <main className="max-w-7xl w-full mx-auto p-6 flex-1 text-neutral-900 relative z-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-extrabold text-neutral-900">
                            Employee Records
                        </h1>
                        <p className="text-sm text-neutral-600 mt-1">
                            Overview of handlers & their bookings — Visa / Ticket / Umrah.
                        </p>
                    </div>

                    <div className="flex gap-3 items-center w-full md:w-auto">
                        <div className="relative w-full md:w-80">
                            <FaSearch className="absolute left-3 top-3.5 text-neutral-500" />
                            <input
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                placeholder="Search by employee email..."
                                className="w-full pl-10 pr-4 py-3 rounded-xl shadow-inner bg-white text-neutral-900 border border-neutral-200 focus:border-neutral-900 outline-none transition"
                            />
                        </div>

                        <button
                            onClick={() => {
                                setShowOnlyWithRecords((s) => !s);
                            }}
                            className={`px-4 py-3 rounded-xl text-sm font-medium shadow-sm transition ${showOnlyWithRecords
                                ? "bg-neutral-900 text-white transform"
                                : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 transform"
                                }`}
                            title="Toggle: show only employees with at least one record"
                        >
                            {showOnlyWithRecords ? "With records" : "All employees"}
                        </button>
                    </div>
                </div>

                {/* Quick totals row */}
                <TotalsRow employees={employeeEntries} />

                {/* Grid */}
                <section className="mt-8 animate-fade-in-up">
                    {loading ? (
                        <div className="text-center py-12 text-neutral-500">
                            Loading employees…
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {filteredEmployees.length === 0 ? (
                                    <div className="col-span-full p-6 bg-white rounded-xl shadow text-center">
                                        <div className="text-neutral-600">No employees found.</div>
                                    </div>
                                ) : (
                                    filteredEmployees.map(
                                        ({ email, data, counts, total }, index) => (
                                            <EmployeeCard
                                                key={email}
                                                email={email}
                                                counts={counts}
                                                _ total={total}
                                                expanded={selectedEmployee === email}
                                                onToggle={() =>
                                                    setSelectedEmployee((prev) =>
                                                        prev === email ? null : email
                                                    )
                                                }
                                            />
                                        )
                                    )
                                )}
                            </div>

                            {/* Expanded details panel - render below grid */}
                            {selectedEmployee && groupedByEmail[selectedEmployee] && (
                                <div ref={detailsRef} className="mt-8">
                                    <div className="bg-white rounded-2xl shadow-md p-6 animate-fade-in-up">
                                        <EmployeeDetails
                                            emp={groupedByEmail[selectedEmployee]}
                                            email={selectedEmployee}
                                            onClose={() => setSelectedEmployee(null)}
                                            onRecordSelect={setModalRecord} // <-- Pass setter to details panel
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>

            {/* NEW: Render the modal conditionally */}
            {modalRecord && (
                <RecordDetailModal
                    record={modalRecord}
                    onClose={() => setModalRecord(null)}
                />
            )}
        </AdminLayout>
    );
}

/* ------------------------------- Totals Row ------------------------------- */

function TotalsRow({ employees = [] }) {
    const totals = employees.reduce(
        (acc, e) => {
            acc.visa += e.counts.visa;
            acc.ticket += e.counts.ticket;
            acc.umrah += e.counts.umrah;
            acc.handlers += e.total > 0 ? 1 : 0;
            return acc;
        },
        { visa: 0, ticket: 0, umrah: 0, handlers: 0 }
    );

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-6 shadow-md flex items-center justify-between transform transition">
                    <div>
                        <div className="text-xs uppercase text-neutral-600">Handlers</div>
                        <div className="text-3xl font-bold text-neutral-900 mt-1">
                            {employees.length}
                        </div>
                        <div className="text-sm text-neutral-500">Total employees listed</div>
                    </div>
                    <div className="text-4xl text-purple-700">👥</div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md flex items-center justify-between transform transition">
                    <div>
                        <div className="text-xs uppercase text-neutral-600">Bookings (all)</div>
                        <div className="text-3xl font-bold text-neutral-900 mt-1">
                            {totals.visa + totals.ticket + totals.umrah}
                        </div>
                        <div className="text-sm text-neutral-500">
                            {totals.visa} visas • {totals.ticket} tickets • {totals.umrah} umrah
                        </div>
                    </div>
                    <div className="text-4xl text-sky-700">📊</div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md flex items-center justify-between transform transition">
                    <div>
                        <div className="text-xs uppercase text-neutral-600">Active handlers</div>
                        <div className="text-3xl font-bold text-neutral-900 mt-1">
                            {totals.handlers}
                        </div>
                        <div className="text-sm text-neutral-500">
                            Have at least 1 booking
                        </div>
                    </div>
                    <div className="text-4xl text-pink-700">⚡</div>
                </div>

            </div>
            <div className="mt-5">
                <EmployeeBookingsLeaderboard />
                <TicketingStates />
            </div>
        </>
    );
}

/* ------------------------------- Employee Card ------------------------------- */

function EmployeeCard({ email, counts = {}, total = 0, expanded = false, onToggle }) {
    return (
        <div
            onClick={onToggle}
            className={`rounded-2xl p-6 cursor-pointer transform transition-all duration-300 ease-in-out ${expanded
                ? "ring-4 ring-purple-500 bg-neutral-100"
                : "bg-white shadow-md hover:shadow-xl"
                }`}
        >
            <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-lg bg-neutral-100 flex items-center justify-center text-2xl text-purple-400">
                    <FaUserTie />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-md font-semibold truncate text-neutral-900">
                            {email}
                        </div>
                        <div className="text-xs text-neutral-600">{total} records</div>

                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-2 bg-neutral-100 px-2 py-1 rounded-full">
                            <FaPassport className="text-blue-700" />
                            <div className="font-medium text-blue-700">{counts.visa}</div>
                            <div className="text-neutral-600">Visas</div>
                        </div>

                        <div className="flex items-center gap-2 bg-neutral-100 px-2 py-1 rounded-full">
                            <FaPlane className="text-purple-700" />
                            <div className="font-medium text-purple-700">{counts.ticket}</div>
                            <div className="text-neutral-600">Tickets</div>
                        </div>

                        <div className="flex items-center gap-2 bg-amber-50 px-2 py-1 rounded-full">
                            <FaKaaba className="text-amber-700" />
                            <div className="font-medium text-amber-700">{counts.umrah}</div>
                            <div className="text-neutral-600">Umrah</div>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                        <div className="text-xs text-neutral-500">Click to expand</div>
                        <div
                            className={`text-sm transform transition-transform duration-300 ${expanded ? "rotate-180 text-purple-700" : "text-neutral-500"
                                }`}
                        >
                            <FaChevronDown />
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}

/* ++++++++++++++++ NEW HELPER COMPONENT ++++++++++++++++ */
// Helper component for the new summary row
function StatBox({ label, value, icon, color = "text-neutral-900" }) {
    return (
        <div className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-inner">
            <div className={`text-3xl ${color}`}>{icon}</div>
            <div>
                <div className="text-xs uppercase text-neutral-600">{label}</div>
                <div className="text-lg font-bold text-neutral-900">{value}</div>
            </div>
        </div>
    );
}
/* ++++++++++++++++++++++++++++++++++++++++++++++++++++++ */


/* ------------------------------- Employee Details (big) ------------------------------- */

function EmployeeDetails({ emp = { visa: [], ticket: [], umrah: [] }, email, onClose, onRecordSelect }) {
    const [tab, setTab] = useState("visa");
    const [localSearch, setLocalSearch] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [groupByDateView, setGroupByDateView] = useState(true);
    const [displayLimit, setDisplayLimit] = useState(20);

    // Reset limit when filters change
    useEffect(() => {
        setDisplayLimit(20);
    }, [tab, localSearch, startDate, endDate]);

    const lists = {
        visa: emp.visa || [],
        ticket: emp.ticket || [],
        umrah: emp.umrah || [],
    };

    const filteredRecords = useMemo(() => {
        const list = lists[tab] || [];
        const q = localSearch.trim().toLowerCase();

        return list
            .filter((item) => {
                const text = (
                    (item.fullName || "") +
                    " " +
                    (item.passenger?.fullName || "") +
                    " " +
                    (item.passport || item.passportNumber || "") +
                    " " +
                    (item.country || "") + " " + (item.to || "") + " " + (item.from || "") +
                    " " + (item.vendor || "") + " " + (item.pnr || "") + " " + (item.phone || "")
                ).toLowerCase();
                if (q && !text.includes(q)) return false;
                const dateStr = toISODate(item);
                if (!dateStr) {
                    // If no date, only include if no date filters are set
                    return !startDate && !endDate;
                }
                if (startDate && dateStr < startDate) return false;
                if (endDate && dateStr > endDate) return false;
                return true;
            })
            .sort((a, b) => {
                const da = toISODate(a) || "";
                const db = toISODate(b) || "";
                if (da === db) {
                    const ta = a.createdAt?.seconds || (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
                    const tb = b.createdAt?.seconds || (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
                    return tb - ta;
                }
                return db.localeCompare(da);
            });
    }, [lists, tab, localSearch, startDate, endDate]);

    // --- NEW: CALCULATE SUMMARY FOR FILTERED RECORDS ---
    const filteredSummary = useMemo(() => {
        return filteredRecords.reduce(
            (acc, r) => {
                const { received, profit } = getFinancials(r);

                // Add to totals
                acc.totalReceived += isNaN(received) ? 0 : received;

                // Handle profit which might be a string like "Not entered"
                let numericProfit = parseFloat(profit);
                if (!isNaN(numericProfit)) {
                    // Refunded tickets: deduct the payable from profit (owner's rule).
                    if (r.refunded) numericProfit -= Number(r.payable) || 0;
                    acc.totalProfit += numericProfit;
                }

                // Increment counts (only for the current tab)
                if (r.__type === "visa") acc.countVisa += 1;
                else if (r.__type === "ticket") acc.countTicket += 1;
                else if (r.__type === "umrah") acc.countUmrah += 1;

                return acc;
            },
            {
                totalReceived: 0,
                totalProfit: 0,
                countVisa: 0,
                countTicket: 0,
                countUmrah: 0,
            }
        );
    }, [filteredRecords]); // Re-calculates whenever filters change
    // --- END OF NEW SUMMARY CALCULATION ---

    const totals = useMemo(() => {
        const totalFiltered = filteredRecords.length;
        const totalAll = (lists[tab] || []).length;
        return { totalFiltered, totalAll };
    }, [filteredRecords, lists, tab]);

    const handleExportFiltered = () => {
        const rows = filteredRecords.map((r) => ({
            id: r.id || "",
            fullName: r.fullName || r.passenger?.fullName || "",
            passport: r.passport || r.passportNumber || "",
            phone: r.phone || "",
            email: r.email || r.userEmail || r.createdByEmail || "",
            type: tab,
            date: toISODate(r) || "",
            country: r.country || r.to || "",
            from: r.from || "",
            to: r.to || "",
            payable: r.payable || r.totalFee || r.price || "",
            received: r.receivedFee || "",
            status: r.status || r.paymentStatus || r.visaStatus || "",
            vendor: r.vendor || r.airlinePref || "",

        }));
        exportToCSV(
            `${email}_${tab}_export_${new Date().toISOString().slice(0, 10)}.csv`,
            rows
        );
    };

    const handleClearDates = () => {
        setStartDate("");
        setEndDate("");
    };
    const handleExportPDF = () => {
        if (!filteredRecords || filteredRecords.length === 0) {
            toast.error("No records to export");
            return;
        }

        const rows = filteredRecords.map((r) => {
            const { payable, received, remaining, profit, embassyFee } = getFinancials(r);
            return {
                __type: r.__type, // <-- Add type for PDF logic
                FullName: r.fullName || r.passenger?.fullName || "",
                Passport: r.passport || r.passportNumber || "",
                Phone: r.phone || "",
                Email: r.email || r.userEmail || r.createdByEmail || "",
                Type: r.__type || "",
                Date: toISODate(r) || "",
                Country: r.country || r.to || "",
                From: r.from || "",
                To: r.to || "",
                Payable: isNaN(payable) ? 0 : payable,
                Received: isNaN(received) ? 0 : received,
                Remaining: remaining === "-" ? "-" : isNaN(remaining) ? 0 : remaining,
                Status: r.status || r.paymentStatus || r.visaStatus || "",
                Vendor: r.vendor || r.airlinePref || "",
                EmbassyFee: typeof embassyFee === "number" ? embassyFee : "-",
                Profit: isNaN(profit) ? 0 : profit,
            };
        });

        exportToPDF(
            `${email}_${tab}_export_${new Date().toISOString().slice(0, 10)}.pdf`,
            rows
        );
    };


    return (
        <div>
            {/* header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-neutral-900">Records for</h2>
                        <div className="text-neutral-900 font-semibold truncate text-lg">
                            {email}
                        </div>
                        <button onClick={onClose} title="Close panel" className="ml-3 text-lg text-neutral-500 hover:text-neutral-900 transition">
                            <FaTimes />
                        </button>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                        Tab: {tab.toUpperCase()}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                    <div className="text-sm text-neutral-600 mr-2">
                        <div>
                            Showing <span className="font-semibold text-neutral-900">{totals.totalFiltered}</span> of <span className="text-neutral-500">{totals.totalAll}</span> {tab} records
                        </div>
                        <div className="text-xs text-neutral-500">
                            Use search/date filters to narrow results
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {["visa", "ticket", "umrah"].map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === t
                            ? "bg-neutral-900 text-white shadow-md transform scale-105"
                            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                            }`}
                    >
                        {t.toUpperCase()} <span className="ml-2 text-xs text-neutral-500">({(lists[t] || []).length})</span>
                    </button>
                ))}
            </div>

            {/* --- NEW SUMMARY ROW --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-white p-4 rounded-lg">
                <StatBox
                    label="Filtered Bookings (Current Tab)"
                    value={
                        tab === 'visa' ? `${filteredSummary.countVisa} Visa` :
                            tab === 'ticket' ? `${filteredSummary.countTicket} Ticket` :
                                `${filteredSummary.countUmrah} Umrah`
                    }
                    icon={<FaPassport />}
                    color="text-purple-700"
                />
                <StatBox
                    label="Total Received (Filtered)"
                    value={`PKR ${filteredSummary.totalReceived.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}`}
                    icon={<FaDownload />}
                    color="text-green-700"
                />
                <StatBox
                    label="Total Profit (Filtered)"
                    value={`PKR ${filteredSummary.totalProfit.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}`}
                    icon={<FaPlane />}
                    color="text-yellow-700"
                />
            </div>
            {/* --- END NEW SUMMARY ROW --- */}


            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[220px]">
                    <FaSearch className="absolute left-3 top-3.5 text-neutral-500" />
                    <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="Search inside this employee..." className="w-full pl-10 pr-3 py-3 rounded-xl border text-sm shadow-inner outline-none bg-white text-neutral-900 border-neutral-200 focus:ring-2 focus:ring-neutral-300" />
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-600"><FaCalendarAlt className="text-neutral-900" /><span className="text-xs">From</span></label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-gray-100 text-gray-700 border-neutral-200" />
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-600"><FaCalendarAlt className="text-neutral-900" /><span className="text-xs">To</span></label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-gray-100 text-gray-700 border-neutral-200" />
                </div>
                <div className="flex items-center gap-2">
                    {startDate || endDate ? (
                        <button onClick={handleClearDates} className="px-3 py-2 rounded-lg bg-neutral-100 text-neutral-700 border border-neutral-200 text-sm shadow-sm hover:bg-neutral-200 transition" title="Clear date filters">
                            Clear
                        </button>
                    ) : null}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <label className="text-sm text-neutral-600 mr-2">View:</label>
                    <button onClick={() => setGroupByDateView((s) => !s)} className="px-3 py-2 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-700 text-sm shadow-sm hover:bg-neutral-200 transition" title="Toggle grouped / flat">
                        {groupByDateView ? "Grouped by date" : "Flat list"}
                    </button>
                </div>
            </div>

            {/* Records area */}
            <div className="space-y-4">
                {groupByDateView ? (
                    groupedFilteredView(filteredRecords.slice(0, displayLimit), onRecordSelect)
                ) : (
                    <FlatList records={filteredRecords.slice(0, displayLimit)} tab={tab} onViewDetails={onRecordSelect} />
                )}
                
                {displayLimit < filteredRecords.length && (
                    <div className="text-center pt-4">
                        <button 
                            onClick={() => setDisplayLimit(prev => prev + 20)}
                            className="px-6 py-2 bg-neutral-900 hover:bg-neutral-700 text-white rounded-full font-semibold transition"
                        >
                            Load More
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ------------------------------- Grouped view helper ------------------------------- */

function groupedFilteredView(list, onViewDetails) {
    const map = {};
    for (const item of list) {
        const date = toISODate(item) || "No date";
        if (!map[date]) map[date] = [];
        map[date].push(item);
    }

    const keys = Object.keys(map).sort((a, b) => {
        if (a === "No date") return 1;
        if (b === "No date") return -1;
        return b.localeCompare(a);
    });

    return (
        <>
            {keys.map((dateKey) => {
                const items = map[dateKey];
                if (!items || items.length === 0) return null;

                return (
                    <div key={dateKey} className="bg-white rounded-lg p-4 border border-neutral-200">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-md font-semibold text-neutral-900">
                                {dateKey === "No date" ? "No date available" : dateKey}
                            </div>
                            <div className="text-xs text-neutral-500">
                                {items.length} record{items.length !== 1 ? "s" : ""}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {items.map((r, index) => (
                                <RecordCard key={r.id || index} r={r} onViewDetails={onViewDetails} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </>
    );
}

/* ------------------------------- Flat List ------------------------------- */

function FlatList({ records, tab, onViewDetails }) {
    if (!records || records.length === 0) {
        return <div className="text-center py-8 text-neutral-500">No records found</div>;
    }
    return (
        <div className="space-y-3">
            {records.map((r, index) => (
                <RecordCard key={r.id || index} r={r} onViewDetails={onViewDetails} />
            ))}
        </div>
    );
}

/* ------------------------------- Single Record Card (UPDATED) ------------------------------- */
function getFinancials(r) {
    let payable = 0, received = 0, remaining = 0, profit = 0, embassyFee = '-', vendorFee = 0;

    const parseNum = (val) => {
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
    };

    switch (r.__type) {
        case 'visa':
            payable = parseNum(r.totalFee || r.payable);
            received = parseNum(r.receivedFee);
            remaining = parseNum(r.remainingFee ?? (payable - received));
            embassyFee = typeof r.embassyFee === 'number' ? r.embassyFee : 'Not entered';
            vendorFee = typeof r.vendorFee === 'number' ? r.vendorFee : '-';
            
            const eFee = parseNum(r.embassyFee);
            const vFee = parseNum(r.vendorFee);
            profit = typeof r.profit === 'number' && !isNaN(r.profit) 
                ? r.profit 
                : (payable - eFee - vFee);
            break;

        case 'ticket':
            payable = parseNum(r.payable);
            received = parseNum(r.price);
            remaining = 0; // Tickets often don't have remaining
            profit = typeof r.profit === 'number' && !isNaN(r.profit) ? r.profit : (received - payable);
            embassyFee = '-';
            break;

        case 'umrah':
            payable = parseNum(r.payable);
            received = parseNum(r.received);
            remaining = "-";
            profit = typeof r.profit === 'number' && !isNaN(r.profit) ? r.profit : (payable - received);
            embassyFee = '-';
            break;

        default:
            payable = parseNum(r.payable || r.totalFee || r.price);
            received = parseNum(r.receivedFee || r.received);
            remaining = parseNum(r.remainingFee ?? (payable - received));
            embassyFee = r.embassyFee || '-';
            profit = typeof r.profit === 'number' && !isNaN(r.profit) ? r.profit : (payable - parseNum(r.embassyFee) - parseNum(r.vendorFee));
    }

    // Ensure outputs are clean
    profit = isNaN(profit) ? (typeof profit === 'string' ? profit : 0) : profit;

    return { payable, received, remaining, profit, embassyFee };
}
const RecordCard = memo(({ r, onViewDetails }) => {
    const { payable, received, remaining, profit, embassyFee } = getFinancials(r);

    const formatNum = (val) => {
        if (typeof val === 'number') return val.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return val; // Return strings like 'Not entered' or '-' as is
    }

    return (
        <div className="bg-white rounded-lg p-4 border border-neutral-200 shadow-sm hover:border-purple-500 transition-all duration-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                {/* Left side: Passenger Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-sm font-semibold text-neutral-900 truncate">
                            {r.fullName || r.passenger?.fullName || "—"}
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700 border border-neutral-200">
                            {r.passport || r.passportNumber || "—"}
                        </span>
                        <span className="text-xs text-neutral-600">
                            {r.country || r.to || "—"}
                        </span>
                    </div>

                    <div className="mt-2 text-xs flex items-center gap-3 text-neutral-600">
                        <span><FaPlane className="inline mr-1 text-purple-700" /> {r.visaType || r.__type}</span>
                        {r.date && <span>Applied: {r.date}</span>}
                    </div>

                    {/* Status & Employee info */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {r.visaStatus && (
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-bold ${r.visaStatus === "Approved" ? "bg-green-500/20 text-green-700 border border-green-500/30" :
                                    r.visaStatus === "Rejected" ? "bg-red-500/20 text-red-700 border border-red-500/30" :
                                        "bg-yellow-500/20 text-yellow-700 border border-yellow-500/30"
                                }`}>
                                {r.visaStatus}
                            </span>
                        )}
                        {(r.paymentStatus || r.status) && (
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-bold ${r.paymentStatus === "Paid" ? "bg-sky-500/20 text-sky-700 border border-sky-500/30" :
                                    "bg-orange-500/20 text-orange-700 border border-orange-500/30"
                                }`}>
                                {r.paymentStatus || r.status}
                            </span>
                        )}
                        <span className="text-[10px] text-neutral-500 italic ml-2">
                            Handled by: {r.createdByName || r.createdByEmail?.split('@')[0] || "Unknown"}
                        </span>
                    </div>
                </div>

                {/* Right side: Financials & Actions */}
                <div className="flex w-full sm:w-auto">
                    <div className="flex flex-wrap justify-start sm:justify-center items-center gap-4 text-center mr-4 flex-1">
                        <div>
                            <div className="text-xs text-neutral-500">Payment</div>
                            <div className="font-semibold text-neutral-900 text-lg">{formatNum(payable)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-neutral-500">Received</div>
                            <div className="font-semibold text-green-700 text-lg">{formatNum(received)}</div>
                        </div>
                        {remaining !== '-' && (
                            <div>
                                <div className="text-xs text-neutral-500">Remaining</div>
                                <div className={`font-semibold text-lg ${remaining >= 0 ? 'text-yellow-700' : 'text-red-600'}`}>{formatNum(remaining)}</div>
                            </div>
                        )}
                        {embassyFee !== '-' && (
                            <div>
                                <div className="text-xs text-neutral-500">Embassy fee</div>
                                <div className={`font-semibold text-lg ${typeof embassyFee === 'number' ? 'text-yellow-700' : 'text-neutral-600'}`}>
                                    {formatNum(embassyFee)}
                                </div>
                            </div>
                        )}
                        <div>
                            <div className="text-xs text-neutral-500">Profit</div>
                            <div className={`font-semibold text-lg ${profit >= 0 ? 'text-yellow-700' : 'text-red-600'}`}>{formatNum(profit)}</div>
                        </div>
                    </div>

                    <button
                        onClick={() => onViewDetails(r)}
                        title="View Details"
                        className="p-3 self-center bg-neutral-100 rounded-lg text-neutral-700 hover:bg-neutral-900 hover:text-white transition"
                    >
                        <FaEye />
                    </button>
                </div>
            </div>
        </div>
    );
});

/* ------------------------------- NEW: Record Detail Modal ------------------------------- */
function RecordDetailModal({ record, onClose }) {
    if (!record) return null;

    const { payable, received, remaining, profit, embassyFee } = getFinancials(record);

    const formatNum = (val) => {
        if (typeof val === 'number') return val.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return val;
    };

    const DetailRow = ({ label, value }) => {
        if (value === null || value === undefined || value === "") return null;
        return (
            <div className="py-2 border-b border-neutral-200">
                <div className="text-xs font-medium text-neutral-600 uppercase tracking-wider">{label}</div>
                <div className="text-sm text-neutral-900 font-medium mt-0.5">{String(value)}</div>
            </div>
        );
    };

    const formatCreatedAt = (createdAt) => {
        if (!createdAt) return null;
        if (createdAt.toDate) return createdAt.toDate().toLocaleString();
        if (createdAt.seconds) return new Date(createdAt.seconds * 1000).toLocaleString();
        if (typeof createdAt === 'string') {
            try { return new Date(createdAt).toLocaleString(); } catch { return createdAt; }
        }
        return String(createdAt);
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl bg-white border border-neutral-200 rounded-2xl shadow-md p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-neutral-900">{record.fullName || record.passenger?.fullName || "Record Details"}</h3>
                        <p className="text-sm text-purple-700">{record.passport || record.passportNumber} {record.__type && <span className="ml-2 px-2 py-0.5 bg-neutral-100 text-purple-300 rounded-full text-xs uppercase">{record.__type}</span>}</p>
                    </div>
                    <button onClick={onClose} className="text-2xl text-neutral-500 hover:text-neutral-900 transition">
                        <FaTimes />
                    </button>
                </div>

                {/* Financial Summary Bar */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 bg-white p-4 rounded-lg mb-6 text-center">
                    <div>
                        <div className="text-xs text-neutral-600">Total Fee</div>
                        <div className="font-bold text-lg text-neutral-900">{formatNum(payable)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-600">Received</div>
                        <div className="font-bold text-lg text-green-700">{formatNum(received)}</div>
                    </div>
                    {remaining !== '-' && (
                        <div>
                            <div className="text-xs text-neutral-600">Remaining</div>
                            <div className={`font-bold text-lg ${remaining >= 0 ? 'text-yellow-700' : 'text-red-600'}`}>{formatNum(remaining)}</div>
                        </div>
                    )}
                    {embassyFee !== '-' && (
                        <div>
                            <div className="text-xs text-neutral-600">Embassy Fee</div>
                            <div className="font-bold text-lg text-orange-700">{formatNum(embassyFee)}</div>
                        </div>
                    )}
                    <div>
                        <div className="text-xs text-neutral-600">Profit</div>
                        <div className={`font-bold text-lg ${typeof profit === 'number' && profit >= 0 ? 'text-yellow-700' : 'text-red-600'}`}>{formatNum(profit)}</div>
                    </div>
                </div>

                {/* All Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">

                    {/* ── Customer Info ── */}
                    <div className="col-span-2 pt-3 pb-1">
                        <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest">👤 Customer</p>
                    </div>
                    <DetailRow label="Full Name" value={record.fullName || record.passenger?.fullName} />
                    <DetailRow label="Passport Number" value={record.passport || record.passportNumber || record.passenger?.passport} />
                    <DetailRow label="Phone" value={record.phone || record.passenger?.phone} />
                    <DetailRow label="Email" value={record.email || record.passenger?.email} />
                    <DetailRow label="CNIC" value={record.passenger?.cnic || record.cnic} />
                    <DetailRow label="Reference" value={record.reference} />

                    {/* ── Visa / Travel Details ── */}
                    <div className="col-span-2 pt-3 pb-1">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">🛂 Visa / Travel Details</p>
                    </div>
                    <DetailRow label="Visa Type" value={record.visaType} />
                    <DetailRow label="Country / Destination" value={record.country || record.to} />
                    <DetailRow label="Application Date" value={record.date || toISODate(record)} />
                    <DetailRow label="Expiry Date" value={record.expiryDate} />
                    <DetailRow label="Sent to Embassy" value={record.sentToEmbassy} />
                    <DetailRow label="Received from Embassy" value={record.receivedFromEmbassy} />
                    <DetailRow label="Origin" value={record.from} />
                    <DetailRow label="Departure Date" value={record.departure} />
                    <DetailRow label="Return Date" value={record.returnDate} />
                    <DetailRow label="Trip Type" value={record.tripType} />
                    <DetailRow label="Travel Class" value={record.travelClass} />
                    <DetailRow label="PNR" value={record.pnr} />
                    <DetailRow label="Total Passengers" value={record.totalPax} />
                    <DetailRow label="Adults / Children / Infants" value={[record.adults, record.children, record.infants].filter(v => v !== undefined).join(' / ') || undefined} />

                    {/* ── Vendor Info ── */}
                    <div className="col-span-2 pt-3 pb-1">
                        <p className="text-xs font-bold text-purple-700 uppercase tracking-widest">🏢 Vendor</p>
                    </div>
                    <DetailRow label="Vendor / Airline" value={record.vendor || record.airlinePref} />
                    <DetailRow label="Vendor Contact" value={record.vendorContact} />
                    <DetailRow label="Vendor Fee" value={record.vendorFee !== undefined ? `PKR ${Number(record.vendorFee || 0).toLocaleString()}` : undefined} />

                    {/* ── Financial Details ── */}
                    <div className="col-span-2 pt-3 pb-1">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">💰 Financials</p>
                    </div>
                    <DetailRow label="Total Fee" value={record.totalFee !== undefined ? `PKR ${Number(record.totalFee || 0).toLocaleString()}` : undefined} />
                    <DetailRow label="Received Fee" value={record.receivedFee !== undefined ? `PKR ${Number(record.receivedFee || 0).toLocaleString()}` : undefined} />
                    <DetailRow label="Remaining Fee" value={record.remainingFee !== undefined ? `PKR ${Number(record.remainingFee || 0).toLocaleString()}` : undefined} />
                    <DetailRow label="Embassy Fee" value={embassyFee !== '-' ? `PKR ${formatNum(embassyFee)}` : undefined} />
                    <DetailRow label="Profit" value={typeof profit === 'number' ? `PKR ${formatNum(profit)}` : profit} />

                    {/* ── Status ── */}
                    <div className="col-span-2 pt-3 pb-1">
                        <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">📋 Status</p>
                    </div>
                    <DetailRow label="Visa Status" value={record.visaStatus} />
                    <DetailRow label="Payment Status" value={record.paymentStatus || record.status} />

                    {/* ── System / Employee Info ── */}
                    <div className="col-span-2 pt-3 pb-1">
                        <p className="text-xs font-bold text-neutral-600 uppercase tracking-widest">🔧 System Info</p>
                    </div>
                    <DetailRow label="Handled By (Employee)" value={record.createdByEmail || record.userEmail} />
                    <DetailRow label="Employee Name" value={record.createdByName} />
                    <DetailRow label="User ID" value={record.userId} />
                    <DetailRow label="Created At" value={formatCreatedAt(record.createdAt)} />
                    <DetailRow label="Promo Code" value={record.promo} />
                    <DetailRow label="Notes" value={record.note} />
                </div>

                {/* Remarks - full width */}
                {record.remarks && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="text-xs font-medium text-amber-700 uppercase tracking-wider mb-1">⚠️ Remarks</div>
                        <div className="text-sm text-neutral-900 whitespace-pre-wrap">{record.remarks}</div>
                    </div>
                )}

                <div className="mt-6 text-right">
                    <button onClick={onClose} className="bg-neutral-900 text-white px-5 py-2 rounded-lg font-semibold hover:bg-neutral-700 transition">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
