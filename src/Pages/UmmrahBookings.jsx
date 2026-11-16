import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import toast from "react-hot-toast";
import {
  FaSearch,
  FaTimes,
  FaEdit,
  FaSave,
  FaPrint,
  FaSpinner,
  FaDownload,
  FaPlus,
} from "react-icons/fa";
import Footer from "../Components/Footer";
import { Link } from "react-router-dom";

export default function UmmrahBookings() {
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    passportNumber: "",
    visaNumber: "",
    makkahHotel: "",
    makkahCheckIn: "",
    makkahCheckOut: "",
    makkahNights: "",
    madinahHotel: "",
    madinahCheckIn: "",
    madinahCheckOut: "",
    madinahNights: "",
    makkahCheckInagain: "",
    makkahCheckOutagain: "",
    makkahagainhotel: "",
    makkahagainNights: "",
    vendor: "",
    payable: "",
    received: "",
  });

  const [bookings, setBookings] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const { user } = useAuth();

  const queryClient = useQueryClient();

  const { data: bookingsData = [], isLoading } = useQuery({
    queryKey: ['ummrahBookings'],
    queryFn: () => dataService.fetchAll('ummrahBookings'),
    staleTime: 1000 * 30, // 5 mins cache
  });

  useEffect(() => {
    if (bookingsData) {
      setBookings(bookingsData);
      setLoading(false);
    }
  }, [bookingsData]);

  const calculateNights = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return "";
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    const diff = (outDate - inDate) / (1000 * 60 * 60 * 24);
    return diff > 0 ? diff : 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let updated = { ...formData, [name]: value };

    if (name === "payable" || name === "received") {
      updated.profit =
        Number(updated.received || 0) - Number(updated.payable || 0);
    }

    if (name === "makkahCheckIn" || name === "makkahCheckOut") {
      updated.makkahNights = calculateNights(
        updated.makkahCheckIn,
        updated.makkahCheckOut
      );
    }

    if (name === "madinahCheckIn" || name === "madinahCheckOut") {
      updated.madinahNights = calculateNights(
        updated.madinahCheckIn,
        updated.madinahCheckOut
      );
    }

    if (name === "makkahCheckInagain" || name === "makkahCheckOutagain") {
      updated.makkahagainNights = calculateNights(
        updated.makkahCheckInagain,
        updated.makkahCheckOutagain
      );
    }

    setFormData(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    for (let key in formData) {
      if (
        !formData[key] &&
        key !== "profit" &&
        key !== "makkahNights" &&
        key !== "madinahNights" &&
        key !== "makkahCheckInagain" &&
        key !== "makkahCheckOutagain" &&
        key !== "makkahagainhotel" &&
        key !== "makkahagainNights" &&
        key !== "email"
      ) {
        return toast.error(`Please enter ${key}`);
      }
    }
    try {
      setSaving(true);
      // ✅ Calculate scheduled dates for email tracking
      const now = new Date();
      const emailTracking = {
        bookingConfirmationSent: false,
        bookingConfirmationDate: null,
        approvalEmailSent: false,
        approvalDate: null,
        followUp1Sent: false,
        followUp1ScheduledDate: null,
        followUp1SentDate: null,
        followUp2Sent: false,
        followUp2ScheduledDate: null,
        followUp2SentDate: null,
      };

      const followUp1Date = new Date(now);
      followUp1Date.setDate(followUp1Date.getDate() + 2); // 2 days later
      const followUp2Date = new Date(now);
      followUp2Date.setDate(followUp2Date.getDate() + 7); // 7 days later
      
      emailTracking.followUp1ScheduledDate = followUp1Date;
      emailTracking.followUp2ScheduledDate = followUp2Date;

      const docRef = await addDoc(collection(db, "ummrahBookings"), {
        ...formData,
        payable: Number(formData.payable),
        received: Number(formData.received),
        profit: Number(formData.received) - Number(formData.payable),
        createdAt: new Date(),
        createdByUid: user?.uid,
        createdByEmail: user?.email,
        createdByName: user?.displayName || "Unknown",
        emailSent: false,
        emailTracking
      });

      // Bust this employee's Umrah cache so the new booking shows immediately.
      await dataService.clearMine("umrah", user.uid);
      queryClient.invalidateQueries({ queryKey: ["my-umrah", user.uid] });


      toast.success("Booking added successfully");
      setFormData({
        fullName: "",
        phone: "",
        email: "",
        passportNumber: "",
        visaNumber: "",
        makkahHotel: "",
        makkahCheckIn: "",
        makkahCheckOut: "",
        makkahNights: "",
        madinahHotel: "",
        madinahCheckIn: "",
        madinahCheckOut: "",
        madinahNights: "",
        makkahCheckInagain: "",
        makkahCheckOutagain: "",
        makkahagainhotel: "",
        makkahagainNights: "",
        vendor: "",
        payable: "",
        received: "",
      });
    } catch (err) {
      toast.error("Failed to add booking");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const resultsRef = useRef(null);
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchTerm.trim())
      return toast.error("Enter a name, passport or phone");
    const filtered = bookings.filter((b) =>
      Object.values(b)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
    setResults(filtered);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const clearSearch = () => {
    setResults([]);
    setSearchTerm("");
  };

  const viewAllBookings = () => {
    setResults(bookings);
    setSearchTerm("");
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const startEdit = (b) => {
    setEditingId(b.id);
    setEditData({ ...b });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    let updated = { ...editData, [name]: value };

    if (name === "payable") {
      updated.profit =
        Number(updated.received || 0) - Number(value || 0);
    }

    if (name === "makkahCheckIn" || name === "makkahCheckOut") {
      updated.makkahNights = calculateNights(
        updated.makkahCheckIn,
        updated.makkahCheckOut
      );
    }

    if (name === "madinahCheckIn" || name === "madinahCheckOut") {
      updated.madinahNights = calculateNights(
        updated.madinahCheckIn,
        updated.madinahCheckOut
      );
    }

    if (name === "makkahCheckInagain" || name === "makkahCheckOutagain") {
      updated.makkahagainNights = calculateNights(
        updated.makkahCheckInagain,
        updated.makkahCheckOutagain
      );
    }
    setEditData(updated);
  };

  const saveEdit = async (id) => {
    try {
      setSaving(true);
      const docRef = doc(db, "ummrahBookings", id);
      const { ...updateFields } = editData;
      await updateDoc(docRef, updateFields);
      toast.success("Booking updated!");
      setEditingId(null);
      setEditData({});
    } catch (err) {
      toast.error("Failed to update booking");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const generateUmrahPDF = (booking) => {
    if (!booking) return;

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    const startX = margin;
    const startY = margin;

    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.text("DATA DASH", pageWidth / 2, startY + 10, { align: "center" });

    doc.setFont("times", "italic");
    doc.setFontSize(10);
    doc.text("Your Trusted Umrah Partner", pageWidth / 2, startY + 16, { align: "center" });

    doc.setDrawColor(50, 50, 50);
    doc.line(margin, startY + 20, pageWidth - margin, startY + 20);

    doc.setFillColor(34, 139, 34);
    doc.rect(startX, startY + 25, contentWidth, 8, "F");
    doc.setFont("times", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("UMRAH BOOKING REPORT", pageWidth / 2, startY + 31, { align: "center" });

    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: startY + 38,
      margin: { left: startX, right: startX },
      tableWidth: contentWidth,
      head: [["Field", "Value", "Field", "Value"]],
      headStyles: {
        fillColor: [40, 40, 40],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      body: [
        ["Full Name", booking.fullName || "-", "Phone", booking.phone || "-"],
        ["Passport Number", booking.passportNumber || "-", "Visa Number", booking.visaNumber || "-"],
        ["Vendor", booking.vendor || "-", "Profit", `${booking.profit || 0}`],
        ["Payable", `PKR ${booking.payable || 0}`, "Received", `PKR ${booking.received || 0}`],
        ["Makkah Hotel", booking.makkahHotel || "-", "Nights", booking.makkahNights || "-"],
        ["Check In", booking.makkahCheckIn || "-", "Check Out", booking.makkahCheckOut || "-"],
        ["Madinah Hotel", booking.madinahHotel || "-", "Nights", booking.madinahNights || "-"],
        ["Check In", booking.madinahCheckIn || "-", "Check Out", booking.madinahCheckOut || "-"],
        ["2nd Makkah Hotel", booking.makkahagainhotel || "-", "Nights", booking.makkahagainNights || "-"],
        ["Check In", booking.makkahCheckInagain || "-", "Check Out", booking.makkahCheckOutagain || "-"],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    let finalY = doc.lastAutoTable.finalY + 20;
    doc.setFont("times", "italic");
    doc.setFontSize(9);
    doc.text("Authorized by Data Dash", margin, finalY);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth - margin, finalY, {
      align: "right",
    });

    doc.save(`Umrah_Booking_${booking.passportNumber}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900 mb-2">
            Umrah Bookings Management 🕋
          </h1>
          <p className="text-neutral-600 text-lg">
            Add, view, and manage your Umrah booking records.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6 md:p-8 mb-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">
            Add New Booking
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Info */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Full Name"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone Number"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Customer Email (for confirmation) — optional"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="text"
                name="passportNumber"
                value={formData.passportNumber}
                onChange={handleChange}
                placeholder="Passport Number"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="text"
                name="visaNumber"
                value={formData.visaNumber}
                onChange={handleChange}
                placeholder="Visa Number"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
              />
            </div>

            {/* Hotel Sections */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-neutral-200">
                <h3 className="text-lg font-bold text-neutral-900 mb-4">
                  Makkah Hotel Details
                </h3>
                <div className="grid gap-4">
                  <input
                    type="text"
                    name="makkahHotel"
                    value={formData.makkahHotel}
                    onChange={handleChange}
                    placeholder="Hotel Name"
                    className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                  <div className="flex gap-4">
                    <input
                      type="date"
                      name="makkahCheckIn"
                      value={formData.makkahCheckIn}
                      onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                    />
                    <input
                      type="date"
                      name="makkahCheckOut"
                      value={formData.makkahCheckOut}
                      onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Nights"
                    name="makkahNights"
                    value={formData.makkahNights}
                    readOnly
                    className="bg-neutral-100 text-neutral-600 rounded-lg px-4 py-3 border border-neutral-200 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-neutral-200">
                <h3 className="text-lg font-bold text-green-700 mb-4">
                  Madinah Hotel Details
                </h3>
                <div className="grid gap-4">
                  <input
                    type="text"
                    name="madinahHotel"
                    value={formData.madinahHotel}
                    onChange={handleChange}
                    placeholder="Hotel Name"
                    className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                  <div className="flex gap-4">
                    <input
                      type="date"
                      name="madinahCheckIn"
                      value={formData.madinahCheckIn}
                      onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                    />
                    <input
                      type="date"
                      name="madinahCheckOut"
                      value={formData.madinahCheckOut}
                      onChange={handleChange}
                      className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Nights"
                    name="madinahNights"
                    value={formData.madinahNights}
                    readOnly
                    className="bg-neutral-100 text-neutral-600 rounded-lg px-4 py-3 border border-neutral-200 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Second Makkah Section */}
            <div className="md:col-span-2 bg-white p-6 rounded-xl border border-neutral-200">
              <h3 className="text-lg font-bold text-neutral-900 mb-4">
                2nd Makkah Hotel (If applicable)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input
                  type="text"
                  name="makkahagainhotel"
                  value={formData.makkahagainhotel}
                  onChange={handleChange}
                  placeholder="Hotel Name"
                  className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                />
                <input
                  type="date"
                  name="makkahCheckInagain"
                  value={formData.makkahCheckInagain}
                  onChange={handleChange}
                  className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                />
                <input
                  type="date"
                  name="makkahCheckOutagain"
                  value={formData.makkahCheckOutagain}
                  onChange={handleChange}
                  className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                />
                <input
                  type="text"
                  placeholder="Nights"
                  name="makkahagainNights"
                  value={formData.makkahagainNights}
                  readOnly
                  className="bg-neutral-100 text-neutral-600 rounded-lg px-4 py-3 border border-neutral-200 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Financial Info */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <input
                type="text"
                name="vendor"
                value={formData.vendor}
                onChange={handleChange}
                placeholder="Vendor"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="number"
                name="payable"
                value={formData.payable}
                onChange={handleChange}
                placeholder="Payable Amount"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="number"
                name="received"
                value={formData.received}
                onChange={handleChange}
                placeholder="Received Amount"
                className="bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
              />
              <input
                type="text"
                name="profit"
                value={formData.profit}
                readOnly
                placeholder="Profit"
                className="bg-white text-green-700 font-bold rounded-lg px-4 py-3 border border-neutral-200 cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="col-span-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:bg-neutral-200 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <FaSpinner className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <FaPlus className="text-lg" /> Add Booking
                </>
              )}
            </button>
          </form>
        </div>

        {/* Search Section */}
        <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6 md:p-8 mb-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">
            Find a Booking
          </h2>
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                placeholder="Search by Name, Passport, or Phone..."
                className="w-full bg-white text-neutral-900 rounded-lg px-12 py-3 focus:ring-2 focus:ring-neutral-300 focus:border-transparent placeholder-neutral-500 border border-neutral-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-700 transition-colors"
              >
                Search
              </button>
              {results.length > 0 && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="p-3 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-colors"
                  title="Clear Results"
                >
                  <FaTimes size={20} />
                </button>
              )}
            </div>
          </form>
          <div className="mt-4 text-center">
            <Link
              type="button"
              to="/viewAllUmmrahBookings"
              className="px-6 py-3 bg-neutral-100 text-neutral-900 rounded-xl font-semibold hover:bg-neutral-200 transition-colors"
            >
              View All Bookings
            </Link>
          </div>
        </div>

        {/* Search Results */}
        {results.length > 0 && (
          <div ref={resultsRef} className="w-full">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Search Results</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {results.map((b) => (
                <div
                  key={b.id}
                  className="bg-white rounded-xl shadow-md border border-neutral-200 p-6 relative"
                >
                  {/* Actions */}
                  <div className="absolute top-4 right-4 flex flex-col sm:flex-row gap-2">
                    {editingId === b.id ? (
                      <button
                        onClick={() => saveEdit(b.id)}
                        disabled={saving}
                        className="bg-green-600 text-white px-3 py-1 rounded-md flex items-center justify-center gap-1 text-xs hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? <FaSpinner className="animate-spin" /> : <FaSave />}
                        {saving ? "" : "Save"}
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(b)}
                        className="bg-neutral-900 text-white px-3 py-1 rounded-md flex items-center justify-center gap-1 text-xs hover:bg-neutral-700 transition-colors"
                      >
                        <FaEdit /> Edit
                      </button>
                    )}
                  </div>

                  {editingId === b.id ? (
                    // Edit mode
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.keys(editData).map((key) =>
                        key === "id" || key === "createdAt" || key === "createdByUid" || key === "createdByEmail" || key === "createdByName" || key === "profit" || key === "received" ? null : (
                          <div key={key} className="flex flex-col">
                            <label className="text-xs font-medium text-neutral-600 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <input
                              type={key.includes("date") || key.includes("nights") || key.includes("payable") ? "number" : "text"}
                              value={editData[key] || ""}
                              onChange={handleEditChange}
                              name={key}
                              className="bg-white text-neutral-900 rounded-lg px-3 py-2 border border-neutral-200"
                            />
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    // View mode
                    <div className="flex flex-col gap-3">
                      <h2 className="text-xl font-bold text-neutral-900">
                        {b.fullName}
                      </h2>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-neutral-600 text-sm">
                        <p className="font-medium">
                          Phone: <span className="text-neutral-900">{b.phone}</span>
                        </p>
                        <p className="font-medium">
                          Passport: <span className="text-neutral-900">{b.passportNumber}</span>
                        </p>
                        <p className="font-medium">
                          Visa: <span className="text-neutral-900">{b.visaNumber}</span>
                        </p>
                      </div>

                      <div className="bg-white rounded-lg p-4 mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 border border-neutral-200">
                        <div>
                          <p className="font-semibold text-blue-700">Makkah Stay</p>
                          <p className="text-sm text-neutral-700 mt-1">Hotel: {b.makkahHotel}</p>
                          <p className="text-sm text-neutral-700">Dates: {b.makkahCheckIn} - {b.makkahCheckOut}</p>
                          <p className="text-sm text-neutral-700">Nights: {b.makkahNights}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-green-700">Madinah Stay</p>
                          <p className="text-sm text-neutral-700 mt-1">Hotel: {b.madinahHotel}</p>
                          <p className="text-sm text-neutral-700">Dates: {b.madinahCheckIn} - {b.madinahCheckOut}</p>
                          <p className="text-sm text-neutral-700">Nights: {b.madinahNights}</p>
                        </div>
                        {b.makkahagainhotel && (
                          <div>
                            <p className="font-semibold text-blue-700">2nd Makkah Stay</p>
                            <p className="text-sm text-neutral-700 mt-1">Hotel: {b.makkahagainhotel}</p>
                            <p className="text-sm text-neutral-700">Dates: {b.makkahCheckInagain} - {b.makkahCheckOutagain}</p>
                            <p className="text-sm text-neutral-700">Nights: {b.makkahagainNights}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <p className="font-medium">
                          Vendor: <span className="text-neutral-900">{b.vendor}</span>
                        </p>
                        <p className="font-medium">
                          Payable: <span className="text-red-700 font-bold">PKR {b.payable}</span>
                        </p>
                        <p className="font-medium">
                          Received: <span className="text-green-700 font-bold">PKR {b.received}</span>
                        </p>
                        <p className="font-medium">
                          Profit: <span className="text-yellow-700 font-bold">PKR {b.profit}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
