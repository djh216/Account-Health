import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatDays, formatNumber } from "./format";
import type { AccountProjectionAndChurn } from "./order-projections";
import { buildExportPdfFilename } from "./pdf-filename";
import { ensurePdfVerticalSpace } from "./pdf-layout";
import {
  artifactFromJsPdf,
  downloadPdfArtifact,
  type PdfExportArtifact,
} from "./pdf-present";
import {
  formatPdfLastVisitFromLookup,
  type PdfAccountVisitLookup,
} from "./pdf-account-visit";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = 12;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const ROSE_ACCENT: [number, number, number] = [190, 18, 60];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type ImminentChurnPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  accounts: AccountProjectionAndChurn[];
  accountVisitLookup?: PdfAccountVisitLookup;
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : `Rep: ${repFilter}`;
}

function churnRow(
  account: AccountProjectionAndChurn,
  accountVisitLookup?: PdfAccountVisitLookup,
): (string | number)[] {
  const tierStr = account.territoryTier ? ` · ${territoryTierLabel(account.territoryTier)} Tier` : "";
  const repStr = account.salesRep ? `\nRep: ${account.salesRep}` : "";
  const accountCell = `${account.accountName}${tierStr}${repStr}`;

  const scoreCell = `${account.churnScore}% RISK\nTrajectory: ${account.trendTrajectory.toUpperCase()}`;

  const lastDateStr = account.lastOrderDate ? formatDate(account.lastOrderDate) : "No prior orders";
  const daysSinceStr = formatDays(account.daysSinceLastOrder);
  const overdueStr = account.isOverdueForOrder ? ` (+${account.daysOverdue}d overdue)` : "";
  const cadenceCell = `Last: ${lastDateStr} (${daysSinceStr})\nCycle: every ${account.typicalIntervalDays}d${overdueStr}`;

  const monthlyBtls = `${formatNumber(account.monthlyVolumeAtRisk)} btls/mo`;
  const annualBtls = formatNumber(account.monthlyVolumeAtRisk * 12);
  const atRiskCell = `${monthlyBtls}\n(${annualBtls} btls/yr)`;

  const signalsCell = account.churnSignals.length > 0
    ? account.churnSignals.join("\n• ")
    : "Cadence lapse & volume deceleration";

  const playbookCell = account.retentionRecommendation || "Conduct urgent in-person account review and audit shelf/by-the-glass placements.";

  return [
    accountCell,
    formatPdfLastVisitFromLookup(accountVisitLookup, undefined, account.accountName),
    scoreCell,
    cadenceCell,
    atRiskCell,
    signalsCell.startsWith("•") ? signalsCell : `• ${signalsCell}`,
    playbookCell,
  ];
}

export function generateImminentChurnPdfDocument(input: ImminentChurnPdfInput): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Document Title Header Banner
  doc.setFillColor(BURGUNDY[0], BURGUNDY[1], BURGUNDY[2]);
  doc.rect(0, 0, pageWidth, 18, "F");

  // Accent line
  doc.setFillColor(ROSE_ACCENT[0], ROSE_ACCENT[1], ROSE_ACCENT[2]);
  doc.rect(0, 18, pageWidth, 1.2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("CELLAR PULSE · IMMINENT CHURN INTERVENTION ACTION PLAN", MARGIN_X, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${repLabel(input.repFilter)}  ·  As of: ${formatDate(input.asOf)}  ·  Exported: ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    11,
    { align: "right" },
  );

  // Summary Metrics Bar
  const totalAccounts = input.accounts.length;
  const totalMonthlyVolumeAtRisk = input.accounts.reduce((s, a) => s + (a.monthlyVolumeAtRisk || 0), 0);
  const totalAnnualVolumeAtRisk = totalMonthlyVolumeAtRisk * 12;
  const avgChurnScore = totalAccounts > 0
    ? Math.round(input.accounts.reduce((s, a) => s + (a.churnScore || 0), 0) / totalAccounts)
    : 0;

  doc.setFillColor(255, 241, 242); // rose-50
  doc.setDrawColor(254, 205, 211); // rose-200
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X, 22, pageWidth - MARGIN_X * 2, 13, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(ROSE_ACCENT[0], ROSE_ACCENT[1], ROSE_ACCENT[2]);
  doc.text("ACCOUNTS AT RISK:", MARGIN_X + 4, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${totalAccounts} accounts`, MARGIN_X + 36, 30);

  doc.setFont("helvetica", "bold");
  doc.text("AVG RISK SCORE:", MARGIN_X + 58, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${avgChurnScore}%`, MARGIN_X + 85, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  doc.text("MONTHLY VOLUME AT RISK:", MARGIN_X + 97, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatNumber(totalMonthlyVolumeAtRisk)} btls/mo`, MARGIN_X + 142, 30);

  doc.setFont("helvetica", "bold");
  doc.text("ANNUALIZED VOLUME AT RISK:", MARGIN_X + 168, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`${formatNumber(totalAnnualVolumeAtRisk)} btls/yr`, MARGIN_X + 214, 30);

  // Sort accounts by churn score descending, then monthly volume at risk descending
  const sortedAccounts = [...input.accounts].sort((a, b) => {
    if (b.churnScore !== a.churnScore) {
      return b.churnScore - a.churnScore;
    }
    return b.monthlyVolumeAtRisk - a.monthlyVolumeAtRisk;
  });

  const tableBody = sortedAccounts.map((account) =>
    churnRow(account, input.accountVisitLookup),
  );

  const tableStartY = ensurePdfVerticalSpace(doc, 38);

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    showHead: "everyPage",
    head: [
      [
        "ACCOUNT & REP",
        "LAST VISIT",
        "CHURN RISK",
        "ORDER CADENCE STATUS",
        "EST. VOLUME AT RISK",
        "CHURN SIGNALS",
        "RETENTION INTERVENTION PLAYBOOK",
      ],
    ],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 2.4,
      textColor: [30, 41, 59],
      valign: "top",
      lineColor: [241, 245, 249],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 46, fontStyle: "bold" },
      1: { cellWidth: 24 },
      2: { cellWidth: 28, fontStyle: "bold" },
      3: { cellWidth: 40 },
      4: { cellWidth: 30 },
      5: { cellWidth: 44 },
      6: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        data.cell.styles.textColor = ROSE_ACCENT;
      }
    },
    didDrawPage: (data) => {
      // Footer with page numbering and confidentiality notice
      const str = `Page ${data.pageNumber} of ${doc.getNumberOfPages()}  ·  Cellar Pulse Imminent Churn Intervention Plan  ·  Confidential & Proprietary`;
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(str, pageWidth / 2, pageHeight - 6, { align: "center" });
    },
  });

  return doc;
}

export function buildImminentChurnPdfArtifact(input: ImminentChurnPdfInput): PdfExportArtifact {
  if (input.accounts.length === 0) {
    throw new Error("No imminent churn accounts to export.");
  }
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateImminentChurnPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "imminent-churn-intervention", stamp),
  );
}

export function downloadImminentChurnPdf(input: ImminentChurnPdfInput): void {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser.");
  }
  downloadPdfArtifact(buildImminentChurnPdfArtifact(input));
}
