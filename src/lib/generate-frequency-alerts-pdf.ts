import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatMoney, formatNumber } from "./format";
import type { AccountFrequencyAlert } from "./frequency-alerts";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type FrequencyAlertsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  alerts: AccountFrequencyAlert[];
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : `Rep: ${repFilter}`;
}

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

function alertRow(alert: AccountFrequencyAlert): (string | number)[] {
  const tierStr = alert.territoryTier ? ` (${territoryTierLabel(alert.territoryTier)})` : "";
  const repStr = alert.salesRep ? `\nRep: ${alert.salesRep}` : "";
  const accountCell = `${alert.accountName}${tierStr}${repStr}`;

  const cadenceCell = `Typ: ${alert.typicalIntervalDays}d\nElapsed: ${alert.currentDaysSinceOrder}d (+${alert.daysPastTypical}d)\n${alert.cadenceMultiplier.toFixed(1)}x cycle`;

  const paceCell = `-${alert.dropPercentage}%\n${alert.recentOrdersPerMonth}/mo vs ${alert.typicalOrdersPerMonth}/mo`;

  const bottlesStr = alert.bottlesAtRisk > 0 ? `${formatNumber(alert.bottlesAtRisk)} btls` : "—";
  const revenueStr = alert.revenueAtRisk > 0 ? formatMoney(alert.revenueAtRisk) : "—";
  const atRiskCell = `${bottlesStr}\n${revenueStr}`;

  const actionCell = `${alert.actionRecommendation}\n"${alert.message}"`;

  return [
    severityLabel(alert.severity),
    accountCell,
    cadenceCell,
    paceCell,
    atRiskCell,
    actionCell,
  ];
}

export function downloadFrequencyAlertsPdf(input: FrequencyAlertsPdfInput): void {
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
  doc.text("CELLAR PULSE · FREQUENCY DROP ALERTS REPORT", MARGIN_X, 11);

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
  const totalBottlesAtRisk = input.alerts.reduce((s, a) => s + (a.bottlesAtRisk || 0), 0);
  const totalRevenueAtRisk = input.alerts.reduce((s, a) => s + (a.revenueAtRisk || 0), 0);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X, 22, pageWidth - MARGIN_X * 2, 13, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

  doc.setFont("helvetica", "bold");
  doc.text("TOTAL ALERTS:", MARGIN_X + 4, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${input.alerts.length}`, MARGIN_X + 27, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(190, 18, 60);
  doc.text("CRITICAL:", MARGIN_X + 38, 30);
  doc.text(`${criticalCount}`, MARGIN_X + 54, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 83, 9);
  doc.text("WARNING:", MARGIN_X + 65, 30);
  doc.text(`${warningCount}`, MARGIN_X + 82, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("WATCH:", MARGIN_X + 93, 30);
  doc.text(`${watchCount}`, MARGIN_X + 107, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text("EST. BOTTLES AT RISK:", MARGIN_X + 124, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatNumber(totalBottlesAtRisk)} btls`, MARGIN_X + 162, 30);

  doc.setFont("helvetica", "bold");
  doc.text("EST. REVENUE AT RISK:", MARGIN_X + 185, 30);
  doc.setFont("helvetica", "normal");
  doc.text(formatMoney(totalRevenueAtRisk), MARGIN_X + 225, 30);

  // Sort alerts: critical first, then warning, then watch, ordered by days overdue
  const sortedAlerts = [...input.alerts].sort((a, b) => {
    const sevRank = (s: AccountFrequencyAlert["severity"]) =>
      s === "critical" ? 0 : s === "warning" ? 1 : 2;
    const diff = sevRank(a.severity) - sevRank(b.severity);
    if (diff !== 0) return diff;
    return b.daysPastTypical - a.daysPastTypical;
  });

  const tableBody = sortedAlerts.map(alertRow);

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    head: [
      [
        "SEVERITY",
        "ACCOUNT & REP",
        "CADENCE DELAY",
        "PACE DROP",
        "AT RISK",
        "ACTION PLAYBOOK & CONTEXT",
      ],
    ],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      valign: "top",
      lineColor: [241, 245, 249],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 20, fontStyle: "bold" },
      1: { cellWidth: 55 },
      2: { cellWidth: 42 },
      3: { cellWidth: 32 },
      4: { cellWidth: 32 },
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
    didDrawPage: (data) => {
      // Footer with page numbering
      const str = `Page ${data.pageNumber} of ${doc.getNumberOfPages()}  ·  Cellar Pulse Automated Frequency Alert Diagnostics`;
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(str, pageWidth / 2, pageHeight - 6, { align: "center" });
    },
  });

  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  const filename = `cellar-pulse-frequency-drop-alerts-${repSlug}-${stamp}.pdf`;

  doc.save(filename);
}
