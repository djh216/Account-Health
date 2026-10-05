import type { jsPDF } from "jspdf";
import { formatDate } from "./format";

export const PDF_MARGIN_X = 12;
export const PDF_BURGUNDY: [number, number, number] = [120, 28, 48];
export const PDF_TEXT: [number, number, number] = [30, 41, 59];
export const PDF_MUTED: [number, number, number] = [100, 116, 139];

export function pdfRepScope(repFilter: string): string {
  return repFilter === "all" ? "All reps" : repFilter;
}

/** Burgundy title bar + meta line. Returns Y for body content. */
export function drawPdfTitleBar(
  doc: jsPDF,
  title: string,
  repFilter: string,
  asOf: string,
  exportedStamp: string,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_BURGUNDY);
  doc.rect(0, 0, pageWidth, 14, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, PDF_MARGIN_X, 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const meta = `${pdfRepScope(repFilter)} · As of ${formatDate(asOf)} · ${exportedStamp.slice(0, 10)}`;
  doc.text(meta, pageWidth - PDF_MARGIN_X, 9, { align: "right" });

  doc.setTextColor(...PDF_TEXT);
  return 18;
}

export type PdfKpiChip = {
  label: string;
  value: string;
  color?: [number, number, number];
};

export function drawPdfKpiRow(doc: jsPDF, startY: number, chips: PdfKpiChip[]): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const barH = 9;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(PDF_MARGIN_X, startY, pageWidth - PDF_MARGIN_X * 2, barH, 1.5, 1.5, "FD");

  doc.setFontSize(7.5);
  let x = PDF_MARGIN_X + 3;
  const y = startY + 6;
  chips.forEach((chip, index) => {
    if (index > 0) x += 2;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(chip.color ?? PDF_MUTED));
    doc.text(`${chip.label}:`, x, y);
    x += doc.getTextWidth(`${chip.label}: `);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_TEXT);
    doc.text(chip.value, x, y);
    x += doc.getTextWidth(`${chip.value}  `) + 4;
  });

  return startY + barH + 4;
}

export function stampPdfFooters(
  doc: jsPDF,
  shortTitle: string,
  asOf: string,
): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Cellar Pulse · ${shortTitle} · ${formatDate(asOf)}`, PDF_MARGIN_X, pageHeight - 4);
    doc.text(`${p}/${totalPages}`, pageWidth - PDF_MARGIN_X, pageHeight - 4, {
      align: "right",
    });
  }
}

export const PDF_TABLE_HEAD = {
  fillColor: [241, 245, 249] as [number, number, number],
  textColor: PDF_TEXT,
  fontStyle: "bold" as const,
  fontSize: 7.5,
  cellPadding: 1.6,
};

export const PDF_TABLE_BODY = {
  fontSize: 7,
  textColor: PDF_TEXT,
  cellPadding: 1.5,
  valign: "top" as const,
};
