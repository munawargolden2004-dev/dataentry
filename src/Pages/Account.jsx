import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  writeBatch,
} from "firebase/firestore";
import toast from "react-hot-toast";

export default function Account() {
  const [deleted, setDeleted] = useState([]);

  // ✅ Fetch deleted visas
  useEffect(() => {
    const fetchDeleted = async () => {
      try {
        const q = query(collection(db, "deletedBookings"), orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDeleted(data);
      } catch (error) {
        console.error("Error fetching deleted bookings", error);
      }
    };
    fetchDeleted();
  }, []);

  // ✅ Restore booking
  const handleRestore = async (booking) => {
    try {
      const batch = writeBatch(db);
      
      const newDocRef = doc(collection(db, "bookings"));
      batch.set(newDocRef, booking); // copy back
      
      const delDocRef = doc(db, "deletedBookings", booking.id);
      batch.delete(delDocRef); // remove
      
      await batch.commit();
      
      setDeleted((prev) => prev.filter((d) => d.id !== booking.id)); // remove from UI
      toast.success("Booking restored successfully 🔄");
    } catch (err) {
      console.error(err);
      toast.error("Failed to restore ❌");
    }
  };

  // ✅ Permanent delete
  const handlePermanentDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "deletedBookings", id));
      setDeleted((prev) => prev.filter((d) => d.id !== id)); // remove from UI
      toast.success("Booking permanently deleted 🗑️");
    } catch (err) {
      console.error(err);
      toast.error("Failed to permanently delete ❌");
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gradient-to-br from-red-50 via-white to-gray-50">
      <h1 className="text-2xl font-bold mb-6">Deleted Visas</h1>

      <div className="overflow-x-auto bg-white rounded-xl shadow-md">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead className="bg-neutral-100 text-neutral-900">
            <tr>
              <th className="px-4 py-2">Passport</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Visa Type</th>
              <th className="px-4 py-2">Country</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Fee</th>
              <th className="px-4 py-2">Payment</th>
              <th className="px-4 py-2">Visa Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {deleted.map((b) => (
              <tr key={b.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">{b.passport}</td>
                <td className="px-4 py-2">{b.fullName}</td>
                <td className="px-4 py-2">{b.visaType}</td>
                <td className="px-4 py-2">{b.country}</td>
                <td className="px-4 py-2">{b.date}</td>
                <td className="px-4 py-2">{b.totalFee}</td>
                <td className="px-4 py-2">{b.paymentStatus}</td>
                <td className="px-4 py-2">{b.visaStatus}</td>

                {/* Actions */}
                <td className="px-4 py-2 space-x-2">
                  <button
                    onClick={() => handleRestore(b)}
                    className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 cursor-pointer"
                  >
                    Restore
                  </button>

                  <button
                    onClick={() => handlePermanentDelete(b.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 cursor-pointer"
                  >
                    Permanent Delete
                  </button>
                </td>
              </tr>
            ))}

            {deleted.length === 0 && (
              <tr>
                <td
                  colSpan="9"
                  className="text-center py-6 text-neutral-500 italic"
                >
                  No deleted visas found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
