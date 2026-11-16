import { useState } from "react";
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import toast from "react-hot-toast";
import { FaPlus, FaSpinner, FaEye, FaIdCard, FaUser, FaBuilding, FaBed, FaMale, FaChild, FaCalendarDay, FaCreditCard, FaDollarSign, FaMoneyBillWave, FaEdit } from "react-icons/fa";
import Footer from "../Components/Footer";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { digitsOnly, decimalOnly } from "../utils/validation";

// Integer-only fields vs money (decimal-allowed) fields (Req 4)
const HOTEL_INT_FIELDS = ["numberOfRooms", "numberOfAdults", "numberOfChildren"];
const HOTEL_MONEY_FIELDS = ["payable", "received"];

function HotelBookings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    bookingId: "",
    clientName: "",
    property: "",
    numberOfRooms: "",
    numberOfAdults: "",
    numberOfChildren: "",
    arrivalDate: "",
    departureDate: "",
    nightsStayed: "",
    paymentMethod: "",
    payable: "",
    received: "",
    profit: "",
    care:"",
    careContact:"",
    careEmail:"",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const calculateNights = (arrival, departure) => {
    if (!arrival || !departure) return "";
    const arrivalDate = new Date(arrival);
    const departureDate = new Date(departure);
    const diff = (departureDate - arrivalDate) / (1000 * 60 * 60 * 24);
    return diff > 0 ? Math.floor(diff) : 0;
  };

  const handleChange = (e) => {
    const { name } = e.target;
    let value = e.target.value;
    // Block letters/special characters in numeric fields (Req 4)
    if (HOTEL_INT_FIELDS.includes(name)) value = digitsOnly(value);
    else if (HOTEL_MONEY_FIELDS.includes(name)) value = decimalOnly(value);
    let updated = { ...formData, [name]: value };

    if (name === "received" || name === "payable") {
      updated.profit =
        Number(updated.received || 0) - Number(updated.payable || 0);
    }

    if (name === "arrivalDate" || name === "departureDate") {
      updated.nightsStayed = calculateNights(
        updated.arrivalDate,
        updated.departureDate
      );
    }

    setFormData(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Simple validation
    for (let key in formData) {
      if (
        !formData[key] &&
        key !== "notes" &&
        key !== "nightsStayed" &&
        key !== "profit"
      ) {
        return toast.error(`Please enter ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      }
    }

    try {
      setSaving(true);
      await addDoc(collection(db, "HotelBookings"), {
        ...formData,
        payable: Number(formData.payable),
        received: Number(formData.received),
        profit: Number(formData.received) - Number(formData.payable),
        nightsStayed: Number(formData.nightsStayed),
        createdAt: serverTimestamp(),
        createdByUid: user.uid,        // ✅ who created it
        userEmail: user.email,         // ✅ store email

      });

      // Bust this employee's hotel cache so the new booking shows immediately.
      await dataService.clearMine("hotels", user.email);
      queryClient.invalidateQueries({ queryKey: ["my-hotels", user.email] });

      toast.success("Hotel booking added successfully!");
      setFormData({
        bookingId: "",
        clientName: "",
        property: "",
        numberOfRooms: "",
        numberOfAdults: "",
        numberOfChildren: "",
        arrivalDate: "",
        departureDate: "",
        nightsStayed: "",
        paymentMethod: "",
        payable: "",
        received: "",
        profit: "",
        care:"",
        careContact:"",
        careEmail:"",
        notes: "",
      });
    } catch (err) {
      console.error("Error adding document: ", err);
      toast.error("Failed to add hotel booking.");
    } finally {
      setSaving(false);
    }
  };

  const handleViewAllBookings = () => {
    navigate("/view-all-hotel-bookings");
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-neutral-900 mb-2">
            Hotel Bookings 🏨
          </h1>
          <p className="text-neutral-600 text-lg">
            Add and manage your hotel booking records.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-md border border-neutral-200 p-6 md:p-8 mb-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">
            Add New Hotel Booking
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Booking & Client Info */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Booking ID</label>
                <div className="relative">
                  <FaIdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="bookingId"
                    value={formData.bookingId}
                    onChange={handleChange}
                    placeholder="Booking ID"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Client Name</label>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleChange}
                    placeholder="Client Name"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
            </div>
            
            {/* Property & Room Details */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Property Name</label>
                <div className="relative">
                  <FaBuilding className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="property"
                    value={formData.property}
                    onChange={handleChange}
                    placeholder="Property Name"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Number of Rooms</label>
                <div className="relative">
                  <FaBed className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="number"
                    name="numberOfRooms"
                    value={formData.numberOfRooms}
                    onChange={handleChange}
                    placeholder="Number of Rooms"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
            </div>

            {/* Guest Details */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Number of Adults</label>
                <div className="relative">
                  <FaMale className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="number"
                    name="numberOfAdults"
                    value={formData.numberOfAdults}
                    onChange={handleChange}
                    placeholder="Number of Adults"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Number of Children</label>
                <div className="relative">
                  <FaChild className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="number"
                    name="numberOfChildren"
                    value={formData.numberOfChildren}
                    onChange={handleChange}
                    placeholder="Number of Children"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
            </div>

            {/* Dates & Nights */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Arrival Date</label>
                <div className="relative">
                  <FaCalendarDay className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="date"
                    name="arrivalDate"
                    value={formData.arrivalDate}
                    onChange={handleChange}
                    className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 pl-12 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Departure Date</label>
                <div className="relative">
                  <FaCalendarDay className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="date"
                    name="departureDate"
                    value={formData.departureDate}
                    onChange={handleChange}
                    className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 pl-12 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Nights Stayed</label>
                <div className="relative">
                  <FaEdit className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="number"
                    name="nightsStayed"
                    value={formData.nightsStayed}
                    placeholder="Nights Stayed"
                    readOnly
                    className="w-full bg-white text-neutral-600 rounded-lg px-4 py-3 pl-12 border border-neutral-200 cursor-not-allowed"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Care Name</label>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="care"
                    value={formData.care}
                    onChange={handleChange}
                    placeholder="Care Name"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Care Contact</label>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="careContact"
                    value={formData.careContact}
                    onChange={handleChange}
                    placeholder="Care Contact"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Care Email</label>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="careEmail"
                    value={formData.careEmail}
                    onChange={handleChange}
                    placeholder="Care Email"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
            </div>
            

            {/* Financial Info */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Payment Method</label>
                <div className="relative">
                  <FaCreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="paymentMethod"
                    value={formData.paymentMethod}
                    onChange={handleChange}
                    placeholder="Payment Method"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Payable Amount</label>
                <div className="relative">
                  <FaDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="number"
                    name="payable"
                    value={formData.payable}
                    onChange={handleChange}
                    placeholder="Payable Amount"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Received Amount</label>
                <div className="relative">
                  <FaMoneyBillWave className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="number"
                    name="received"
                    value={formData.received}
                    onChange={handleChange}
                    placeholder="Received Amount"
                    className="w-full bg-white text-neutral-900 rounded-lg pl-12 pr-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Profit</label>
                <div className="relative">
                  <FaDollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input
                    type="text"
                    name="profit"
                    value={formData.profit}
                    readOnly
                    placeholder="Profit"
                    className="w-full bg-white text-green-700 font-bold rounded-lg pl-12 pr-4 py-3 border border-neutral-200 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Notes Textarea */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-600 mb-1">Notes / Additional Details</label>
              <textarea
                name="notes"
                rows="4"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Add any additional notes here..."
                className="w-full bg-white text-neutral-900 rounded-lg px-4 py-3 focus:ring-2 focus:ring-neutral-300 placeholder-neutral-500 border border-neutral-200"
              ></textarea>
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

        {/* View All Bookings Button */}
        <div className="text-center mt-8">
          <Link
            to={"/viewallHotelbookings"}
            className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold flex items-center justify-center gap-2 mx-auto hover:bg-neutral-700 transition-colors"
          >
            <FaEye /> View All Hotel Bookings
          </Link>
        </div>

      </div>
      <Footer />
    </div>
  );
}

export default HotelBookings;
