import { differenceInCalendarDays, parseISO, startOfYear } from "date-fns";
import {
  orderDatesExcludingLatestEventWeek,
  orderWeekAnchorsThroughAsOf,
  ytdOrderWeekAnchorDates,
} from "./order-weeks";
import type { Order } from "./types";

export const AVG_DAYS_PER_MONTH = 30.44;

function toDate(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

function resolveAsOfDate(asOf: string | Date): Date {
  return typeof asOf === "string" ? toDate(asOf) : asOf;
}

/** Inclusive calendar days from Jan 1 of the as-of year through as-of. */
export function daysYearToDate(asOf: string | Date): number {
  const asOfDate = resolveAsOfDate(asOf);
  return differenceInCalendarDays(asOfDate, startOfYear(asOfDate)) + 1;
}

/** Unique order dates in the as-of calendar year through as-of. */
export function ytdOrderDates(dates: string[], asOf: string | Date): string[] {
  const asOfDate = resolveAsOfDate(asOf);
  const year = asOfDate.getFullYear();
  const yearPrefix = `${year}-`;
  return [...new Set(dates.map((date) => date.slice(0, 10)))]
    .filter((date) => date.startsWith(yearPrefix) && toDate(date) <= asOfDate)
    .sort();
}

export function averageOrdersPerMonth(
  orderEventCountYtd: number,
  asOf: string | Date,
): number | null {
  if (orderEventCountYtd <= 0) return null;
  const daysYtd = daysYearToDate(asOf);
  return (orderEventCountYtd / daysYtd) * AVG_DAYS_PER_MONTH;
}

/** Typical reorder interval in days: YTD days divided by YTD order count. */
export function typicalFrequencyDays(
  orderEventCountYtd: number,
  asOf: string | Date,
): number | null {
  if (orderEventCountYtd <= 0) return null;
  const daysYtd = daysYearToDate(asOf);
  return Math.max(1, Math.round(daysYtd / orderEventCountYtd));
}

/** Unique order dates on or before as-of, chronological. */
export function orderDatesThroughAsOf(dates: string[], asOf: string | Date): string[] {
  const asOfDate = resolveAsOfDate(asOf);
  return [...new Set(dates.map((date) => date.slice(0, 10)))]
    .filter((date) => toDate(date) <= asOfDate)
    .sort();
}

function consecutiveOrderGaps(dates: string[]): number[] {
  const unique = [...new Set(dates.map((date) => date.slice(0, 10)))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const gap = differenceInCalendarDays(toDate(unique[i]!), toDate(unique[i - 1]!));
    if (gap > 0) gaps.push(gap);
  }
  return gaps;
}

function medianOfValues(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  return Math.max(1, Math.round(median));
}

function meanOfValues(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.max(1, Math.round(sum / values.length));
}

/** Median gap between consecutive order dates. One order → no interval. */
export function medianGapDays(dates: string[]): number | null {
  const gaps = consecutiveOrderGaps(dates);
  if (gaps.length === 0) return null;
  return medianOfValues(gaps);
}

/** Mean gap between consecutive order dates (typical account cadence). One order → no interval. */
export function meanGapDays(dates: string[]): number | null {
  const gaps = consecutiveOrderGaps(dates);
  if (gaps.length === 0) return null;
  return meanOfValues(gaps);
}

/** Typical reorder interval aligned with lifetime orders/month (includes time since last order). */
export function typicalFrequencyDaysFromOrderDates(
  dates: string[],
  asOf: string | Date,
): number | null {
  const orderDates = orderWeekAnchorsThroughAsOf(dates, asOf);
  if (orderDates.length <= 1) return null;
  const pace = averageOrdersPerMonthLifetimeFromOrderDates(dates, asOf);
  if (pace === null || pace <= 0) return null;
  return Math.max(1, Math.round(AVG_DAYS_PER_MONTH / pace));
}

export function averageOrdersPerMonthFromOrderDates(
  dates: string[],
  asOf: string | Date,
): number | null {
  const ytdWeeks = ytdOrderWeekAnchorDates(dates, asOf);
  return averageOrdersPerMonth(ytdWeeks.length, asOf);
}

/** Small wiggle room when comparing day counts to rounded typical cadence. */
export const FREQUENCY_DELTA_UNCHANGED_DAYS = 3;

export type LatestOrderGapComparison = {
  /** Typical frequency after the most recent order (matches account “Typical frequency”). */
  currentFrequencyDays: number;
  /** Typical frequency before that order (as of the prior order date). */
  priorFrequencyDays: number;
  /** Change in typical frequency caused by the latest order and its gap. */
  deltaDays: number;
};

/**
 * How the latest order shifted typical frequency: current lifetime typical minus
 * typical computed through the previous order (excluding the latest event).
 */
export function latestOrderGapComparison(
  orders: Order[],
  asOf: string | Date,
): LatestOrderGapComparison | null {
  const orderDates = orders.map((order) => order.date);
  const anchors = orderWeekAnchorsThroughAsOf(orderDates, asOf);
  if (anchors.length < 2) return null;

  const priorOrderDate = anchors.at(-2)!;
  const priorDates = orderDatesExcludingLatestEventWeek(orders, asOf);
  const priorFrequencyDays = typicalFrequencyDaysFromOrderDates(
    priorDates,
    priorOrderDate,
  );
  const currentFrequencyDays = typicalFrequencyDaysFromOrderDates(orderDates, asOf);
  if (priorFrequencyDays === null || currentFrequencyDays === null) return null;

  return {
    currentFrequencyDays,
    priorFrequencyDays,
    deltaDays: currentFrequencyDays - priorFrequencyDays,
  };
}

export function frequencyDeltaFromLatestOrderGap(
  orders: Order[],
  asOf: string | Date,
): number | null {
  const comparison = latestOrderGapComparison(orders, asOf);
  if (!comparison) return null;
  return comparison.deltaDays;
}

/** Average order events per month from first order through as-of (account lifetime). */
export function averageOrdersPerMonthLifetimeFromOrderDates(
  dates: string[],
  asOf: string | Date,
): number | null {
  const orderDates = orderWeekAnchorsThroughAsOf(dates, asOf);
  if (orderDates.length === 0) return null;
  const asOfDate = resolveAsOfDate(asOf);
  const firstDate = toDate(orderDates[0]!);
  const daysActive = Math.max(1, differenceInCalendarDays(asOfDate, firstDate) + 1);
  return Number(((orderDates.length / daysActive) * AVG_DAYS_PER_MONTH).toFixed(1));
}
