import { filterPortfolioByRep } from "@/lib/rep-filter";
import { portfolioStateCacheKey } from "@/lib/portfolio-analytics-bundle";
import type { PortfolioState } from "@/lib/types";

export type RepPortfolioIndex = {
  sourceKey: string;
  all: PortfolioState;
  /** Lazily populated per rep; always includes `"all"`. */
  byRep: Map<string, PortfolioState>;
  visibleState: PortfolioState;
};

export function createRepPortfolioIndex(visibleState: PortfolioState): RepPortfolioIndex {
  const byRep = new Map<string, PortfolioState>();
  byRep.set("all", visibleState);
  return {
    sourceKey: portfolioStateCacheKey(visibleState),
    all: visibleState,
    byRep,
    visibleState,
  };
}

export function portfolioStateForRep(index: RepPortfolioIndex, rep: string): PortfolioState {
  if (rep === "all") return index.all;
  const existing = index.byRep.get(rep);
  if (existing) return existing;
  const slice = filterPortfolioByRep(index.visibleState, rep);
  index.byRep.set(rep, slice);
  return slice;
}

/** All rep keys that should eventually be warmed (includes `"all"`). */
export function listRepIndexKeys(index: RepPortfolioIndex, reps: string[]): string[] {
  return [...new Set(["all", ...reps])];
}
