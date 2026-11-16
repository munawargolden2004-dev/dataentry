import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import {
  FaSearch,
  FaPlane,
  FaPassport,
  FaKaaba,
  FaTimes,
  FaEye,
  FaBriefcaseMedical,
  FaFilter,
  FaChevronLeft,
  FaChevronRight,
  FaCalendarAlt,
  FaArrowRight,
} from "react-icons/fa";
import AdminNavbar from "../Components/AdminNavbar";
import Footer from "../Components/Footer";
import toast from "react-hot-toast";

// Helper function to get a consistent date string from any record
function getTimestamp(item) {
  if (!item) return 0;
  if (item.createdAt?.toMillis) return item.createdAt.toMillis();
  if (item.createdAt?.seconds) return item.createdAt.seconds * 1000;
  if (item.departure) {
    const t = new Date(item.departure).getTime();
    if (!isNaN(t)) return t;
  }
  if (item.date) {
    const t = new Date(item.date).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

function toISODate(item) {
  if (!item) return "N/A";
  if (item.createdAt?.toDate) return item.createdAt.toDate().toISOString().slice(0, 10);
  if (item.createdAt?.seconds) return new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10);
  if (item.departure) return String(item.departure).slice(0, 10);
  if (item.date) return String(item.date);
  return "N/A";
}

// Helper function to calculate financial details for any record
function getFinancials(r) {
  let payable = 0, received = 0, remaining = 0, profit = 0, embassyFee = '-', vendorFee = 0;

  switch(r.__type) {
    case 'visa':
      payable = parseFloat(r.totalFee || r.payable || 0);
      received = parseFloat(r.receivedFee || 0);
      remaining = parseFloat(r.remainingFee ?? (payable - received));
      profit = typeof r.profit === 'number' && !isNaN(r.profit) ? r.profit : (payable - received);
      embassyFee = typeof r.embassyFee === 'number' && !isNaN(r.embassyFee) ? r.embassyFee : 'Not entered';
      vendorFee = typeof r.vendorFee === 'number' && !isNaN(r.vendorFee) ? r.vendorFee : '-';
      break;

    case 'ticket':
      payable = parseFloat(r.payable || 0);
      received = parseFloat(r.price || 0);
      remaining = parseFloat(r.remainingFee || 0);
      profit = parseFloat(r.profit ?? (received - payable));
      embassyFee = '-';
      break;

    case 'umrah':
      payable = parseFloat(r.payable || 0);
      received = parseFloat(r.received || 0);
      remaining= parseFloat(r.remaining || 0);
      profit = parseFloat(r.profit ?? (payable - received));
      embassyFee = '-';
      break;
    
    case 'insurance':
      payable = parseFloat(r.totalPayableAmount || 0);
      received = parseFloat(r.totalReceivedAmount || 0);
      remaining = parseFloat(r.totalRemainingAmount || 0);
      profit = parseFloat(r.totalProfit || 0);
      embassyFee = '-';
      break;

    default:
      payable = parseFloat(r.payable || r.totalFee || r.price || 0);
      received = parseFloat(r.receivedFee || r.received || 0);
      remaining = parseFloat(r.remainingFee ?? 0);
      profit = parseFloat(r.profit ?? (payable - received));
      embassyFee = r.embassyFee || '-';
  }

  return { payable, received, remaining, profit, embassyFee };
}

// ---------------------------
// Main Search Component
// ---------------------------
export default function GlobalSearchPage() {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  
  // Filters
  const [filterType, setFilterType] = useState("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [modalRecord, setModalRecord] = useState(null);

  // 1. Fetch ALL data from every category using react-query
  const { data: rawVisas = [], isLoading: isLoadingVisas } = useQuery({ queryKey: ['bookings'], queryFn: () => dataService.fetchAll('bookings'), staleTime: 1000 * 30 });
  const { data: rawTickets = [], isLoading: isLoadingTickets } = useQuery({ queryKey: ['ticketBookings'], queryFn: () => dataService.fetchAll('ticketBookings'), staleTime: 1000 * 30 });
  const { data: rawUmrah = [], isLoading: isLoadingUmrah } = useQuery({ queryKey: ['ummrahBookings'], queryFn: () => dataService.fetchAll('ummrahBookings'), staleTime: 1000 * 30 });
  const { data: rawInsurance = [], isLoading: isLoadingInsurance } = useQuery({ queryKey: ['medical_insurance'], queryFn: () => dataService.fetchAll('medical_insurance'), staleTime: 1000 * 30 });

  useEffect(() => {
    const loadingState = isLoadingVisas || isLoadingTickets || isLoadingUmrah || isLoadingInsurance;
    setLoading(loadingState);

    if (!loadingState) {
      const visaData = rawVisas.map((d) => ({ ...d, __type: "visa" }));
      const ticketData = rawTickets.map((d) => ({ ...d, __type: "ticket" }));
      const umrahData = rawUmrah.map((d) => ({ ...d, __type: "umrah" }));
      const insuranceData = rawInsurance.map((d) => ({ ...d, __type: "insurance" }));

      const combined = [...visaData, ...ticketData, ...umrahData, ...insuranceData];
      combined.sort((a, b) => getTimestamp(b) - getTimestamp(a));
      setAllRecords(combined);
    }
  }, [rawVisas, rawTickets, rawUmrah, rawInsurance, isLoadingVisas, isLoadingTickets, isLoadingUmrah, isLoadingInsurance]);

  // 2. Debounce typing to prevent DOM lag on massive datasets
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
      setCurrentPage(1); // reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleTypeChange = (t) => {
    setFilterType(t);
    setCurrentPage(1); // reset on filter
  }

  // 3. Filter data
  const filteredRecords = useMemo(() => {
    let result = allRecords;

    if (filterType !== 'all') {
      result = result.filter(r => r.__type === filterType);
    }

    const query = debouncedTerm.trim().toLowerCase();
    if (query) {
      result = result.filter((record) => {
        const searchableText = [
          record.fullName,
          record.passenger?.fullName,
          record.NameofInsured, 
          record.passport,
          record.passportNumber,
          record.phone,
          record.contactNumber, 
          record.pnr,
          record.country,
          record.countryofTravel, 
          record.to,
          record.vendor,
        ].filter(Boolean).join(' ').toLowerCase();

        return searchableText.includes(query);
      });
    }

    return result;
  }, [debouncedTerm, filterType, allRecords]);

  // 4. Paginate
  const totalItems = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const currentRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage, itemsPerPage]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans">
      <AdminNavbar />

      {/* Hero Header */}
      <div className="w-full bg-white border-b border-neutral-200 pt-16 pb-12 px-6 relative overflow-hidden">
        <div className="hidden absolute top-0 right-0 w-[400px] h-[400px] bg-neutral-100 rounded-full filter blur-[120px] opacity-10 pointer-events-none"></div>
        <div className="hidden absolute bottom-0 left-0 w-[400px] h-[400px] bg-neutral-100 rounded-full filter blur-[120px] opacity-10 pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">Universal Search</h1>
          <p className="text-neutral-600 mt-4 max-w-2xl text-lg">
            Instantly query across all your operations. Filter by names, ticket numbers, statuses, and more.
          </p>
          
          <div className="relative w-full max-w-3xl mt-8">
            <FaSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-500 text-xl" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Start typing a name, passport, destination..."
              className="w-full pl-16 pr-6 py-5 rounded-2xl bg-white border border-neutral-200 text-neutral-900 placeholder-neutral-500 focus:border-neutral-900 focus:bg-white focus:ring-4 focus:ring-neutral-300 outline-none transition-all text-xl shadow-md backdrop-blur-xl"
              autoFocus
            />
          </div>
        </div>
      </div>

      <main className="max-w-7xl w-full mx-auto p-6 flex-1 -mt-6 z-20">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm mb-6 gap-4">
           {/* Filters */}
           <div className="flex bg-white p-1 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All Records' },
                { id: 'visa', label: 'Visas' },
                { id: 'ticket', label: 'Tickets' },
                { id: 'umrah', label: 'Umrah' },
                { id: 'insurance', label: 'Insurance' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => handleTypeChange(f.id)}
                  className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${filterType === f.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
                >
                  {f.label}
                </button>
              ))}
           </div>
           
           <div className="text-sm font-medium text-neutral-600 px-4 whitespace-nowrap">
              {loading ? "Loading database..." : `Found ${totalItems.toLocaleString()} results`}
           </div>
        </div>

        {/* Results Section */}
        <section className="animate-fade-in-up">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
               <div className="w-12 h-12 border-4 border-neutral-200 border-t-purple-500 rounded-full animate-spin mb-4"></div>
               <p>Compiling global database...</p>
             </div>
          ) : (
             <>
                {currentRecords.length > 0 ? (
                  <div className="space-y-4">
                    {currentRecords.map((record) => (
                      <RecordCard key={record.id} r={record} onViewDetails={setModalRecord} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-24 bg-white rounded-3xl border border-neutral-200 shadow-inner flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6">
                       <FaFilter className="text-3xl text-gray-600" />
                    </div>
                    <h3 className="text-xl font-bold text-neutral-700">No records found</h3>
                    <p className="text-neutral-500 mt-2">Try adjusting your search query or filters.</p>
                  </div>
                )}
             </>
          )}

          {/* Pagination Controls */}
          {!loading && totalItems > 0 && (
             <div className="flex flex-col sm:flex-row justify-between items-center mt-8 bg-white px-6 py-4 rounded-2xl border border-neutral-200 shadow-sm">
                <span className="text-sm text-neutral-500 mb-4 sm:mb-0">
                   Showing <span className="font-bold text-neutral-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-neutral-900">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="font-bold text-neutral-900">{totalItems}</span> entries
                </span>
                <div className="flex gap-2">
                   <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="p-2 bg-white text-neutral-600 rounded-lg hover:text-neutral-900 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                   >
                     <FaChevronLeft />
                   </button>
                   
                   <div className="hidden sm:flex gap-1 mx-2">
                      {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                         let pageNum = i + 1;
                         // Show window around current page
                         if (totalPages > 5) {
                            if (currentPage > 3) pageNum = currentPage - 2 + i;
                            if (currentPage > totalPages - 2) pageNum = totalPages - 4 + i;
                         }
                         return (
                            <button
                               key={pageNum}
                               onClick={() => setCurrentPage(pageNum)}
                               className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${currentPage === pageNum ? 'bg-neutral-900 text-white' : 'bg-transparent text-neutral-600 hover:bg-neutral-100'}`}
                            >
                               {pageNum}
                            </button>
                         )
                      })}
                   </div>

                   <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages}
                     className="p-2 bg-white text-neutral-600 rounded-lg hover:text-neutral-900 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                   >
                     <FaChevronRight />
                   </button>
                </div>
             </div>
          )}
        </section>
      </main>

      <Footer />

      {/* Modal */}
      {modalRecord && (
        <RecordDetailModal
          record={modalRecord}
          onClose={() => setModalRecord(null)}
        />
      )}
    </div>
  );
}

// ---------------------------
// Re-usable UI Components
// ---------------------------

function RecordCard({ r, onViewDetails }) {
  const { payable, received, profit } = getFinancials(r);

  const getTypeInfo = (type) => {
    switch (type) {
      case 'visa': return { icon: <FaPassport className="text-neutral-900" />, bg: "bg-blue-600/20", color: "text-blue-600", label: "VISA" };
      case 'ticket': return { icon: <FaPlane className="text-neutral-900" />, bg: "bg-purple-600/20", color: "text-purple-600", label: "TICKET" };
      case 'umrah': return { icon: <FaKaaba className="text-neutral-900" />, bg: "bg-amber-600/20", color: "text-amber-600", label: "UMRAH" };
      case 'insurance': return { icon: <FaBriefcaseMedical className="text-neutral-900" />, bg: "bg-emerald-600/20", color: "text-emerald-600", label: "INSURE" };
      default: return { icon: null, bg: "bg-white", color: "text-neutral-500", label: "OTHER" };
    }
  };

  const typeInfo = getTypeInfo(r.__type);
  const passName = r.fullName || r.passenger?.fullName || r.NameofInsured || "—";
  const statusStr = r.status || r.visaStatus || r.paymentStatus || "Logged";

  return (
    <div className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-md hover:border-neutral-400 hover:bg-neutral-100 transition-all duration-300 group cursor-pointer" onClick={() => onViewDetails(r)}>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        
        <div className="flex items-center gap-5 flex-1 min-w-0">
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shadow-inner shrink-0 ${typeInfo.bg} ${typeInfo.color}`}>
             {typeInfo.icon}
             <span className="text-[9px] font-black mt-1 tracking-wider">{typeInfo.label}</span>
          </div>
          <div className="overflow-hidden">
            <h3 className="text-lg font-bold text-neutral-900 truncate group-hover:text-purple-800 transition-colors">
              {passName}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1 text-xs font-medium text-neutral-500">
               {(r.passport || r.passportNumber) && (
                 <span className="flex items-center gap-1.5"><FaPassport className="text-gray-600" /> {r.passport || r.passportNumber}</span>
               )}
               {toISODate(r) !== "N/A" && (
                 <span className="flex items-center gap-1.5"><FaCalendarAlt className="text-gray-600" /> {toISODate(r)}</span>
               )}
               {(r.country || r.countryofTravel || r.from || r.to) && (
                  <div className="bg-white py-0.5 px-2 rounded-md font-bold text-neutral-700">
                     {r.from && r.to ? `${r.from} ➔ ${r.to}` : (r.country || r.countryofTravel)}
                  </div>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8 w-full lg:w-auto">
          <div className="p-3 rounded-xl bg-white border border-neutral-200 shrink-0 flex items-center justify-center">
             <span className={`px-3 py-1 font-bold text-[10px] rounded-lg tracking-wider uppercase ${
                statusStr.toLowerCase().includes('paid') || statusStr.toLowerCase() === 'approved' 
                ? 'bg-emerald-500/20 text-emerald-700' 
                : statusStr.toLowerCase().includes('reject') ? 'bg-red-500/20 text-red-700' 
                : 'bg-amber-500/20 text-amber-700'
             }`}>
                {statusStr}
             </span>
          </div>

          <div className="flex gap-6 lg:gap-10 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1">Payable</div>
              <div className="font-mono font-bold text-neutral-700">{payable.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1">Received</div>
              <div className="font-mono font-bold text-emerald-700">{received.toLocaleString()}</div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-1">Profit</div>
              <div className={`font-mono font-bold ${profit >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{profit.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="hidden md:block">
             <button className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 group-hover:bg-neutral-900 group-hover:text-neutral-900 group-hover:border-purple-500 transition-all">
                <FaArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
             </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function RecordDetailModal({ record, onClose }) {
  if (!record) return null;

  const { payable, received, remaining, profit, embassyFee } = getFinancials(record);

  const DetailRow = ({ label, value }) => {
    if (value === null || value === undefined || value === "") return null;
    return (
      <div className="py-3 border-b border-neutral-200">
        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">{label}</div>
        <div className="text-sm font-medium text-neutral-900">{String(value)}</div>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 bg-white backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white border border-neutral-200 rounded-3xl shadow-md p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-black text-neutral-900">{record.fullName || record.passenger?.fullName || record.NameofInsured || "Record Details"}</h3>
            <span className="inline-block mt-2 px-3 py-1 bg-white text-xs font-bold text-purple-700 rounded-lg tracking-widest uppercase">
               {record.__type} RECORD
            </span>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-all text-xl">
            <FaTimes />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1 bg-white rounded-2xl mb-8">
          <div className="bg-white rounded-xl p-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Payable</div>
            <div className="font-mono font-bold text-xl text-neutral-900">{payable.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Received</div>
            <div className="font-mono font-bold text-xl text-emerald-700">{received.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Remaining</div>
            <div className={`font-mono font-bold text-xl ${remaining > 0 ? 'text-red-700' : 'text-neutral-600'}`}>{remaining.toLocaleString()}</div>
          </div>
        </div>

        <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider border-b border-neutral-200 pb-2 mb-4">Identity & Contact</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <DetailRow label="Passport / NIC" value={record.passport || record.passportNumber || record.Nic} />
          <DetailRow label="Phone" value={record.phone || record.contactNumber} />
          <DetailRow label="Email" value={record.email || record.userEmail || record.createdByEmail} />
        </div>

        <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider border-b border-neutral-200 pb-2 mb-4 mt-8">Operational Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <DetailRow label="Date Added" value={toISODate(record)} />
          <DetailRow label="Status" value={record.status || record.visaStatus || record.paymentStatus} />
          <DetailRow label="Destination / Route" value={record.from && record.to ? `${record.from} to ${record.to}` : (record.country || record.countryofTravel)} />
          <DetailRow label="Vendor / Info" value={record.vendor || record.airlinePref || record.NameofCompany} />
          <DetailRow label="Identifiers" value={record.pnr || record.visaType || record.EffectiveDate} />
        </div>
        
        <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider border-b border-neutral-200 pb-2 mb-4 mt-8">Internal Financials</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <DetailRow label="Embassy Fee / Cost" value={embassyFee} />
          <DetailRow label="Profit Margin" value={profit} />
        </div>

        {record.remarks && (
          <>
            <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-wider border-b border-neutral-200 pb-2 mb-4 mt-8">Remarks</h4>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 text-sm whitespace-pre-wrap">
               {record.remarks}
            </div>
          </>
        )}
        
        <div className="mt-10">
          <button onClick={onClose} className="w-full bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-900 py-4 flex items-center justify-center font-bold tracking-widest uppercase rounded-xl transition-all">
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}
