import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FOCUS_SECTIONS } from "./focus-sections";
import { formatDate } from "./format";
import type { FocusHealthPdfInput } from "./report-export";
import type { AccountHealth, FocusHorizon, RiskLevel } from "./types";
import { territoryTierLabel } from "./territory-value";

const MARGIN_X = 12;
const HEADER_RGB: [number, number, number] = [235, 230, 223];

const WINDOW_LABEL: Record<FocusHorizon, string> = {
  this_week: "≤1 wk",
  two_weeks: "2 wk",
  three_weeks: "3 wk",
};

const RISK_SHORT: Record<RiskLevel, string> = {
  critical: "Crit",
  at_risk: "Risk",
  dormant: "Dorm",
  healthy: "OK",
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All reps" : repFilter;
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

function focusRow(window: string, item: AccountHealth): string[] {
  return [
    window,
    item.account.name,
    RISK_SHORT[item.risk],
    item.territoryTier ? territoryTierLabel(item.territoryTier).slice(0, 1) : "—",
    String(item.score),
    compactDays(item.daysSinceOrder),
    compactFrequency(item.typicalIntervalDays),
  ];
}

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function drawCompactHeader(doc: jsPDF, input: FocusHealthPdfInput): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    `Cellar Pulse · ${repLabel(input.repFilter)} · as of ${formatDate(input.asOf)}`,
    MARGIN_X,
    11,
  );
  doc.setDrawColor(92, 46, 46);
  doc.setLineWidth(0.35);
  doc.line(MARGIN_X, 13, pageWidth(doc) - MARGIN_X, 13);
  return 17;
}

function tableStyles() {
  return {
    theme: "grid" as const,
    margin: { left: MARGIN_X, right: MARGIN_X },
    headStyles: {
      fillColor: HEADER_RGB,
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 7.5,
      cellPadding: 1.2,
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      valign: "middle" as const,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 252] as [number, number, number],
    },
    styles: {
      overflow: "linebreak" as const,
      cellWidth: "wrap" as const,
    },
  };
}

function addPageFooters(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`${p}/${total}`, pageWidth(doc) - MARGIN_X, pageHeight(doc) - 4, {
      align: "right",
    });
  }
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

  const y = drawCompactHeader(doc, input);

  const focusBody = FOCUS_SECTIONS.flatMap((section) => {
    const label = WINDOW_LABEL[section.horizon];
    const accounts = input.focusByHorizon[section.horizon];
    if (accounts.length === 0) return [];
    return accounts.map((item) => focusRow(label, item));
  });

  autoTable(doc, {
    startY: y,
    head: [["When", "Account", "Risk", "T", "Score", "Last", "Cadence"]],
    body:
      focusBody.length > 0
        ? focusBody
        : [["—", "No focus accounts", "—", "—", "—", "—", "—"]],
    ...tableStyles(),
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 72 },
      2: { cellWidth: 12 },
      3: { cellWidth: 8, halign: "center" },
      4: { cellWidth: 11, halign: "right" },
      5: { cellWidth: 12, halign: "right" },
      6: { cellWidth: 14, halign: "right" },
    },
  });

  addPageFooters(doc);

  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  doc.save(`cellar-pulse-focus-health-${repSlug}-${stamp}.pdf`);
}
