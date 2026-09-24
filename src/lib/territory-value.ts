import { normalizeName } from "./format";
import type { AccountHealth, Order, TerritoryValueTier } from "./types";

const TIER_1_CUMULATIVE_SHARE = 0.7;
const TIER_2_CUMULATIVE_SHARE = 0.9;

function lineVolume(order: Order): number {
  return order.cases > 0 ? order.cases : 1;
}

function ordersForAccount(account: AccountHealth, orders: Order[]): Order[] {
  const normalized = normalizeName(account.account.name);
  return orders.filter(
    (order) =>
      order.accountId === account.account.id ||
      normalizeName(order.accountName) === normalized,
  );
}

/** All-time volume, falling back to revenue or recent activity when volume is missing. */
export function territoryValueForAccount(
  account: AccountHealth,
  orders: Order[],
): number {
  const accountOrders = ordersForAccount(account, orders);
  const volume = accountOrders.reduce((sum, order) => sum + lineVolume(order), 0);
  if (volume > 0) return volume;

  const revenue = accountOrders.reduce((sum, order) => sum + order.revenue, 0);
  if (revenue > 0) return revenue;

  return Math.max(account.revenue90, account.revenuePrior90, account.cases90, 0);
}

export function territoryTierLabel(tier: TerritoryValueTier): string {
  switch (tier) {
    case "anchor":
      return "1";
    case "core":
      return "2";
    case "base":
      return "3";
  }
}

export function territoryTierTitle(tier: TerritoryValueTier): string {
  switch (tier) {
    case "anchor":
      return "Tier 1";
    case "core":
      return "Tier 2";
    case "base":
      return "Tier 3";
  }
}

export function territoryTierDescription(tier: TerritoryValueTier): string {
  switch (tier) {
    case "anchor":
      return "Highest-value accounts — roughly the top 70% of territory volume.";
    case "core":
      return "Mid-value accounts — the next ~20% of territory volume.";
    case "base":
      return "Lower-value accounts — the remaining territory volume.";
  }
}

function assignTier(cumulativeShare: number, value: number): TerritoryValueTier {
  if (value <= 0) return "base";
  if (cumulativeShare <= TIER_1_CUMULATIVE_SHARE) return "anchor";
  if (cumulativeShare <= TIER_2_CUMULATIVE_SHARE) return "core";
  return "base";
}

export function enrichAccountsWithTerritoryValue(
  accounts: AccountHealth[],
  orders: Order[],
): AccountHealth[] {
  if (accounts.length === 0) return [];

  const ranked = accounts
    .map((account) => ({
      account,
      value: territoryValueForAccount(account, orders),
    }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.account.account.name.localeCompare(b.account.account.name),
    );

  const totalValue = ranked.reduce((sum, row) => sum + row.value, 0);
  let cumulative = 0;

  return ranked.map((row, index) => {
    cumulative += row.value;
    const cumulativeShare = totalValue > 0 ? cumulative / totalValue : 1;
    const sharePct = totalValue > 0 ? (row.value / totalValue) * 100 : 0;

    return {
      ...row.account,
      territoryValue: row.value,
      territorySharePct: sharePct,
      territoryTier: assignTier(cumulativeShare, row.value),
      territoryRank: index + 1,
    };
  });
}

export function accountsByTerritoryTier(
  accounts: AccountHealth[],
): Record<TerritoryValueTier, AccountHealth[]> {
  const buckets: Record<TerritoryValueTier, AccountHealth[]> = {
    anchor: [],
    core: [],
    base: [],
  };

  for (const account of accounts) {
    const tier = account.territoryTier ?? "base";
    buckets[tier].push(account);
  }

  for (const tier of Object.keys(buckets) as TerritoryValueTier[]) {
    buckets[tier].sort(
      (a, b) =>
        (a.territoryRank ?? Number.MAX_SAFE_INTEGER) -
          (b.territoryRank ?? Number.MAX_SAFE_INTEGER) ||
        a.account.name.localeCompare(b.account.name),
    );
  }

  return buckets;
}
