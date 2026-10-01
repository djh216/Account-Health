import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatNumber } from "./format";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type AccountProductPdfRow = {
  product: string;
  volume: number;
  sharePct: number;
  orderEventCount: number;
  firstOrdered: string;
  lastOrdered: string;
};

export type AccountProductsPdfInput = {
  accountName: string;
  asOf: string;
  generatedAt: string;
  products: AccountProductPdfRow[];
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function downloadAccountProductsPdf(input: AccountProductsPdfInput): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalVolume = input.products.reduce((sum, row) => sum + row.volume, 0);

  doc.setFillColor(BURGUNDY[0], BURGUNDY[1], BURGUNDY[2]);
  doc.rect(0, 0, pageWidth, 18, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("CELLAR PULSE · PRODUCTS PURCHASED", MARGIN_X, 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(input.accountName, MARGIN_X, 14);

  doc.setFontSize(8);
  doc.text(
    `As of ${formatDate(input.asOf)}  ·  Exported ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    11,
    { align: "right" },
  );

  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${input.products.length} product${input.products.length === 1 ? "" : "s"}  ·  ${formatNumber(totalVolume)} bottles all time`,
    MARGIN_X,
    26,
  );

  autoTable(doc, {
    startY: 30,
    head: [["#", "Product", "Bottles", "Share", "Orders", "First ordered", "Last ordered"]],
    body: input.products.map((row, index) => [
      String(index + 1),
      row.product,
      formatNumber(row.volume),
      `${Math.round(row.sharePct)}%`,
      String(row.orderEventCount),
      formatDate(row.firstOrdered),
      formatDate(row.lastOrdered),
    ]),
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: TEXT_DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: BURGUNDY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "right" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 28 },
      6: { cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    didDrawPage(data) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Cellar Pulse · ${input.accountName} · All products purchased`,
        MARGIN_X,
        pageHeight - 6,
      );
      doc.text(`Page ${data.pageNumber}`, pageWidth - MARGIN_X, pageHeight - 6, {
        align: "right",
      });
    },
  });

  const stamp = input.generatedAt.slice(0, 10);
  doc.save(`cellar-pulse-${slug(input.accountName) || "account"}-products-${stamp}.pdf`);
}
