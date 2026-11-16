import { COMPANY_INFO } from "./company";

/**
 * Print one element on its own, exactly as it looks on screen.
 *
 * The element is cloned into #print-root (a direct child of <body>); the print
 * stylesheet in index.css hides everything else. Printing from inside a modal
 * or a scrolling container would otherwise clip the document to one screen.
 */
export function printElement(element) {
  if (!element) return;
  document.getElementById("print-root")?.remove();
  const root = document.createElement("div");
  root.id = "print-root";
  root.appendChild(element.cloneNode(true));
  document.body.appendChild(root);

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    root.remove();
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

const INK = [15, 23, 42];
const MUTED = [71, 85, 105];
export const PDF_TONES = {
  unpaid: [220, 38, 38],
  expense: [37, 99, 235],
  profit: [22, 163, 74],
  ink: INK,
  muted: MUTED,
};

/**
 * A4 statement PDF on the RS Travels letterhead: title block, optional detail
 * lines and summary boxes, one table, and "Page x of y" on every page.
 * jsPDF is loaded on demand so it never slows down opening a page.
 *
 * @param {object} o
 * @param {string} o.title            e.g. "VENDOR LEDGER"
 * @param {string[]} [o.meta]         right-aligned lines under the title
 * @param {string[]} [o.details]      left block under the letterhead (party / account details)
 * @param {{label:string,value:string,tone?:string}[]} [o.summary]
 * @param {string[]} o.head
 * @param {Array[]} o.body
 * @param {Array[]} [o.foot]
 * @param {object} [o.columnStyles]
 * @param {function} [o.didParseCell] jspdf-autotable hook (row colouring)
 * @param {boolean} [o.landscape]
 * @param {string} o.fileName
 */
export async function downloadStatementPdf(o) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF(o.landscape ? "l" : "p", "mm", "a4");
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const left = 14;
  const right = width - 14;

  pdf.setFont("times", "bold").setFontSize(18).setTextColor(...INK);
  pdf.text(COMPANY_INFO.name.toUpperCase(), left, 17);
  pdf.setFont("times", "normal").setFontSize(8.5).setTextColor(...MUTED);
  pdf.text(COMPANY_INFO.subtext, left, 22);
  const address = pdf.splitTextToSize(COMPANY_INFO.address, 105);
  pdf.text(address, left, 26.5);
  let y = 26.5 + address.length * 3.8;
  pdf.text(`Phone: ${COMPANY_INFO.phone}  |  Email: ${COMPANY_INFO.email}`, left, y);

  pdf.setFont("times", "bold").setFontSize(16).setTextColor(...INK);
  pdf.text(o.title, right, 17, { align: "right" });
  pdf.setFont("times", "normal").setFontSize(8.5).setTextColor(...MUTED);
  (o.meta || []).forEach((line, i) => pdf.text(String(line), right, 22.5 + i * 4.3, { align: "right" }));

  y = Math.max(y, 22.5 + (o.meta?.length || 0) * 4.3) + 4;
  pdf.setDrawColor(...INK).setLineWidth(0.5).line(left, y, right, y);
  y += 6;

  if (o.details?.length) {
    pdf.setFont("times", "bold").setFontSize(13).setTextColor(...INK);
    pdf.text(String(o.details[0]), left, y);
    pdf.setFont("times", "normal").setFontSize(8.5).setTextColor(...MUTED);
    o.details.slice(1).forEach((line, i) => pdf.text(String(line), left, y + 4.5 + i * 4));
    y += 4.5 + (o.details.length - 1) * 4 + 2;
  }

  if (o.summary?.length) {
    const gap = 3;
    const boxW = (right - left - gap * (o.summary.length - 1)) / o.summary.length;
    o.summary.forEach((s, i) => {
      const x = left + i * (boxW + gap);
      pdf.setFillColor(248, 250, 252).setDrawColor(226, 232, 240).setLineWidth(0.2);
      pdf.roundedRect(x, y, boxW, 15, 1.5, 1.5, "FD");
      pdf.setFont("times", "normal").setFontSize(7.5).setTextColor(...MUTED);
      pdf.text(s.label.toUpperCase(), x + 3, y + 5.5);
      pdf.setFont("times", "bold").setFontSize(10).setTextColor(...(PDF_TONES[s.tone] || INK));
      pdf.text(String(s.value), x + 3, y + 11.5);
    });
    y += 20;
  }

  autoTable(pdf, {
    startY: y,
    margin: { left, right: 14, bottom: 16 },
    head: [o.head],
    body: o.body,
    foot: o.foot,
    showFoot: "lastPage",
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { font: "times", fontSize: 8.5, cellPadding: 2.4, textColor: [30, 41, 59], overflow: "linebreak" },
    columnStyles: o.columnStyles,
    didParseCell: o.didParseCell,
  });

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(226, 232, 240).setLineWidth(0.2).line(left, height - 12, right, height - 12);
    pdf.setFont("times", "normal").setFontSize(7.5).setTextColor(148, 163, 184);
    pdf.text(`${COMPANY_INFO.name} — computer generated statement, ${new Date().toLocaleString()}`, left, height - 7.5);
    pdf.text(`Page ${p} of ${pages}`, right, height - 7.5, { align: "right" });
  }
  pdf.save(o.fileName);
}
