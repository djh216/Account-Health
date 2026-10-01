import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import type { Order } from "./types";

function toDay(iso: string): string {
  return iso.slice(0, 10);
}

/** ISO week bucket for an order date (YYYY-Www). */
export function orderWeekKey(isoDate: string): string {
  const date = parseISO(toDay(isoDate));
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

/** Latest calendar day in each ISO week, sorted ascending (one “order event” per week). */
export function uniqueOrderWeekAnchorDatesFromDays(dates: string[]): string[] {
  const byWeek = new Map<string, string>();
  for (const raw of dates) {
    const day = toDay(raw);
    const week = orderWeekKey(day);
    const existing = byWeek.get(week);
    if (!existing || day > existing) {
      byWeek.set(week, day);
    }
  }
  return [...byWeek.values()].sort();
}

export function uniqueOrderWeekAnchorDates(orders: Order[]): string[] {
  return uniqueOrderWeekAnchorDatesFromDays(orders.map((order) => order.date));
}

export function orderEventCountFromOrders(orders: Order[]): number {
  return uniqueOrderWeekAnchorDates(orders).length;
}

/** Week anchors on or before as-of. */
export function orderWeekAnchorsThroughAsOf(
  dates: string[],
  asOf: string | Date,
): string[] {
  const asOfDay = typeof asOf === "string" ? toDay(asOf) : asOf.toISOString().slice(0, 10);
  return uniqueOrderWeekAnchorDatesFromDays(dates).filter((day) => day <= asOfDay);
}

/** Week anchors in the as-of calendar year (by anchor date year), through as-of. */
export function ytdOrderWeekAnchorDates(dates: string[], asOf: string | Date): string[] {
  const asOfDay = typeof asOf === "string" ? toDay(asOf) : asOf.toISOString().slice(0, 10);
  const year = asOfDay.slice(0, 4);
  return orderWeekAnchorsThroughAsOf(dates, asOfDay).filter((day) => day.startsWith(year));
}

/** Order line dates with the most recent weekly order event removed. */
export function orderDatesExcludingLatestEventWeek(
  orders: Order[],
  asOf: string | Date,
): string[] {
  const anchors = orderWeekAnchorsThroughAsOf(
    orders.map((order) => order.date),
    asOf,
  );
  if (anchors.length === 0) return [];
  const lastWeek = orderWeekKey(anchors.at(-1)!);
  return orders
    .filter((order) => orderWeekKey(order.date) !== lastWeek)
    .map((order) => order.date);
}
