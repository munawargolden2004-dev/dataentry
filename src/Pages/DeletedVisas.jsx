import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataService } from "../services/dataService";
import { db } from "../firebase";
import toast from "react-hot-toast";
import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
  addDoc,
  writeBatch,
  orderBy,
  getDoc,
  getDocs,
  where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

export default function DeletedVisas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 🔹 Global cache fetch
  const { data: rawDeletedBookings = [], isLoading } = useQuery({
    queryKey: ['deletedBookings'],
    queryFn: () => dataService.fetchAll('deletedBookings'),
    staleTime: 1000 * 30,
  });

  const deletedBookings = useMemo(() => {
    if (!user) return [];
    return rawDeletedBookings
      .filter((b) => b.userId === user.uid)
      .sort((a, b) => {
        const dateA = new Date(a.deletedAt || 0);
        const dateB = new Date(b.deletedAt || 0);
        return dateB - dateA;
      });
  }, [rawDeletedBookings, user]);

  // Check for duplicate passport number before restoration (only within user's records)
  const checkDuplicatePassport = async (passportNumber) => {
    if (!user) return false;
    
    const q = query(
      collection(db, "bookings"), 
      where("passport", "==", passportNumber),
      where("userId", "==", user.uid)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  };

  // Restore deleted booking
 // Restore deleted booking
const handleRestore = async (deletedBooking) => {
  if (!user || deletedBooking.userId !== user.uid) {
    toast.error("You can only restore your own deleted records.");
    return;
  }

  try {
    // Remove metadata fields and prepare clean booking object
    const { id: deletedId, deletedAt, ...restoredData } = deletedBooking;

    const batch = writeBatch(db);

    // Add back to bookings collection
    const newDocRef = doc(collection(db, "bookings"));
    batch.set(newDocRef, {
      ...restoredData,
      restoredAt: new Date().toISOString(),
    });

    // Remove from deletedBookings collection
    const delDocRef = doc(db, "deletedBookings", deletedId);
    batch.delete(delDocRef);

    await batch.commit();

    dataService.clearCache('bookings');
    dataService.clearCache('deletedBookings');
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['deletedBookings'] });

    toast.success("Booking restored successfully!");
  } catch (error) {
    console.error(error);
    toast.error("Error restoring booking: " + error.message);
  }
};

  // Permanently delete
  const handlePermanentDelete = async (deletedId) => {
    if (!user) {
      toast.error("You must be logged in to delete records.");
      return;
    }

    try {
      // Verify the record belongs to the current user before deleting
      const docRef = doc(db, "deletedBookings", deletedId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists() && docSnap.data().userId !== user.uid) {
        toast.error("You can only delete your own records.");
        return;
      }

      await deleteDoc(doc(db, "deletedBookings", deletedId));
      
      dataService.clearCache('deletedBookings');
      queryClient.invalidateQueries({ queryKey: ['deletedBookings'] });
      
      toast.success("Record permanently deleted!");
    } catch (error) {
      toast.error("Error permanently deleting record: " + error.message);
    }
  };

  // Show message if not logged in
  if (!user) {
    return (
      <div className="p-6 min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-700 mb-4">Access Denied</h2>
          <p className="text-gray-600">Please log in to view your deleted records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-red-700">My Deleted Visa Records</h1>
        <p className="text-gray-600 mt-2">Manage your deleted visa applications and restore if needed</p>
        
        {/* User Info */}
        <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
          <p className="text-red-800 text-sm">
            <strong>Logged in as:</strong> {user.email}
          </p>
          <p className="text-red-600 text-xs mt-1">
            You can only see and manage your own deleted records.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow-md">
        <table className="min-w-full text-sm text-left border-collapse">
          <thead className="bg-neutral-100 text-neutral-900">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Passport</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Visa Type</th>
              <th className="px-4 py-2">Country</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Fee</th>
              <th className="px-4 py-2">Payment</th>
              <th className="px-4 py-2">Visa Status</th>
              <th className="px-4 py-2">Deleted At</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deletedBookings.length === 0 ? (
              <tr>
                <td colSpan="11" className="px-4 py-8 text-center text-neutral-500">
                  No deleted records found for your account
                </td>
              </tr>
            ) : (
              deletedBookings.map((b, index) => (
                <tr key={b.id} className="border-b hover:bg-red-50">
                  <td className="px-4 py-2 font-medium text-gray-600">
                    {index + 1}
                  </td>
                  <td className="px-4 py-2">{b.passport}</td>
                  <td className="px-4 py-2">{b.fullName}</td>
                  <td className="px-4 py-2">{b.visaType}</td>
                  <td className="px-4 py-2">{b.country}</td>
                  <td className="px-4 py-2">{b.date}</td>
                  <td className="px-4 py-2">{b.totalFee}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      b.paymentStatus === 'Paid' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {b.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      b.visaStatus === 'Approved' 
                        ? 'bg-green-100 text-green-800'
                        : b.visaStatus === 'Rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {b.visaStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {b.deletedAt ? new Date(b.deletedAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-2 flex gap-2">
                    <button
                      onClick={() => handleRestore(b)}
                      className="bg-green-500 text-white px-3 py-1 rounded cursor-pointer hover:bg-green-600 text-xs"
                      title="Restore this record"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(b.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded cursor-pointer hover:bg-red-700 text-xs"
                      title="Permanently delete this record"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
