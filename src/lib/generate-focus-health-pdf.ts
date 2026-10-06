import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FOCUS_SECTIONS } from "./focus-sections";
import { formatDate, formatHealthScoreChange } from "./format";
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
import type { AccountHealth, FocusHorizon, RiskLevel } from "./types";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = PDF_MARGIN_X;

export type FocusHealthPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
  allAccounts?: AccountHealth[];
};

const WINDOW_LABEL: Record<FocusHorizon, string> = {
  this_week: "Week 1",
  two_weeks: "Week 2",
  three_weeks: "Week 3",
};

const RISK_SHORT: Record<RiskLevel, string> = {
  critical: "CRITICAL",
  at_risk: "AT RISK",
  dormant: "DORMANT",
  healthy: "HEALTHY",
};

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
    item.daysSinceOrder !== null
      ? `${item.daysSinceOrder}d`
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
    item.daysSinceVisit !== null ? `${item.daysSinceVisit}d` : "—",
    compactFrequency(item.typicalIntervalDays),
    cadenceMultiplier,
  ];
}

export function generateFocusHealthPdfDocument(input: FocusHealthPdfInput): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

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

  let startY = drawPdfTitleBar(
    doc,
    "Account health & focus",
    input.repFilter,
    input.asOf,
    input.generatedAt,
  );
  startY = drawPdfKpiRow(doc, startY, [
    { label: "Accounts", value: String(totalAccounts) },
    { label: "Critical", value: String(criticalCount), color: [190, 18, 60] },
    { label: "At risk", value: String(atRiskCount), color: [180, 83, 9] },
    { label: "Dormant", value: String(dormantCount), color: [100, 116, 139] },
    { label: "Healthy", value: String(healthyCount), color: [22, 101, 52] },
    { label: "Avg score", value: String(avgScore) },
  ]);

  const focusBody = FOCUS_SECTIONS.flatMap((section) => {
    const label = WINDOW_LABEL[section.horizon];
    const accounts = input.focusByHorizon[section.horizon];
    if (accounts.length === 0) return [];
    return accounts.map((item) => focusRow(label, item));
  });

  startY = ensurePdfVerticalSpace(doc, startY);

  autoTable(doc, {
    startY,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 12 },
    showHead: "everyPage",
    head: [
      ["Window", "Account", "Risk", "Tier", "Score", "Last order", "Last visit", "Typ cadence", "Pace"],
    ],
    body:
      focusBody.length > 0
        ? focusBody
        : [["—", "No focus accounts in active horizons", "—", "—", "—", "—", "—", "—", "—"]],
    theme: "grid",
    headStyles: PDF_TABLE_HEAD,
    bodyStyles: { ...PDF_TABLE_BODY, valign: "middle" },
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

  stampPdfFooters(doc, "Account health", input.asOf);

  return doc;
}

export function buildFocusHealthPdfArtifact(input: FocusHealthPdfInput): PdfExportArtifact {
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateFocusHealthPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "account-health", stamp),
  );
}

export function downloadFocusHealthPdf(input: FocusHealthPdfInput): void {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser.");
  }
  downloadPdfArtifact(buildFocusHealthPdfArtifact(input));
}
