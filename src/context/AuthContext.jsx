import { createContext, useContext, useState, useEffect, useRef } from "react";
import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext();

// ⏰ Inactivity time limit (15 mins example)
const INACTIVITY_LIMIT = 15 * 60 * 1000; 
// ⏳ Warning popup before logout (1 min earlier)
const WARNING_TIME = 1 * 60 * 1000;       

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem("isAdmin") === "true";
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(() => {
    return localStorage.getItem("isSuperAdmin") === "true";
  });

  const [showWarning, setShowWarning] = useState(false);

  const loginAttempts = useRef(0);
  const lastLoginAttempt = useRef(0);
  let inactivityTimer = useRef(null);
  let warningTimer = useRef(null);

  const checkRateLimit = () => {
    const now = Date.now();
    const timeWindow = 15 * 60 * 1000;

    if (now - lastLoginAttempt.current > timeWindow) {
      loginAttempts.current = 0;
    }

    if (loginAttempts.current >= 5) {
      const remainingTime = Math.ceil(
        (timeWindow - (now - lastLoginAttempt.current)) / 1000 / 60
      );
      throw new Error(
        `Too many login attempts. Please try again in ${remainingTime} minutes.`
      );
    }

    loginAttempts.current++;
    lastLoginAttempt.current = now;
  };

  // Resolve a signed-in user's role/agency and whether they're blocked (Req 6).
  // FAIL-OPEN on read errors so a transient issue never locks out real staff.
  const resolveUserAccess = async (firebaseUser) => {
    const userData = { email: firebaseUser.email, uid: firebaseUser.uid };
    let role = "employee";
    let agencyId = null;
    let disabled = false;
    try {
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (userDoc.exists()) {
        const d = userDoc.data();
        role = d.role || "employee";
        agencyId = d.agencyId || null;
        disabled = d.disabled === true;
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
    }
    userData.role = role;
    userData.agencyId = agencyId;

    if (disabled) {
      return { userData, blocked: true, reason: "Your account has been disabled. Please contact your administrator." };
    }
    if (agencyId) {
      try {
        const agSnap = await getDoc(doc(db, "agencies", agencyId));
        if (agSnap.exists() && agSnap.data().enabled === false) {
          return { userData, blocked: true, reason: "Your agency's access is currently disabled. Please contact the administrator." };
        }
      } catch (err) {
        console.error("Error checking agency status:", err);
      }
    }
    // Keep the roles SEPARATE: a super admin is the platform head (its own control
    // plane), NOT an agency admin. Do not let superadmin inherit isAdmin.
    const superAdmin = role === "superadmin";
    return { userData, blocked: false, isAdmin: role === "admin", isSuperAdmin: superAdmin };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const res = await resolveUserAccess(firebaseUser);
        if (res.blocked) {
          setUser(null);
          setIsAdmin(false);
          setIsSuperAdmin(false);
          localStorage.removeItem("user");
          localStorage.removeItem("isAdmin");
          localStorage.removeItem("isSuperAdmin");
          try { await signOut(auth); } catch { /* ignore */ }
          setLoading(false);
          return;
        }
        setUser(res.userData);
        setIsAdmin(res.isAdmin);
        setIsSuperAdmin(res.isSuperAdmin);

        localStorage.setItem("user", JSON.stringify(res.userData));
        localStorage.setItem("isAdmin", res.isAdmin ? "true" : "false");
        localStorage.setItem("isSuperAdmin", res.isSuperAdmin ? "true" : "false");
        localStorage.setItem("lastActivity", Date.now());
      } else {
        setUser(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        localStorage.removeItem("user");
        localStorage.removeItem("isAdmin");
        localStorage.removeItem("isSuperAdmin");
        localStorage.removeItem("lastActivity");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auto logout disabled per request
  const logout = () => {
    setIsAdmin(false);
    setIsSuperAdmin(false);
    setUser(null);
    setShowWarning(false);
    localStorage.removeItem("user");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("isSuperAdmin");
    localStorage.removeItem("lastActivity");
    signOut(auth);
  };

  const login = async (email, password) => {
    try {
      checkRateLimit();

      // Every login goes through Firebase Auth. There are deliberately no
      // hardcoded credential shortcuts — roles come from users/{uid} only.
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const res = await resolveUserAccess(userCredential.user);
      if (res.blocked) {
        try { await signOut(auth); } catch { /* ignore */ }
        setUser(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        return { success: false, error: res.reason };
      }

      setUser(res.userData);
      setIsAdmin(res.isAdmin);
      setIsSuperAdmin(res.isSuperAdmin);

      localStorage.setItem("user", JSON.stringify(res.userData));
      localStorage.setItem("isAdmin", res.isAdmin ? "true" : "false");
      localStorage.setItem("isSuperAdmin", res.isSuperAdmin ? "true" : "false");
      localStorage.setItem("lastActivity", Date.now());

      return { success: true, isAdmin: res.isAdmin, isSuperAdmin: res.isSuperAdmin };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, isAdmin, isSuperAdmin, login, showWarning }}>
      {children}
      {showWarning && (
        <div className="fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-3 rounded shadow-md z-50">
          ⚠️ You will be logged out in 1 minute due to inactivity.
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
