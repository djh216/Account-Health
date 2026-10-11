import { jsPDF } from "jspdf";
import { formatDate, formatHealthScoreChange, formatNumber } from "./format";
import type { AccountFrequencyAlert } from "./frequency-alerts";
import { FOCUS_SECTIONS } from "./focus-sections";
import { buildExportPdfFilename } from "./pdf-filename";
import type { AccountProjectionAndChurn } from "./order-projections";
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
import type { ProductSlowingAlert } from "./product-trends";
import type { SalesInsightsBundle } from "./sales-insights/types";
import type { AccountHealth, FocusHorizon, RiskLevel } from "./types";
import { territoryTierLabel } from "./territory-value";

export type SalesInsightsPdfInput = {
  repFilter: string;
  generatedAt: string;
  insights: SalesInsightsBundle;
  /** Weeks 1–3 priority accounts (replaces separate account-health / action-plan PDFs). */
  focusByHorizon?: Record<FocusHorizon, AccountHealth[]>;
  /** Order frequency drop alerts (merged from standalone frequency-alerts export). */
  frequencyAlerts?: AccountFrequencyAlert[];
  /** High churn projection accounts (merged from imminent-churn export). */
  churnAccounts?: AccountProjectionAndChurn[];
  /** 28-day wine slowdown alerts (summary; full SKU detail stays on product trends PDF). */
  productSlowdownAlerts?: ProductSlowingAlert[];
};

const FOCUS_WINDOW_LABEL: Record<FocusHorizon, string> = {
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

function focusCompactRow(window: string, item: AccountHealth): (string | number)[] {
  const tier = item.territoryTier ? territoryTierLabel(item.territoryTier) : "—";
  return [
    window,
    item.account.name,
    RISK_SHORT[item.risk],
    tier,
    `${item.score}${formatHealthScoreChange(item.scoreChange14d) ?? ""}`,
    item.daysSinceOrder !== null ? `${item.daysSinceOrder}d` : "—",
  ];
}

export function generateSalesInsightsPdfDocument(input: SalesInsightsPdfInput): jsPDF {
  const { insights: s } = input;
  const b = s.weeklyBriefing;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = drawPdfTitleBar(
    doc,
    "Weekly rep pack",
    input.repFilter,
    s.asOf,
    input.generatedAt,
  );

  y = drawPdfKpiRow(doc, y, [
    { label: "Accounts", value: String(b.totalAccounts) },
    { label: "Avg score", value: String(b.avgScore) },
    { label: "Critical", value: String(b.criticalCount), color: [190, 18, 60] },
    { label: "At risk", value: String(b.atRiskCount), color: [180, 83, 9] },
    { label: "Btl at risk (90d)", value: formatNumber(b.volumeAtRisk90) },
    { label: "Due to reorder", value: String(b.dueToReorderCount) },
  ]);

  y = drawPdfKpiRow(doc, y, [
    { label: "Visit overdue", value: String(b.visitOverdueCount) },
    {
      label: "Strike rate (90d)",
      value: b.strikeRateAllRepsPct !== null ? `${b.strikeRateAllRepsPct}%` : "—",
    },
    { label: "Freq. drop alerts", value: String(b.frequencyAlertCount) },
    { label: "Wine slowdown alerts", value: String(b.productAlertCount) },
    { label: "High churn", value: String(b.highChurnCount), color: [190, 18, 60] },
    { label: "New / retained", value: `${b.newAccountsCount} / ${b.retainedCount}` },
  ]);

  if (input.focusByHorizon) {
    const focusBody = FOCUS_SECTIONS.flatMap((section) => {
      const label = FOCUS_WINDOW_LABEL[section.horizon];
      const accounts = input.focusByHorizon![section.horizon];
      if (accounts.length === 0) return [];
      return accounts.slice(0, 25).map((item) => focusCompactRow(label, item));
    });

    y = drawPdfSectionTable(doc, y, {
      sectionTitle: "Account focus by week (health score & cadence)",
      head: [["Window", "Account", "Risk", "Tier", "Score", "Days since order"]],
      body:
        focusBody.length > 0
          ? focusBody
          : [["—", "No focus accounts in active horizons", "—", "—", "—", "—"]],
    });
  }

  const frequencyAlerts = input.frequencyAlerts ?? [];
  if (frequencyAlerts.length > 0) {
    y = drawPdfSectionTable(doc, y, {
      sectionTitle: "Order frequency drop alerts",
      head: [["Severity", "Account", "Pace drop", "Orders / mo (recent vs typ)"]],
      body: frequencyAlerts.slice(0, 35).map((alert) => [
        alert.severity.toUpperCase(),
        alert.accountName,
        `-${alert.dropPercentage}%`,
        `${alert.recentOrdersPerMonth} vs ${alert.typicalOrdersPerMonth}`,
      ]),
    });
  }

  const churnAccounts = input.churnAccounts ?? [];
  if (churnAccounts.length > 0) {
    y = drawPdfSectionTable(doc, y, {
      sectionTitle: "High churn risk (volume projection)",
      head: [["Account", "Churn score", "Btl / mo at risk", "Days since order"]],
      body: churnAccounts.slice(0, 25).map((account) => [
        account.accountName,
        `${account.churnScore}%`,
        formatNumber(account.monthlyVolumeAtRisk),
        account.daysSinceLastOrder ?? "—",
      ]),
    });
  }

  const productAlerts = input.productSlowdownAlerts ?? [];
  if (productAlerts.length > 0) {
    y = drawPdfSectionTable(doc, y, {
      sectionTitle: "28-day wine slowdown alerts (summary)",
      head: [["Wine / SKU", "Severity", "Drop", "Note"]],
      body: productAlerts.slice(0, 30).map((alert) => [
        alert.productName,
        alert.severity.toUpperCase(),
        `-${alert.dropPercentage}%`,
        alert.message.length > 72 ? `${alert.message.slice(0, 69)}…` : alert.message,
      ]),
    });
  }

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

  stampPdfFooters(doc, "Weekly rep pack", s.asOf);
  return doc;
}

export function buildSalesInsightsPdfArtifact(input: SalesInsightsPdfInput): PdfExportArtifact {
  const stamp = input.generatedAt.slice(0, 10);
  return artifactFromJsPdf(
    generateSalesInsightsPdfDocument(input),
    buildExportPdfFilename(input.repFilter, "weekly-rep-pack", stamp),
  );
}

export function downloadSalesInsightsPdf(input: SalesInsightsPdfInput): void {
  downloadPdfArtifact(buildSalesInsightsPdfArtifact(input));
}
