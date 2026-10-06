import { buildSalesInsights, type BuildSalesInsightsInput } from "./build-sales-insights";
import type { SalesInsightsBundle } from "./types";

const cache = new Map<string, SalesInsightsBundle>();
let sourceKey = "";

function cacheKeyForRep(portfolioKey: string, repFilter: string): string {
  return `${portfolioKey}::${repFilter}`;
}

export function resetSalesInsightsCache(portfolioKey: string): void {
  if (sourceKey !== portfolioKey) {
    cache.clear();
    sourceKey = portfolioKey;
  }
}

export function getCachedSalesInsights(
  portfolioKey: string,
  repFilter: string,
): SalesInsightsBundle | undefined {
  resetSalesInsightsCache(portfolioKey);
  return cache.get(cacheKeyForRep(portfolioKey, repFilter));
}

export function getOrBuildSalesInsights(
  portfolioKey: string,
  input: BuildSalesInsightsInput,
): SalesInsightsBundle {
  resetSalesInsightsCache(portfolioKey);
  const key = cacheKeyForRep(portfolioKey, input.repFilter);
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildSalesInsights(input);
  cache.set(key, built);
  return built;
}

export function warmSalesInsights(input: BuildSalesInsightsInput, portfolioKey: string): void {
  getOrBuildSalesInsights(portfolioKey, input);
}
