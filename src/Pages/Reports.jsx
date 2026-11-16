import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import {
  MdSearch,
  MdPrint,
  MdHistory,
  MdClose,
  MdDateRange
} from "react-icons/md";
import { FaPassport, FaRegFilePdf, FaPlaneDeparture, FaHotel, FaBriefcaseMedical, FaBookReader, FaGlobeAmericas, FaChartPie, FaChartBar } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import AdminLayout from "../Components/AdminLayout";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Report() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [allMyBookings, setAllMyBookings] = useState([]); 
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Month filter state (YYYY-MM)
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: rawVisas = [], isLoading: isLoadingVisas } = useQuery({ queryKey: ['bookings'], queryFn: () => dataService.fetchAll('bookings'), staleTime: 1000 * 30 });
  const { data: rawHotels = [], isLoading: isLoadingHotels } = useQuery({ queryKey: ['HotelBookings'], queryFn: () => dataService.fetchAll('HotelBookings'), staleTime: 1000 * 30 });
  const { data: rawTickets = [], isLoading: isLoadingTickets } = useQuery({ queryKey: ['ticketBookings'], queryFn: () => dataService.fetchAll('ticketBookings'), staleTime: 1000 * 30 });
  const { data: rawInsurance = [], isLoading: isLoadingInsurance } = useQuery({ queryKey: ['medical_insurance'], queryFn: () => dataService.fetchAll('medical_insurance'), staleTime: 1000 * 30 });

  useEffect(() => {
    if (!user) return;
    const loadingState = isLoadingVisas || isLoadingHotels || isLoadingTickets || isLoadingInsurance;
    setLoadingRecent(loadingState);

    if (!loadingState) {
      let allRecs = [];
      const addRecords = (data, type) => {
        data.filter(d => d.userId === user.uid).forEach(doc => {
          let rawDate = doc.date || "";
          allRecs.push({ ...doc, _collectionType: type, dateStr: rawDate });
        });
      };

      addRecords(rawVisas, "Visa");
      addRecords(rawHotels, "Hotel");
      addRecords(rawTickets, "Ticket");
      addRecords(rawInsurance, "Insurance");

      allRecs.sort((a,b) => {
        const dateA = a.dateStr ? new Date(a.dateStr).getTime() : 0;
        const dateB = b.dateStr ? new Date(b.dateStr).getTime() : 0;
        return dateB - dateA; // Newest first
      });
      setAllMyBookings(allRecs);
    }
  }, [user, rawVisas, rawHotels, rawTickets, rawInsurance, isLoadingVisas, isLoadingHotels, isLoadingTickets, isLoadingInsurance]);

  // Derived state based on the selected Month
  const filteredMonthly = useMemo(() => {
     if (!filterMonth) return [];
     // filterMonth is "YYYY-MM" format. 
     // We assume dateStr is "YYYY-MM-DD"
     return allMyBookings.filter(b => {
        if (!b.dateStr) return false;
        // Basic substring match since standard input is YYYY-MM-DD
        return b.dateStr.startsWith(filterMonth);
     });
  }, [allMyBookings, filterMonth]);

  // Charts Config
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
  
  const serviceStats = useMemo(() => {
     const counts = { Visa: 0, Ticket: 0, Hotel: 0, Insurance: 0 };
     filteredMonthly.forEach(b => counts[b._collectionType]++);
     return Object.entries(counts).filter(([_, val]) => val > 0).map(([key, val]) => ({ name: key, value: val }));
  }, [filteredMonthly]);

  const countryStats = useMemo(() => {
     const counts = {};
     filteredMonthly.forEach(b => {
        let cnt = b.country || b.destination || "Other";
        counts[cnt] = (counts[cnt] || 0) + 1;
     });
     return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([key, val]) => ({ name: key, value: val }));
  }, [filteredMonthly]);


  // Global search multi-collection using cached data
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      toast.error("Please enter a searchable ID (Passport, PNR, Name, etc).");
      return;
    }
    setLoadingSearch(true);
    setHasSearched(true);
    setSelectedBooking(null);
    try {
      const searchVal = searchTerm.trim().toUpperCase();
      const exactVal = searchTerm.trim();
      
      let allResults = [];

      rawVisas.forEach(d => {
        if ((d.passport || "").toUpperCase() === searchVal) allResults.push({ ...d, _collectionType: "Visa" });
      });

      rawHotels.forEach(d => {
        if ((d.clientName || "") === exactVal) allResults.push({ ...d, _collectionType: "Hotel" });
      });

      rawTickets.forEach(d => {
        if ((d.pnr || "").toUpperCase() === searchVal) allResults.push({ ...d, _collectionType: "Ticket" });
      });

      rawInsurance.forEach(d => {
        if ((d.passport || "").toUpperCase() === searchVal) allResults.push({ ...d, _collectionType: "Insurance" });
      });

      setSearchResults(allResults);
      if (allResults.length === 1) setSelectedBooking(allResults[0]);
      
      if (allResults.length > 0) toast.success(`Found ${allResults.length} matching report(s).`);
      else toast.error("No record matched this identifier.");
      
    } catch (error) {
      console.error(error);
      toast.error("Error fetching booking report");
    } finally {
      setLoadingSearch(false);
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
    setHasSearched(false);
    setSearchResults([]);
    setSelectedBooking(null);
  };

  // 📄 Generate SINGLE Record PDF
  const generatePDF = (booking) => {
    if (!booking) return;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    const startX = margin;
    let startY = margin;

    // Stylish Company Header
    doc.setFillColor(30, 58, 138); 
    doc.rect(0, 0, pageWidth, 40, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text("DATA DASH", startX, 22);
    
    doc.setFontSize(10);
    doc.setFont("times", "normal");
    doc.text("Your Trusted Travel Partner", startX, 30);
    
    doc.setTextColor(50, 50, 50);
    startY = 50;

    // Report Title
    doc.setFontSize(16);
    doc.setFont("times", "bold");
    doc.text(`Official ${booking._collectionType.toUpperCase()} Record`, startX, startY);
    
    // Details (including Employee Email requested)
    doc.setFontSize(10);
    doc.setFont("times", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Operated By: ${user?.email || "Employee"}`, startX, startY + 6);
    doc.text(`Generated At: ${new Date().toLocaleString()}`, startX, startY + 11);

    let pdfBody = [];

    // Map carefully to prevent empty fields
    if (booking._collectionType === "Visa") {
      pdfBody = [
        ["Passport Number", booking.passport || "-", "Full Name", booking.fullName || "-"],
        ["Visa Type", booking.visaType || "-", "Application Date", booking.date || "-"],
        ["Expiry Date", booking.expiryDate || "-", "Sent To Embassy", booking.sentToEmbassy || "-"],
        ["Return Embassy", booking.receivedFromEmbassy || "-", "Country", booking.country || "-"],
        ["Visa Status", booking.visaStatus || "-", "Total Fee", `${booking.totalFee || "0"}`],
        ["Received Fee", `${booking.receivedFee || "0"}`, "Remaining Fee", `${booking.remainingFee || "0"}`],
        ["Reference", booking.reference || "-", "Embassy Fee", booking.embassyFee || "-"],
        ["Payment Status", booking.paymentStatus || "-", "Email", booking.email || "-"],
        ["Phone", booking.phone || "-", "Remarks", booking.remarks || "-"],
        ["Vendor Name", booking.vendor || "-", "Vendor Fee", booking.vendorFee || "-"],
      ];
    } else if (booking._collectionType === "Ticket") {
      pdfBody = [
        ["PNR Number", booking.pnr || "-", "Passenger Name", booking.passengerName || "-"],
        ["Airline", booking.airline || "-", "Application Date", booking.date || "-"],
        ["Sector", booking.sector || "-", "Ticket Type", booking.ticketType || booking.type || "-"],
        ["Ticket Status", booking.status || "-", "Total Fee", `${booking.totalFee || "0"}`],
        ["Received Fee", `${booking.receivedFee || "0"}`, "Remaining Fee", `${booking.remainingFee || "0"}`],
        ["Vendor Name", booking.vendor || booking.vendorName || "-", "Vendor Contact", booking.vendorContact || "-"],
        ["Email", booking.email || "-", "Phone", booking.phoneNumber || booking.phone || "-"],
        ["Remarks", booking.remarks || "-", "Reference", booking.reference || "-"],
      ];
    } else if (booking._collectionType === "Hotel") {
      pdfBody = [
        ["Guest Name", booking.guestName || "-", "Hotel Name", booking.hotelName || "-"],
        ["Rooms", booking.noOfRooms || "-", "Nights", booking.noOfNights || "-"],
        ["Category", booking.hotelCategory || "-", "Application Date", booking.date || "-"],
        ["Hotel Status", booking.hotelStatus || "-", "Total Fee", `${booking.totalPayable || booking.totalFee || "0"}`],
        ["Received Fee", `${booking.advancePayable || booking.receivedFee || "0"}`, "Remaining Error", `${booking.remainingPayable || booking.remainingFee || "0"}`],
        ["Vendor Name", booking.vendor || booking.vendorName || "-", "Vendor Config", booking.vendorCheckOptions || "-"],
        ["Remarks", booking.remarks || "-", "Reference", booking.reference || "-"],
      ];
    } else if (booking._collectionType === "Insurance") {
      pdfBody = [
        ["Passport Number", booking.passport || "-", "Full Name", booking.fullName || "-"],
        ["Insurance Co.", booking.insuranceCompany || "-", "Duration", booking.duration || "-"],
        ["Country", booking.country || "-", "Application Date", booking.date || "-"],
        ["Policy Status", booking.insuranceStatus || "-", "Total Fee", `${booking.totalFee || "0"}`],
        ["Received Fee", `${booking.receivedFee || "0"}`, "Remaining Fee", `${booking.remainingFee || "0"}`],
        ["Vendor Name", booking.vendorContact || booking.vendor || "-", "Reference", booking.reference || "-"],
        ["Remarks", booking.remarks || "-", "Payment Status", booking.paymentStatus || "-"],
      ];
    }

    autoTable(doc, {
      startY: startY + 16,
      margin: { left: startX, right: startX },
      tableWidth: contentWidth,
      head: [["Information", "Details", "Information", "Details"]],
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
        halign: "center",
      },
      body: pdfBody,
      styles: { fontSize: 9, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
         0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 35 },
         2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 35 }
      }
    });

    const uniqueID = booking.passport || booking.pnr || booking.guestName || "Record";
    doc.save(`OS_Record_${booking._collectionType}_${uniqueID}.pdf`);
  };

  // 📊 Generate MACRO Monthly PDF
  const generateMonthlyPDF = () => {
    if (filteredMonthly.length === 0) {
       toast.error("No data available for this month to download.");
       return;
    }

    const doc = new jsPDF("l", "mm", "a4"); // Landscape for wide tables
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    
    // Header
    doc.setFillColor(30, 58, 138); 
    doc.rect(0, 0, pageWidth, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.text("DATA DASH: MONTHLY ANALYTICS REPORT", margin, 20);
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(14);
    doc.text(`Period: ${filterMonth}`, margin, 45);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    // Explicitly showing the Employee ID/Email as required
    doc.text(`Operated By Employee: ${user?.email || "Unknown"} (ID: ${user?.uid})`, margin, 52);
    doc.text(`Total Monthly Records: ${filteredMonthly.length}`, margin, 58);

    const bodyData = filteredMonthly.map((b) => {
       const identifer = b.passport || b.pnr || b.hotelName || b.insuranceCompany || "-";
       const cName = b.fullName || b.passengerName || b.guestName || "-";
       const total = b.totalFee || b.totalPayable || 0;
       const status = b.visaStatus || b.status || b.hotelStatus || b.insuranceStatus || "Processing";
       return [
          b._collectionType,
          b.dateStr || "-",
          cName,
          identifer,
          b.country || b.destination || "-",
          total,
          status,
          b.reference || "-"
       ];
    });

    autoTable(doc, {
       startY: 65,
       margin: { left: margin, right: margin },
       head: [["Service", "Date", "Client Name", "Auth ID (Passport/PNR)", "Country/Dest.", "Total Fee", "Status", "Reference"]],
       headStyles: { fillColor: [40, 40, 40] },
       body: bodyData,
       styles: { fontSize: 8 },
       alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`OS_Monthly_Report_${filterMonth}.pdf`);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-900">
          <h2 className="text-2xl font-bold">Access Restricted</h2>
      </div>
    );
  }

  const getServiceIcon = (type) => {
     switch(type) {
       case "Visa": return <FaGlobeAmericas />;
       case "Ticket": return <FaPlaneDeparture />;
       case "Hotel": return <FaHotel />;
       case "Insurance": return <FaBriefcaseMedical />;
       default: return <FaBookReader />;
     }
  }

  const RenderRow = ({ b, isSelected }) => {
    const identifer = b.passport || b.pnr || b.hotelName || b.insuranceCompany || "-";
    const primaryTitle = b.fullName || b.passengerName || b.guestName || "-";
    const status = b.visaStatus || b.status || b.hotelStatus || b.insuranceStatus || "Processing";
    const isApproved = ["Approved", "Ticketed", "Completed"].includes(status);

    return (
      <div 
        onClick={() => setSelectedBooking(b)}
        className={`p-4 rounded-xl cursor-pointer transition-all border ${
           isSelected ? 'bg-blue-600/10 border-blue-500 shadow-sm' : 'bg-white border-neutral-200 hover:border-blue-400/50 hover:bg-neutral-100'
        } flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-3`}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-white text-neutral-600 flex items-center justify-center text-lg">{getServiceIcon(b._collectionType)}</div>
          <div className="overflow-hidden">
            <h3 className="font-bold text-neutral-900 text-lg truncate flex items-center gap-2">
              {primaryTitle} 
              <span className="px-2 py-0.5 text-[10px] bg-white border border-neutral-200 rounded tracking-widest text-blue-700">{b._collectionType}</span>
            </h3>
            <p className="text-sm font-medium text-neutral-600 flex items-center gap-3 mt-1">
               <span className="font-mono">{identifer}</span> • <span>{b.dateStr}</span>
            </p>
          </div>
        </div>
        
        <div className="flex gap-4 items-center md:justify-end">
           <div className="text-right flex flex-col">
             <span className="text-[10px] text-neutral-500 uppercase font-bold">Status</span>
             <span className={`font-bold ${isApproved ? 'text-emerald-700' : 'text-amber-700'}`}>{status}</span>
           </div>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout hideNavbar={true}>
      <main className="max-w-7xl w-full mx-auto p-6 flex-1 py-10 relative z-10 text-neutral-900">
        
        {/* Header Block */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
           <div>
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-500/20 text-blue-600 rounded-xl mb-4">
                <FaRegFilePdf size={24} />
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-neutral-900">Analytics Hub <span className="text-blue-600">.</span></h1>
              <p className="text-neutral-600 mt-2 text-lg">Cross-service reporting and official PDF generation.</p>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 bg-white p-2 pr-4 border border-neutral-200 rounded-xl">
                 <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex justify-center items-center text-blue-700"><MdDateRange /></div>
                 <input 
                   type="month" 
                   value={filterMonth}
                   onChange={(e) => setFilterMonth(e.target.value)}
                   className="bg-transparent border-none text-neutral-900 outline-none font-bold"
                 />
              </div>
           </div>
        </div>

        {/* Analytics Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
           {/* Service Distribution Pie */}
           <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-2 flex items-center gap-2"><FaChartPie className="text-blue-600"/> Service Distribution</h3>
              <div className="h-60 w-full">
                 {serviceStats.length === 0 ? <p className="text-neutral-500 mt-20 text-center">No data for this month</p> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                         <Pie isAnimationActive={false} data={serviceStats} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {serviceStats.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                         </Pie>
                         <RechartsTooltip contentStyle={{backgroundColor: '#ffffff', borderColor: '#e5e5e5'}} itemStyle={{color: '#fff'}} />
                      </PieChart>
                    </ResponsiveContainer>
                 )}
              </div>
           </div>
           
           {/* Country Demand Bar Chart */}
           <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900 mb-2 flex items-center gap-2"><FaChartBar className="text-emerald-600"/> Top Destinations / Countries</h3>
              <div className="h-60 w-full">
                 {countryStats.length === 0 ? <p className="text-neutral-500 mt-20 text-center">No data for this month</p> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={countryStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                         <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} />
                         <XAxis dataKey="name" tick={{fill: '#525252', fontSize: 12}} />
                         <YAxis tick={{fill: '#525252', fontSize: 12}} />
                         <RechartsTooltip contentStyle={{backgroundColor: '#ffffff', borderColor: '#e5e5e5'}} itemStyle={{color: '#fff'}} />
                         <Bar isAnimationActive={false} dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                 )}
              </div>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
           {/* LEFT COLUMN: Deep Search & Results List */}
           <div className="lg:col-span-3 flex flex-col gap-6">
              
              <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
                 <div className="flex bg-white border border-neutral-200 rounded-xl p-1">
                    <input
                      type="text"
                      placeholder="Deep search any Passport, PNR, or Name globally..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="flex-1 bg-transparent border-none text-neutral-900 px-4 outline-none placeholder-neutral-500 tracking-wide"
                    />
                    {hasSearched && <button onClick={clearSearch} className="px-4 text-neutral-500 hover:text-neutral-900 transition-colors"><MdClose size={24} /></button>}
                    <button onClick={handleSearch} disabled={loadingSearch} className="px-6 py-3 rounded-lg bg-neutral-900 hover:bg-neutral-700 text-white font-bold transition-all disabled:opacity-50">
                      {loadingSearch ? "..." : "SEARCH"}
                    </button>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm min-h-[400px]">
                 {hasSearched ? (
                    <>
                       <h2 className="text-lg font-bold text-neutral-900 mb-4">Search Results ({searchResults.length})</h2>
                       {searchResults.length === 0 ? <p className="text-neutral-500">No match.</p> : searchResults.map((b, i) => <RenderRow key={i} b={b} isSelected={selectedBooking?.id === b.id} />)}
                    </>
                 ) : (
                    <>
                       <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center justify-between">
                         <span className="flex items-center gap-2"><MdHistory className="text-blue-600" /> Monthly Operations Feed</span>
                         <span className="text-sm font-normal text-neutral-600 bg-white px-3 py-1 rounded-full">{filteredMonthly.length} Records</span>
                       </h2>
                       {loadingRecent ? <p className="text-neutral-500">Loading...</p> : filteredMonthly.length === 0 ? <p className="text-neutral-500">No operations found for this month.</p> : (
                          <div className="space-y-1">
                             {filteredMonthly.map((b, i) => <RenderRow key={i} b={b} isSelected={selectedBooking?.id === b.id} />)}
                          </div>
                       )}
                    </>
                 )}
              </div>
           </div>

           {/* RIGHT COLUMN: Detail Preview */}
           <div className="lg:col-span-2">
              <div className="bg-white border border-neutral-200 shadow-md rounded-3xl overflow-hidden sticky top-6">
                 {selectedBooking ? (
                    <>
                       <div className="bg-gradient-to-br from-neutral-100 to-neutral-100 p-6 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-2xl -mr-10 -mt-10"></div>
                          <div className="w-12 h-12 rounded-xl bg-white text-neutral-900 flex items-center justify-center text-2xl mb-4 border border-neutral-200 relative z-10">{getServiceIcon(selectedBooking._collectionType)}</div>
                          <h3 className="text-xl font-black text-neutral-900 relative z-10 mb-1">{selectedBooking.fullName || selectedBooking.passengerName || selectedBooking.guestName || "Client"}</h3>
                          <p className="text-blue-100/80 font-mono relative z-10 text-sm">{selectedBooking.passport || selectedBooking.pnr || selectedBooking.hotelName || "No ID"}</p>
                       </div>
                       <div className="p-6 space-y-4">
                          <div className="flex justify-between items-center py-2 border-b border-neutral-200"><span className="text-xs text-neutral-500 uppercase">Service</span><span className="font-bold text-blue-700">{selectedBooking._collectionType}</span></div>
                          <div className="flex justify-between items-center py-2 border-b border-neutral-200"><span className="text-xs text-neutral-500 uppercase">Status</span><span className="font-bold text-neutral-900">{selectedBooking.visaStatus || selectedBooking.status || selectedBooking.hotelStatus || selectedBooking.insuranceStatus || "Processing"}</span></div>
                          <div className="flex justify-between items-center py-2 border-b border-neutral-200"><span className="text-xs text-neutral-500 uppercase">Gross Fee</span><span className="font-mono text-neutral-700">{selectedBooking.totalFee || selectedBooking.totalPayable || "0"}</span></div>
                       </div>
                    </>
                 ) : (
                    <div className="p-10 flex flex-col items-center justify-center text-center min-h-[400px]">
                       <FaBookReader size={40} className="text-gray-600 mb-6" />
                       <h3 className="text-xl font-bold text-neutral-700">No Target Locked</h3>
                       <p className="text-sm text-neutral-500 mt-2">Select a record to preview and print its official PDF.</p>
                    </div>
                 )}
              </div>
           </div>
        </div>

      </main>
    </AdminLayout>
  );
}
