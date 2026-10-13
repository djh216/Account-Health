import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatDate,
  formatDays,
  formatFrequencyDeltaDays,
  formatHealthScoreWithChange,
  formatIntervalDays,
  formatNumber,
  formatPct,
} from "./format";
import type { AccountOrderTracking } from "./order-analytics";
import { buildExportPdfFilename } from "./pdf-filename";
import {
  artifactFromJsPdf,
  downloadPdfArtifact,
  type PdfExportArtifact,
} from "./pdf-present";
import {
  drawPdfKpiRow,
  drawPdfTitleBar,
  ensurePdfVerticalSpace,
  PDF_MARGIN_X,
  PDF_TABLE_BODY,
  PDF_TABLE_HEAD,
  stampPdfFooters,
} from "./pdf-layout";
import { orderCadenceTone } from "./order-cadence";
import { frequencyDeltaTone } from "./format";

export type AccountOrderTrackingPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  rows: AccountOrderTracking[];
};

const CADENCE_COLORS: Record<
  ReturnType<typeof orderCadenceTone>,
  [number, number, number]
> = {
  current: [22, 101, 52],
  approaching: [180, 83, 9],
  overdue: [190, 18, 60],
  unknown: [100, 116, 139],
};

const FREQ_DELTA_COLORS: Record<
  ReturnType<typeof frequencyDeltaTone>,
  [number, number, number]
> = {
  shortened: [22, 101, 52],
  lengthened: [180, 83, 9],
  neutral: [100, 116, 139],
  unknown: [100, 116, 139],
};

function lastOrderCell(row: AccountOrderTracking): string {
  const { lastOrderDate, daysSinceLastOrder } = row.frequency;
  return `${formatDays(daysSinceLastOrder)}\n${formatDate(lastOrderDate)}`;
}

function trackingRow(row: AccountOrderTracking): string[] {
  const rank =
    row.territoryRank != null ? `#${row.territoryRank}` : "—";
  const health =
    row.healthScore != null
      ? formatHealthScoreWithChange(row.healthScore, row.healthScoreChange14d)
      : "—";

  return [
    row.accountName,
    rank,
    health,
    formatIntervalDays(row.frequency.avgDaysBetweenOrders),
    lastOrderCell(row),
    formatNumber(row.volumeAllTime),
    formatNumber(row.volumeRecent90),
    formatNumber(row.volumePrior90),
    formatPct(row.volumeDeltaPct),
    formatFrequencyDeltaDays(row.frequencyDeltaDays),
  ];
}

export function generateAccountOrderTrackingPdfDocument(
  input: AccountOrderTrackingPdfInput,
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const totalVolume = input.rows.reduce((sum, row) => sum + row.volumeAllTime, 0);
  const recentVolume = input.rows.reduce((sum, row) => sum + row.volumeRecent90, 0);

  let startY = drawPdfTitleBar(
    doc,
    "Account order tracking",
    input.repFilter,
    input.asOf,
    input.generatedAt,
  );
  startY = drawPdfKpiRow(doc, startY, [
    { label: "Accounts", value: String(input.rows.length) },
    { label: "All-time btl", value: formatNumber(totalVolume) },
    { label: "Recent 45d btl", value: formatNumber(recentVolume) },
    {
      label: "Sort",
      value: "Value rank (asc) — matches Orders default",
    },
  ]);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Volume trends use 45-day recent vs prior windows. All uploaded order history is retained for all-time totals.",
    PDF_MARGIN_X,
    startY + 1,
  );
  startY += 6;

  startY = ensurePdfVerticalSpace(doc, startY);

  const body = input.rows.map(trackingRow);
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - PDF_MARGIN_X * 2;

  autoTable(doc, {
    startY,
    tableWidth,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, bottom: 12 },
    showHead: "everyPage",
    head: [
      [
        "Account",
        "Value rank",
        "Health",
        "Typical freq.",
        "Last order",
        "All-time",
        "Recent 45d",
        "Prior 45d",
        "Volume Δ",
        "Frequency Δ",
      ],
    ],
    body,
    theme: "grid",
    headStyles: PDF_TABLE_HEAD,
    bodyStyles: PDF_TABLE_BODY,
    styles: { overflow: "linebreak", cellWidth: "wrap" },
    columnStyles: {
      0: { cellWidth: tableWidth * 0.17 },
      1: { cellWidth: tableWidth * 0.06, halign: "right" },
      2: { cellWidth: tableWidth * 0.07, halign: "right" },
      3: { cellWidth: tableWidth * 0.07 },
      4: { cellWidth: tableWidth * 0.11 },
      5: { cellWidth: tableWidth * 0.08, halign: "right" },
      6: { cellWidth: tableWidth * 0.08, halign: "right" },
      7: { cellWidth: tableWidth * 0.08, halign: "right" },
      8: { cellWidth: tableWidth * 0.06, halign: "right" },
      9: { cellWidth: tableWidth * 0.22, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const rowIndex = data.row.index;
      const row = input.rows[rowIndex];
      if (!row) return;

      if (data.column.index === 4) {
        const tone = orderCadenceTone({
          daysSinceOrder: row.frequency.daysSinceLastOrder,
          intervalDays: row.frequency.avgDaysBetweenOrders,
        });
        data.cell.styles.textColor = CADENCE_COLORS[tone];
      }

      if (data.column.index === 8 && row.volumeDeltaPct !== null) {
        if (row.volumeDeltaPct > 0) {
          data.cell.styles.textColor = [22, 101, 52];
        } else if (row.volumeDeltaPct < 0) {
          data.cell.styles.textColor = [190, 18, 60];
        }
      }

      if (data.column.index === 9) {
        data.cell.styles.textColor =
          FREQ_DELTA_COLORS[frequencyDeltaTone(row.frequencyDeltaDays)];
      }
    },
  });

  stampPdfFooters(doc, "Account order tracking", input.asOf);

  return doc;
}

export function buildAccountOrderTrackingPdfArtifact(
  input: AccountOrderTrackingPdfInput,
): PdfExportArtifact {
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateAccountOrderTrackingPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "account-order-tracking", stamp),
  );
}

export function downloadAccountOrderTrackingPdf(
  input: AccountOrderTrackingPdfInput,
): void {
  downloadPdfArtifact(buildAccountOrderTrackingPdfArtifact(input));
}
