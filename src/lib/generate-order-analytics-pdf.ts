import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatMoney, formatNumber } from "./format";
import type { RestaurantOrderFrequency, RestaurantVolumeRow } from "./order-analytics";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type OrderAnalyticsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  restaurantFrequency: RestaurantOrderFrequency[];
  topRestaurants?: RestaurantVolumeRow[];
  totalOrders: number;
  totalBottles: number;
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : `Rep: ${repFilter}`;
}

function frequencyStatus(row: RestaurantOrderFrequency): {
  label: string;
  color: [number, number, number];
} {
  if (row.avgDaysBetweenOrders === null || row.avgDaysBetweenOrders <= 0) {
    return { label: "NEW / SINGLE", color: [100, 116, 139] };
  }
  const ratio = row.daysSinceLastOrder / row.avgDaysBetweenOrders;
  if (ratio >= 2.5) {
    return { label: "CRITICAL", color: [190, 18, 60] };
  }
  if (ratio >= 1.5) {
    return { label: "OVERDUE", color: [180, 83, 9] };
  }
  if (ratio >= 1.1) {
    return { label: "WATCH", color: [202, 138, 4] };
  }
  return { label: "ON TRACK", color: [22, 101, 52] };
}

function restaurantRow(row: RestaurantOrderFrequency): (string | number)[] {
  const status = frequencyStatus(row);
  const typCadence = row.avgDaysBetweenOrders
    ? `${Math.round(row.avgDaysBetweenOrders)}d`
    : "—";
  const pace = row.ordersPerMonth
    ? `${row.ordersPerMonth.toFixed(1)}/mo`
    : "—";

  return [
    row.accountName,
    status.label,
    formatDate(row.lastOrderDate),
    `${row.daysSinceLastOrder}d`,
    typCadence,
    pace,
    row.orderEventCount,
    row.productCount,
    formatNumber(row.totalVolume),
  ];
}

export function downloadOrderAnalyticsPdf(input: OrderAnalyticsPdfInput): void {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser.");
  }

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
  doc.text("CELLAR PULSE · ORDER ANALYTICS & RESTAURANT CADENCE", MARGIN_X, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${repLabel(input.repFilter)}  ·  As of: ${formatDate(input.asOf)}  ·  Exported: ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    11,
    { align: "right" },
  );

  // Summary Metrics Bar
  const totalRestaurants = input.restaurantFrequency.length;
  const overdueCount = input.restaurantFrequency.filter((r) => {
    if (!r.avgDaysBetweenOrders) return false;
    return r.daysSinceLastOrder / r.avgDaysBetweenOrders >= 1.5;
  }).length;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X, 22, pageWidth - MARGIN_X * 2, 13, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

  doc.setFont("helvetica", "bold");
  doc.text("RESTAURANTS:", MARGIN_X + 4, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${totalRestaurants}`, MARGIN_X + 28, 30);

  doc.setFont("helvetica", "bold");
  doc.text("TOTAL ORDERS:", MARGIN_X + 42, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatNumber(input.totalOrders)}`, MARGIN_X + 68, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(190, 18, 60);
  doc.text("OVERDUE CADENCE:", MARGIN_X + 88, 30);
  doc.text(`${overdueCount}`, MARGIN_X + 120, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text("TOTAL BOTTLES:", MARGIN_X + 135, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatNumber(input.totalBottles)} btls`, MARGIN_X + 162, 30);

  // Sort: most volume or most overdue
  const sorted = [...input.restaurantFrequency].sort((a, b) => {
    // sort overdue first, then by volume
    const aOverdue =
      a.avgDaysBetweenOrders && a.daysSinceLastOrder / a.avgDaysBetweenOrders >= 1.5 ? 1 : 0;
    const bOverdue =
      b.avgDaysBetweenOrders && b.daysSinceLastOrder / b.avgDaysBetweenOrders >= 1.5 ? 1 : 0;
    if (bOverdue !== aOverdue) return bOverdue - aOverdue;
    return b.totalVolume - a.totalVolume;
  });

  const tableBody = sorted.map(restaurantRow);

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    head: [
      [
        "Restaurant / Account",
        "Cadence Status",
        "Last Order",
        "Days Elapsed",
        "Typical Cadence",
        "Order Pace",
        "Orders",
        "Products",
        "Total Bottles",
      ],
    ],
    body:
      tableBody.length > 0
        ? tableBody
        : [["No restaurant order data available", "", "", "", "", "", "", "", ""]],
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
      0: { cellWidth: 62 },
      1: { cellWidth: 26, fontStyle: "bold" },
      2: { cellWidth: 24 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 18, halign: "right" },
      8: { cellWidth: 28, halign: "right", fontStyle: "bold" },
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
      `Cellar Pulse  ·  Order Analytics Report  ·  ${formatDate(input.asOf)}`,
      MARGIN_X,
      pageHeight - 5,
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - MARGIN_X, pageHeight - 5, {
      align: "right",
    });
  }

  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  doc.save(`cellar-pulse-order-analytics-${repSlug}-${stamp}.pdf`);
}
