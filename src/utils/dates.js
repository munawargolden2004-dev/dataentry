/**
 * Resolve a Firestore createdAt-style value to a JS Date from ANY form it can
 * take across this app:
 *   - a live Firestore Timestamp (has .toDate())
 *   - the cached plain-object form {seconds,nanoseconds} (survives IndexedDB,
 *     but loses .toDate()) — this is what caused "Invalid Date" bugs
 *   - an ISO string / millis / existing Date (from the per-user cache layer)
 * Returns null for empty/invalid input.
 */
export const toDateSafe = (c) => {
  if (!c) return null;
  if (c?.toDate) return c.toDate();
  if (c?.seconds) return new Date(c.seconds * 1000);
  const d = new Date(c);
  return isNaN(d.getTime()) ? null : d;
};
