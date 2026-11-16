// Shared input validation & sanitization helpers (Req 4)
// Used across all data-entry forms to stop letters/special characters
// in numeric fields and to enforce standard field formats.

/** Keep digits only (integers): counts, phone numbers, etc. */
export const digitsOnly = (value = "") => String(value).replace(/[^0-9]/g, "");

/** Keep digits + a single decimal point (money / amounts). */
export const decimalOnly = (value = "") => {
  let v = String(value).replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  return v;
};

/** Block invalid keystrokes inside <input type="number"> (e, E, +, -). */
export const blockInvalidNumberKeys = (e) => {
  if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
};

/** Allow only letters + spaces (people/company names). */
export const lettersAndSpacesOnly = (value = "") =>
  String(value).replace(/[^A-Za-z ]/g, "");

// ── Validators (return true when the value is valid) ──────────────────────
export const isMoney = (v) => /^\d+(\.\d{1,2})?$/.test(String(v)) && Number(v) >= 0;
export const isPositiveInt = (v) => /^\d+$/.test(String(v)) && Number(v) >= 0;
export const isPhone = (v) => /^\d{10,15}$/.test(String(v));
export const isLettersOnly = (v) => /^[A-Za-z ]+$/.test(String(v).trim());
export const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v));

// ── CNIC (Pakistani National Identity Card) ───────────────────────────────
/**
 * Format a CNIC to the Pakistani standard: 13 digits as XXXXX-XXXXXXX-X (5-7-1).
 * Strips non-digits, caps at 13 digits, and inserts dashes as the user types.
 */
export const formatCNIC = (value = "") => {
  const d = String(value).replace(/\D/g, "").slice(0, 13);
  let out = d.slice(0, 5);
  if (d.length > 5) out += "-" + d.slice(5, 12);
  if (d.length > 12) out += "-" + d.slice(12, 13);
  return out;
};

/** Valid CNIC = exactly 13 digits (dashes ignored). */
export const isCNIC = (v) => /^\d{13}$/.test(String(v).replace(/\D/g, ""));
