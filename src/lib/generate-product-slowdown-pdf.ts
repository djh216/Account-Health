import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatNumber } from "./format";
import type { ProductSlowingAlert } from "./product-trends";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type ProductSlowdownPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  alerts: ProductSlowingAlert[];
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : `Rep: ${repFilter}`;
}

function severityLabel(severity: ProductSlowingAlert["severity"]): string {
  switch (severity) {
    case "critical":
      return "CRITICAL";
    case "warning":
      return "WARNING";
    case "watch":
      return "WATCH";
  }
}

function alertRow(alert: ProductSlowingAlert): (string | number)[] {
  const productCell = `${alert.productName}\n${alert.accountCount} active account(s)\nLast ordered: ${alert.lastOrderDate ? formatDate(alert.lastOrderDate) : "—"}`;
  const volumeCell = `Last 28d: ${formatNumber(alert.recentVolume28d)} btls\nPrior 28d: ${formatNumber(alert.priorVolume28d)} btls\nDrop: -${formatNumber(alert.volumeDropBtls)} btls (-${alert.dropPercentage}%)`;
  const accountsCell =
    alert.topAtRiskAccounts.length > 0
      ? alert.topAtRiskAccounts.join("\n")
      : "Historical buyer accounts";
  const actionCell = `${alert.recommendation}\n"${alert.message}"`;

  return [
    severityLabel(alert.severity),
    productCell,
    volumeCell,
    accountsCell,
    actionCell,
  ];
}

export function downloadProductSlowdownPdf(input: ProductSlowdownPdfInput): void {
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
  doc.text("CELLAR PULSE · 28-DAY PRODUCT SALES SLOWDOWN REPORT", MARGIN_X, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${repLabel(input.repFilter)}  ·  As of: ${formatDate(input.asOf)}  ·  Exported: ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    11,
    { align: "right" },
  );

  // Summary Metrics Bar
  const criticalCount = input.alerts.filter((a) => a.severity === "critical").length;
  const warningCount = input.alerts.filter((a) => a.severity === "warning").length;
  const watchCount = input.alerts.filter((a) => a.severity === "watch").length;
  const totalBottlesDrop = input.alerts.reduce((sum, a) => sum + a.volumeDropBtls, 0);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(MARGIN_X, 22, pageWidth - MARGIN_X * 2, 14, "FD");

  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);

  const kpis = [
    { label: "Total Slowing SKUs", value: `${input.alerts.length} Products` },
    { label: "Critical (Zero Reorders / -50%+)", value: `${criticalCount}` },
    { label: "Warning (Decelerating -25%+)", value: `${warningCount}` },
    { label: "Watchlist (Cooling -15%+)", value: `${watchCount}` },
    { label: "Total 28-Day Bottle Deficit", value: `-${formatNumber(totalBottlesDrop)} btls` },
  ];

  const colWidth = (pageWidth - MARGIN_X * 2) / kpis.length;
  kpis.forEach((kpi, idx) => {
    const x = MARGIN_X + idx * colWidth + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label.toUpperCase(), x, 27);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (kpi.label.includes("Critical")) {
      doc.setTextColor(190, 18, 60);
    } else if (kpi.label.includes("Warning")) {
      doc.setTextColor(180, 83, 9);
    } else {
      doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    }
    doc.text(kpi.value, x, 33);
  });

  // Main Slowdown Table
  const tableData = input.alerts.map(alertRow);

  autoTable(doc, {
    startY: 40,
    head: [
      [
        "SEVERITY",
        "WINE PRODUCT SKU & PLACEMENTS",
        "28D VS PRIOR 28D VOLUME",
        "TOP ACCOUNTS AT RISK",
        "ANALYSIS & RECOMMENDED ACTION",
      ],
    ],
    body: tableData,
    margin: { left: MARGIN_X, right: MARGIN_X },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: TEXT_DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: BURGUNDY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: "bold", halign: "center" },
      1: { cellWidth: 65 },
      2: { cellWidth: 50 },
      3: { cellWidth: 48 },
      4: { cellWidth: "auto" },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 0) {
        const val = String(data.cell.raw);
        if (val === "CRITICAL") {
          data.cell.styles.textColor = [190, 18, 60];
          data.cell.styles.fillColor = [255, 241, 242];
        } else if (val === "WARNING") {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fillColor = [254, 243, 199];
        } else {
          data.cell.styles.textColor = [71, 85, 105];
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    },
    didDrawPage(data) {
      // Footer with page numbering
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "Cellar Pulse · Intelligent Product Sales Slowdown Report · Generated automatically",
        MARGIN_X,
        pageHeight - 6,
      );
      const pageNumberStr = `Page ${data.pageNumber}`;
      doc.text(pageNumberStr, pageWidth - MARGIN_X, pageHeight - 6, {
        align: "right",
      });
    },
  });

  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  const filename = `cellar-pulse-product-slowdown-report-${repSlug}-${stamp}.pdf`;

  doc.save(filename);
}

export function downloadProductSlowdownCsv(input: ProductSlowdownPdfInput): void {
  const headers = [
    "Severity",
    "Product Name",
    "Active Accounts Count",
    "Last Order Date",
    "Recent 28-Day Volume (Bottles)",
    "Prior 28-Day Volume (Bottles)",
    "Volume Drop (Bottles)",
    "Drop Percentage",
    "Top Inactive / At-Risk Accounts",
    "Diagnosis",
    "Action Recommendation",
    "Sales Rep Filter",
    "Report Generated Date",
  ];

  const rows = input.alerts.map((a) => [
    a.severity.toUpperCase(),
    `"${a.productName.replace(/"/g, '""')}"`,
    a.accountCount,
    a.lastOrderDate || "",
    a.recentVolume28d,
    a.priorVolume28d,
    a.volumeDropBtls,
    `${a.dropPercentage}%`,
    `"${a.topAtRiskAccounts.join("; ").replace(/"/g, '""')}"`,
    `"${a.message.replace(/"/g, '""')}"`,
    `"${a.recommendation.replace(/"/g, '""')}"`,
    `"${input.repFilter}"`,
    input.generatedAt.slice(0, 10),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  a.href = url;
  a.download = `cellar-pulse-product-slowdown-report-${repSlug}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
