import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FOCUS_SECTIONS } from "./focus-sections";
import { formatDate, formatHealthScoreChange } from "./format";
import { buildExportPdfFilename } from "./pdf-filename";
import { formatPdfLastVisitCell } from "./pdf-account-visit";
import type { AccountHealth, FocusHorizon, RiskLevel } from "./types";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type FocusHealthPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
  allAccounts?: AccountHealth[];
};

const WINDOW_LABEL: Record<FocusHorizon, string> = {
  this_week: "≤ 1 Week (Urgent)",
  two_weeks: "2 Weeks Out",
  three_weeks: "3 Weeks Out",
};

const RISK_SHORT: Record<RiskLevel, string> = {
  critical: "CRITICAL",
  at_risk: "AT RISK",
  dormant: "DORMANT",
  healthy: "HEALTHY",
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : `Rep: ${repFilter}`;
}

function compactDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "0d";
  return `${days}d`;
}

function compactFrequency(days: number | null): string {
  if (days === null) return "—";
  if (days === 1) return "1d";
  if (days < 14) return `${days}d`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "1w" : `${weeks}w`;
  }
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? "1mo" : `${months}mo`;
}

function focusRow(window: string, item: AccountHealth): (string | number)[] {
  const tier = item.territoryTier ? territoryTierLabel(item.territoryTier) : "—";
  const rep = item.account.salesRep ? ` (${item.account.salesRep})` : "";
  const cadenceMultiplier =
    item.typicalIntervalDays && item.daysSinceOrder
      ? `${(item.daysSinceOrder / item.typicalIntervalDays).toFixed(1)}x cycle`
      : "—";

  const lastOrderCell =
    item.lastOrderDate && item.daysSinceOrder !== null
      ? `${formatDate(item.lastOrderDate)}\n(${item.daysSinceOrder}d ago)`
      : item.lastOrderDate
        ? formatDate(item.lastOrderDate)
        : "—";

  return [
    window,
    `${item.account.name}${rep}`,
    RISK_SHORT[item.risk],
    tier,
    `${item.score}${formatHealthScoreChange(item.scoreChange14d) ?? ""}`,
    lastOrderCell,
    formatPdfLastVisitCell(item.lastVisitDate, item.daysSinceVisit),
    compactFrequency(item.typicalIntervalDays),
    cadenceMultiplier,
  ];
}

export function downloadFocusHealthPdf(input: FocusHealthPdfInput): void {
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
  doc.text("CELLAR PULSE · ACCOUNT HEALTH & FOCUS HORIZONS REPORT", MARGIN_X, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${repLabel(input.repFilter)}  ·  As of: ${formatDate(input.asOf)}  ·  Exported: ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    11,
    { align: "right" },
  );

  // Compute metrics from allAccounts or focusByHorizon
  const accountsList =
    input.allAccounts && input.allAccounts.length > 0
      ? input.allAccounts
      : FOCUS_SECTIONS.flatMap((s) => input.focusByHorizon[s.horizon]);

  const totalAccounts = accountsList.length;
  const criticalCount = accountsList.filter((a) => a.risk === "critical").length;
  const atRiskCount = accountsList.filter((a) => a.risk === "at_risk").length;
  const dormantCount = accountsList.filter((a) => a.risk === "dormant").length;
  const healthyCount = accountsList.filter((a) => a.risk === "healthy").length;
  const avgScore =
    totalAccounts > 0
      ? Math.round(accountsList.reduce((s, a) => s + a.score, 0) / totalAccounts)
      : 0;

  // Summary Metrics Bar
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X, 22, pageWidth - MARGIN_X * 2, 13, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

  doc.setFont("helvetica", "bold");
  doc.text("TOTAL ACCOUNTS:", MARGIN_X + 4, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${totalAccounts}`, MARGIN_X + 34, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(190, 18, 60);
  doc.text("CRITICAL:", MARGIN_X + 50, 30);
  doc.text(`${criticalCount}`, MARGIN_X + 66, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 83, 9);
  doc.text("AT RISK:", MARGIN_X + 78, 30);
  doc.text(`${atRiskCount}`, MARGIN_X + 92, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);
  doc.text("DORMANT:", MARGIN_X + 104, 30);
  doc.text(`${dormantCount}`, MARGIN_X + 122, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("HEALTHY:", MARGIN_X + 134, 30);
  doc.text(`${healthyCount}`, MARGIN_X + 150, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text("AVG HEALTH SCORE:", MARGIN_X + 164, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${avgScore} / 100`, MARGIN_X + 196, 30);

  const focusBody = FOCUS_SECTIONS.flatMap((section) => {
    const label = WINDOW_LABEL[section.horizon];
    const accounts = input.focusByHorizon[section.horizon];
    if (accounts.length === 0) return [];
    return accounts.map((item) => focusRow(label, item));
  });

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    head: [
      [
        "Focus Window",
        "Account / Customer",
        "Risk Level",
        "Territory Tier",
        "Health Score",
        "Last Order",
        "Last Visit",
        "Cadence",
        "Cadence Pace",
      ],
    ],
    body:
      focusBody.length > 0
        ? focusBody
        : [["—", "No focus accounts in active horizons", "—", "—", "—", "—", "—", "—", "—"]],
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
      0: { cellWidth: 34, fontStyle: "bold" },
      1: { cellWidth: 68 },
      2: { cellWidth: 24, fontStyle: "bold" },
      3: { cellWidth: 26 },
      4: { cellWidth: 20, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 22, halign: "right" },
      7: { cellWidth: 20, halign: "right" },
      8: { cellWidth: 24, halign: "right" },
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
      `Cellar Pulse  ·  Account Health & Priority Horizons  ·  ${formatDate(input.asOf)}`,
      MARGIN_X,
      pageHeight - 5,
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - MARGIN_X, pageHeight - 5, {
      align: "right",
    });
  }

  const stamp = input.generatedAt.slice(0, 10);
  doc.save(buildExportPdfFilename(input.repFilter, "account-health", stamp));
}
