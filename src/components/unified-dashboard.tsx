"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { DashboardShell } from "@/components/dashboard-shell";
import { OrderAnalyticsDashboard } from "@/components/order-analytics-dashboard";
import { SalesInsightsDashboard } from "@/components/sales-insights-dashboard";
import { TrendsDashboardView } from "@/components/trends-dashboard-view";
import {
  parseDashboardView,
  type DashboardViewId,
  type TrendsGrain,
} from "@/lib/dashboard-view";

export function UnifiedDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView = useMemo(
    () => parseDashboardView(searchParams.get("view")),
    [searchParams],
  );
  const trendsGrain: TrendsGrain =
    searchParams.get("grain") === "product" ? "product" : "account";

  const setView = useCallback(
    (view: DashboardViewId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", view);
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setTrendsGrainAndUrl = useCallback(
    (grain: TrendsGrain) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "trends");
      params.set("grain", grain);
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <DashboardShell
      activeView={activeView}
      onViewChange={setView}
      trendsGrain={trendsGrain}
    >
      {activeView === "insights" ? <SalesInsightsDashboard embedded /> : null}
      {activeView === "health" ? <Dashboard embedded /> : null}
      {activeView === "orders" ? <OrderAnalyticsDashboard embedded /> : null}
      {activeView === "trends" ? (
        <TrendsDashboardView grain={trendsGrain} onGrainChange={setTrendsGrainAndUrl} />
      ) : null}
    </DashboardShell>
  );
}
