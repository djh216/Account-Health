import { buildSalesInsights, type BuildSalesInsightsInput } from "./build-sales-insights";
import type { SalesInsightsBundle } from "./types";

type SalesInsightsCacheEntry = {
  bundle: SalesInsightsBundle;
  portfolioKey: string;
  enrichedAccountCount: number;
  orderCount: number;
};

const cache = new Map<string, SalesInsightsCacheEntry>();
let sourceKey = "";

const listeners = new Set<() => void>();

function cacheKeyForRep(portfolioKey: string, repFilter: string): string {
  return `${portfolioKey}::${repFilter}`;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSalesInsights(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function entryForInput(
  input: BuildSalesInsightsInput,
  portfolioKey: string,
): SalesInsightsCacheEntry {
  return {
    portfolioKey,
    enrichedAccountCount: input.enrichedAccounts.length,
    orderCount: input.portfolioState.orders.length,
    bundle: buildSalesInsights(input),
  };
}

function isValidEntry(
  entry: SalesInsightsCacheEntry,
  input: BuildSalesInsightsInput,
  portfolioKey: string,
): boolean {
  return (
    entry.portfolioKey === portfolioKey &&
    entry.bundle.repFilter === input.repFilter &&
    entry.enrichedAccountCount === input.enrichedAccounts.length &&
    entry.orderCount === input.portfolioState.orders.length
  );
}

export function resetSalesInsightsCache(portfolioKey: string): void {
  if (sourceKey !== portfolioKey) {
    cache.clear();
    sourceKey = portfolioKey;
    notifyListeners();
  }
}

export function getCachedSalesInsights(
  portfolioKey: string,
  repFilter: string,
  input?: BuildSalesInsightsInput | null,
): SalesInsightsBundle | undefined {
  resetSalesInsightsCache(portfolioKey);
  const entry = cache.get(cacheKeyForRep(portfolioKey, repFilter));
  if (!entry) return undefined;
  if (input && !isValidEntry(entry, input, portfolioKey)) return undefined;
  return entry.bundle;
}

export function getOrBuildSalesInsights(
  portfolioKey: string,
  input: BuildSalesInsightsInput,
): SalesInsightsBundle {
  resetSalesInsightsCache(portfolioKey);
  const key = cacheKeyForRep(portfolioKey, input.repFilter);
  const existing = cache.get(key);
  if (existing && isValidEntry(existing, input, portfolioKey)) {
    return existing.bundle;
  }

  const next = entryForInput(input, portfolioKey);
  cache.set(key, next);
  notifyListeners();
  return next.bundle;
}

export function warmSalesInsights(input: BuildSalesInsightsInput, portfolioKey: string): void {
  getOrBuildSalesInsights(portfolioKey, input);
}
