import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./Components/Navbar";

// Code Splitting - Lazy load all pages
const Login = lazy(() => import("./Authentication/Login"));
const Bookings = lazy(() => import("./Pages/Bookings"));
const ApprovedVisas = lazy(() => import("./Pages/ApprovedVisas"));
const DeletedVisas = lazy(() => import("./Pages/DeletedVisas"));
const Countries = lazy(() => import("./Pages/Countries"));
const Search = lazy(() => import("./Pages/Search"));
const Reports = lazy(() => import("./Pages/Reports"));
const AdminLogin = lazy(() => import("./Pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./Pages/AdminDashboard"));
const Home = lazy(() => import("./Pages/Home"));
const Ticketing = lazy(() => import("./Pages/Ticketing"));
const Viewall = lazy(() => import("./Pages/Viewall"));
const AdminTicketBookings = lazy(() => import("./Pages/AdminTicketBookings"));
const UmmrahBookings = lazy(() => import("./Pages/UmmrahBookings"));
const AdminHome = lazy(() => import("./Pages/AdminHome"));
const UmmrahBokkingDet = lazy(() => import("./Pages/UmmrahBokkingDet"));
const EmployeeRecord = lazy(() => import("./Pages/EmployeeRecord"));
const CountriesWiseDet = lazy(() => import("./Pages/CountriesWiseDet"));
const ViewallUmmarhBookings = lazy(() => import("./Pages/ViewallUmmarhBookings"));
const HotelBookings = lazy(() => import("./Pages/HotelBookings"));
const ViewAllHotelBookings = lazy(() => import("./Pages/ViewAllhotelbookings"));
const HoetlDetAdminSide = lazy(() => import("./Pages/HoetlDetAdminSide"));
const MedicalInsurence = lazy(() => import("./Pages/MedicalInsurence"));
const ViewAllMedicalBookings = lazy(() => import("./Pages/ViewAllMedicalBookings"));
const AdminSideMedicalInsurrance = lazy(() => import("./Pages/AdminSideMedicalInsurrance"));
const CustomerCountryPage = lazy(() => import("./Pages/CustomerCountryPage"));
const DetaliedSearchPage = lazy(() => import("./Pages/DetaliedSearchPage"));
const ViewAnalytics = lazy(() => import("./Pages/ViewAnalytics"));
const SuperAdminDashboard = lazy(() => import("./Pages/SuperAdminDashboard"));
const AdminManageEmployees = lazy(() => import("./Pages/AdminManageEmployees"));
const Invoices = lazy(() => import("./Pages/Invoices"));
const Expenses = lazy(() => import("./Pages/Expenses"));
const Ledgers = lazy(() => import("./Pages/Ledgers"));
const BankAccounts = lazy(() => import("./Pages/BankAccounts"));
const BalanceSheet = lazy(() => import("./Pages/BalanceSheet"));

// 🔒 Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
};

