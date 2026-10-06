"use client";

import { useEffect, useMemo, useState } from "react";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import type { BuildSalesInsightsInput } from "@/lib/sales-insights/build-sales-insights";
import {
  getCachedSalesInsights,
  getOrBuildSalesInsights,
} from "@/lib/sales-insights/sales-insights-cache";
import type { SalesInsightsBundle } from "@/lib/sales-insights/types";
import { todayIso } from "@/lib/format";
import { portfolioStateCacheKey } from "@/lib/portfolio-analytics-bundle";

export function assembleSalesInsightsInput(
  portfolio: Pick<
    ReturnType<typeof useFilteredPortfolio>,
    | "enrichedAccounts"
    | "repFilter"
    | "frequencyAlerts"
    | "productAlerts"
    | "newAccounts"
    | "retainedAccounts"
    | "returningCustomers"
    | "projectionsSummary"
    | "state"
    | "snapshot"
    | "repFilterPending"
  >,
): BuildSalesInsightsInput | null {
  const {
    enrichedAccounts,
    repFilter,
    frequencyAlerts,
    productAlerts,
    newAccounts,
    retainedAccounts,
    returningCustomers,
    projectionsSummary,
    state,
    snapshot,
    repFilterPending,
  } = portfolio;

  if (repFilterPending || enrichedAccounts.length === 0) return null;

  const asOf = state.analysisAsOf ?? snapshot.asOf ?? todayIso();

  return {
    repFilter,
    asOf,
    portfolioState: state,
    enrichedAccounts,
    frequencyAlerts,
    productAlerts,
    newAccountsCount: newAccounts.length,
    retainedCount: retainedAccounts.length,
    returningCount: returningCustomers.length,
    highChurnCount: projectionsSummary.highChurnCount,
  };
}

export function useSalesInsights(): {
  insights: SalesInsightsBundle | null;
  insightsPending: boolean;
} {
  const {
    enrichedAccounts,
    repFilter,
    frequencyAlerts,
    productAlerts,
    newAccounts,
    retainedAccounts,
    returningCustomers,
    projectionsSummary,
    state,
    snapshot,
    repFilterPending,
  } = useFilteredPortfolio();

  const portfolioScopeKey = portfolioStateCacheKey(state);

  const input = useMemo(
    () =>
      assembleSalesInsightsInput({
        enrichedAccounts,
        repFilter,
        frequencyAlerts,
        productAlerts,
        newAccounts,
        retainedAccounts,
        returningCustomers,
        projectionsSummary,
        state,
        snapshot,
        repFilterPending,
      }),
    [
      repFilterPending,
      enrichedAccounts,
      repFilter,
      frequencyAlerts,
      productAlerts,
      newAccounts.length,
      retainedAccounts.length,
      returningCustomers.length,
      projectionsSummary.highChurnCount,
      portfolioScopeKey,
      snapshot.asOf,
      state.analysisAsOf,
    ],
  );

  const portfolioKey = useMemo(
    () => (input ? portfolioStateCacheKey(input.portfolioState) : ""),
    [input],
  );

  const [insights, setInsights] = useState<SalesInsightsBundle | null>(() => {
    if (!input || !portfolioKey) return null;
    return getCachedSalesInsights(portfolioKey, input.repFilter) ?? null;
  });

  const [insightsPending, setInsightsPending] = useState(() => {
    if (!input || !portfolioKey) return false;
    return !getCachedSalesInsights(portfolioKey, input.repFilter);
  });

  useEffect(() => {
    if (!input || !portfolioKey) {
      setInsights(null);
      setInsightsPending(false);
      return;
    }

    const cached = getCachedSalesInsights(portfolioKey, input.repFilter);
    if (cached) {
      setInsights(cached);
      setInsightsPending(false);
      return;
    }

    setInsightsPending(true);
    let cancelled = false;

    const compute = () => {
      if (cancelled) return;
      const built = getOrBuildSalesInsights(portfolioKey, input);
      if (cancelled) return;
      setInsights(built);
      setInsightsPending(false);
    };

    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(compute, { timeout: 120 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }

    const timerId = window.setTimeout(compute, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [input, portfolioKey]);

  return { insights, insightsPending };
}
