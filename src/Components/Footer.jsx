import { MdLocationOn, MdPhone, MdAccessTime } from "react-icons/md";
import { COMPANY_INFO } from "../utils/company";

const PHONE_HREF = `tel:${COMPANY_INFO.phone.replace(/\s+/g, "")}`;
const MAP_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${COMPANY_INFO.name}, ${COMPANY_INFO.address}`)}`;

export default function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 mt-16 text-neutral-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <p className="text-xl font-bold text-neutral-900">{COMPANY_INFO.name}</p>
          <p className="text-sm mt-1">{COMPANY_INFO.subtext}</p>
          <p className="text-sm mt-3 max-w-md">
            Flight tickets, visas, Umrah and Hajj packages, hotel bookings and tour packages from Islamabad.
          </p>
        </div>

        <address className="not-italic text-sm space-y-3 md:justify-self-end md:max-w-sm">
          <a href={MAP_HREF} target="_blank" rel="noreferrer" className="flex items-start gap-3 hover:text-neutral-900 transition-colors">
            <MdLocationOn className="text-lg text-neutral-900 shrink-0 mt-0.5" />
            <span>{COMPANY_INFO.address}</span>
          </a>
          <a href={PHONE_HREF} className="flex items-center gap-3 hover:text-neutral-900 transition-colors">
            <MdPhone className="text-lg text-neutral-900 shrink-0" />
            <span>{COMPANY_INFO.phone}</span>
          </a>
          <p className="flex items-center gap-3">
            <MdAccessTime className="text-lg text-neutral-900 shrink-0" />
            <span>{COMPANY_INFO.hours}</span>
          </p>
        </address>
      </div>

      <div className="border-t border-neutral-200 py-4 px-4 text-center text-xs text-neutral-500">
        &copy; {new Date().getFullYear()} {COMPANY_INFO.name}. All rights reserved.
      </div>
    </footer>
  );
}