// 🟢 Admin Routes
function AdminRoutes() {
  return (
    <Routes>
      {/* --- FIX: Added redirect for the root "/" path --- */}
      {/* If an admin lands on "/", send them to their home page */}
      <Route path="/" element={<Navigate to="/adminhome" replace />} />

      <Route path="/admin-dashboard" element={<AdminDashboard />} />
      <Route
        path="/manage-employees"
        element={
          <ProtectedRoute>
            <AdminManageEmployees />
          </ProtectedRoute>
        }
      />
      <Route
        path="/view-analytics"
        element={
          <ProtectedRoute>
            <ViewAnalytics />
          </ProtectedRoute>
        }
      />
      <Route path="/AdminTicketBookings" element={<AdminTicketBookings />} />
      <Route
        path="/adminhome"
        element={
          <ProtectedRoute>
            <AdminHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/umrahbookings" // This path is for Admin's UmmrahBokkingDet
        element={
          <ProtectedRoute>
            <UmmrahBokkingDet />
          </ProtectedRoute>
        }
      />
      <Route
        path="employee-record"
        element={
          <ProtectedRoute>
            <EmployeeRecord />
          </ProtectedRoute>
        }
      />
      <Route
        path="/countrywise-det/:countryName"
        element={
          <ProtectedRoute>
            <CountriesWiseDet />
          </ProtectedRoute>
        }
      />
      <Route
        path="/adminHotelDet"
        element={
          <ProtectedRoute>
            <HoetlDetAdminSide />
          </ProtectedRoute>
        }
      />
      <Route
        path="/medicalInsurancedet"
        element={
          <ProtectedRoute>
            <AdminSideMedicalInsurrance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-country"
        element={
          <ProtectedRoute>
            <CustomerCountryPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <Invoices />
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <Expenses />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ledgers"
        element={
          <ProtectedRoute>
            <Ledgers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bank-accounts"
        element={
          <ProtectedRoute>
            <BankAccounts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/balance-sheet"
        element={
          <ProtectedRoute>
            <BalanceSheet />
          </ProtectedRoute>
        }
      />
      <Route
        path="/detailed-search"
        element={
          <ProtectedRoute>
            <DetaliedSearchPage />
          </ProtectedRoute>
        }
      />
      {/* Fallback for any other admin route, redirect to admin home */}
      <Route path="*" element={<Navigate to="/adminhome" replace />} />
    </Routes>
  );
}

// 🔵 User Routes
function UserRoutes({ user }) {
  return (
    <>
      {user && <Navbar userName={user.email} />}
      <Routes>
        {/* --- FIX: Added redirect for the root "/" path --- */}
        {/* If a user lands on "/", send them to "/home" (if logged in) or "/login" (if not) */}
        <Route
          path="/"
          element={<Navigate to={user ? "/home" : "/login"} replace />}
        />

        <Route
          path="/login"
          element={!user ? <Login /> : <Navigate to="/home" />}
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <Bookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approved-visas"
          element={
            <ProtectedRoute>
              <ApprovedVisas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deleted-visas"
          element={
            <ProtectedRoute>
              <DeletedVisas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/countries"
          element={
            <ProtectedRoute>
              <Countries />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <Search />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickiting"
          element={
            <ProtectedRoute>
              <Ticketing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewall"
          element={
            <ProtectedRoute>
              <Viewall />
            </ProtectedRoute>
          }
        />
        <Route
          path="/adminTicketDashboard" // This was in your user routes, kept it as is
          element={
            <ProtectedRoute>
              <AdminTicketBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/umrahbookings" // This path is for User's UmmrahBookings
          element={
            <ProtectedRoute>
              <UmmrahBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="viewAllUmmrahBookings"
          element={
            <ProtectedRoute>
              <ViewallUmmarhBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hotelbookings"
          element={
            <ProtectedRoute>
              <HotelBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewallHotelbookings"
          element={
            <ProtectedRoute>
              <ViewAllHotelBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/medical-insurance"
          element={
            <ProtectedRoute>
              <MedicalInsurence />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewAllmedBookings"
          element={
            <ProtectedRoute>
              <ViewAllMedicalBookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <Invoices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute>
              <Expenses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ledgers"
          element={
            <ProtectedRoute>
              <Ledgers />
            </ProtectedRoute>
          }
        />
        {/* ✅ fallback for users */}
        <Route
          path="*"
          element={<Navigate to={user ? "/home" : "/login"} />}
        />
      </Routes>
    </>
  );
}

// 🟣 Super Admin Routes — the platform head's OWN control plane (separate from
// agency admins). Manages agencies + their admins/employees. Not the home-agency
// agency dashboards.
function SuperAdminRoutes() {
  return (
    <Routes>
      <Route
        path="/super-admin"
        element={
          <ProtectedRoute>
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />
      {/* Everything else for a super admin funnels to their control panel */}
      <Route path="*" element={<Navigate to="/super-admin" replace />} />
    </Routes>
  );
}

// 🔗 Main App Content
function AppContent() {
  const { user, isAdmin, isSuperAdmin, loading } = useAuth(); // Added loading

  // --- ADDED: Global loading check ---
  // This prevents the app from trying to render routes before auth is ready
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900"></div>
      </div>
    );
  }

  // Keep the three roles on separate route trees.
  if (isSuperAdmin) return <SuperAdminRoutes />;
  if (isAdmin) return <AdminRoutes />;
  return <UserRoutes user={user} />;
}

// 🚀 Root App
function App() {
  return (
    <AuthProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900"></div>
        </div>
      }>
        <AppContent />
      </Suspense>
      <Toaster position="center" />
    </AuthProvider>
  );
}

export default App;
