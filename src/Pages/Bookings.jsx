import { useState } from "react";
import { MdFlightTakeoff } from "react-icons/md";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import {
  FaPassport,
  FaUser,
  FaGlobeEurope,
  FaDollarSign,
  FaCreditCard,
  FaCalendarAlt,
  FaAt,
  FaPhone,
  FaLink,
  FaCommentDots,
  FaStore,
} from "react-icons/fa";
import { RiVisaLine, RiPlaneLine, RiHandCoinLine } from "react-icons/ri";
import { BiChevronDown, BiCheckCircle } from "react-icons/bi";
import { blockInvalidNumberKeys } from "../utils/validation";

// ✅ Curated visa destination list (prevents typos like "Pakistan" instead of intended country)
const VISA_COUNTRIES = [
  "Azerbaijan", "Cambodia", "China", "Egypt", "Hong Kong", "Indonesia",
  "Japan", "Kazakhstan", "Kyrgyzstan", "Malaysia", "Nepal", "Philippines",
  "Saudi Arabia", "Singapore", "Sri Lanka", "Tajikistan", "Thailand",
  "Turkey", "Uzbekistan", "Vietnam",
  // Schengen/File Processing
  "Australia", "Belgium", "Canada", "Czech Republic", "Denmark", "France",
  "Germany", "Greece", "Hungary", "Italy", "Netherlands", "Norway",
  "Poland", "Portugal", "Spain", "Sweden", "Switzerland", "UK", "USA",
].sort();

