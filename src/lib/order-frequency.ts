import { differenceInCalendarDays, parseISO, startOfYear } from "date-fns";

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

/**
 * Average calendar days between orders: amount of days since their first order
 * divided by the amount of orders through as-of.
 */
export function averageDaysBetweenOrdersFromFirst(
  dates: string[],
  asOf: string | Date,
): number | null {
  const asOfDate = resolveAsOfDate(asOf);
  const unique = orderDatesThroughAsOf(dates, asOf);
  if (unique.length === 0) return null;

  const firstOrderDate = toDate(unique[0]!);
  const daysSinceFirstOrder = differenceInCalendarDays(asOfDate, firstOrderDate);
  if (daysSinceFirstOrder <= 0) return 1;

  return Math.max(1, Math.round(daysSinceFirstOrder / unique.length));
}

export function typicalFrequencyDaysFromOrderDates(
  dates: string[],
  asOf: string | Date,
): number | null {
  return averageDaysBetweenOrdersFromFirst(dates, asOf);
}

export function averageOrdersPerMonthFromOrderDates(
  dates: string[],
  asOf: string | Date,
): number | null {
  const ytdDates = ytdOrderDates(dates, asOf);
  return averageOrdersPerMonth(ytdDates.length, asOf);
}
