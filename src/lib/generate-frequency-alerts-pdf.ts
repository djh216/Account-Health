import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatNumber } from "./format";
import type { AccountFrequencyAlert } from "./frequency-alerts";
import { buildExportPdfFilename } from "./pdf-filename";
import { formatPdfLastVisitFromLookup, type PdfAccountVisitLookup } from "./pdf-account-visit";
import {
  drawPdfKpiRow,
  drawPdfTitleBar,
  PDF_MARGIN_X,
  PDF_TABLE_BODY,
  PDF_TABLE_HEAD,
  stampPdfFooters,
} from "./pdf-layout";
import { territoryTierLabel } from "./territory-value";

export type FrequencyAlertsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  alerts: AccountFrequencyAlert[];
  accountVisitLookup?: PdfAccountVisitLookup;
};

function severityLabel(severity: AccountFrequencyAlert["severity"]): string {
  switch (severity) {
    case "critical":
      return "CRITICAL";
    case "warning":
      return "WARNING";
    case "watch":
      return "WATCH";
  }
}

function severityColor(
  severity: AccountFrequencyAlert["severity"],
): [number, number, number] {
  switch (severity) {
    case "critical":
      return [190, 18, 60]; // crimson
    case "warning":
      return [180, 83, 9]; // amber
    case "watch":
      return [71, 85, 105]; // slate
  }
}

function alertRow(
  alert: AccountFrequencyAlert,
  accountVisitLookup?: PdfAccountVisitLookup,
): (string | number)[] {
  const tierStr = alert.territoryTier ? ` · ${territoryTierLabel(alert.territoryTier)}` : "";
  const repStr = alert.salesRep ? ` · ${alert.salesRep}` : "";
  const accountCell = `${alert.accountName}${tierStr}${repStr}`;

  const cadenceCell = `${alert.currentDaysSinceOrder}d / ${alert.typicalIntervalDays}d typ · ${alert.cadenceMultiplier.toFixed(1)}x${
    alert.daysPastTypical > 0 ? ` · +${alert.daysPastTypical}d late` : ""
  }`;

  const bottles =
    alert.bottlesAtRisk || alert.volumeAtRisk
      ? `${formatNumber(alert.bottlesAtRisk || alert.volumeAtRisk)} btl`
      : "";
  const paceCell = `-${alert.dropPercentage}% pace · ${alert.recentOrdersPerMonth} vs ${alert.typicalOrdersPerMonth}/mo${
    bottles ? ` · ${bottles} at risk` : ""
  }`;

  return [
    severityLabel(alert.severity),
    accountCell,
    formatPdfLastVisitFromLookup(accountVisitLookup, alert.id, alert.accountName),
    cadenceCell,
    paceCell,
    alert.actionRecommendation,
  ];
}

export function downloadFrequencyAlertsPdf(input: FrequencyAlertsPdfInput): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const criticalCount = input.alerts.filter((a) => a.severity === "critical").length;
  const warningCount = input.alerts.filter((a) => a.severity === "warning").length;
  const watchCount = input.alerts.filter((a) => a.severity === "watch").length;
  const totalBottlesAtRisk = input.alerts.reduce(
    (s, a) => s + (a.bottlesAtRisk || a.volumeAtRisk || 0),
    0,
  );

  let startY = drawPdfTitleBar(
    doc,
    "Frequency drop alerts",
    input.repFilter,
    input.asOf,
    input.generatedAt,
  );
  startY = drawPdfKpiRow(doc, startY, [
    { label: "Alerts", value: String(input.alerts.length) },
    { label: "Critical", value: String(criticalCount), color: [190, 18, 60] },
    { label: "Warning", value: String(warningCount), color: [180, 83, 9] },
    { label: "Watch", value: String(watchCount), color: [71, 85, 105] },
    { label: "Btl at risk", value: formatNumber(totalBottlesAtRisk) },
  ]);

  // Sort alerts: critical first, then warning, then watch, ordered by days overdue
  const sortedAlerts = [...input.alerts].sort((a, b) => {
    const sevRank = (s: AccountFrequencyAlert["severity"]) =>
      s === "critical" ? 0 : s === "warning" ? 1 : 2;
    const diff = sevRank(a.severity) - sevRank(b.severity);
    if (diff !== 0) return diff;
    return b.daysPastTypical - a.daysPastTypical;
  });

  const tableBody = sortedAlerts.map((alert) =>
    alertRow(alert, input.accountVisitLookup),
  );

  autoTable(doc, {
    startY,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X, bottom: 12 },
    head: [["Level", "Account", "Last visit", "Order cadence", "Pace · risk", "Next step"]],
    body: tableBody,
    theme: "grid",
    headStyles: PDF_TABLE_HEAD,
    bodyStyles: PDF_TABLE_BODY,
    columnStyles: {
      0: { cellWidth: 16, fontStyle: "bold" },
      1: { cellWidth: 52 },
      2: { cellWidth: 22 },
      3: { cellWidth: 38 },
      4: { cellWidth: 42 },
      5: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const val = String(data.cell.raw);
        if (val === "CRITICAL") {
          data.cell.styles.textColor = severityColor("critical");
        } else if (val === "WARNING") {
          data.cell.styles.textColor = severityColor("warning");
        } else {
          data.cell.styles.textColor = severityColor("watch");
        }
      }
    },
  });

  stampPdfFooters(doc, "Frequency alerts", input.asOf);

  const stamp = input.generatedAt.slice(0, 10);
  doc.save(buildExportPdfFilename(input.repFilter, "frequency-drop-alerts", stamp));
}
