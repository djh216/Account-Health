import { detectOrderFrequencyDrops } from "@/lib/frequency-alerts";
import { buildOrderIndex } from "@/lib/order-index";
import { buildVisitIndex } from "@/lib/visit-index";
import {
  buildOrderAnalytics,
  lastOrderGapsByAccount,
  listNewAccountsWithRecentOrders,
  listRetainedAccounts,
  listReturningCustomers,
  type OrderAnalyticsSnapshot,
} from "@/lib/order-analytics";
import { buildProjectionsAndChurn } from "@/lib/order-projections";
import {
  buildAggregateProductTrendDataCached,
  type ProductTrendDataResult,
} from "@/lib/product-trends";
import { buildSnapshot } from "@/lib/score";
import { filterPortfolioByRep } from "@/lib/rep-filter";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import type { AccountFrequencyAlert } from "@/lib/frequency-alerts";
import type { AccountHealth, PortfolioSnapshot, PortfolioState } from "@/lib/types";

export type PortfolioAnalyticsBundle = {
  snapshot: PortfolioSnapshot;
  orderAnalytics: OrderAnalyticsSnapshot;
  enrichedAccounts: AccountHealth[];
  productTrends: ProductTrendDataResult;
  frequencyAlerts: AccountFrequencyAlert[];
  projectionsSummary: ReturnType<typeof buildProjectionsAndChurn>;
  newAccounts: ReturnType<typeof listNewAccountsWithRecentOrders>;
  retainedAccounts: ReturnType<typeof listRetainedAccounts>;
  returningCustomers: ReturnType<typeof listReturningCustomers>;
  lastOrderGaps: ReturnType<typeof lastOrderGapsByAccount>;
};

export type PortfolioCoreAnalytics = Omit<
  PortfolioAnalyticsBundle,
  "orderAnalytics" | "projectionsSummary"
>;

export type PortfolioHeavyAnalytics = Pick<
  PortfolioAnalyticsBundle,
  "orderAnalytics" | "projectionsSummary"
>;

export type PortfolioAnalyticsCacheEntry = {
  core?: PortfolioCoreAnalytics;
  heavy?: PortfolioHeavyAnalytics;
};

export function portfolioStateCacheKey(state: PortfolioState): string {
  return `${state.accounts.length}:${state.orders.length}:${state.visits.length}:${state.analysisAsOf ?? ""}`;
}

/** Scoring, product trends, and alerts — no order-analytics account tracking. */
export function computePortfolioCoreAnalytics(
  filteredState: PortfolioState,
): PortfolioCoreAnalytics {
  const orderIndex = buildOrderIndex(filteredState.orders);
  const visitIndex = buildVisitIndex(filteredState.visits);

  const snapshot = buildSnapshot(
    filteredState.accounts,
    filteredState.orders,
    filteredState.visits,
    filteredState.analysisAsOf,
    orderIndex,
    visitIndex,
  );

  const enrichedAccounts = enrichAccountsWithTerritoryValue(
    snapshot.accounts,
    orderIndex,
  );

  const asOf = filteredState.analysisAsOf ?? snapshot.asOf;

  const productTrends = buildAggregateProductTrendDataCached(
    portfolioStateCacheKey(filteredState),
    filteredState.orders,
    asOf,
  );

  const frequencyAlerts = detectOrderFrequencyDrops(
    enrichedAccounts,
    filteredState.orders,
    asOf,
    orderIndex.byNormalizedName,
  );

  return {
    snapshot,
    enrichedAccounts,
    productTrends,
    frequencyAlerts,
    newAccounts: listNewAccountsWithRecentOrders(filteredState.orders, asOf),
    retainedAccounts: listRetainedAccounts(filteredState.orders, asOf),
    returningCustomers: listReturningCustomers(filteredState.orders, asOf),
    lastOrderGaps: lastOrderGapsByAccount(filteredState.orders),
  };
}

export function computePortfolioHeavyAnalytics(
  filteredState: PortfolioState,
  core: PortfolioCoreAnalytics,
): PortfolioHeavyAnalytics {
  const asOf = filteredState.analysisAsOf ?? core.snapshot.asOf;
  const orderAnalytics = buildOrderAnalytics(
    filteredState.orders,
    filteredState.analysisAsOf,
  );

  const projectionsSummary = buildProjectionsAndChurn(
    orderAnalytics,
    core.enrichedAccounts,
    asOf,
  );

  return { orderAnalytics, projectionsSummary };
}

export function mergePortfolioAnalytics(
  core: PortfolioCoreAnalytics,
  heavy: PortfolioHeavyAnalytics,
): PortfolioAnalyticsBundle {
  return { ...core, ...heavy };
}

function getCacheEntry(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  rep: string,
): PortfolioAnalyticsCacheEntry {
  let entry = cache.get(rep);
  if (!entry) {
    entry = {};
    cache.set(rep, entry);
  }
  return entry;
}

export function readPortfolioCoreForFilteredState(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  rep: string,
  filteredState: PortfolioState,
): PortfolioCoreAnalytics {
  const entry = getCacheEntry(cache, rep);
  if (entry.core) return entry.core;
  entry.core = computePortfolioCoreAnalytics(filteredState);
  return entry.core;
}

export function readPortfolioHeavyForFilteredState(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  rep: string,
  filteredState: PortfolioState,
): PortfolioHeavyAnalytics {
  const entry = getCacheEntry(cache, rep);
  if (entry.heavy) return entry.heavy;
  if (!entry.core) {
    entry.core = computePortfolioCoreAnalytics(filteredState);
  }
  entry.heavy = computePortfolioHeavyAnalytics(filteredState, entry.core);
  return entry.heavy;
}

export function readPortfolioCoreFromCache(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  visibleState: PortfolioState,
  rep: string,
): PortfolioCoreAnalytics {
  return readPortfolioCoreForFilteredState(
    cache,
    rep,
    filterPortfolioByRep(visibleState, rep),
  );
}

export function readPortfolioHeavyFromCache(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  visibleState: PortfolioState,
  rep: string,
): PortfolioHeavyAnalytics {
  return readPortfolioHeavyForFilteredState(
    cache,
    rep,
    filterPortfolioByRep(visibleState, rep),
  );
}

/** Full derived analytics for one filtered portfolio slice (one rep or all). */
export function computePortfolioAnalyticsBundle(
  filteredState: PortfolioState,
): PortfolioAnalyticsBundle {
  const core = computePortfolioCoreAnalytics(filteredState);
  const heavy = computePortfolioHeavyAnalytics(filteredState, core);
  return mergePortfolioAnalytics(core, heavy);
}

export function readPortfolioBundleFromCache(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  visibleState: PortfolioState,
  rep: string,
): PortfolioAnalyticsBundle {
  const core = readPortfolioCoreFromCache(cache, visibleState, rep);
  const heavy = readPortfolioHeavyFromCache(cache, visibleState, rep);
  return mergePortfolioAnalytics(core, heavy);
}
