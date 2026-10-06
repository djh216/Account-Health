"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import type { BuildSalesInsightsInput } from "@/lib/sales-insights/build-sales-insights";
import {
  getCachedSalesInsights,
  getOrBuildSalesInsights,
  subscribeSalesInsights,
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

function insightsInputKey(input: BuildSalesInsightsInput, portfolioKey: string): string {
  return [
    portfolioKey,
    input.repFilter,
    input.enrichedAccounts.length,
    input.portfolioState.orders.length,
    input.asOf,
  ].join("|");
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

  const inputKey = useMemo(
    () => (input && portfolioKey ? insightsInputKey(input, portfolioKey) : ""),
    [input, portfolioKey],
  );

  const inputRef = useRef(input);
  inputRef.current = input;
  const portfolioKeyRef = useRef(portfolioKey);
  portfolioKeyRef.current = portfolioKey;

  const insights = useSyncExternalStore(
    subscribeSalesInsights,
    (): SalesInsightsBundle | null => {
      const currentInput = inputRef.current;
      const key = portfolioKeyRef.current;
      if (!currentInput || !key) return null;
      return getCachedSalesInsights(key, currentInput.repFilter, currentInput) ?? null;
    },
    (): SalesInsightsBundle | null => null,
  );

  useEffect(() => {
    if (!input || !portfolioKey || !inputKey) return;

    if (getCachedSalesInsights(portfolioKey, input.repFilter, input)) {
      return;
    }

    let cancelled = false;

    const compute = () => {
      if (cancelled) return;
      getOrBuildSalesInsights(portfolioKey, input);
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
  }, [inputKey, input, portfolioKey]);

  const insightsPending = Boolean(input && portfolioKey && !insights);

  return { insights, insightsPending };
}
