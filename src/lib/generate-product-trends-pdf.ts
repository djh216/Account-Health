import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatMoney, formatNumber } from "./format";
import type { ProductSummary, ProductSlowingAlert } from "./product-trends";
import { buildExportPdfFilename } from "./pdf-filename";
import {
  artifactFromJsPdf,
  downloadPdfArtifact,
  type PdfExportArtifact,
} from "./pdf-present";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type ProductTrendsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  products: ProductSummary[];
  slowingAlerts?: ProductSlowingAlert[];
  totalBottles: number;
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : `Rep: ${repFilter}`;
}

function trajectoryLabel(trajectory: ProductSummary["trajectory"]): string {
  switch (trajectory) {
    case "accelerating":
      return "GROWING (+)";
    case "steady":
      return "STEADY";
    case "decelerating":
      return "SLOWING (-)";
    case "new":
      return "NEW ITEM";
    case "dormant":
      return "INACTIVE";
    default:
      return "STEADY";
  }
}

export function generateProductTrendsPdfDocument(input: ProductTrendsPdfInput): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Document Title Header
  doc.setFillColor(BURGUNDY[0], BURGUNDY[1], BURGUNDY[2]);
  doc.rect(0, 0, pageWidth, 18, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Product sales trends", MARGIN_X, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${repLabel(input.repFilter)}  ·  As of: ${formatDate(input.asOf)}  ·  Exported: ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    11,
    { align: "right" },
  );

  // Summary Metrics Bar
  const totalProducts = input.products.length;
  const slowingCount = input.slowingAlerts?.length ?? 0;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X, 22, pageWidth - MARGIN_X * 2, 13, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

  doc.setFont("helvetica", "bold");
  doc.text("PRODUCTS:", MARGIN_X + 4, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${totalProducts}`, MARGIN_X + 26, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(190, 18, 60);
  doc.text("SLOWING ITEMS:", MARGIN_X + 40, 30);
  doc.text(`${slowingCount}`, MARGIN_X + 70, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text("TOTAL BOTTLES:", MARGIN_X + 90, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatNumber(input.totalBottles)} btls`, MARGIN_X + 120, 30);

  // Top Products Table
  const sorted = [...input.products].sort((a, b) => b.totalBottles - a.totalBottles);

  const productRows = sorted.map((p) => {
    const paceStr =
      p.velocityDeltaPct !== null
        ? `${p.velocityDeltaPct > 0 ? "+" : ""}${p.velocityDeltaPct}%`
        : "—";

    return [
      p.productName,
      trajectoryLabel(p.trajectory),
      formatNumber(p.recentVolume),
      formatNumber(p.priorVolume),
      paceStr,
      p.accountCount,
      p.orderCount,
      formatNumber(p.totalBottles),
    ];
  });

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    head: [
      [
        "Product Name",
        "Trajectory",
        "Recent Run",
        "Prior Run",
        "Velocity Δ",
        "Accounts",
        "Orders",
        "Total Bottles",
      ],
    ],
    body:
      productRows.length > 0
        ? productRows
        : [["No product trend data available", "", "", "", "", "", "", ""]],
    theme: "grid",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 1.8,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 26, fontStyle: "bold" },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 18, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 26, halign: "right", fontStyle: "bold" },
      8: { cellWidth: 30, halign: "right" },
    },
  });

  // Page numbering footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Cellar Pulse  ·  Product Sales Trends Report  ·  ${formatDate(input.asOf)}`,
      MARGIN_X,
      pageHeight - 5,
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - MARGIN_X, pageHeight - 5, {
      align: "right",
    });
  }

  return doc;
}

export function buildProductTrendsPdfArtifact(input: ProductTrendsPdfInput): PdfExportArtifact {
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateProductTrendsPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "product-trends", stamp),
  );
}

export function downloadProductTrendsPdf(input: ProductTrendsPdfInput): void {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser.");
  }
  downloadPdfArtifact(buildProductTrendsPdfArtifact(input));
}
