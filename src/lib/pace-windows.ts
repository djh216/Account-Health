import { startOfMonth, subDays, subMonths } from "date-fns";

/**
 * Calendar-month pace window. The current period always includes the month
 * that contains `asOf`, even when that month is still in progress.
 * A 1-month window is this month vs last month. A 3-month window is this
 * month plus the two before it, vs the three months before that.
 */
export function calendarPaceWindow(asOfDate: Date, monthCount: number) {
  const currentStart = startOfMonth(subMonths(asOfDate, monthCount - 1));
  const priorStart = startOfMonth(subMonths(currentStart, monthCount));
  return {
    currentStart,
    currentEnd: asOfDate,
    priorStart,
  };
}

/** Rolling day window. Current is the last `dayCount` days through asOf; prior is the `dayCount` days before that. */
export function rollingPaceWindow(asOfDate: Date, dayCount: number) {
  const currentStart = subDays(asOfDate, dayCount);
  const priorStart = subDays(asOfDate, dayCount * 2);
  return {
    currentStart,
    currentEnd: asOfDate,
    priorStart,
  };
}
