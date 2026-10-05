import {
  buildOrderIndex,
  ordersForAccount,
  ordersForAccountHealth,
  type OrderIndex,
} from "./order-index";
import type { Account, AccountHealth, Order, TerritoryValueTier } from "./types";

const TIER_1_CUMULATIVE_SHARE = 0.7;
const TIER_2_CUMULATIVE_SHARE = 0.9;

function lineVolume(order: Order): number {
  return order.cases > 0 ? order.cases : 1;
}

/** All-time bottle volume, falling back to recent activity when line volume is missing. */
export function territoryValueForAccount(
  account: AccountHealth,
  orderIndex: OrderIndex,
): number {
  const accountOrders = ordersForAccountHealth(orderIndex, account);
  const volume = accountOrders.reduce((sum, order) => sum + lineVolume(order), 0);
  if (volume > 0) return volume;

  return Math.max(account.volume90, account.volumePrior90, account.cases90, 0);
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
      return "Highest-value accounts — roughly the top 70% of territory volume. Visit every 14–21 days.";
    case "core":
      return "Mid-value accounts — the next ~20% of territory volume. Visit every 14–21 days.";
    case "base":
      return "Lower-value accounts — the remaining territory volume. Visit every 21–28 days.";
  }
}

function assignTier(cumulativeShare: number, value: number): TerritoryValueTier {
  if (value <= 0) return "base";
  if (cumulativeShare <= TIER_1_CUMULATIVE_SHARE) return "anchor";
  if (cumulativeShare <= TIER_2_CUMULATIVE_SHARE) return "core";
  return "base";
}

/** Territory tier per account id (same ranking as enrich, for scoring before enrich). */
export function buildTerritoryTierByAccountId(
  accounts: Account[],
  orderIndex: OrderIndex,
): Map<string, TerritoryValueTier> {
  if (accounts.length === 0) return new Map();

  const ranked = accounts
    .map((account) => ({
      account,
      value: ordersForAccount(orderIndex, account).reduce(
        (sum, order) => sum + lineVolume(order),
        0,
      ),
    }))
    .sort(
      (a, b) =>
        b.value - a.value || a.account.name.localeCompare(b.account.name),
    );

  const totalValue = ranked.reduce((sum, row) => sum + row.value, 0);
  let cumulative = 0;
  const tiers = new Map<string, TerritoryValueTier>();

  for (const row of ranked) {
    cumulative += row.value;
    const cumulativeShare = totalValue > 0 ? cumulative / totalValue : 1;
    tiers.set(row.account.id, assignTier(cumulativeShare, row.value));
  }

  return tiers;
}

export function enrichAccountsWithTerritoryValue(
  accounts: AccountHealth[],
  ordersOrIndex: Order[] | OrderIndex,
): AccountHealth[] {
  if (accounts.length === 0) return [];

  const orderIndex = Array.isArray(ordersOrIndex)
    ? buildOrderIndex(ordersOrIndex)
    : ordersOrIndex;

  const ranked = accounts
    .map((account) => ({
      account,
      value: territoryValueForAccount(account, orderIndex),
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
