import { useState, useEffect } from "react";
import { MdSearch, MdClear } from "react-icons/md";

/**
 * A search input component that manages its own keystroke state to prevent
 * massive parent components from re-rendering on every single keystroke.
 * It only calls onChange after the user stops typing for the specified delay.
 */
export default function DebouncedSearchInput({ 
  value, 
  onChange, 
  placeholder = "Search...", 
  delay = 500,
  className = "" 
}) {
  const [innerValue, setInnerValue] = useState(value || "");

  // Sync from props if parent resets the filter externally
  useEffect(() => {
    setInnerValue(value || "");
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only trigger if it actually changed to prevent loops
      if (innerValue !== value) {
        onChange(innerValue);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [innerValue, delay, onChange, value]);

  return (
    <div className={`relative ${className}`}>
      <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 text-xl" />
      <input
        type="text"
        placeholder={placeholder}
        value={innerValue}
        onChange={(e) => setInnerValue(e.target.value)}
        className="w-full bg-white border border-neutral-200 rounded-xl pl-12 pr-10 py-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 backdrop-blur-md transition-all shadow-sm"
      />
      {innerValue && (
        <button
          onClick={() => {
            setInnerValue("");
            onChange("");
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <MdClear className="text-xl" />
        </button>
      )}
    </div>
  );
}
