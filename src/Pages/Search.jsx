import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import DebouncedSearchInput from "../Components/DebouncedSearchInput";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { MdSearch, MdFilterList, MdClear } from "react-icons/md";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Search() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [filters, setFilters] = useState({
    visaStatus: "All",
    paymentStatus: "All",
    country: "All",
    startDate: "",
    endDate: ""
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Reset to first page when search criteria change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  // Fetch user's bookings with aggressive caching
  const fetchUserBookings = async () => {
    const q = query(
      collection(db, "bookings"),
      where("userId", "==", user.uid)
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Sort by date (newest first)
    return data.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA;
    });
  };

  const { data: allBookings = [], isLoading: loading } = useQuery({
    queryKey: ['my-visa-bookings', user?.uid], // shared with Countries page -> one download, reused everywhere
    queryFn: () => dataService.fetchMyBookings(user.uid),
    enabled: !!user?.uid,
    staleTime: 1000 * 30,
  });

  // Search and filter function
  useEffect(() => {
    if (!allBookings.length) {
      setSearchResults([]);
      return;
    }

    let filtered = allBookings;

    // Apply search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(booking => 
        (booking.passport && booking.passport.toLowerCase().includes(term)) ||
        (booking.fullName && booking.fullName.toLowerCase().includes(term)) ||
        (booking.country && booking.country.toLowerCase().includes(term)) ||
        (booking.visaType && booking.visaType.toLowerCase().includes(term))
      );
    }

    // Apply filters
    if (filters.visaStatus !== "All") {
      filtered = filtered.filter(booking => booking.visaStatus === filters.visaStatus);
    }

    if (filters.paymentStatus !== "All") {
      filtered = filtered.filter(booking => booking.paymentStatus === filters.paymentStatus);
    }

    if (filters.country !== "All") {
      filtered = filtered.filter(booking => booking.country === filters.country);
    }

    if (filters.startDate) {
      filtered = filtered.filter(booking => {
        const bookingDate = new Date(booking.date);
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        return bookingDate >= start;
      });
    }

    if (filters.endDate) {
      filtered = filtered.filter(booking => {
        const bookingDate = new Date(booking.date);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        return bookingDate <= end;
      });
    }

    setSearchResults(filtered);
  }, [searchTerm, filters, allBookings]);

  // Get unique countries for filter
  const uniqueCountries = [...new Set(allBookings.map(b => b.country).filter(Boolean))];

  // Calculate financial stats dynamically based on displayed records
  const totalEarnings = searchResults.reduce((sum, b) => sum + (parseFloat(b.totalFee) || parseFloat(b.payable) || 0), 0);
  const totalEmbassyFee = searchResults.reduce((sum, b) => sum + (parseFloat(b.embassyFee) || 0), 0);
  const totalVendorFee = searchResults.reduce((sum, b) => sum + (parseFloat(b.vendorFee) || 0), 0);
  const totalReceived = searchResults.reduce((sum, b) => sum + (parseFloat(b.receivedFee) || parseFloat(b.received) || 0), 0);
  
  const totalProfit = searchResults.reduce((sum, b) => {
      const p = parseFloat(b.profit);
      const calculatedProfit = (parseFloat(b.totalFee) || parseFloat(b.payable) || 0) - (parseFloat(b.embassyFee) || 0) - (parseFloat(b.vendorFee) || 0);
      return sum + (!isNaN(p) ? p : calculatedProfit);
  }, 0);
  
  const totalRemaining = totalEarnings - totalReceived;

  // monthly chart data
  const monthlyDataMap = {};
  searchResults.forEach(b => {
    if (!b.date) return;
    const dateObj = new Date(b.date);
    const monthName = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
    
    if (!monthlyDataMap[monthName]) {
      monthlyDataMap[monthName] = { 
        month: monthName, 
        TotalEarnings: 0, 
        Profit: 0, 
        EmbassyFee: 0, 
        VendorFee: 0,
        SortKeys: dateObj.getTime()
      };
    }
    
    const p = parseFloat(b.profit);
    const calculatedProfit = (parseFloat(b.totalFee) || parseFloat(b.payable) || 0) - (parseFloat(b.embassyFee) || 0) - (parseFloat(b.vendorFee) || 0);

    monthlyDataMap[monthName].TotalEarnings += (parseFloat(b.totalFee) || parseFloat(b.payable) || 0);
    monthlyDataMap[monthName].Profit += (!isNaN(p) ? p : calculatedProfit);
    monthlyDataMap[monthName].EmbassyFee += (parseFloat(b.embassyFee) || 0);
    monthlyDataMap[monthName].VendorFee += (parseFloat(b.vendorFee) || 0);
  });

  const chartData = Object.values(monthlyDataMap).sort((a, b) => a.SortKeys - b.SortKeys);

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      visaStatus: "All",
      paymentStatus: "All",
      country: "All",
      startDate: "",
      endDate: ""
    });
    setSearchTerm("");
  };

  // Show message if not logged in
  if (!user) {
    return (
      <div className="pt-20 p-6 min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center bg-white p-10 rounded-2xl shadow-md backdrop-blur-md border border-neutral-200">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Access Denied</h2>
          <p className="text-neutral-600">Please log in to search your visa records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 p-6 min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <div className="w-full mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900 mb-2">
            Search Visa Records
          </h1>
          <p className="text-neutral-600 text-lg">
            Find and filter your visa applications by passport, name, country, or other criteria.
          </p>
          
          <div className="mt-4 p-3 bg-white rounded-lg border border-neutral-200 inline-block">
            <p className="text-neutral-700 text-sm">
              <strong>Logged in as:</strong> {user.email}
            </p>
          </div>
        </div>

        {/* Enhanced Stats Box */}
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-neutral-900">{searchResults.length}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Total Bookings</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-teal-700">{totalEarnings.toFixed(2)}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Total Invoiced</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-emerald-700">{totalReceived.toFixed(2)}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Total Received</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-green-700">{totalProfit.toFixed(2)}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Net Profit</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-yellow-700">{totalEmbassyFee.toFixed(2)}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Embassy Fee</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-neutral-900">{totalVendorFee.toFixed(2)}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Vendor Fee</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 text-center border border-neutral-200">
            <div className="text-2xl font-bold text-red-700">{totalRemaining.toFixed(2)}</div>
            <div className="text-xs text-neutral-600 mt-1 uppercase tracking-wider">Pending Receive</div>
          </div>
        </div>

        {/* Chart Section */}
        {chartData.length > 0 && (
          <div className="bg-white backdrop-blur-md rounded-xl shadow-md border border-neutral-200 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Monthly Overview</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="month" stroke="#525252" />
                  <YAxis stroke="#525252" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e5e5', color: '#171717' }}
                    itemStyle={{ color: '#171717' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar isAnimationActive={false} dataKey="TotalEarnings" name="Total Earnings" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="Profit" name="Profit" fill="#4ADE80" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="EmbassyFee" name="Embassy Fee" fill="#FACC15" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="VendorFee" name="Vendor Fee" fill="#C084FC" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Search Bar & Clear Button */}
        <div className="bg-white backdrop-blur-md rounded-xl shadow-md border border-neutral-200 p-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1">
              <DebouncedSearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search by passport number, name, country, or visa type..."
                className="w-full"
              />
            </div>
            
            <button
              onClick={clearFilters}
              className="w-full md:w-auto px-6 py-3 bg-neutral-100 text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <MdClear />
              Clear All
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white backdrop-blur-md rounded-xl shadow-md border border-neutral-200 p-6">
          <div className="flex items-center gap-2 mb-4 text-blue-700">
            <MdFilterList className="text-2xl" />
            <h3 className="text-lg font-semibold text-neutral-900">Filters</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">Visa Status</label>
              <select
                value={filters.visaStatus}
                onChange={(e) => setFilters({...filters, visaStatus: e.target.value})}
                className="w-full bg-white text-neutral-700 border border-neutral-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-300 focus:border-transparent"
              >
                <option value="All">All Statuses</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Processing">Processing</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">Payment Status</label>
              <select
                value={filters.paymentStatus}
                onChange={(e) => setFilters({...filters, paymentStatus: e.target.value})}
                className="w-full bg-white text-neutral-700 border border-neutral-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-300 focus:border-transparent"
              >
                <option value="All">All Payments</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">Country</label>
              <select
                value={filters.country}
                onChange={(e) => setFilters({...filters, country: e.target.value})}
                className="w-full bg-white text-neutral-700 border border-neutral-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-300 focus:border-transparent"
              >
                <option value="All">All Countries</option>
                {uniqueCountries.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">From Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                className="w-full bg-white text-neutral-700 border border-neutral-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-neutral-300 focus:border-transparent [color-scheme:dark]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">To Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                className="w-full bg-white text-neutral-700 border border-neutral-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-neutral-300 focus:border-transparent [color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        {/* Results Data Table */}
        <div className="bg-white backdrop-blur-md rounded-xl shadow-md overflow-hidden border border-neutral-200">
          <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-neutral-900">Search Results</h3>
            <div className="text-sm text-neutral-600">
              {loading ? "Loading..." : `${searchResults.length} record${searchResults.length !== 1 ? 's' : ''} found`}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="text-blue-700 animate-pulse">Loading your data...</div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              {searchTerm || Object.values(filters).some(f => f !== "All" && f !== "") 
                ? "No records found matching your search criteria." 
                : "No visa records found for your account."}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-white text-neutral-700 whitespace-nowrap">
                    <tr>
                      <th className="px-6 py-4 font-semibold">#</th>
                      <th className="px-6 py-4 font-semibold">Passport</th>
                      <th className="px-6 py-4 font-semibold">Name</th>
                      <th className="px-6 py-4 font-semibold">Visa Type</th>
                      <th className="px-6 py-4 font-semibold">Country</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Embassy Fee</th>
                      <th className="px-6 py-4 font-semibold">Vendor Fee</th>
                      <th className="px-6 py-4 font-semibold">Total Fee</th>
                      <th className="px-6 py-4 font-semibold">Profit</th>
                      <th className="px-6 py-4 font-semibold">Payment Status</th>
                      <th className="px-6 py-4 font-semibold">Visa Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {searchResults
                      .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                      .map((booking, index) => {
                        const calculatedProfit = (parseFloat(booking.totalFee) || 0) - (parseFloat(booking.embassyFee) || 0) - (parseFloat(booking.vendorFee) || 0);
                        return (
                          <tr 
                            key={booking.id} 
                            className={`transition-colors whitespace-nowrap ${
                              index % 2 === 0 ? "bg-white" : "bg-transparent"
                            } hover:bg-neutral-100`}
                          >
                            <td className="px-6 py-4 text-neutral-600">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                            <td className="px-6 py-4 font-mono text-neutral-700">{booking.passport || "-"}</td>
                            <td className="px-6 py-4 font-medium text-neutral-900">{booking.fullName || "-"}</td>
                            <td className="px-6 py-4 text-neutral-700">{booking.visaType || "-"}</td>
                            <td className="px-6 py-4 text-neutral-700">{booking.country || "-"}</td>
                            <td className="px-6 py-4 text-neutral-600">{booking.date || "-"}</td>
                            <td className="px-6 py-4 text-yellow-700">{booking.embassyFee || "0"}</td>
                            <td className="px-6 py-4 text-purple-700">{booking.vendorFee || "0"}</td>
                            <td className="px-6 py-4 font-semibold text-teal-700">{booking.totalFee || "0"}</td>
                            <td className="px-6 py-4 font-bold text-green-700">{calculatedProfit.toFixed(2)}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                booking.paymentStatus === 'Paid' 
                                  ? 'bg-green-500/10 text-green-700 border border-green-500/20'
                                  : 'bg-red-500/10 text-red-700 border border-red-500/20'
                              }`}>
                                {booking.paymentStatus || "Unpaid"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                booking.visaStatus === 'Approved' 
                                  ? 'bg-green-500/10 text-green-700 border border-green-500/20'
                                  : booking.visaStatus === 'Rejected'
                                  ? 'bg-red-500/10 text-red-700 border border-red-500/20'
                                  : 'bg-yellow-500/10 text-yellow-700 border border-yellow-500/20'
                              }`}>
                                {booking.visaStatus || "Processing"}
                              </span>
                            </td>
                          </tr>
                        );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {searchResults.length > itemsPerPage && (
                <div className="p-4 border-t border-neutral-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-sm text-neutral-600">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, searchResults.length)} of {searchResults.length} entries
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-white text-neutral-700 rounded-lg hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-200 transition"
                    >
                      Previous
                    </button>
                    <div className="px-4 py-2 bg-white border border-neutral-200 text-neutral-700 rounded-lg font-medium">
                      Page {currentPage} of {Math.ceil(searchResults.length / itemsPerPage)}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(searchResults.length / itemsPerPage), p + 1))}
                      disabled={currentPage === Math.ceil(searchResults.length / itemsPerPage)}
                      className="px-4 py-2 bg-white text-neutral-700 rounded-lg hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-200 transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
