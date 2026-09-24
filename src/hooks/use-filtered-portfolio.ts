"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { excludeHomeBaseFromPortfolio } from "@/lib/account-filters";
import {
  filterPortfolioByRep,
  getRepFilterSnapshot,
  listSalesReps,
  resetRepFilter,
  setRepFilter,
  subscribeRepFilter,
} from "@/lib/rep-filter";
import { buildSnapshot } from "@/lib/score";

const getServerRepFilterSnapshot = () => "all";

export function useFilteredPortfolio() {
  const { state, importParseResult, reset } = usePortfolio();
  const repFilter = useSyncExternalStore(
    subscribeRepFilter,
    getRepFilterSnapshot,
    getServerRepFilterSnapshot,
  );

  const visibleState = useMemo(
    () => excludeHomeBaseFromPortfolio(state),
    [state],
  );

  const reps = useMemo(() => listSalesReps(visibleState), [visibleState]);

  useEffect(() => {
    if (repFilter !== "all" && reps.length > 0 && !reps.includes(repFilter)) {
      resetRepFilter();
    }
  }, [repFilter, reps]);

  const filteredState = useMemo(
    () => filterPortfolioByRep(visibleState, repFilter),
    [visibleState, repFilter],
  );

  const snapshot = useMemo(
    () =>
      buildSnapshot(
        filteredState.accounts,
        filteredState.orders,
        filteredState.visits,
        filteredState.analysisAsOf,
      ),
    [filteredState],
  );

  const resetAll = useCallback(() => {
    reset();
    resetRepFilter();
  }, [reset]);

  return {
    state: filteredState,
    fullState: state,
    snapshot,
    repFilter,
    setRepFilter,
    reps,
    importParseResult,
    reset: resetAll,
  };
}
