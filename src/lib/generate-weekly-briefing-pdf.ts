import { jsPDF } from "jspdf";
import { formatDate, formatNumber } from "./format";
import { buildExportPdfFilename } from "./pdf-filename";
import {
  artifactFromJsPdf,
  downloadPdfArtifact,
  type PdfExportArtifact,
} from "./pdf-present";
import {
  drawPdfKpiRow,
  drawPdfSectionTable,
  drawPdfTitleBar,
  stampPdfFooters,
} from "./pdf-layout";
import type { WeeklyBriefingSummary } from "./sales-insights/types";

export type WeeklyBriefingPdfInput = {
  repFilter: string;
  generatedAt: string;
  briefing: WeeklyBriefingSummary;
};

export function generateWeeklyBriefingPdfDocument(input: WeeklyBriefingPdfInput): jsPDF {
  const { briefing: b } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = drawPdfTitleBar(
    doc,
    "Weekly book briefing",
    input.repFilter,
    b.asOf,
    input.generatedAt,
  );

  y = drawPdfKpiRow(doc, y, [
    { label: "Accounts", value: String(b.totalAccounts) },
    { label: "Avg score", value: String(b.avgScore) },
    { label: "Critical", value: String(b.criticalCount), color: [190, 18, 60] },
    { label: "At risk", value: String(b.atRiskCount), color: [180, 83, 9] },
  ]);

  y = drawPdfKpiRow(doc, y, [
    { label: "Btl at risk (90d)", value: formatNumber(b.volumeAtRisk90) },
    { label: "Due to reorder", value: String(b.dueToReorderCount) },
    { label: "Visit overdue", value: String(b.visitOverdueCount) },
    {
      label: "Strike rate (90d)",
      value: b.strikeRateAllRepsPct !== null ? `${b.strikeRateAllRepsPct}%` : "—",
    },
  ]);

  y = drawPdfKpiRow(doc, y, [
    { label: "New accts", value: String(b.newAccountsCount) },
    { label: "Retained", value: String(b.retainedCount) },
    { label: "Returning", value: String(b.returningCount) },
    { label: "High churn", value: String(b.highChurnCount), color: [190, 18, 60] },
  ]);

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Due to reorder (next 14 days)",
    sectionTitleFontSize: 10,
    tableStartOffset: 6,
    head: [["Account", "Expected", "Days", "Score", "Risk"]],
    body:
      b.topDueAccounts.length > 0
        ? b.topDueAccounts.map((row) => [
            row.accountName,
            formatDate(row.expectedOrderDate),
            String(row.daysUntilExpected),
            String(row.score),
            row.risk.toUpperCase(),
          ])
        : [["No accounts in the proactive reorder window", "", "", "", ""]],
  });

  drawPdfSectionTable(doc, y, {
    sectionTitle: "Score momentum (14d)",
    sectionTitleFontSize: 10,
    tableStartOffset: 2,
    head: [["Improving", "Δ", "Declining", "Δ"]],
    body: Array.from(
      { length: Math.max(b.topImproving.length, b.topDeclining.length, 1) },
      (_, i) => {
        const up = b.topImproving[i];
        const down = b.topDeclining[i];
        return [
          up?.account.account.name ?? "—",
          up ? `+${up.scoreChange14d}` : "—",
          down?.account.account.name ?? "—",
          down ? String(down.scoreChange14d) : "—",
        ];
      },
    ),
  });

  stampPdfFooters(doc, "Weekly briefing", b.asOf);
  return doc;
}

export function buildWeeklyBriefingPdfArtifact(input: WeeklyBriefingPdfInput): PdfExportArtifact {
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateWeeklyBriefingPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "weekly-book-briefing", stamp),
  );
}

export function downloadWeeklyBriefingPdf(input: WeeklyBriefingPdfInput): void {
  downloadPdfArtifact(buildWeeklyBriefingPdfArtifact(input));
}
