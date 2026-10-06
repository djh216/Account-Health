import { jsPDF } from "jspdf";
import { formatDate, formatNumber } from "./format";
import { buildExportPdfFilename } from "./pdf-filename";
import {
  artifactFromJsPdf,
  downloadPdfArtifact,
  type PdfExportArtifact,
} from "./pdf-present";
import { drawPdfSectionTable, drawPdfTitleBar, stampPdfFooters } from "./pdf-layout";
import type { SalesInsightsBundle } from "./sales-insights/types";

export type SalesInsightsPdfInput = {
  repFilter: string;
  generatedAt: string;
  insights: SalesInsightsBundle;
};

export function generateSalesInsightsPdfDocument(input: SalesInsightsPdfInput): jsPDF {
  const { insights: s } = input;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = drawPdfTitleBar(
    doc,
    "Sales insights pack",
    input.repFilter,
    s.asOf,
    input.generatedAt,
  );

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Proactive reorder window (next 14 days)",
    head: [["Account", "Expected", "Days out", "Typ cadence", "Score"]],
    body:
      s.dueToReorder.length > 0
        ? s.dueToReorder.slice(0, 40).map((r) => [
            r.accountName,
            formatDate(r.expectedOrderDate),
            r.daysUntilExpected,
            r.typicalIntervalDays,
            r.score,
          ])
        : [["—", "No rows", "—", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Visit coverage gaps",
    head: [["Account", "Rep", "Days since visit", "Overdue", "Tier target"]],
    body:
      s.visitCoverageAccounts.length > 0
        ? s.visitCoverageAccounts.slice(0, 35).map((r) => [
            r.accountName,
            r.salesRep ?? "—",
            r.daysSinceVisit ?? "—",
            r.visitCadenceOverdue ? "Yes" : "No",
            r.targetMaxDays ? `${r.targetMaxDays}d max` : "—",
          ])
        : [["—", "No rows", "—", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Visit → order strike rate (90d, 7-day window)",
    head: [["Rep", "Visits", "Converted", "Strike %"]],
    body:
      s.visitConversionByRep.length > 0
        ? s.visitConversionByRep.map((r) => [
            r.repName,
            r.visitCount90,
            r.convertedVisits90,
            `${r.strikeRatePct}%`,
          ])
        : [["—", "No rows", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "SKU breadth change (90d vs prior 90d)",
    head: [["Account", "Recent SKUs", "Prior SKUs", "Δ", "Volume 90d"]],
    body:
      s.skuBreadth.length > 0
        ? s.skuBreadth.slice(0, 30).map((r) => [
            r.accountName,
            r.skuCountRecent90,
            r.skuCountPrior90,
            r.skuDelta,
            formatNumber(r.volume90),
          ])
        : [["—", "No rows", "—", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Win-back SKUs (prior volume, none recent)",
    head: [["Account", "Product", "Prior 90d btl", "Last order", "Days since"]],
    body:
      s.winBackSkus.length > 0
        ? s.winBackSkus.slice(0, 35).map((r) => [
            r.accountName,
            r.product,
            formatNumber(r.priorVolume90),
            r.lastOrderedDate ? formatDate(r.lastOrderedDate) : "—",
            r.daysSinceLastOrder ?? "—",
          ])
        : [["—", "No rows", "—", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Improving accounts (14d score)",
    head: [["Account", "Score", "Δ14d", "Risk"]],
    body:
      s.improving.length > 0
        ? s.improving.slice(0, 20).map((r) => [
            r.account.account.name,
            r.account.score,
            `+${r.scoreChange14d}`,
            r.account.risk,
          ])
        : [["—", "No rows", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Declining accounts (14d score)",
    head: [["Account", "Score", "Δ14d", "Risk"]],
    body:
      s.declining.length > 0
        ? s.declining.slice(0, 20).map((r) => [
            r.account.account.name,
            r.account.score,
            r.scoreChange14d,
            r.account.risk,
          ])
        : [["—", "No rows", "—", "—"]],
  });

  y = drawPdfSectionTable(doc, y, {
    sectionTitle: "Volume & risk by tier",
    head: [["Tier", "Accounts", "Btl 90d", "At-risk btl", "Critical #"]],
    body:
      s.volumeByTier.length > 0
        ? s.volumeByTier.map((r) => [
            r.label,
            r.accountCount,
            formatNumber(r.bottles90),
            formatNumber(r.atRiskVolume90),
            r.criticalCount,
          ])
        : [["—", "No rows", "—", "—", "—"]],
  });

  stampPdfFooters(doc, "Sales insights", s.asOf);
  return doc;
}

export function buildSalesInsightsPdfArtifact(input: SalesInsightsPdfInput): PdfExportArtifact {
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateSalesInsightsPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "sales-insights-pack", stamp),
  );
}

export function downloadSalesInsightsPdf(input: SalesInsightsPdfInput): void {
  downloadPdfArtifact(buildSalesInsightsPdfArtifact(input));
}