export default function Bookings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    passport: "",
    fullName: "",
    visaType: "",
    date: today,
    sentToEmbassy: "",
    receivedFromEmbassy: "",
    totalFee: "",
    receivedFee: "",
    remainingFee: "",
    profit: "",
    paymentStatus: "",
    country: "",
    visaStatus: "",
    embassyFee: "",
    email: "",
    phone: "",
    expiryDate: "",
    reference: "",
    remarks: "",
    vendor: "",
    vendorContact: "",
    vendorFee: "",
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation
  const validate = async () => {
    let newErrors = {};

    if (!form.passport) newErrors.passport = "Passport number is required.";
    if (!/^[A-Za-z ]+$/.test(form.fullName.trim()))
      newErrors.fullName = "Name must contain only letters.";
    if (!form.visaType) newErrors.visaType = "Visa type is required.";
    if (!form.totalFee || isNaN(form.totalFee))
      newErrors.totalFee = "Enter valid total fee.";
    if (form.receivedFee === "" || isNaN(form.receivedFee)) {
      newErrors.receivedFee = "Enter valid received fee.";
    } else if (Number(form.receivedFee) < 0) {
      newErrors.receivedFee = "Received fee cannot be negative.";
    } else if (Number(form.receivedFee) > Number(form.totalFee)) {
      newErrors.receivedFee = "Cannot exceed total fee.";
    }

    if (!form.paymentStatus) newErrors.paymentStatus = "Select payment status.";
    if (!form.country) newErrors.country = "Country required.";
    if (!form.visaStatus) newErrors.visaStatus = "Visa status required.";

    // MODIFIED: Stronger check for embassyFee
    if (form.embassyFee === "" || isNaN(form.embassyFee))
      newErrors.embassyFee = "Embassy fee must be a valid number.";

    if (!form.email) newErrors.email = "Email is required.";
    if (!/^\d{10,15}$/.test(form.phone))
      newErrors.phone = "Phone must be 10–15 digits.";
    if (!form.expiryDate) {
      newErrors.expiryDate = "Expiry date required.";
    } else {
      const applyDate = new Date(form.date);
      const expiry = new Date(form.expiryDate);
      const minExpiry = new Date(applyDate);
      minExpiry.setMonth(minExpiry.getMonth() + 7);
      if (expiry < minExpiry) {
        newErrors.expiryDate =
          "Expiry must be at least 7 months after application date.";
      }
    }

    // MODIFIED: Validate vendor fields if any vendor info is provided, regardless of visa type.
    // This makes them optional but ensures data integrity if used.
    if (form.vendor || form.vendorContact || form.vendorFee) {
      if (!form.vendor) newErrors.vendor = "Vendor name is required if other vendor details are provided.";
      if (!form.vendorContact) newErrors.vendorContact = "Vendor contact is required if other vendor details are provided.";
      if (form.vendorFee === "" || isNaN(form.vendorFee)) {
        newErrors.vendorFee = "Vendor fee must be a valid number.";
      }
    }


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // MODIFIED: Auto-calc Remaining Fee + Profit (Formula now always includes vendor fee)
  const handleChange = (e) => {
    const { name, value } = e.target;
    let updatedForm = { ...form, [name]: value };

    const total = Number(name === "totalFee" ? value : form.totalFee) || 0;
    const received = Number(name === "receivedFee" ? value : form.receivedFee) || 0;
    const embassy = Number(name === "embassyFee" ? value : form.embassyFee) || 0;
    const vendor = Number(name === "vendorFee" ? value : form.vendorFee) || 0;

    // ✅ Prevent negative remaining fee
    updatedForm.remainingFee = Math.max(0, total - received);
    // The formula correctly includes all costs now
    updatedForm.profit = total - embassy - vendor;

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }

    setForm(updatedForm);
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {

      toast.error("You must be logged in to create bookings.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (!(await validate())) {
        setIsSubmitting(false);
        return;
      }


      // ✅ Calculate scheduled dates based on visa status
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
        followUp3Sent: false,
        followUp3ScheduledDate: null,
        followUp3SentDate: null,
        followUp4Sent: false,
        followUp4ScheduledDate: null,
        followUp4SentDate: null,
        lastRecurringEmailDate: null,
        nextRecurringEmailDate: null,
      };

      // The next pending follow-up date — powers the efficient cron query (Req 1/2).
      // Null unless a Processing/Approved schedule is set below.
      let nextEmailDue = null;

      // If status is Processing, schedule follow-ups 1 & 2
      // NOTE: Appointment-type visas must NEVER trigger emails/follow-ups (Req 5)
      if (form.visaStatus === "Processing" && form.visaType !== "Appointment") {
        const followUp1Date = new Date(now);
        followUp1Date.setDate(followUp1Date.getDate() + 2); // 2 days later

        const followUp2Date = new Date(now);
        followUp2Date.setDate(followUp2Date.getDate() + 7); // 7 days later

        emailTracking.followUp1ScheduledDate = followUp1Date;
        emailTracking.followUp2ScheduledDate = followUp2Date;
        nextEmailDue = followUp1Date; // earliest pending
      }

      // If status is Approved, schedule follow-ups 3, 4, and recurring
      // NOTE: Appointment-type visas must NEVER trigger emails/follow-ups (Req 5)
      if (form.visaStatus === "Approved" && form.visaType !== "Appointment") {
        const followUp3Date = new Date(now);
        followUp3Date.setMonth(followUp3Date.getMonth() + 1); // 1 month later

        const followUp4Date = new Date(now);
        followUp4Date.setMonth(followUp4Date.getMonth() + 3); // 3 months later

        const recurringDate = new Date(now);
        recurringDate.setMonth(recurringDate.getMonth() + 6); // 6 months later

        emailTracking.followUp3ScheduledDate = followUp3Date;
        emailTracking.followUp4ScheduledDate = followUp4Date;
        emailTracking.nextRecurringEmailDate = recurringDate;
        nextEmailDue = followUp3Date; // earliest pending
      }

      const bookingData = {
        ...form,
        totalFee: Number(form.totalFee) || 0,
        receivedFee: Number(form.receivedFee) || 0,
        remainingFee: Number(form.remainingFee) || 0,
        profit: Number(form.profit) || 0,
        embassyFee: Number(form.embassyFee) || 0,
        reference: form.reference,
        vendorFee: Number(form.vendorFee) || 0,
        userId: user.uid,
        userEmail: user.email,
        createdAt: Timestamp.now(),
        emailSent: false,
        emailTracking,
        nextEmailDue, // drives the efficient follow-up cron query (null if none)
      };

      const docRef = await addDoc(collection(db, "bookings"), bookingData);

      // Bust this employee's visa cache so the new record shows immediately
      // on My Visa Records / Countries / Search (no reload needed).
      await dataService.clearMine("visa", user.uid);
      queryClient.invalidateQueries({ queryKey: ["my-visa-bookings", user.uid] });


      toast.success("Booking saved successfully!");

      setForm({
        passport: "",
        fullName: "",
        visaType: "",
        date: today,
        sentToEmbassy: "",
        receivedFromEmbassy: "",
        totalFee: "",
        receivedFee: "",
        remainingFee: "",
        profit: "",
        paymentStatus: "",
        country: "",
        visaStatus: "",
        embassyFee: "",
        email: "",
        phone: "",
        expiryDate: "",
        reference: "",
        remarks: "",
        vendor: "",
        vendorContact: "",
        vendorFee: "",
      });
      setErrors({});
    } catch (error) {
      console.error("Error saving booking:", error);
      toast.error("Error saving booking!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formFields = [
    { label: "Passport No", name: "passport", type: "text", placeholder: "AB1234567", icon: FaPassport },
    { label: "Expiry Date", name: "expiryDate", type: "date", icon: FaCalendarAlt },
    { label: "Full Name", name: "fullName", type: "text", placeholder: "John Doe", icon: FaUser },
    {
      label: "Visa Type",
      name: "visaType",
      type: "select",
      options: ["Business", "Tourism", "Family Visit", "National Visa", "Appointment"],
      icon: RiVisaLine,
    },
    { label: "Application Date", name: "date", type: "date", readonly: true, icon: FaCalendarAlt },
    { label: "Country", name: "country", type: "select", options: VISA_COUNTRIES, icon: FaGlobeEurope },
    {
      label: "Visa Status",
      name: "visaStatus",
      type: "select",
      options: ["Approved", "Rejected", "Processing"],
      icon: BiCheckCircle,
    },
    { label: "Total Fee", name: "totalFee", type: "number", placeholder: "0", icon: FaDollarSign },
    { label: "Received Fee", name: "receivedFee", type: "number", placeholder: "0", icon: RiHandCoinLine },
    { label: "Remaining Fee", name: "remainingFee", type: "number", readonly: true, icon: FaCreditCard },
    { label: "Embassy Fee", name: "embassyFee", type: "number", placeholder: "0", icon: FaDollarSign },
    { label: "Profit", name: "profit", type: "number", readonly: true, icon: RiHandCoinLine },
    {
      label: "Payment Status",
      name: "paymentStatus",
      type: "select",
      options: ["Paid", "Unpaid", "Partially Paid"],
      icon: FaCreditCard,
    },
    { label: "Reference", name: "reference", type: "text", placeholder: "Wajahat Ali", icon: FaLink },
    { label: "Email", name: "email", type: "email", placeholder: "john.doe@example.com", icon: FaAt },
    { label: "Phone", name: "phone", type: "text", placeholder: "03XXXXXXXXX", icon: FaPhone },
    // NEW: Added vendor fields directly to the main form array to always display them
    { label: "Vendor Name", name: "vendor", type: "text", placeholder: "Optional", icon: FaStore },
    { label: "Vendor Contact", name: "vendorContact", type: "text", placeholder: "Optional", icon: FaPhone },
    { label: "Vendor Fee", name: "vendorFee", type: "number", placeholder: "0", icon: FaDollarSign },
  ];

  return (
    <div className="relative min-h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900 flex items-center justify-center p-8">
      {/* ... keep the same UI / animations ... */}

      <div className="absolute inset-0 z-0 bg-travel-grid">
        <div className="hidden"></div>
        <div className="hidden absolute inset-0 z-10 animate-pulse-light"></div>
        <div className="hidden"></div>
        <div className="hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] border-2 border-dashed border-blue-500/30 rounded-full animate-rotate-slow"></div>
        <div className="hidden absolute top-1/4 left-1/4 w-40 h-40 bg-blue-500/20 blur-3xl animate-blob-pulse-1"></div>
        <div className="hidden absolute bottom-1/4 right-1/4 w-40 h-40 bg-green-500/20 blur-3xl animate-blob-pulse-2"></div>
      </div>

      <div className="relative z-20 w-full max-w-6xl animate-fade-in-up">
        <div className="bg-white backdrop-blur-xl border border-neutral-200 shadow-md rounded-3xl p-10">
          {/* Header */}
          <div className="flex items-center justify-center gap-4 mb-12 text-center">
            <MdFlightTakeoff className="text-blue-700 text-5xl" />
            <h1 className="text-4xl font-extrabold text-neutral-900 tracking-wider">
              Visa Bookings
            </h1>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {/* Common Fields */}
            {formFields.map((field, i) => (
              <div key={i} className="col-span-1 group relative">
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  {field.label}
                </label>
                <div className="relative">
                  {field.type === "select" ? (
                    <div className="relative">
                      <field.icon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <select
                        name={field.name}
                        value={form[field.name]}
                        onChange={handleChange}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900"
                      >
                        <option value="">Select {field.label}</option>
                        {field.options.map((opt, idx) => (
                          <option key={idx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <BiChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                    </div>
                  ) : (
                    <>
                      <field.icon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <input
                        type={field.type}
                        name={field.name}
                        value={form[field.name]}
                        onChange={handleChange}
                        onKeyDown={field.type === "number" ? blockInvalidNumberKeys : undefined}
                        readOnly={field.readonly}
                        placeholder={field.placeholder}
                        className={`w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 ${field.readonly
                          ? "bg-white text-neutral-600"
                          : "bg-white text-neutral-900"
                          }`}
                      />
                    </>
                  )}
                  {errors[field.name] && (
                    <p className="text-red-700 text-xs mt-2 ml-1">
                      {errors[field.name]}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* MODIFIED: Conditional Fields for non-appointment types */}
            {form.visaType !== "Appointment" && (
              <>
                {/* Embassy Dates */}
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">
                    Sent To Embassy
                  </label>
                  <div className="relative">
                    <RiPlaneLine className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      name="sentToEmbassy"
                      value={form.sentToEmbassy}
                      onChange={handleChange}
                      placeholder="e.g., 20/sep/2025"
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900"
                    />
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">
                    Received From Embassy
                  </label>
                  <div className="relative">
                    <RiPlaneLine className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      name="receivedFromEmbassy"
                      value={form.receivedFromEmbassy}
                      onChange={handleChange}
                      placeholder="e.g., 25/sep/2025"
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Remarks */}
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Remarks
              </label>
              <div className="relative">
                <FaCommentDots className="absolute left-4 top-4 text-neutral-500" />
                <textarea
                  name="remarks"
                  value={form.remarks}
                  onChange={handleChange}
                  placeholder="Additional notes..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900"
                  rows="3"
                />
              </div>
              {errors.remarks && <p className="text-red-700 text-xs">{errors.remarks}</p>}
            </div>

            {/* Save Button */}
            <div className="md:col-span-2 lg:col-span-3 pt-6">
              <button
                type="submit"
                disabled={isSubmitting || !user}
                className={`w-full py-4 rounded-full font-bold text-lg flex items-center justify-center gap-3 ${isSubmitting || !user
                  ? "bg-neutral-100 text-neutral-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-neutral-900 to-neutral-900 text-white"
                  }`}
              >
                {!user ? (
                  "Please Login to Continue"
                ) : isSubmitting ? (
                  <>
                    <span className="animate-spin h-5 w-5 border-2 border-neutral-200 border-t-transparent rounded-full"></span>
                    Saving...
                  </>
                ) : (
                  "Save Booking"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>


      {/* Tailwind CSS keyframes for animation */}
      <style>{`hidden 
        /* ... All your existing animation styles remain the same ... */

        .bg-travel-grid {
          background-image: none;
          background-size: 50px 50px, 50px 50px;
        }

        @keyframes grid-pan {
          from {
            background-position: 0 0, 0 0;
          }
          to {
            background-position: 50px 50px, 50px 50px;
          }
        }

        .animate-pulse-light {
          animation: pulse-light 10s ease-in-out infinite;
        }

        @keyframes pulse-light {
          0%, 100% {
            box-shadow: none;
          }
          50% {
            box-shadow: none;
          }
        }

        .animate-rotate-slow {
          animation: rotate-slow 120s linear infinite;
        }
        @keyframes rotate-slow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        .animate-blob-pulse-1 {
          animation: blob-pulse 20s ease-in-out infinite;
        }
        .animate-blob-pulse-2 {
          animation: blob-pulse 18s ease-in-out infinite reverse;
        }
        @keyframes blob-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
