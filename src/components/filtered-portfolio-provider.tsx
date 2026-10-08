"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { hardResetApp } from "@/lib/portfolio-store";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { useClosedBusinessAccounts } from "@/hooks/use-closed-business-accounts";
import { useFrequencyDropRoster } from "@/hooks/use-frequency-drop-roster";
import type { FrequencyDropClearance } from "@/lib/frequency-drop-roster";
import { excludeClosedBusinessAccounts } from "@/lib/closed-business-accounts";
import { excludeHomeBaseFromPortfolio } from "@/lib/account-filters";
import { excludeOutOfStock } from "@/lib/out-of-stock-products";
import { detectSlowingProductAlerts } from "@/lib/product-trends";
import { portfolioRosterScopeKey } from "@/lib/frequency-drop-roster";
import {
  getPortfolioAnalyticsSessionCache,
  isRepAnalyticsWarm,
  isRepCoreWarm,
  mergePortfolioAnalytics,
  portfolioStateCacheKey,
  readPortfolioCoreForFilteredState,
  readPortfolioHeavyForFilteredState,
  warmPortfolioAnalyticsForRep,
  type PortfolioAnalyticsBundle,
  type PortfolioHeavyAnalytics,
} from "@/lib/portfolio-analytics-bundle";
import {
  createRepPortfolioIndex,
  listRepIndexKeys,
  portfolioStateForRep,
} from "@/lib/rep-portfolio-index";
import {
  getRepFilterSnapshot,
  listSalesReps,
  resetRepFilter,
  setRepFilter,
  subscribeRepFilter,
} from "@/lib/rep-filter";
import type { AccountFrequencyAlert } from "@/lib/frequency-alerts";
import type { ProductSlowingAlert } from "@/lib/product-trends";
import type { AccountHealth, PortfolioSnapshot, PortfolioState } from "@/lib/types";
import type { OrderAnalyticsSnapshot } from "@/lib/order-analytics";
import type { PortfolioProjectionSummary } from "@/lib/order-projections";
import { assembleSalesInsightsInput } from "@/hooks/use-sales-insights";
import {
  getCachedSalesInsights,
  warmSalesInsights,
} from "@/lib/sales-insights/sales-insights-cache";

const getServerRepFilterSnapshot = () => "all";

function emptyOrderAnalytics(asOf: string): OrderAnalyticsSnapshot {
  return {
    asOf,
    dateRange: { start: null, end: null },
    totals: {
      orderLines: 0,
      totalVolume: 0,
      restaurantCount: 0,
      productCount: 0,
      orderEvents: 0,
    },
    byProduct: [],
    byRestaurant: [],
    byMonth: [],
    byFrequency: [],
    productCatalog: [],
    byRestaurantProduct: [],
    byAccount: [],
    orders: [],
  };
}

function emptyProjectionsSummary(): PortfolioProjectionSummary {
  return {
    totalProjectedVolume30: 0,
    totalProjectedVolume60: 0,
    totalProjectedVolume90: 0,
    totalBaselineVolume90: 0,
    totalRiskAdjustedVolume90: 0,
    totalMonthlyVolumeAtRisk: 0,
    highChurnCount: 0,
    moderateChurnCount: 0,
    lowChurnCount: 0,
    accounts: [],
  };
}

type FilteredPortfolioContextValue = {
  state: PortfolioState;
  fullState: PortfolioState;
  snapshot: PortfolioSnapshot;
  repFilter: string;
  repFilterPending: boolean;
  setRepFilter: (rep: string) => void;
  reps: string[];
  importParseResult: ReturnType<typeof usePortfolio>["importParseResult"];
  reset: () => void;
  orderAnalytics: OrderAnalyticsSnapshot;
  enrichedAccounts: AccountHealth[];
  productTrends: PortfolioAnalyticsBundle["productTrends"];
  frequencyAlerts: AccountFrequencyAlert[];
  frequencyDropRecentClearances: FrequencyDropClearance[];
  frequencyDropRecentClearanceCount: number;
  productAlerts: ProductSlowingAlert[];
  projectionsSummary: PortfolioProjectionSummary;
  newAccounts: PortfolioAnalyticsBundle["newAccounts"];
  retainedAccounts: PortfolioAnalyticsBundle["retainedAccounts"];
  returningCustomers: PortfolioAnalyticsBundle["returningCustomers"];
  lastOrderGaps: PortfolioAnalyticsBundle["lastOrderGaps"];
};

