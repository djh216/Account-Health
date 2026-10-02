"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DashboardPageLoading } from "@/components/page-loading";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { excludeHomeBaseFromPortfolio } from "@/lib/account-filters";
import { excludeOutOfStock } from "@/lib/out-of-stock-products";
import { detectSlowingProductAlerts } from "@/lib/product-trends";
import {
  mergePortfolioAnalytics,
  portfolioStateCacheKey,
  readPortfolioCoreForFilteredState,
  readPortfolioHeavyForFilteredState,
  type PortfolioAnalyticsBundle,
  type PortfolioAnalyticsCacheEntry,
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

const getServerRepFilterSnapshot = () => "all";

function emptyOrderAnalytics(asOf: string): OrderAnalyticsSnapshot {
  return {
    asOf,
    dateRange: { start: null, end: null },
    totals: {
      orderLines: 0,
      totalVolume: 0,
      totalRevenue: 0,
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
    totalProjectedRevenue30: 0,
    totalProjectedRevenue90: 0,
    totalBaselineVolume90: 0,
    totalRiskAdjustedVolume90: 0,
    totalMonthlyVolumeAtRisk: 0,
    totalMonthlyRevenueAtRisk: 0,
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

function warmCoreForRep(
  cache: Map<string, PortfolioAnalyticsCacheEntry>,
  repIndex: ReturnType<typeof createRepPortfolioIndex>,
  rep: string,
): void {
  if (cache.get(rep)?.core) return;
  const slice = portfolioStateForRep(repIndex, rep);
  readPortfolioCoreForFilteredState(cache, rep, slice);
}

export function FilteredPortfolioProvider({ children }: { children: ReactNode }) {
  const { state, importParseResult, reset } = usePortfolio();
  const repFilter = useSyncExternalStore(
    subscribeRepFilter,
    getRepFilterSnapshot,
    getServerRepFilterSnapshot,
  );
  const { ids: outOfStockIds } = useOutOfStockProducts();

  const analyticsCacheRef = useRef<Map<string, PortfolioAnalyticsCacheEntry>>(new Map());
  const analyticsCacheSourceRef = useRef("");

  const visibleState = useMemo(
    () => excludeHomeBaseFromPortfolio(state),
    [state],
  );

  const visibleStateKey = useMemo(
    () => portfolioStateCacheKey(visibleState),
    [visibleState],
  );

  if (analyticsCacheSourceRef.current !== visibleStateKey) {
    analyticsCacheRef.current.clear();
    analyticsCacheSourceRef.current = visibleStateKey;
  }

  const repIndex = useMemo(
    () => createRepPortfolioIndex(visibleState),
    [visibleState, visibleStateKey],
  );

  const reps = useMemo(() => listSalesReps(visibleState), [visibleState]);

  const [coreEpoch, setCoreEpoch] = useState(0);
  const [heavyVersion, setHeavyVersion] = useState(0);
  const repFilterRef = useRef(repFilter);
  repFilterRef.current = repFilter;

  const hasPortfolioData = visibleState.accounts.length > 0;

  useLayoutEffect(() => {
    if (!hasPortfolioData) {
      setCoreEpoch((epoch) => epoch + 1);
      return;
    }
    const cache = analyticsCacheRef.current;
    if (cache.get(repFilter)?.core) return;
    warmCoreForRep(cache, repIndex, repFilter);
    setCoreEpoch((epoch) => epoch + 1);
  }, [visibleStateKey, repFilter, repIndex, hasPortfolioData]);

  useEffect(() => {
    if (!hasPortfolioData) return;
    const cache = analyticsCacheRef.current;
    if (cache.get("all")?.core) return;
    warmCoreForRep(cache, repIndex, "all");
    setCoreEpoch((epoch) => epoch + 1);
  }, [visibleStateKey, repIndex, hasPortfolioData]);

  useEffect(() => {
    if (!hasPortfolioData) return;
    const cache = analyticsCacheRef.current;
    const keys = listRepIndexKeys(repIndex, reps).filter(
      (key) => !cache.get(key)?.core,
    );
    if (keys.length === 0) return;

    let cancelled = false;
    let index = 0;

    const warmNext = () => {
      if (cancelled || index >= keys.length) return;
      const key = keys[index]!;
      index += 1;
      warmCoreForRep(cache, repIndex, key);
      if (key === repFilterRef.current) {
        setCoreEpoch((epoch) => epoch + 1);
      }
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(warmNext, { timeout: 2_000 });
      } else {
        window.setTimeout(warmNext, 0);
      }
    };

    warmNext();
    return () => {
      cancelled = true;
    };
  }, [visibleStateKey, repIndex, reps, hasPortfolioData]);

  useEffect(() => {
    if (!hasPortfolioData) return;
    const cache = analyticsCacheRef.current;
    let cancelled = false;
    const keys = listRepIndexKeys(repIndex, reps).sort((a, b) => {
      if (a === repFilterRef.current) return -1;
      if (b === repFilterRef.current) return 1;
      if (a === "all") return -1;
      if (b === "all") return 1;
      return a.localeCompare(b);
    });

    const warmNext = (index: number) => {
      if (cancelled || index >= keys.length) return;
      const key = keys[index]!;
      if (!cache.get(key)?.heavy) {
        const slice = portfolioStateForRep(repIndex, key);
        readPortfolioHeavyForFilteredState(cache, key, slice);
        if (key === repFilterRef.current) {
          setHeavyVersion((version) => version + 1);
        }
      }
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => warmNext(index + 1), { timeout: 2_000 });
      } else {
        window.setTimeout(() => warmNext(index + 1), 0);
      }
    };

    warmNext(0);
    return () => {
      cancelled = true;
    };
  }, [visibleStateKey, repIndex, reps, hasPortfolioData]);

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
    () => analyticsCacheRef.current.get(repFilter)?.core ?? null,
    [repFilter, visibleStateKey, coreEpoch],
  );
  const activeHeavy = useMemo(
    () => analyticsCacheRef.current.get(repFilter)?.heavy ?? null,
    [repFilter, visibleStateKey, heavyVersion],
  );

  const repFilterPending = Boolean(hasPortfolioData && !activeHeavy);

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

  const resetAll = useCallback(() => {
    reset();
    resetRepFilter();
  }, [reset]);

  const value = useMemo((): FilteredPortfolioContextValue | null => {
    if (!hasPortfolioData) {
      return {
        state: filteredState,
        fullState: state,
        snapshot: {
          asOf: visibleState.analysisAsOf ?? new Date().toISOString().slice(0, 10),
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
            revenue90: 0,
            revenueAtRisk: 0,
          },
        },
        repFilter,
        repFilterPending: false,
        setRepFilter,
        reps,
        importParseResult,
        reset: resetAll,
        orderAnalytics: emptyOrderAnalytics(
          visibleState.analysisAsOf ?? new Date().toISOString().slice(0, 10),
        ),
        enrichedAccounts: [],
        productTrends: {
          data: [],
          productSummaries: [],
          allProductsSorted: [],
          totalActiveProducts: 0,
          totalBottles: 0,
          totalRevenue: 0,
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
        productAlerts: [],
        projectionsSummary: emptyProjectionsSummary(),
        newAccounts: [],
        retainedAccounts: [],
        returningCustomers: [],
        lastOrderGaps: new Map(),
      };
    }

    if (!activeCore || !bundle) return null;
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
      frequencyAlerts: activeCore.frequencyAlerts,
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
  ]);

  if (!value) {
    return <DashboardPageLoading label="portfolio analytics" />;
  }

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
