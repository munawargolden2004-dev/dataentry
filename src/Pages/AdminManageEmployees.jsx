import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { createUserAccount, setUserDisabled, listUsers, getAgency } from "../services/agencyService";
import AdminNavbar from "../Components/AdminNavbar";
import { FaUserPlus, FaToggleOn, FaToggleOff, FaSpinner, FaUsers } from "react-icons/fa";

import { useQuery, useQueryClient } from "@tanstack/react-query";

// Agency-admin screen: create & manage REAL employee login accounts for the
// admin's OWN agency. Admins can only add employees (not admins),
// scoped to their agency — enforced in both the UI and the Firestore rules.
export default function AdminManageEmployees() {
  const { user, isAdmin } = useAuth();
  const agencyId = user?.agencyId || null;
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const { data, isLoading } = useQuery({
    queryKey: ['adminEmployees', agencyId],
    queryFn: async () => {
      if (!agencyId) return { employees: [], agencyName: "" };
      const [us, ag] = await Promise.all([listUsers(agencyId), getAgency(agencyId)]);
      return {
        employees: us.filter((u) => u.role === "employee"),
        agencyName: ag?.name || ""
      };
    },
    enabled: !!isAdmin && !!agencyId,
    staleTime: 1000 * 30,
  });

  const loading = isLoading && !!agencyId;

  const employees = data?.employees || [];
  const agencyName = data?.agencyName || "";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminEmployees', agencyId] });
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-red-700 font-semibold">
        Access Denied — Admins only.
      </div>
    );
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return toast.error("Email is required.");
    if (!form.password || form.password.length < 6) return toast.error("Password (min 6 chars) is required.");
    if (!agencyId) return toast.error("Your admin account isn't linked to an agency. Ask the super admin to assign one.");
    setBusy(true);
    const res = await createUserAccount({
      email: form.email,
      password: form.password,
      role: "employee",
      agencyId,
      createdBy: user?.uid || null,
    });
    setBusy(false);
    if (res.success) {
      toast.success("Employee account created.");
      setForm({ email: "", password: "" });
      refresh();
    } else {
      toast.error(res.error);
    }
  };

  const toggle = async (u) => {
    const res = await setUserDisabled(u.id, !(u.disabled === true));
    if (res.success) { toast.success(`Employee ${u.disabled ? "enabled" : "disabled"}.`); refresh(); }
    else toast.error(res.error);
  };

  return (
    <>
      <AdminNavbar />
      <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 bg-gradient-to-r from-neutral-100 to-neutral-100 rounded-xl flex items-center justify-center">
              <FaUsers className="text-neutral-900 text-xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Manage Employees</h1>
              <p className="text-sm text-neutral-600">{agencyName ? `${agencyName} — ` : ""}add and manage your agency's employee logins</p>
            </div>
          </div>

          {!agencyId ? (
            <div className="mt-8 bg-amber-500/10 border border-amber-600/30 rounded-xl p-5 text-amber-700">
              Your admin account isn't linked to an agency yet. Ask the super admin to assign you to one.
            </div>
          ) : (
            <>
              {/* Create employee */}
              <form onSubmit={handleCreate} className="mt-6 bg-white border border-neutral-200 rounded-xl p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2"><FaUserPlus className="text-emerald-700" /> New Employee</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <input
                    type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Employee email"
                    className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 outline-none focus:border-neutral-900"
                  />
                  <input
                    type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Temp password (min 6)"
                    className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 outline-none focus:border-neutral-900"
                  />
                </div>
                <button disabled={busy} className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-500 rounded-lg font-semibold disabled:opacity-50">
                  {busy ? "Working…" : "Create Employee"}
                </button>
              </form>

              {/* Employee list */}
              <div className="mt-6 bg-white border border-neutral-200 rounded-xl p-5">
                <h2 className="font-semibold mb-4">Employees ({employees.length})</h2>
                {loading ? (
                  <div className="flex justify-center py-10"><FaSpinner className="animate-spin text-2xl text-indigo-700" /></div>
                ) : employees.length === 0 ? (
                  <p className="text-neutral-500 text-sm">No employees yet.</p>
                ) : (
                  <div className="space-y-2">
                    {employees.map((u) => (
                      <div key={u.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.email}</div>
                          <div className="text-xs text-neutral-600 uppercase">
                            employee{u.disabled ? <span className="text-red-700"> · disabled</span> : null}
                          </div>
                        </div>
                        <button onClick={() => toggle(u)} title="Enable / disable employee" className="text-2xl flex-shrink-0">
                          {u.disabled ? <FaToggleOff className="text-neutral-500" /> : <FaToggleOn className="text-emerald-700" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
