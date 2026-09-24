import { addDays, parseISO } from "date-fns";
import type { FocusHorizon, RiskLevel } from "./types";

const ORDER_CYCLE_DAYS = 28;

/** Days past typical frequency still counted as healthy (inclusive). */
export const RISK_HEALTHY_GRACE_DAYS = 7;
/** At risk when last order is this many days past typical (inclusive). */
export const RISK_AT_RISK_MIN_DAYS = 8;
export const RISK_AT_RISK_MAX_DAYS = 14;
/** Critical when last order is this many or more days past typical. */
export const RISK_CRITICAL_MIN_DAYS = 15;

/** Focus 3 weeks out: days past typical reorder cadence (inclusive). */
export const FOCUS_THREE_WEEKS_MIN_DAYS = 7;
export const FOCUS_THREE_WEEKS_MAX_DAYS = 14;
/** Focus 2 weeks out: days past typical reorder cadence (inclusive). */
export const FOCUS_TWO_WEEKS_MIN_DAYS = 15;
export const FOCUS_TWO_WEEKS_MAX_DAYS = 29;
/** Focus this week: days past typical reorder cadence (inclusive). */
export const FOCUS_THIS_WEEK_MIN_DAYS = 30;

export type OrderCadenceAlertData = {
  daysSinceOrder: number | null;
  typicalIntervalDays: number | null;
  orderCadenceOverdue: boolean;
  orderCadenceDaysOverdue: number | null;
  expectedOrderDate: string | null;
};

function toDate(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

export function resolveTypicalIntervalDays(intervalDays: number | null): number {
  return intervalDays ?? ORDER_CYCLE_DAYS;
}

/** How many days the last order exceeds the typical reorder interval (negative = early). */
export function daysPastTypicalFrequency(
  daysSinceOrder: number | null,
  intervalDays: number | null,
): number | null {
  if (daysSinceOrder === null) return null;
  return daysSinceOrder - resolveTypicalIntervalDays(intervalDays);
}

export function riskFromOrderCadence(input: {
  daysSinceOrder: number | null;
  intervalDays: number | null;
}): RiskLevel {
  const daysPast = daysPastTypicalFrequency(
    input.daysSinceOrder,
    input.intervalDays,
  );
  if (daysPast === null) return "critical";
  if (daysPast <= RISK_HEALTHY_GRACE_DAYS) return "healthy";
  if (daysPast >= RISK_AT_RISK_MIN_DAYS && daysPast <= RISK_AT_RISK_MAX_DAYS) {
    return "at_risk";
  }
  if (daysPast >= RISK_CRITICAL_MIN_DAYS) return "critical";
  return "critical";
}

export function assignFocusHorizon(input: {
  daysSinceOrder: number | null;
  intervalDays: number | null;
}): FocusHorizon | null {
  const daysPast = daysPastTypicalFrequency(
    input.daysSinceOrder,
    input.intervalDays,
  );

  if (daysPast === null) return "this_week";
  if (daysPast >= FOCUS_THIS_WEEK_MIN_DAYS) return "this_week";
  if (daysPast >= FOCUS_TWO_WEEKS_MIN_DAYS) return "two_weeks";
  if (daysPast >= FOCUS_THREE_WEEKS_MIN_DAYS) return "three_weeks";
  return null;
}

export function orderCadenceStatus(input: {
  daysSinceOrder: number | null;
  lastOrderDate: string | null;
  intervalDays: number | null;
}): OrderCadenceAlertData {
  const interval = resolveTypicalIntervalDays(input.intervalDays);
  const daysPast = daysPastTypicalFrequency(input.daysSinceOrder, interval);

  if (input.daysSinceOrder === null) {
    return {
      daysSinceOrder: null,
      typicalIntervalDays: interval,
      orderCadenceOverdue: true,
      orderCadenceDaysOverdue: null,
      expectedOrderDate: null,
    };
  }

  const overdue = daysPast !== null && daysPast >= RISK_AT_RISK_MIN_DAYS;
  const expectedOrderDate = input.lastOrderDate
    ? addDays(toDate(input.lastOrderDate), interval).toISOString().slice(0, 10)
    : null;

  return {
    daysSinceOrder: input.daysSinceOrder,
    typicalIntervalDays: interval,
    orderCadenceOverdue: overdue,
    orderCadenceDaysOverdue: overdue && daysPast !== null ? daysPast : null,
    expectedOrderDate,
  };
}

export { ORDER_CYCLE_DAYS as DEFAULT_ORDER_CYCLE_DAYS };

export type OrderCadenceTone = "current" | "approaching" | "overdue" | "unknown";

export function orderCadenceTone(input: {
  daysSinceOrder: number | null;
  intervalDays: number | null;
}): OrderCadenceTone {
  const daysPast = daysPastTypicalFrequency(
    input.daysSinceOrder,
    input.intervalDays,
  );

  if (daysPast === null) return "unknown";
  if (daysPast <= RISK_HEALTHY_GRACE_DAYS) return "current";
  if (daysPast <= RISK_AT_RISK_MAX_DAYS) return "approaching";
  return "overdue";
}

export function orderCadenceToneClass(tone: OrderCadenceTone): string {
  switch (tone) {
    case "current":
      return "text-emerald-800";
    case "approaching":
      return "text-amber-800";
    case "overdue":
      return "text-rose-800";
    case "unknown":
      return "text-muted-foreground";
  }
}

export function orderCadenceToneHintClass(tone: OrderCadenceTone): string {
  switch (tone) {
    case "current":
      return "text-emerald-700/80";
    case "approaching":
      return "text-amber-700/80";
    case "overdue":
      return "text-rose-700/80";
    case "unknown":
      return "text-muted-foreground";
  }
}
