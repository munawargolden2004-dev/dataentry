import { useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, addDoc, Timestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import toast from "react-hot-toast";

// Importing icons for a richer UI
import { FaUser, FaBuilding, FaPassport, FaIdCard, FaGlobe, FaPhone, FaCalendarAlt, FaDollarSign, FaEnvelope } from "react-icons/fa";
import { BiChevronDown, BiCalculator } from "react-icons/bi";
import { MdOutlineAirlineSeatReclineExtra } from "react-icons/md";
import { Link } from "react-router-dom";
import { digitsOnly, decimalOnly, formatCNIC } from "../utils/validation";

// Integer-only vs money (decimal-allowed) fields (Req 4)
const MED_INT_FIELDS = ["age", "noOfdays", "contactNumber"];
const MED_MONEY_FIELDS = ["totalReceivedAmount", "totalPayableAmount"];

// Reusable Input Component to keep JSX clean
const FormInput = ({ field, formData, handleChange, errors }) => {
    const Icon = field.icon;
    const isSelect = field.type === "select";

    return (
        <div className="col-span-1 group relative">
            <label htmlFor={field.name} className="block text-sm font-semibold text-neutral-700 mb-2 transition-colors duration-300 group-focus-within:text-blue-400">
                {field.label} {field.required && <span className="text-red-700">*</span>}
            </label>
            <div className="relative">
                {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-blue-400 transition-colors" />}
                {isSelect ? (
                    <div className="relative">
                        <select
                            name={field.name}
                            id={field.name}
                            value={formData[field.name]}
                            onChange={handleChange}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-neutral-200 shadow-md focus:ring-4 focus:ring-neutral-300 focus:border-neutral-900 outline-none transition-all duration-300 bg-white text-neutral-900 cursor-pointer appearance-none"
                        >
                            <option value="" className="bg-white">Select {field.label}</option>
                            {field.options.map((opt, idx) => (
                                <option key={idx} value={opt} className="bg-white">{opt}</option>
                            ))}
                        </select>
                        <BiChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                    </div>
                ) : (
                    <input
                        type={field.type}
                        name={field.name}
                        id={field.name}
                        placeholder={field.placeholder}
                        value={formData[field.name]}
                        onChange={handleChange}
                        disabled={field.disabled}
                        className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-3 rounded-xl border border-neutral-200 shadow-md focus:ring-4 focus:ring-neutral-300 focus:border-neutral-900 outline-none transition-all duration-300 ${field.disabled ? "bg-white text-neutral-600 cursor-not-allowed" : "bg-white text-neutral-900 placeholder-neutral-500"
                            } ${errors[field.name] ? 'border-red-500' : ''}`}
                    />
                )}
                {errors[field.name] && <span className="text-red-700 text-xs mt-2 ml-1">{errors[field.name]}</span>}
            </div>
        </div>
    );
};

export default function MedicalInsurance() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const today = useMemo(() => new Date().toISOString().split('T')[0], []);

    const [formData, setFormData] = useState({
        NameofCompany: "",
        NameofInsured: "",
        email: "",
        age: "",
        passportNumber: "",
        Nic: "",
        countryofTravel: "",
        contactNumber: "",
        noOfdays: "",
        EffectiveDate: "",
        ExpiryDate: "",
        IssuedAt: "",
        totalReceivedAmount: "",
        totalPayableAmount: "",
        totalProfit: "",
        createdAt: today,
        createdByUid: user?.uid || "",
        userEmail: user?.email || "",
    });

    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const validate = () => {
        let newErrors = {};
        const requiredFields = [
            "NameofCompany", "NameofInsured", "age", "passportNumber", "Nic",
            "countryofTravel", "contactNumber", "noOfdays", "EffectiveDate",
            "ExpiryDate", "totalReceivedAmount", "totalPayableAmount"
        ];

        requiredFields.forEach(field => {
            if (!formData[field]) {
                newErrors[field] = `${field.replace(/([A-Z])/g, ' $1').trim()} is required.`;
            }
        });

        if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
            newErrors.email = "Please enter a valid email address.";
        }

        if (formData.age && (isNaN(formData.age) || Number(formData.age) <= 0)) {
            newErrors.age = "Age must be a positive number.";
        }

        if (formData.contactNumber && !/^\d{10,15}$/.test(formData.contactNumber)) {
            newErrors.contactNumber = "Contact number must be 10-15 digits.";
        }

        if (formData.noOfdays && (isNaN(formData.noOfdays) || Number(formData.noOfdays) <= 0)) {
            newErrors.noOfdays = "Number of days must be a positive number.";
        }

        const payable = Number(formData.totalPayableAmount);
        const received = Number(formData.totalReceivedAmount);

        if (isNaN(payable) || payable < 0) {
            newErrors.totalPayableAmount = "Enter a valid payable amount.";
        }
        if (isNaN(received) || received < 0) {
            newErrors.totalReceivedAmount = "Enter a valid received amount.";
        }

        // Date validation
        if (formData.EffectiveDate && formData.ExpiryDate) {
            const effectiveDate = new Date(formData.EffectiveDate);
            const expiryDate = new Date(formData.ExpiryDate);
            if (expiryDate <= effectiveDate) {
                newErrors.ExpiryDate = "Expiry date must be after the effective date.";
            }
        }

        return newErrors;
    };

    const handleChange = (e) => {
        const { name } = e.target;
        let value = e.target.value;
        // Block letters/special characters in numeric fields (Req 4)
        if (name === "Nic") value = formatCNIC(value); // 13-digit PK CNIC, dashed
        else if (MED_INT_FIELDS.includes(name)) value = digitsOnly(value);
        else if (MED_MONEY_FIELDS.includes(name)) value = decimalOnly(value);
        setFormData(prev => {
            const updatedForm = { ...prev, [name]: value };
            if (name === "totalPayableAmount" || name === "totalReceivedAmount") {
                const payable = Number(updatedForm.totalPayableAmount) || 0;
                const received = Number(updatedForm.totalReceivedAmount) || 0;
                updatedForm.totalProfit = received - payable;
            }
            return updatedForm;
        });

        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: "" }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) {
            toast.error("You must be logged in to create a record.");
            return;
        }

        const validationErrors = validate();
        setErrors(validationErrors);

        if (Object.keys(validationErrors).length > 0) {
            return;
        }

        setSubmitting(true);
        try {
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

            const dataToSave = {
                ...formData,
                age: Number(formData.age),
                noOfdays: Number(formData.noOfdays),
                totalPayableAmount: Number(formData.totalPayableAmount),
                totalReceivedAmount: Number(formData.totalReceivedAmount),
                totalProfit: Number(formData.totalProfit),
                createdAt: Timestamp.now(),
                emailSent: false,
                emailTracking
            };

            const docRef = await addDoc(collection(db, "medical_insurance"), dataToSave);

            // Bust this employee's medical cache so the new record shows immediately.
            await dataService.clearMine("medical", user.email);
            queryClient.invalidateQueries({ queryKey: ["my-medical", user.email] });

            toast.success("Medical Insurance record added successfully! 🎉");

            // Reset form
            setFormData({
                NameofCompany: "",
                NameofInsured: "",
                email: "",
                age: "",
                passportNumber: "",
                Nic: "",
                countryofTravel: "",
                contactNumber: "",
                noOfdays: "",
                EffectiveDate: "",
                ExpiryDate: "",
                IssuedAt: "",
                totalReceivedAmount: "",
                totalPayableAmount: "",
                totalProfit: "",
                createdAt: today,
                createdByUid: user.uid,
                userEmail: user.email,
            });
            setErrors({});

        } catch (error) {
            console.error("Error submitting form: ", error);
            toast.error("Failed to add medical insurance record. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const formFields = [
        { label: "Company Name", name: "NameofCompany", type: "text", placeholder: "Enter Company Name", required: true, icon: FaBuilding },
        { label: "Insured's Name", name: "NameofInsured", type: "text", placeholder: "Enter Name of Insured", required: true, icon: FaUser },
        { label: "Client Email", name: "email", type: "email", placeholder: "Enter Email Address", required: false, icon: FaEnvelope },
        { label: "Age", name: "age", type: "number", placeholder: "Enter Age", required: true, icon: MdOutlineAirlineSeatReclineExtra },
        { label: "Passport Number", name: "passportNumber", type: "text", placeholder: "Enter Passport Number", required: true, icon: FaPassport },
        { label: "NIC", name: "Nic", type: "text", placeholder: "Enter NIC", required: true, icon: FaIdCard },
        { label: "Country of Travel", name: "countryofTravel", type: "text", placeholder: "Enter Country of Travel", required: true, icon: FaGlobe },
        { label: "Contact Number", name: "contactNumber", type: "text", placeholder: "Enter Contact Number", required: true, icon: FaPhone },
        { label: "Number of Days", name: "noOfdays", type: "number", placeholder: "Enter No of days", required: true, icon: BiCalculator },
        { label: "Effective Date", name: "EffectiveDate", type: "date", placeholder: "Select Effective Date", required: true, icon: FaCalendarAlt },
        { label: "Expiry Date", name: "ExpiryDate", type: "date", placeholder: "Select Expiry Date", required: true, icon: FaCalendarAlt },
        { label: "Issued At", name: "IssuedAt", type: "text", placeholder: "e.g., Lahore", required: false, icon: FaGlobe },
        { label: "Total Received Amount", name: "totalReceivedAmount", type: "number", placeholder: "Enter Received Amount", required: true, icon: FaDollarSign },
        { label: "Total Payable Amount", name: "totalPayableAmount", type: "number", placeholder: "Enter Payable Amount", required: true, icon: FaDollarSign },
        { label: "Total Profit", name: "totalProfit", type: "number", placeholder: "Auto Calculated", required: false, disabled: true, icon: FaDollarSign },
    ];

    return (
        <div className="relative min-h-screen bg-neutral-50 overflow-hidden font-sans text-neutral-900 flex items-center justify-center p-8">
            {/* Background Animations */}
            <div className="absolute inset-0 z-0 bg-travel-grid">
                <div className="hidden"></div>
                <div className="hidden absolute inset-0 z-10 animate-pulse-light"></div>
                <div className="hidden"></div>
                <div className="hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] border-2 border-dashed border-blue-500/30 rounded-full animate-rotate-slow"></div>
                <div className="hidden absolute top-1/4 left-1/4 w-40 h-40 bg-blue-500/20 blur-3xl animate-blob-pulse-1"></div>
                <div className="hidden absolute bottom-1/4 right-1/4 w-40 h-40 bg-green-500/20 blur-3xl animate-blob-pulse-2"></div>
            </div>

            {/* Main Content Container */}
            <div className="relative z-20 w-full max-w-6xl animate-fade-in-up">
                <div className="bg-white backdrop-blur-xl border border-neutral-200 shadow-md rounded-3xl p-10 transform transition-all duration-500 hover:scale-[1.005] hover:shadow-3xl">
                    {/* Header */}
                    <div className="flex items-center justify-center gap-4 mb-12 text-center">
                        <FaBuilding className="text-teal-700 text-5xl animate-pulse-slow" />
                        <h1 className="text-4xl font-extrabold text-neutral-900 tracking-wider">
                            Medical Insurance Form
                        </h1>
                    </div>

                    {/* User Info */}
                    <div className="mb-8 p-5 bg-blue-50 rounded-2xl border border-blue-200 shadow-inner flex items-center gap-4 animate-fade-in-up">
                        <FaUser className="text-blue-700 text-2xl" />
                        <div>
                            <Link
                                to={"/viewAllmedBookings"}
                                className="text-lg font-semibold text-neutral-900 hover:underline hover:text-blue-800 transition"

                            >
                                View All Medical Bookings
                            </Link>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {formFields.map((field) => (
                            <FormInput
                                key={field.name}
                                field={field}
                                formData={formData}
                                handleChange={handleChange}
                                errors={errors}
                            />
                        ))}

                        {/* Submit Button */}
                        <div className="md:col-span-2 pt-6">
                            <button
                                type="submit"
                                disabled={submitting || !user}
                                className={`w-full py-4 rounded-full font-bold text-lg shadow-sm transform transition-all duration-300 ease-in-out hover:shadow-md flex items-center justify-center gap-3 ${submitting || !user ? "bg-neutral-100 text-neutral-500 cursor-not-allowed" : "bg-gradient-to-r from-neutral-900 to-neutral-900 text-white hover:from-neutral-700 hover:to-neutral-700"
                                    }`}
                            >
                                {submitting ? (
                                    <>
                                        <span className="animate-spin h-5 w-5 border-2 border-neutral-200 border-t-transparent rounded-full"></span>
                                        <span>Submitting...</span>
                                    </>
                                ) : (
                                    <span>Save Record</span>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Tailwind CSS keyframes for animation (copied from your original) */}
            <style jsx>{`hidden 
                .bg-travel-grid {
                    background-image: none;
                    background-size: 50px 50px, 50px 50px;
                }
                @keyframes grid-pan {
                    from { background-position: 0 0, 0 0; }
                    to { background-position: 50px 50px, 50px 50px; }
                }
                .animate-pulse-light { animation: pulse-light 10s ease-in-out infinite; }
                @keyframes pulse-light {
                    0%, 100% { box-shadow: none; }
                    50% { box-shadow: none; }
                }
                .animate-rotate-slow { animation: rotate-slow 120s linear infinite; }
                @keyframes rotate-slow {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                .animate-blob-pulse-1 { animation: blob-pulse 20s ease-in-out infinite; }
                .animate-blob-pulse-2 { animation: blob-pulse 18s ease-in-out infinite reverse; }
                @keyframes blob-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.2); }
                }
                .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-pulse-slow { animation: pulse-slow 3s infinite; }
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.05); }
                }
            `}</style>
        </div>
    );
}
