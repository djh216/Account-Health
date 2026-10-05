import { addDays, parseISO, subDays } from "date-fns";
import { medianGapDays } from "./order-frequency";
import {
  daysPastTypicalFrequency,
  RISK_AT_RISK_MIN_DAYS,
} from "./order-cadence";
import { territoryTierTitle } from "./territory-value";
import type { AccountHealth, TerritoryValueTier } from "./types";

export const DEFAULT_VISIT_CYCLE_DAYS = 28;

export type VisitCadenceTierTarget = {
  minDays: number;
  maxDays: number;
};

/** Policy: Tier 1 & 2 every 14–21 days; Tier 3 every 21–28 days. */
export function visitCadenceTargetForTerritoryTier(
  tier: TerritoryValueTier | undefined,
): VisitCadenceTierTarget {
  if (tier === "anchor" || tier === "core") {
    return { minDays: 14, maxDays: 21 };
  }
  return { minDays: 21, maxDays: 28 };
}

function toDate(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

export function visitDatesThroughAsOf(dates: string[], asOf: string): string[] {
  const asOfDate = toDate(asOf);
  return [...new Set(dates.map((date) => date.slice(0, 10)))]
    .filter((date) => toDate(date) <= asOfDate)
    .sort();
}

/** Typical days between rep visits (median gap), or default when only one visit on file. */
export function typicalVisitIntervalDays(visitDates: string[], asOf: string): number {
  const dates = visitDatesThroughAsOf(visitDates, asOf);
  if (dates.length === 0) return DEFAULT_VISIT_CYCLE_DAYS;
  const median = medianGapDays(dates);
  if (median !== null) return median;
  return DEFAULT_VISIT_CYCLE_DAYS;
}

/** Median days between visits in the trailing window (null if fewer than 2 stops). */
export function averageVisitGapDaysInWindow(
  visitDates: string[],
  asOf: string,
  windowDays = 90,
): number | null {
  const asOfDate = toDate(asOf);
  const windowStart = subDays(asOfDate, windowDays);
  const dates = visitDatesThroughAsOf(visitDates, asOf).filter(
    (date) => toDate(date) >= windowStart,
  );
  if (dates.length < 2) return null;
  return medianGapDays(dates);
}

export type VisitCadenceStatus = {
  daysSinceVisit: number | null;
  typicalVisitIntervalDays: number;
  visitCadenceOverdue: boolean;
  visitCadenceDaysOverdue: number | null;
  expectedVisitDate: string | null;
};

export function visitCadenceStatus(input: {
  daysSinceVisit: number | null;
  lastVisitDate: string | null;
  visitIntervalDays: number;
  /** When set, overdue is measured against policy max spacing (tier target). */
  targetMaxDays?: number;
}): VisitCadenceStatus {
  const interval = input.targetMaxDays ?? input.visitIntervalDays;
  const daysPast = daysPastTypicalFrequency(input.daysSinceVisit, interval);

  if (input.daysSinceVisit === null) {
    return {
      daysSinceVisit: null,
      typicalVisitIntervalDays: interval,
      visitCadenceOverdue: true,
      visitCadenceDaysOverdue: null,
      expectedVisitDate: null,
    };
  }

  const overdue = daysPast !== null && daysPast >= RISK_AT_RISK_MIN_DAYS;
  const expectedVisitDate = input.lastVisitDate
    ? addDays(toDate(input.lastVisitDate), interval).toISOString().slice(0, 10)
    : null;

  return {
    daysSinceVisit: input.daysSinceVisit,
    typicalVisitIntervalDays: interval,
    visitCadenceOverdue: overdue,
    visitCadenceDaysOverdue: overdue && daysPast !== null ? daysPast : null,
    expectedVisitDate,
  };
}

function scoreDaysSinceVisitAgainstTarget(
  daysSinceVisit: number | null,
  target: VisitCadenceTierTarget,
): number {
  if (daysSinceVisit === null) return 18;
  if (daysSinceVisit < target.minDays) return 94;
  if (daysSinceVisit <= target.maxDays) return 76;
  const overdue = daysSinceVisit - target.maxDays;
  if (overdue <= 7) return 52;
  if (overdue <= 14) return 26;
  return 8;
}

function scoreAverageGapAgainstTarget(
  averageGapDays: number | null,
  target: VisitCadenceTierTarget,
): number | null {
  if (averageGapDays === null) return null;
  if (averageGapDays >= target.minDays && averageGapDays <= target.maxDays) return 96;
  if (averageGapDays < target.minDays) return 90;
  const overshoot = averageGapDays - target.maxDays;
  if (overshoot <= 7) return 54;
  if (overshoot <= 14) return 28;
  return 10;
}

function formatTargetRange(target: VisitCadenceTierTarget): string {
  return `${target.minDays}–${target.maxDays} days`;
}

/** Grade last visit timing and 90-day average spacing vs territory tier visit policy. */
export function visitCadenceTierScore(input: {
  daysSinceVisit: number | null;
  averageGapDays90: number | null;
  territoryTier?: TerritoryValueTier;
}): { score: number; detail: string; target: VisitCadenceTierTarget } {
  const target = visitCadenceTargetForTerritoryTier(input.territoryTier);
  const tierLabel = input.territoryTier
    ? territoryTierTitle(input.territoryTier)
    : "Tier 3";
  const range = formatTargetRange(target);

  if (input.daysSinceVisit === null && input.averageGapDays90 === null) {
    return {
      score: 18,
      target,
      detail: `No visit history — ${tierLabel} accounts should be visited every ${range}.`,
    };
  }

  const lastScore = scoreDaysSinceVisitAgainstTarget(input.daysSinceVisit, target);
  const avgScore = scoreAverageGapAgainstTarget(input.averageGapDays90, target);
  const score =
    avgScore === null
      ? lastScore
      : Math.round(lastScore * 0.45 + avgScore * 0.55);

  const parts: string[] = [];
  if (input.daysSinceVisit !== null) {
    if (input.daysSinceVisit < target.minDays) {
      parts.push(
        `Last visit ${input.daysSinceVisit} days ago — within ${tierLabel} policy (${range} between stops).`,
      );
    } else if (input.daysSinceVisit <= target.maxDays) {
      parts.push(
        `Last visit ${input.daysSinceVisit} days ago — in the ${tierLabel} visit window (${range}); due for a stop.`,
      );
    } else {
      parts.push(
        `Last visit ${input.daysSinceVisit} days ago — ${input.daysSinceVisit - target.maxDays} days past ${tierLabel} max (${target.maxDays}d).`,
      );
    }
  }

  if (input.averageGapDays90 !== null) {
    if (
      input.averageGapDays90 >= target.minDays &&
      input.averageGapDays90 <= target.maxDays
    ) {
      parts.push(
        `90-day average spacing ~${Math.round(input.averageGapDays90)} days — on ${tierLabel} target (${range}).`,
      );
    } else if (input.averageGapDays90 < target.minDays) {
      parts.push(
        `90-day average spacing ~${Math.round(input.averageGapDays90)} days — ahead of ${tierLabel} target (${range}).`,
      );
    } else {
      parts.push(
        `90-day average spacing ~${Math.round(input.averageGapDays90)} days — slower than ${tierLabel} target (${range}).`,
      );
    }
  } else if (input.daysSinceVisit !== null) {
    parts.push("Not enough stops in 90 days to measure average spacing yet.");
  }

  return {
    score,
    target,
    detail: parts.join(" "),
  };
}

/** Higher = more urgent for rep action plans (visit policy + tier value). */
export function visitCadenceUrgencyScore(account: Pick<
  AccountHealth,
  | "daysSinceVisit"
  | "visitCadenceTargetMaxDays"
  | "visitCadenceTargetMinDays"
  | "averageVisitGapDays90"
  | "visitCadenceDaysOverdue"
>): number {
  let urgency = 0;
  const max = account.visitCadenceTargetMaxDays ?? DEFAULT_VISIT_CYCLE_DAYS;

  if (account.daysSinceVisit === null) {
    urgency += 900;
  } else if (account.daysSinceVisit > max) {
    urgency += 250 + (account.daysSinceVisit - max) * 12;
  } else if (
    account.visitCadenceTargetMinDays != null &&
    account.daysSinceVisit >= account.visitCadenceTargetMinDays
  ) {
    urgency += 80 + (account.daysSinceVisit - account.visitCadenceTargetMinDays) * 4;
  }

  if (account.visitCadenceDaysOverdue != null && account.visitCadenceDaysOverdue > 0) {
    urgency += 120 + account.visitCadenceDaysOverdue * 8;
  }

  const avg = account.averageVisitGapDays90;
  if (avg != null && avg > max) {
    urgency += 90 + (avg - max) * 6;
  }

  return urgency;
}

export function territoryTierActionWeight(tier: TerritoryValueTier | undefined): number {
  switch (tier) {
    case "anchor":
      return 120;
    case "core":
      return 70;
    case "base":
      return 0;
    default:
      return 0;
  }
}

/** PDF / action plan: last visit vs tier visit policy. */
export function formatVisitCadenceActionPlanCell(account: AccountHealth): string {
  const tierLabel = account.territoryTier
    ? territoryTierTitle(account.territoryTier)
    : "Tier 3";
  const min = account.visitCadenceTargetMinDays;
  const max = account.visitCadenceTargetMaxDays;
  const target =
    min != null && max != null ? `Optimal ${min}–${max}d (${tierLabel})` : `Policy (${tierLabel})`;

  const since =
    account.daysSinceVisit != null
      ? `Last stop ${account.daysSinceVisit}d ago`
      : "No visit on file";

  const avg =
    account.averageVisitGapDays90 != null
      ? `90d avg spacing ~${Math.round(account.averageVisitGapDays90)}d`
      : null;

  const overdue =
    account.visitCadenceDaysOverdue != null && account.visitCadenceDaysOverdue > 0
      ? `${account.visitCadenceDaysOverdue}d past policy max`
      : account.daysSinceVisit != null &&
          max != null &&
          account.daysSinceVisit > max
        ? `${account.daysSinceVisit - max}d past policy max`
        : null;

  return [target, since, avg, overdue].filter(Boolean).join("\n");
}

/** One-line visit cadence for compact PDF tables. */
export function formatVisitCadencePdfCompact(account: AccountHealth): string {
  const max = account.visitCadenceTargetMaxDays;
  const since =
    account.daysSinceVisit != null ? `${account.daysSinceVisit}d since visit` : "No visit";
  const policy = max != null ? ` · max ${max}d` : "";
  const overdue =
    account.visitCadenceDaysOverdue != null && account.visitCadenceDaysOverdue > 0
      ? ` · ${account.visitCadenceDaysOverdue}d overdue`
      : "";
  return `${since}${policy}${overdue}`;
}

/** @deprecated Use visitCadenceTierScore for health scoring. */
export function visitCadenceRecencyScore(
  daysSinceVisit: number | null,
  intervalDays: number,
): { score: number; detail: string } {
  const target = { minDays: 14, maxDays: Math.max(intervalDays, 21) };
  const score = scoreDaysSinceVisitAgainstTarget(daysSinceVisit, target);
  const daysPast = daysPastTypicalFrequency(daysSinceVisit, intervalDays);
  if (daysPast === null) {
    return { score: 18, detail: "No last visit on file — visit cadence unknown." };
  }
  return {
    score,
    detail: `Last visit ${daysSinceVisit} days ago (legacy ${intervalDays}-day reference).`,
  };
}
