import type { Order, Visit } from "./types";

function visitDayKey(accountId: string, date: string): string {
  return `${accountId}|${date.slice(0, 10)}`;
}

/**
 * Remove zero-line “orders” on days that match imported activity stops (visit dates ≠ orders).
 */
export function purgeOrdersMatchingActivityVisits(
  orders: Order[],
  incomingVisits: Visit[],
): Order[] {
  if (incomingVisits.length === 0) return orders;

  const activityDays = new Set(
    incomingVisits.map((visit) => visitDayKey(visit.accountId, visit.date)),
  );

  return orders.filter((order) => {
    if (order.product?.trim() || order.cases > 0) return true;
    const key = visitDayKey(order.accountId, order.date);
    return !activityDays.has(key);
  });
}
