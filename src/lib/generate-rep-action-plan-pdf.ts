import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FOCUS_SECTIONS } from "./focus-sections";
import { formatDate } from "./format";
import type { RepActionPlan } from "./rep-action-plans";
import { totalFocusActions } from "./rep-action-plans";
import type { AccountHealth, FocusHorizon, RiskLevel } from "./types";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = 14;
const BURGUNDY: [number, number, number] = [120, 28, 48];
const TEXT_DARK: [number, number, number] = [30, 41, 59];

export type RepActionPlansPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  plans: RepActionPlan[];
};

const HORIZON_PLAN_LABEL: Record<FocusHorizon, string> = {
  this_week: "Week 1 · Execute this week (≤ 7 days)",
  two_weeks: "Week 2 · Schedule & prepare (days 8–14)",
  three_weeks: "Week 3 · Pipeline touchpoints (days 15–21)",
};

const RISK_SHORT: Record<RiskLevel, string> = {
  critical: "CRITICAL",
  at_risk: "AT RISK",
  dormant: "DORMANT",
  healthy: "HEALTHY",
};

function repScopeLabel(repFilter: string, planCount: number): string {
  if (repFilter !== "all") return `Rep: ${repFilter}`;
  return planCount === 1 ? `Rep: ${repFilter}` : `All sales reps (${planCount} books)`;
}

function actionRow(priority: number, item: AccountHealth): (string | number)[] {
  const focus = item.focus;
  const tier = item.territoryTier ? territoryTierLabel(item.territoryTier) : "—";
  const lastOrder =
    item.lastOrderDate && item.daysSinceOrder !== null
      ? `${formatDate(item.lastOrderDate)} (${item.daysSinceOrder}d ago)`
      : item.lastOrderDate
        ? formatDate(item.lastOrderDate)
        : "—";
  const cadence = item.typicalIntervalDays ? `Every ${item.typicalIntervalDays}d` : "—";

  return [
    priority,
    item.account.name,
    `${RISK_SHORT[item.risk]} · ${tier}`,
    item.score,
    `${lastOrder}\n${cadence}`,
    focus?.title ?? `Work ${item.account.name}`,
    focus?.reason ?? "Priority account on this rep's ranked call plan.",
    focus?.action ?? "Confirm next visit and reorder date before leaving.",
  ];
}

function drawDocumentBanner(
  doc: jsPDF,
  input: RepActionPlansPdfInput,
  subtitle: string,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(BURGUNDY[0], BURGUNDY[1], BURGUNDY[2]);
  doc.rect(0, 0, pageWidth, 20, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("CELLAR PULSE · REP ACTION PLAN (1 / 2 / 3 WEEK)", MARGIN_X, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${repScopeLabel(input.repFilter, input.plans.length)}  ·  As of ${formatDate(input.asOf)}  ·  Exported ${input.generatedAt.slice(0, 10)}`,
    pageWidth - MARGIN_X,
    9,
    { align: "right" },
  );
  doc.text(subtitle, pageWidth - MARGIN_X, 15, { align: "right" });

  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  return 26;
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
  doc.setFontSize(8.5);
  const actions = totalFocusActions(plan);
  doc.text(
    `${plan.accountCount} accounts  ·  ${actions} prioritized actions across 3 weeks`,
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
  const section = FOCUS_SECTIONS.find((s) => s.horizon === horizon);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(BURGUNDY[0], BURGUNDY[1], BURGUNDY[2]);
  doc.text(HORIZON_PLAN_LABEL[horizon], MARGIN_X, startY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(section?.description ?? "", MARGIN_X, startY + 4.5);

  const body =
    accounts.length > 0
      ? accounts.map((item, index) => actionRow(index + 1, item))
      : [["—", "No accounts in this window", "—", "—", "—", "—", "—", "—"]];

  autoTable(doc, {
    startY: startY + 7,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 14 },
    head: [
      [
        "#",
        "Account",
        "Risk · Tier",
        "Score",
        "Last order · Cadence",
        "Action title",
        "Why now",
        "Do this",
      ],
    ],
    body,
    theme: "grid",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: TEXT_DARK,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: TEXT_DARK,
      cellPadding: 2,
      valign: "top",
    },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 32 },
      2: { cellWidth: 26, fontStyle: "bold" },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 28 },
      5: { cellWidth: 38, fontStyle: "bold" },
      6: { cellWidth: 42 },
      7: { cellWidth: 42 },
    },
    styles: {
      overflow: "linebreak",
      cellWidth: "wrap",
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "Cellar Pulse · Rep weekly action plan · Print and check off as completed",
        MARGIN_X,
        pageHeight - 5,
      );
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

  const subtitle =
    "Ranked by risk, territory value, and health score · Top 10 accounts per week";
  let y = drawDocumentBanner(doc, input, subtitle);

  input.plans.forEach((plan, planIndex) => {
    if (planIndex > 0) {
      doc.addPage();
      y = drawDocumentBanner(doc, input, `${plan.repName} · weekly playbook`);
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

  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - MARGIN_X, pageHeight - 5, {
      align: "right",
    });
  }

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
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  doc.save(`cellar-pulse-rep-action-plan-${repSlug}-${stamp}.pdf`);
}
