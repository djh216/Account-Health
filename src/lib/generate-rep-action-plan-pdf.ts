import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatHealthScoreChange } from "./format";
import { buildExportPdfFilename } from "./pdf-filename";
import { formatVisitCadencePdfCompact } from "./visit-cadence";
import {
  drawPdfTitleBar,
  PDF_MARGIN_X,
  PDF_TABLE_BODY,
  PDF_TABLE_HEAD,
  stampPdfFooters,
} from "./pdf-layout";
import type { RepActionPlan } from "./rep-action-plans";
import { totalFocusActions } from "./rep-action-plans";
import type { AccountHealth, FocusHorizon, RiskLevel } from "./types";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = PDF_MARGIN_X;
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type RepActionPlansPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  plans: RepActionPlan[];
};

const HORIZON_PLAN_LABEL: Record<FocusHorizon, string> = {
  this_week: "Week 1 — this week",
  two_weeks: "Week 2 — next week",
  three_weeks: "Week 3 — pipeline",
};

const RISK_SHORT: Record<RiskLevel, string> = {
  critical: "CRITICAL",
  at_risk: "AT RISK",
  dormant: "DORMANT",
  healthy: "HEALTHY",
};

function actionRow(priority: number, item: AccountHealth): (string | number)[] {
  const focus = item.focus;
  const tier = item.territoryTier ? territoryTierLabel(item.territoryTier) : "—";
  const orderLine =
    item.daysSinceOrder != null
      ? `${item.daysSinceOrder}d since order${item.typicalIntervalDays ? ` · typ ${item.typicalIntervalDays}d` : ""}`
      : "—";
  const cadenceCol = `${orderLine}\n${formatVisitCadencePdfCompact(item)}`;
  const nextStep = focus
    ? `${focus.action}${focus.reason ? `\n${focus.reason}` : ""}`
    : "Confirm next visit and reorder date.";

  return [
    priority,
    item.account.name,
    `${RISK_SHORT[item.risk]} · ${tier}`,
    `${item.score}${formatHealthScoreChange(item.scoreChange14d) ?? ""}`,
    cadenceCol,
    nextStep,
  ];
}

function drawRepHeader(doc: jsPDF, plan: RepActionPlan, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(MARGIN_X, startY, pageWidth - MARGIN_X * 2, 11, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`${plan.repName}`, MARGIN_X + 4, startY + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const actions = totalFocusActions(plan);
  doc.text(
    `${plan.accountCount} accounts · ${actions} actions`,
    pageWidth - MARGIN_X - 4,
    startY + 7,
    { align: "right" },
  );

  return startY + 15;
}

function addHorizonTable(
  doc: jsPDF,
  horizon: FocusHorizon,
  accounts: AccountHealth[],
  startY: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(120, 28, 48);
  doc.text(HORIZON_PLAN_LABEL[horizon], MARGIN_X, startY);

  const body =
    accounts.length > 0
      ? accounts.map((item, index) => actionRow(index + 1, item))
      : [["—", "No accounts in this window", "—", "—", "—", "—"]];

  autoTable(doc, {
    startY: startY + 4,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 12 },
    head: [["#", "Account", "Risk · tier", "Score", "Order · visit cadence", "Next step"]],
    body,
    theme: "grid",
    headStyles: PDF_TABLE_HEAD,
    bodyStyles: PDF_TABLE_BODY,
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 40 },
      2: { cellWidth: 28, fontStyle: "bold" },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 44 },
      5: { cellWidth: "auto" },
    },
    styles: {
      overflow: "linebreak",
      cellWidth: "wrap",
    },
  });

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;
  return finalY + 6;
}

export function generateRepActionPlansPdfDocument(input: RepActionPlansPdfInput): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  let y = drawPdfTitleBar(
    doc,
    "Rep action plan (weeks 1–3)",
    input.repFilter,
    input.asOf,
    input.generatedAt,
  );
  y += 4;

  input.plans.forEach((plan, planIndex) => {
    if (planIndex > 0) {
      doc.addPage();
      y = drawPdfTitleBar(
        doc,
        `Rep action plan · ${plan.repName}`,
        input.repFilter,
        input.asOf,
        input.generatedAt,
      );
      y += 4;
    }

    y = drawRepHeader(doc, plan, y);

    const horizons: FocusHorizon[] = ["this_week", "two_weeks", "three_weeks"];
    for (const horizon of horizons) {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (y > pageHeight - 40) {
        doc.addPage();
        y = MARGIN_X + 4;
      }
      y = addHorizonTable(doc, horizon, plan.focusByHorizon[horizon], y);
    }
  });

  stampPdfFooters(doc, "Action plan", input.asOf);

  return doc;
}

export function downloadRepActionPlansPdf(input: RepActionPlansPdfInput): void {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser.");
  }
  if (input.plans.length === 0) {
    throw new Error("No rep action plans to export.");
  }

  const doc = generateRepActionPlansPdfDocument(input);
  const stamp = input.generatedAt.slice(0, 10);
  doc.save(buildExportPdfFilename(input.repFilter, "rep-action-plan", stamp));
}
