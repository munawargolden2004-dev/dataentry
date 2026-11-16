import { useEffect, useState } from "react";

/**
 * Best-effort content protection (owner request): deters copying, right-click,
 * printing and screenshots. A browser CANNOT truly block an OS screenshot or a
 * phone camera, but we:
 *   - disable right-click, text selection, copy/cut (outside form fields)
 *   - block Ctrl/Cmd+P / +S / +C
 *   - blank the screen (black overlay) when the window loses focus / is hidden
 *     or PrintScreen is pressed (deters Snipping Tool + PrintScreen)
 *   - hide everything during print
 * Typing and selecting inside inputs is unaffected so staff can still work.
 */
export default function ContentProtection() {
  const [blackout, setBlackout] = useState(false);

  useEffect(() => {
    const isEditable = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

    const onContextMenu = (e) => e.preventDefault();
    const onCopyCut = (e) => { if (!isEditable(e.target)) e.preventDefault(); };
    const onKeyDown = (e) => {
      if (e.key === "PrintScreen") {
        try { navigator.clipboard && navigator.clipboard.writeText(" "); } catch { /* ignore */ }
        setBlackout(true);
        setTimeout(() => setBlackout(false), 1200);
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && ["p", "s"].includes(e.key.toLowerCase())) e.preventDefault();
      if (ctrl && e.key.toLowerCase() === "c" && !isEditable(e.target)) e.preventDefault();
    };
    const hide = () => setBlackout(true);
    const show = () => setBlackout(false);
    const onVis = () => setBlackout(document.hidden);

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyCut);
    document.addEventListener("cut", onCopyCut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeprint", hide);
    window.addEventListener("afterprint", show);

    const style = document.createElement("style");
    style.setAttribute("data-content-protection", "");
    style.textContent = `
      body { -webkit-user-select: none; -moz-user-select: none; user-select: none; }
      input, textarea, select, [contenteditable="true"] { -webkit-user-select: text; user-select: text; }
      @media print { html, body { display: none !important; } }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyCut);
      document.removeEventListener("cut", onCopyCut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeprint", hide);
      window.removeEventListener("afterprint", show);
      style.remove();
    };
  }, []);

  if (!blackout) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2147483647, background: "#000",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#2b3440", fontFamily: "system-ui, sans-serif", fontSize: 13, letterSpacing: ".14em",
      }}
    >
      PROTECTED
    </div>
  );
}
