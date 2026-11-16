import React from 'react';
import AdminNavbar from './AdminNavbar';
import Footer from './Footer';

import ParticleMap from './ParticleMap';

export default function AdminLayout({ children, hideFooter = false, hideNavbar = false }) {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans relative overflow-x-hidden text-neutral-900">
      <ParticleMap />

      {!hideNavbar && (
        <div className="relative z-50">
          <AdminNavbar />
        </div>
      )}

      <div className="relative z-10 flex-1 w-full">
        {children}
      </div>

      {!hideFooter && (
        <div className="relative z-10">
          <Footer />
        </div>
      )}
    </div>
  );
}
