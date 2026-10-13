import type { jsPDF } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
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

/** Y position for body content after a manual page break. */
export const PDF_CONTENT_TOP_Y = 18;

export const PDF_PAGE_BOTTOM_MARGIN = 12;

/** Section title line + gap before the grid (mm). */
export const PDF_SECTION_TITLE_BLOCK_MM = 8;

/** Table header row + at least one body row (mm). */
export const PDF_MIN_TABLE_BLOCK_MM = 20;

export function pdfPageContentBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - PDF_PAGE_BOTTOM_MARGIN;
}

/** Start a new page when fewer than `minBlockHeight` mm remain (keeps table heads with table start). */
export function ensurePdfVerticalSpace(
  doc: jsPDF,
  startY: number,
  minBlockHeight = PDF_MIN_TABLE_BLOCK_MM,
): number {
  if (startY + minBlockHeight > pdfPageContentBottom(doc)) {
    doc.addPage();
    return PDF_CONTENT_TOP_Y;
  }
  return startY;
}

export function pdfAutoTableFinalY(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

export type DrawPdfSectionTableInput = {
  sectionTitle?: string;
  sectionTitleFontSize?: number;
  sectionTitleColor?: [number, number, number];
  /** Gap between section title baseline and table top (mm). */
  tableStartOffset?: number;
  head: NonNullable<UserOptions["head"]>;
  body: NonNullable<UserOptions["body"]>;
} & Omit<UserOptions, "startY" | "head" | "body">;

/** Draw optional section title + autoTable, avoiding orphaned titles or column headers. */
export function drawPdfSectionTable(
  doc: jsPDF,
  startY: number,
  input: DrawPdfSectionTableInput,
): number {
  const {
    sectionTitle,
    sectionTitleFontSize = 9,
    sectionTitleColor,
    tableStartOffset = 4,
    head,
    body,
    margin,
    ...rest
  } = input;

  const titleBlock = sectionTitle ? PDF_SECTION_TITLE_BLOCK_MM : 0;
  const y = ensurePdfVerticalSpace(doc, startY, titleBlock + PDF_MIN_TABLE_BLOCK_MM);

  let tableStartY = y;
  if (sectionTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(sectionTitleFontSize);
    if (sectionTitleColor) doc.setTextColor(...sectionTitleColor);
    else doc.setTextColor(...PDF_TEXT);
    doc.text(sectionTitle, PDF_MARGIN_X, y);
    doc.setTextColor(...PDF_TEXT);
    tableStartY = y + tableStartOffset;
  }

  const marginOverrides =
    margin && typeof margin === "object" && !Array.isArray(margin) ? margin : {};

  autoTable(doc, {
    startY: tableStartY,
    margin: {
      left: PDF_MARGIN_X,
      right: PDF_MARGIN_X,
      bottom: PDF_PAGE_BOTTOM_MARGIN,
      ...marginOverrides,
    },
    head,
    body,
    theme: "grid",
    headStyles: PDF_TABLE_HEAD,
    bodyStyles: PDF_TABLE_BODY,
    showHead: "everyPage",
    rowPageBreak: "auto",
    styles: { overflow: "linebreak", cellWidth: "wrap" },
    ...rest,
  });

  return pdfAutoTableFinalY(doc, tableStartY + 16) + 6;
}