const FilteredPortfolioContext = createContext<FilteredPortfolioContextValue | null>(
  null,
);

function shellPortfolioContext(input: {
  filteredState: PortfolioState;
  fullState: PortfolioState;
  asOf: string;
  repFilter: string;
  repFilterPending: boolean;
  reps: string[];
  importParseResult: ReturnType<typeof usePortfolio>["importParseResult"];
  resetAll: () => void;
}): FilteredPortfolioContextValue {
  return {
    state: input.filteredState,
    fullState: input.fullState,
    snapshot: {
      asOf: input.asOf,
      mode: "snapshot",
      accounts: [],
      totals: {
        accountCount: 0,
        critical: 0,
        atRisk: 0,
        dormant: 0,
        healthy: 0,
        overdueOrders: 0,
        overdueVisits: 0,
        volume90: 0,
        volumeAtRisk: 0,
      },
    },
    repFilter: input.repFilter,
    repFilterPending: input.repFilterPending,
    setRepFilter,
    reps: input.reps,
    importParseResult: input.importParseResult,
    reset: input.resetAll,
    orderAnalytics: emptyOrderAnalytics(input.asOf),
    enrichedAccounts: [],
    productTrends: {
      data: [],
      productSummaries: [],
      allProductsSorted: [],
      totalActiveProducts: 0,
      totalBottles: 0,
      topPerformer: null,
      topGrowing: null,
      atRiskProduct: null,
      topGrowingQuarterly: null,
      coolingQuarterly: null,
      portfolioPaceLast3Months: 0,
      portfolioPacePrior3Months: 0,
      portfolioQuarterlyPaceDeltaPct: null,
      peakPeriod: null,
      avgMonthlyBottles: 0,
    },
    frequencyAlerts: [],
    frequencyDropRecentClearances: [],
    frequencyDropRecentClearanceCount: 0,
    productAlerts: [],
    projectionsSummary: emptyProjectionsSummary(),
    newAccounts: [],
    retainedAccounts: [],
    returningCustomers: [],
    lastOrderGaps: new Map(),
  };
}

