import { normalizeName } from "./format";
import type { Account, Order } from "./types";

export type OrderIndex = {
  byAccountId: Map<string, Order[]>;
  byNormalizedName: Map<string, Order[]>;
};

function sortOrdersChronologically(orders: Order[]): Order[] {
  orders.sort((a, b) => a.date.localeCompare(b.date));
  return orders;
}

/** One pass over orders; each bucket is sorted chronologically (asc). */
export function buildOrderIndex(orders: Order[]): OrderIndex {
  const byAccountId = new Map<string, Order[]>();
  const byNormalizedName = new Map<string, Order[]>();

  for (const order of orders) {
    if (order.accountId) {
      const list = byAccountId.get(order.accountId) ?? [];
      list.push(order);
      byAccountId.set(order.accountId, list);
    }
    const nameKey = normalizeName(order.accountName);
    const nameList = byNormalizedName.get(nameKey) ?? [];
    nameList.push(order);
    byNormalizedName.set(nameKey, nameList);
  }

  for (const list of byAccountId.values()) sortOrdersChronologically(list);
  for (const list of byNormalizedName.values()) sortOrdersChronologically(list);

  return { byAccountId, byNormalizedName };
}

/** Matches legacy filter: account id OR normalized account name. */
export function ordersForAccount(index: OrderIndex, account: Account): Order[] {
  const normalized = normalizeName(account.name);
  const byId = account.id ? index.byAccountId.get(account.id) : undefined;
  const byName = index.byNormalizedName.get(normalized);

  if (byId && byName) {
    if (byId.length === 0) return byName;
    if (byName.length === 0) return byId;
    const merged: Order[] = [];
    const seen = new Set<Order>();
    for (const order of byId) {
      if (!seen.has(order)) {
        seen.add(order);
        merged.push(order);
      }
    }
    for (const order of byName) {
      if (!seen.has(order)) {
        seen.add(order);
        merged.push(order);
      }
    }
    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
  }

  return byId ?? byName ?? [];
}

export function ordersForAccountHealth(
  index: OrderIndex,
  account: { account: Account },
): Order[] {
  return ordersForAccount(index, account.account);
}
