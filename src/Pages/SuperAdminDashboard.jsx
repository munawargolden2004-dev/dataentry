import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import {
  createAgency,
  createUserAccount,
  addRegistryMember,
  setAgencyEnabled,
  setUserDisabled,
  deleteAgency,
  listAgencies,
  listUsers,
} from "../services/agencyService";
import { FaBuilding, FaUserPlus, FaToggleOn, FaToggleOff, FaSpinner, FaShieldAlt, FaSignOutAlt, FaTrash } from "react-icons/fa";

// Platform-owner control panel (Req 6): manage agencies, their admins & employees,
// and enable/disable access per agency or per user.
export default function SuperAdminDashboard() {
  const { isSuperAdmin, user, logout } = useAuth();

  const [agencies, setAgencies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Forms
  const [agencyName, setAgencyName] = useState("");
  const [nu, setNu] = useState({ email: "", password: "", role: "admin", agencyId: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([listAgencies(), listUsers()]);
      setAgencies(a);
      setUsers(u);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) refresh();
  }, [isSuperAdmin, refresh]);

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-red-700 font-semibold">
        Access Denied — Super Admins only.
      </div>
    );
  }

  const handleCreateAgency = async (e) => {
    e.preventDefault();
    if (!agencyName.trim()) return toast.error("Enter an agency name.");
    setBusy(true);
    const res = await createAgency({ name: agencyName, createdBy: user?.uid || null });
    setBusy(false);
    if (res.success) {
      toast.success("Agency created.");
      setAgencyName("");
      refresh();
    } else toast.error(res.error);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!nu.email.trim()) return toast.error("Email is required.");
    if (!nu.agencyId) return toast.error("Select an agency.");

    const selectedAgency = agencies.find((a) => a.id === nu.agencyId);
    const isExternal = selectedAgency ? selectedAgency.isExternal !== false : true;

    setBusy(true);
    let res;
    if (isExternal) {
      // External agency = registry record only (they log into their own Firebase).
      res = await addRegistryMember({
        agencyId: nu.agencyId,
        email: nu.email,
        role: nu.role,
        createdBy: user?.uid || null,
      });
    } else {
      // Home agency (Data Dash) = real login account on this Firebase.
      if (!nu.password || nu.password.length < 6) {
        setBusy(false);
        return toast.error("A password (min 6 chars) is required for a real Data Dash account.");
      }
      res = await createUserAccount({
        email: nu.email,
        password: nu.password,
        role: nu.role,
        agencyId: nu.agencyId,
        createdBy: user?.uid || null,
      });
    }
    setBusy(false);
    if (res.success) {
      toast.success(isExternal ? `${nu.role} recorded in registry.` : `${nu.role} account created.`);
      setNu({ email: "", password: "", role: "admin", agencyId: "" });
      refresh();
    } else toast.error(res.error);
  };

  const toggleAgency = async (ag) => {
    const res = await setAgencyEnabled(ag.id, !(ag.enabled !== false));
    if (res.success) { toast.success(`Agency ${ag.enabled !== false ? "disabled" : "enabled"}.`); refresh(); }
    else toast.error(res.error);
  };

  const handleDeleteAgency = async (a) => {
    if (a.isExternal === false) return toast.error("The home agency (Data Dash) can't be deleted.");
    if (!window.confirm(`Delete agency "${a.name}" and its registry members? This cannot be undone.`)) return;
    const res = await deleteAgency(a.id);
    if (res.success) { toast.success("Agency deleted."); refresh(); }
    else toast.error(res.error);
  };

  const toggleUser = async (u) => {
    const res = await setUserDisabled(u.id, !(u.disabled === true));
    if (res.success) { toast.success(`User ${u.disabled ? "enabled" : "disabled"}.`); refresh(); }
    else toast.error(res.error);
  };

  const agencyName_ = (id) => agencies.find((a) => a.id === id)?.name || "—";

  // Build the hierarchy: platform super admins, then each agency → its admin(s) → employees.
  const superAdmins = users.filter((u) => u.role === "superadmin");
  const grouped = agencies.map((a) => ({
    agency: a,
    admins: users.filter((u) => u.agencyId === a.id && u.role === "admin"),
    employees: users.filter((u) => u.agencyId === a.id && u.role !== "admin" && u.role !== "superadmin"),
  }));
  const unassigned = users.filter((u) => !u.agencyId && u.role !== "superadmin");

  const UserRow = ({ u, className = "" }) => (
    <div className={`flex items-center justify-between bg-white rounded-lg px-4 py-2.5 mb-2 ${className}`}>
      <div className="min-w-0">
        <div className="font-medium truncate">{u.email}</div>
        <div className="text-xs text-neutral-600 uppercase">
          {u.role || "employee"}
          {u.registryOnly ? <span className="text-amber-700"> · registry</span> : null}
          {u.disabled ? <span className="text-red-700"> · disabled</span> : null}
        </div>
      </div>
      {u.role !== "superadmin" && (
        <button onClick={() => toggleUser(u)} title="Enable / disable user" className="text-2xl flex-shrink-0">
          {u.disabled ? <FaToggleOff className="text-neutral-500" /> : <FaToggleOn className="text-emerald-700" />}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-r from-neutral-100 to-neutral-100 rounded-xl flex items-center justify-center shadow-md">
              <FaShieldAlt className="text-neutral-900 text-xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Super Admin</h1>
              <p className="text-sm text-neutral-600">Manage agencies, their admins &amp; employees</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user?.email && (
              <span className="text-sm text-neutral-600 hidden sm:inline">{user.email}</span>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-neutral-900 font-semibold text-sm"
            >
              <FaSignOutAlt /> Logout
            </button>
          </div>
        </div>

        {/* Create forms */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <form onSubmit={handleCreateAgency} className="bg-white border border-neutral-200 rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><FaBuilding className="text-indigo-700" /> New Agency</h2>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="Agency name"
              className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-2.5 mb-4 outline-none focus:border-neutral-900"
            />
            <button disabled={busy} className="px-5 py-2.5 bg-neutral-100 hover:bg-neutral-700 rounded-lg font-semibold disabled:opacity-50">
              {busy ? "Working…" : "Create Agency"}
            </button>
          </form>

          <form onSubmit={handleCreateUser} className="bg-white border border-neutral-200 rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><FaUserPlus className="text-emerald-700" /> New Admin / Employee</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="Email" type="email"
                className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 outline-none focus:border-neutral-900" />
              <input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="Temp password (min 6)" type="text"
                className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 outline-none focus:border-neutral-900" />
              <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}
                className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 outline-none focus:border-neutral-900">
                <option value="admin">Admin</option>
                <option value="employee">Employee</option>
              </select>
              <select value={nu.agencyId} onChange={(e) => setNu({ ...nu, agencyId: e.target.value })}
                className="bg-white border border-neutral-200 rounded-lg px-4 py-2.5 outline-none focus:border-neutral-900">
                <option value="">Select agency…</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isExternal !== false ? " (external)" : ""}</option>)}
              </select>
            </div>
            {nu.agencyId && (
              <p className="text-xs mb-3 text-neutral-600">
                {(agencies.find((a) => a.id === nu.agencyId)?.isExternal !== false)
                  ? "🗂 External agency — recorded for your records only (no login is created; password ignored)."
                  : "🔑 Data Dash — creates a real login account (password required)."}
              </p>
            )}
            <button disabled={busy} className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-500 rounded-lg font-semibold disabled:opacity-50">
              {busy ? "Working…" : "Create Account"}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><FaSpinner className="animate-spin text-3xl text-indigo-700" /></div>
        ) : (
          <div className="space-y-5">
            {/* Platform level */}
            {superAdmins.length > 0 && (
              <div className="bg-white border border-purple-200 rounded-xl p-5">
                <h2 className="font-semibold text-purple-700 mb-3 flex items-center gap-2"><FaShieldAlt /> Platform · Super Admins</h2>
                {superAdmins.map((u) => <UserRow key={u.id} u={u} />)}
              </div>
            )}

            {/* Each agency → its admin → its employees */}
            {grouped.length === 0 ? (
              <p className="text-neutral-500">No agencies yet — create one above.</p>
            ) : (
              grouped.map(({ agency, admins, employees }) => (
                <div key={agency.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                  {/* Agency header */}
                  <div className="flex items-center justify-between p-4 bg-white border-b border-neutral-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FaBuilding className="text-indigo-700" />
                      <span className="font-bold text-lg">{agency.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${agency.enabled !== false ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"}`}>
                        {agency.enabled !== false ? "Enabled" : "Disabled"}
                      </span>
                      <span className="text-xs text-neutral-500">· {admins.length} admin · {employees.length} employees</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button onClick={() => toggleAgency(agency)} title="Enable / disable whole agency" className="text-2xl">
                        {agency.enabled !== false ? <FaToggleOn className="text-emerald-700" /> : <FaToggleOff className="text-neutral-500" />}
                      </button>
                      {agency.isExternal !== false ? (
                        <button onClick={() => handleDeleteAgency(agency)} title="Delete agency" className="text-red-700 hover:text-red-800">
                          <FaTrash />
                        </button>
                      ) : (
                        <span title="Home agency — protected" className="text-[10px] text-neutral-500 uppercase tracking-wider">home</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    {/* Admin(s) */}
                    <div className="text-[11px] uppercase tracking-wider text-indigo-700 font-bold mb-2">Admin</div>
                    {admins.length === 0
                      ? <p className="text-slate-600 text-sm mb-3 pl-3">No admin assigned yet.</p>
                      : admins.map((u) => <UserRow key={u.id} u={u} className="border-l-2 border-indigo-500/50" />)}

                    {/* Employees nested under the agency */}
                    <div className="mt-3 pl-6 border-l border-neutral-200">
                      <div className="text-[11px] uppercase tracking-wider text-neutral-600 font-bold mb-2">Employees</div>
                      {employees.length === 0
                        ? <p className="text-slate-600 text-sm">No employees yet.</p>
                        : employees.map((u) => <UserRow key={u.id} u={u} />)}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Users not yet assigned to any agency */}
            {unassigned.length > 0 && (
              <div className="bg-white border border-amber-200 rounded-xl p-5">
                <h2 className="font-semibold text-amber-700 mb-3">Unassigned users (no agency)</h2>
                {unassigned.map((u) => <UserRow key={u.id} u={u} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
