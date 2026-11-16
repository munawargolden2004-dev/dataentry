// Multi-agency / role management service (Req 6)
//
// Roles: "superadmin" (owns the platform) > "admin" (owns one agency) > "employee".
// Data model:
//   agencies/{agencyId} : { name, enabled: true, createdAt, createdBy }
//   users/{uid}         : { email, role, agencyId, disabled: false, createdBy, createdAt }
//
// Account creation works on the FREE plan (no Cloud Functions / Blaze) by creating
// the new user on a SECONDARY Firebase app instance, so the logged-in admin's own
// session is never disturbed.

import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, firebaseConfig } from "../firebase";

/**
 * Create a Firebase Auth user + their users/{uid} profile WITHOUT logging out
 * the current admin. Used by super admin (to create agency admins) and by
 * agency admins (to create their employees).
 */
export async function createUserAccount({ email, password, role, agencyId = null, createdBy = null }) {
  // Unique name so concurrent creations don't clash.
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    const uid = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      email: email.trim(),
      role,
      agencyId,
      disabled: false,
      createdBy,
      createdAt: serverTimestamp(),
    });
    await signOut(secondaryAuth);
    return { success: true, uid };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    // Always tear down the throwaway app.
    try { await deleteApp(secondaryApp); } catch { /* ignore */ }
  }
}

/**
 * Create a new agency. Agencies created here are EXTERNAL (registry-only) by
 * default: each external agency runs on its OWN separate Firebase/clone that we
 * don't control, so here we only keep a record of them. The home agency
 * (the home agency = this Firebase) is marked isExternal:false.
 */
export async function createAgency({ name, createdBy = null, isExternal = true }) {
  try {
    const ref = doc(collection(db, "agencies"));
    await setDoc(ref, {
      name: name.trim(),
      enabled: true,
      isExternal,
      createdBy,
      createdAt: serverTimestamp(),
    });
    return { success: true, agencyId: ref.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Add a REGISTRY-ONLY member (admin/employee) to an external agency — a record
 * for our bookkeeping, NOT a real login account (they log into their own
 * Firebase). Writes a users doc with registryOnly:true and an auto id.
 */
export async function addRegistryMember({ agencyId, email, role, name = "", createdBy = null }) {
  try {
    const ref = doc(collection(db, "users"));
    await setDoc(ref, {
      email: email.trim(),
      name: name.trim(),
      role,
      agencyId,
      registryOnly: true,
      disabled: false,
      createdBy,
      createdAt: serverTimestamp(),
    });
    return { success: true, id: ref.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete an EXTERNAL (registry) agency and its registry-only members.
 * Refuses to delete the home agency (isExternal === false) and never deletes
 * real login accounts (only docs flagged registryOnly).
 */
export async function deleteAgency(agencyId) {
  try {
    const agSnap = await getDoc(doc(db, "agencies", agencyId));
    if (agSnap.exists() && agSnap.data().isExternal === false) {
      return { success: false, error: "The home agency cannot be deleted." };
    }
    const membersSnap = await getDocs(query(collection(db, "users"), where("agencyId", "==", agencyId)));
    const batch = writeBatch(db);
    membersSnap.forEach((d) => {
      if (d.data().registryOnly === true) batch.delete(d.ref); // never delete real accounts
    });
    batch.delete(doc(db, "agencies", agencyId));
    await batch.commit();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Enable/disable an agency (blocks all its users from logging in when disabled). */
export async function setAgencyEnabled(agencyId, enabled) {
  try {
    await updateDoc(doc(db, "agencies", agencyId), { enabled });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Enable/disable a single user. */
export async function setUserDisabled(uid, disabled) {
  try {
    await updateDoc(doc(db, "users", uid), { disabled });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** List all agencies (super admin only). */
export async function listAgencies() {
  const snap = await getDocs(collection(db, "agencies"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** List users, optionally scoped to one agency (admins list their own agency). */
export async function listUsers(agencyId = null) {
  const q = agencyId
    ? query(collection(db, "users"), where("agencyId", "==", agencyId))
    : collection(db, "users");
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Fetch one agency doc. */
export async function getAgency(agencyId) {
  if (!agencyId) return null;
  const snap = await getDoc(doc(db, "agencies", agencyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
