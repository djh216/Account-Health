import { addDays, parseISO } from "date-fns";
import { medianGapDays } from "./order-frequency";
import {
  daysPastTypicalFrequency,
  RISK_AT_RISK_MIN_DAYS,
  RISK_HEALTHY_GRACE_DAYS,
} from "./order-cadence";

export const DEFAULT_VISIT_CYCLE_DAYS = 28;

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
}): VisitCadenceStatus {
  const interval = input.visitIntervalDays;
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

export function visitCadenceRecencyScore(
  daysSinceVisit: number | null,
  intervalDays: number,
): { score: number; detail: string } {
  const typical = intervalDays;
  const daysPast = daysPastTypicalFrequency(daysSinceVisit, typical);

  if (daysPast === null) {
    return { score: 18, detail: "No last visit on file — visit cadence unknown." };
  }
  if (daysPast <= RISK_HEALTHY_GRACE_DAYS) {
    return {
      score: 94,
      detail:
        daysPast <= 0
          ? `Last visit ${daysSinceVisit} days ago — on or ahead of typical ${typical}-day visit cadence.`
          : `Last visit ${daysSinceVisit} days ago — within ${RISK_HEALTHY_GRACE_DAYS} days of typical ${typical}-day visit cadence.`,
    };
  }
  if (daysPast <= 14) {
    return {
      score: 55,
      detail: `Last visit ${daysSinceVisit} days ago — ${daysPast} days past typical ${typical}-day visit cadence (due for a stop).`,
    };
  }
  return {
    score: daysPast <= 28 ? 24 : 8,
    detail: `Last visit ${daysSinceVisit} days ago — ${daysPast} days past typical ${typical}-day visit cadence (overdue).`,
  };
}