export function FilteredPortfolioProvider({ children }: { children: ReactNode }) {
  const { state, importParseResult } = usePortfolio();
  const repFilter = useSyncExternalStore(
    subscribeRepFilter,
    getRepFilterSnapshot,
    getServerRepFilterSnapshot,
  );
  const { ids: outOfStockIds } = useOutOfStockProducts();
  const { ids: closedAccountIds } = useClosedBusinessAccounts();

  const visibleState = useMemo(
    () => excludeHomeBaseFromPortfolio(state),
    [state],
  );

  const visibleStateKey = useMemo(
    () => portfolioStateCacheKey(visibleState),
    [visibleState],
  );

  const rosterPortfolioKey = useMemo(
    () => portfolioRosterScopeKey(visibleState),
    [visibleState.accounts],
  );

  const analyticsCache = getPortfolioAnalyticsSessionCache(visibleStateKey);

  const repIndex = useMemo(
    () => createRepPortfolioIndex(visibleState),
    [visibleState, visibleStateKey],
  );

  const reps = useMemo(() => listSalesReps(visibleState), [visibleState]);

  const [analyticsEpoch, setAnalyticsEpoch] = useState(0);
  const hasPortfolioData = visibleState.accounts.length > 0;

  /** Core analytics (scores, trends) — sync so the UI never spins waiting on rAF. */
  useEffect(() => {
    if (!hasPortfolioData) return;
    if (isRepCoreWarm(analyticsCache, repFilter)) return;

    try {
      readPortfolioCoreForFilteredState(
        analyticsCache,
        repFilter,
        portfolioStateForRep(repIndex, repFilter),
      );
      setAnalyticsEpoch((epoch) => epoch + 1);
    } catch (error) {
      console.error("Failed to warm portfolio analytics core", error);
    }
  }, [visibleStateKey, repFilter, repIndex, hasPortfolioData, analyticsCache]);

  /** Heavy analytics (order tracking, projections) — idle when possible. */
  useEffect(() => {
    if (!hasPortfolioData) return;
    if (!isRepCoreWarm(analyticsCache, repFilter)) return;
    if (isRepAnalyticsWarm(analyticsCache, repFilter)) return;

    let cancelled = false;
    const filtered = portfolioStateForRep(repIndex, repFilter);

    const ensureHeavy = () => {
      if (cancelled) return;
      if (isRepAnalyticsWarm(analyticsCache, repFilter)) return;
      try {
        readPortfolioHeavyForFilteredState(analyticsCache, repFilter, filtered);
        setAnalyticsEpoch((epoch) => epoch + 1);
      } catch (error) {
        console.error("Failed to warm portfolio analytics heavy", error);
      }
    };

    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(ensureHeavy, { timeout: 1_500 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }

    const timerId = window.setTimeout(ensureHeavy, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    visibleStateKey,
    repFilter,
    repIndex,
    hasPortfolioData,
    analyticsCache,
    analyticsEpoch,
  ]);

  /** Preload other rep slices in idle time — no React updates until the user switches rep. */
  useEffect(() => {
    if (!hasPortfolioData) return;

    const repKeys = listRepIndexKeys(repIndex, reps);
    let cancelled = false;
    let queueIndex = 0;

    const warmNext = () => {
      if (cancelled) return;

      while (queueIndex < repKeys.length) {
        const rep = repKeys[queueIndex];
        queueIndex += 1;
        if (rep === repFilter) continue;
        if (isRepAnalyticsWarm(analyticsCache, rep)) continue;

        warmPortfolioAnalyticsForRep(
          analyticsCache,
          rep,
          portfolioStateForRep(repIndex, rep),
        );
        break;
      }

      if (cancelled || queueIndex >= repKeys.length) return;

      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(warmNext, { timeout: 4_000 });
      } else {
        window.setTimeout(warmNext, 250);
      }
    };

    const starter = window.setTimeout(warmNext, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(starter);
    };
  }, [visibleStateKey, repIndex, reps, repFilter, hasPortfolioData, analyticsCache]);

  useEffect(() => {
    if (repFilter !== "all" && reps.length > 0 && !reps.includes(repFilter)) {
      resetRepFilter();
    }
  }, [repFilter, reps]);

  const filteredState = useMemo(
    () => portfolioStateForRep(repIndex, repFilter),
    [repIndex, repFilter],
  );

  const activeCore = useMemo(
    () => analyticsCache.get(repFilter)?.core ?? null,
    [analyticsCache, repFilter, visibleStateKey, analyticsEpoch],
  );
  const activeHeavy = useMemo(
    () => analyticsCache.get(repFilter)?.heavy ?? null,
    [analyticsCache, repFilter, visibleStateKey, analyticsEpoch],
  );

  const repFilterPending = Boolean(hasPortfolioData && !activeCore);

  const bundle = useMemo(() => {
    if (!activeCore) return null;
    const heavy =
      activeHeavy ??
      ({
        orderAnalytics: emptyOrderAnalytics(activeCore.snapshot.asOf),
        projectionsSummary: emptyProjectionsSummary(),
      } satisfies PortfolioHeavyAnalytics);
    return mergePortfolioAnalytics(activeCore, heavy);
  }, [activeCore, activeHeavy]);

  const productAlerts = useMemo(
    () =>
      excludeOutOfStock(
        detectSlowingProductAlerts(activeCore?.productTrends.productSummaries ?? []),
        outOfStockIds,
      ),
    [activeCore?.productTrends.productSummaries, outOfStockIds],
  );

  const frequencyAlerts = useMemo(
    () =>
      excludeClosedBusinessAccounts(activeCore?.frequencyAlerts ?? [], closedAccountIds),
    [activeCore?.frequencyAlerts, closedAccountIds],
  );

  const rosterAsOf =
    activeCore?.snapshot.asOf ??
    visibleState.analysisAsOf ??
    new Date().toISOString().slice(0, 10);

  const { recentClearances: rosterClearances } = useFrequencyDropRoster(
    rosterPortfolioKey,
    repFilter,
    frequencyAlerts,
    rosterAsOf,
    hasPortfolioData && Boolean(activeCore),
  );

  const frequencyDropRecentClearances = useMemo(
    () => rosterClearances.filter((entry) => !closedAccountIds.has(entry.id)),
    [rosterClearances, closedAccountIds],
  );

  const frequencyDropRecentClearanceCount = frequencyDropRecentClearances.length;

  const resetAll = useCallback(() => {
    void hardResetApp();
  }, []);

  /** Precompute sales insights in idle time so /insights opens instantly when cached. */
  useEffect(() => {
    if (!activeCore || !activeHeavy || repFilterPending) return;

    const input = assembleSalesInsightsInput({
      enrichedAccounts: activeCore.enrichedAccounts,
      repFilter,
      frequencyAlerts,
      productAlerts,
      newAccounts: activeCore.newAccounts,
      retainedAccounts: activeCore.retainedAccounts,
      returningCustomers: activeCore.returningCustomers,
      projectionsSummary:
        activeHeavy?.projectionsSummary ?? emptyProjectionsSummary(),
      state: filteredState,
      snapshot: activeCore.snapshot,
      repFilterPending: false,
    });
    if (!input) return;

    const portfolioKey = portfolioStateCacheKey(filteredState);
    if (getCachedSalesInsights(portfolioKey, repFilter, input)) return;

    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      warmSalesInsights(input, portfolioKey);
    };

    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(warm, { timeout: 3_000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }

    const timerId = window.setTimeout(warm, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    activeCore,
    activeHeavy,
    repFilterPending,
    filteredState,
    repFilter,
    frequencyAlerts,
    productAlerts,
    visibleStateKey,
    analyticsEpoch,
  ]);

  const analysisAsOf =
    visibleState.analysisAsOf ?? new Date().toISOString().slice(0, 10);

  const value = useMemo((): FilteredPortfolioContextValue => {
    if (!hasPortfolioData) {
      return shellPortfolioContext({
        filteredState,
        fullState: state,
        asOf: analysisAsOf,
        repFilter,
        repFilterPending: false,
        reps,
        importParseResult,
        resetAll,
      });
    }

    if (!activeCore || !bundle) {
      return shellPortfolioContext({
        filteredState,
        fullState: state,
        asOf: analysisAsOf,
        repFilter,
        repFilterPending: true,
        reps,
        importParseResult,
        resetAll,
      });
    }

    return {
      state: filteredState,
      fullState: state,
      snapshot: activeCore.snapshot,
      repFilter,
      repFilterPending,
      setRepFilter,
      reps,
      importParseResult,
      reset: resetAll,
      orderAnalytics: bundle.orderAnalytics,
      enrichedAccounts: activeCore.enrichedAccounts,
      productTrends: activeCore.productTrends,
      frequencyAlerts,
      frequencyDropRecentClearances,
      frequencyDropRecentClearanceCount,
      productAlerts,
      projectionsSummary: bundle.projectionsSummary,
      newAccounts: activeCore.newAccounts,
      retainedAccounts: activeCore.retainedAccounts,
      returningCustomers: activeCore.returningCustomers,
      lastOrderGaps: activeCore.lastOrderGaps,
    };
  }, [
    hasPortfolioData,
    filteredState,
    state,
    visibleState.analysisAsOf,
    bundle,
    activeCore,
    repFilter,
    repFilterPending,
    reps,
    importParseResult,
    resetAll,
    productAlerts,
    frequencyAlerts,
    frequencyDropRecentClearances,
    frequencyDropRecentClearanceCount,
    analysisAsOf,
  ]);

  return (
    <FilteredPortfolioContext.Provider value={value}>
      {children}
    </FilteredPortfolioContext.Provider>
  );
}

export function useFilteredPortfolio(): FilteredPortfolioContextValue {
  const context = useContext(FilteredPortfolioContext);
  if (!context) {
    throw new Error("useFilteredPortfolio must be used within FilteredPortfolioProvider");
  }
  return context;
}
