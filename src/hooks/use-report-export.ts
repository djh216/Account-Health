"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { excludeHomeBaseFromPortfolio } from "@/lib/account-filters";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { useClosedBusinessAccounts } from "@/hooks/use-closed-business-accounts";
import { excludeOutOfStock, outOfStockProductId } from "@/lib/out-of-stock-products";
import { excludeClosedBusinessAccounts } from "@/lib/closed-business-accounts";
import {
  downloadFocusHealthPdf,
  downloadFrequencyAlertsPdf,
  downloadOrderAnalyticsPdf,
  downloadProductTrendsPdf,
  downloadRepActionPlansPdf,
  buildRepActionPlans,
  buildPdfAccountVisitLookup,
  type FocusHealthPdfInput,
  type FrequencyAlertsPdfInput,
  type OrderAnalyticsPdfInput,
  type ProductTrendsPdfInput,
  type RepActionPlansPdfInput,
} from "@/lib/report-export";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import { detectOrderFrequencyDrops } from "@/lib/frequency-alerts";
import { focusAccountsByHorizon } from "@/lib/score";
import { buildOrderAnalytics } from "@/lib/order-analytics";
import {
  buildProductTrendData,
  detectSlowingProductAlerts,
} from "@/lib/product-trends";
import { todayIso } from "@/lib/format";

export type ReportPageType = "health" | "orders" | "products";

export function useReportExport() {
  const pathname = usePathname();
  const { state, fullState, snapshot, repFilter, reps } = useFilteredPortfolio();
  const { ids: outOfStockIds } = useOutOfStockProducts();
  const { ids: closedAccountIds } = useClosedBusinessAccounts();
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Determine current active page
  const activePage: ReportPageType = useMemo(() => {
    if (pathname === "/orders") return "orders";
    if (pathname === "/products") return "products";
    return "health";
  }, [pathname]);

  const enrichedAccounts = useMemo(
    () => enrichAccountsWithTerritoryValue(snapshot.accounts, state.orders),
    [snapshot.accounts, state.orders],
  );

  const visibleFullState = useMemo(
    () => excludeHomeBaseFromPortfolio(fullState),
    [fullState],
  );

  const alerts = useMemo(
    () =>
      excludeClosedBusinessAccounts(
        detectOrderFrequencyDrops(
          enrichedAccounts,
          state.orders,
          state.analysisAsOf ?? snapshot.asOf,
        ),
        closedAccountIds,
      ),
    [enrichedAccounts, state.orders, state.analysisAsOf, snapshot.asOf, closedAccountIds],
  );

  const asOf = state.analysisAsOf ?? snapshot.asOf ?? todayIso();
  const generatedAt = asOf;

  const accountVisitLookup = useMemo(
    () => buildPdfAccountVisitLookup(enrichedAccounts),
    [enrichedAccounts],
  );

  // 1. Focus Health PDF Input
  const focusHealthInput = useMemo((): FocusHealthPdfInput | null => {
    if (enrichedAccounts.length === 0) return null;
    return {
      repFilter,
      asOf,
      generatedAt,
      focusByHorizon: focusAccountsByHorizon(enrichedAccounts),
      allAccounts: enrichedAccounts,
    };
  }, [enrichedAccounts, repFilter, asOf, generatedAt]);

  const repActionPlansInput = useMemo((): RepActionPlansPdfInput | null => {
    if (visibleFullState.accounts.length === 0) return null;
    const plans = buildRepActionPlans(visibleFullState, reps, repFilter);
    if (plans.length === 0) return null;
    return {
      repFilter,
      asOf,
      generatedAt,
      plans,
    };
  }, [visibleFullState, reps, repFilter, asOf, generatedAt]);

  // 2. Frequency Alerts PDF Input
  const frequencyAlertsInput = useMemo((): FrequencyAlertsPdfInput | null => {
    if (enrichedAccounts.length === 0) return null;
    return {
      repFilter,
      asOf,
      generatedAt,
      alerts,
      accountVisitLookup,
    };
  }, [enrichedAccounts.length, repFilter, asOf, generatedAt, alerts, accountVisitLookup]);

  // 3. Order Analytics PDF Input
  const orderAnalyticsInput = useMemo((): OrderAnalyticsPdfInput | null => {
    if (state.orders.length === 0 && enrichedAccounts.length === 0) return null;
    const analytics = buildOrderAnalytics(state.orders);
    return {
      repFilter,
      asOf,
      generatedAt,
      restaurantFrequency: analytics.byFrequency,
      topRestaurants: analytics.byRestaurant,
      totalOrders: analytics.totals.orderEvents || state.orders.length,
      totalBottles: analytics.totals.totalVolume,
      accountVisitLookup,
    };
  }, [state.orders, enrichedAccounts.length, repFilter, asOf, generatedAt, accountVisitLookup]);

  // 4. Product Trends PDF Input
  const productTrendsInput = useMemo((): ProductTrendsPdfInput | null => {
    if (state.orders.length === 0) return null;
    const trendData = buildProductTrendData({
      orders: state.orders,
      selectedProducts: [],
      timeframe: "12m",
      granularity: "monthly",
      asOf,
    });
    const slowingAlerts = excludeOutOfStock(
      detectSlowingProductAlerts(trendData.productSummaries),
      outOfStockIds,
    );
    const products = trendData.productSummaries.filter(
      (summary) => !outOfStockIds.has(outOfStockProductId(summary.productName)),
    );
    return {
      repFilter,
      asOf,
      generatedAt,
      products,
      slowingAlerts,
      totalBottles: trendData.totalBottles,
      accountVisitLookup,
    };
  }, [state.orders, repFilter, asOf, generatedAt, outOfStockIds, accountVisitLookup]);

  const canExport = snapshot.accounts.length > 0 || state.orders.length > 0;

  // Dedicated Exporters
  const exportFocusHealthPdf = useCallback(async () => {
    if (!focusHealthInput) {
      throw new Error("No account health data available to generate report. Load sample data or upload records first.");
    }
    setBusy(true);
    setBusyAction("Generating Account Health PDF…");
    try {
      downloadFocusHealthPdf(focusHealthInput);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [focusHealthInput]);

  const exportRepActionPlansPdf = useCallback(async () => {
    if (!repActionPlansInput) {
      throw new Error(
        "No account data available to build rep action plans. Load sample data or upload records first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Rep Action Plan PDF…");
    try {
      downloadRepActionPlansPdf(repActionPlansInput);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [repActionPlansInput]);

  const exportFrequencyAlertsPdf = useCallback(async () => {
    if (!frequencyAlertsInput) {
      throw new Error("No account data available to generate frequency alerts. Load sample data or upload records first.");
    }
    setBusy(true);
    setBusyAction("Generating Frequency Alerts PDF…");
    try {
      downloadFrequencyAlertsPdf(frequencyAlertsInput);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [frequencyAlertsInput]);

  const exportOrderAnalyticsPdf = useCallback(async () => {
    if (!orderAnalyticsInput) {
      throw new Error("No order analytics data available to generate report. Load sample data or upload orders first.");
    }
    setBusy(true);
    setBusyAction("Generating Order Analytics PDF…");
    try {
      downloadOrderAnalyticsPdf(orderAnalyticsInput);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [orderAnalyticsInput]);

  const exportProductTrendsPdf = useCallback(async () => {
    if (!productTrendsInput) {
      throw new Error("No product trends data available to generate report. Load sample data or upload orders first.");
    }
    setBusy(true);
    setBusyAction("Generating Product Trends PDF…");
    try {
      downloadProductTrendsPdf(productTrendsInput);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [productTrendsInput]);

  const exportCurrentPagePdf = useCallback(
    async (pageOverride?: ReportPageType) => {
      const page = pageOverride ?? activePage;
      switch (page) {
        case "orders":
          if (orderAnalyticsInput) {
            await exportOrderAnalyticsPdf();
            return "Order Analytics PDF downloaded.";
          }
          break;
        case "products":
          if (productTrendsInput) {
            await exportProductTrendsPdf();
            return "Product Sales Trends PDF downloaded.";
          }
          break;
        case "health":
        default:
          if (focusHealthInput) {
            await exportFocusHealthPdf();
            return "Account Health Report PDF downloaded.";
          }
          break;
      }

      // Fallback: If current page input isn't ready but alerts or another report is ready
      if (frequencyAlertsInput) {
        await exportFrequencyAlertsPdf();
        return "Frequency Alerts PDF downloaded.";
      }
      throw new Error("No data loaded. Please load sample data or upload accounts/orders first.");
    },
    [
      activePage,
      orderAnalyticsInput,
      productTrendsInput,
      focusHealthInput,
      frequencyAlertsInput,
      exportOrderAnalyticsPdf,
      exportProductTrendsPdf,
      exportFocusHealthPdf,
      exportFrequencyAlertsPdf,
    ],
  );

  // Backward-compatible alias for existing exportReport callers
  const exportReport = useCallback(
    async (page?: ReportPageType) => {
      if (page) {
        return exportCurrentPagePdf(page);
      }
      return exportFrequencyAlertsPdf();
    },
    [exportCurrentPagePdf, exportFrequencyAlertsPdf],
  );

  // Safe Print: Handles iframe sandbox constraints gracefully
  const triggerSafePrint = useCallback(
    async (pageOverride?: ReportPageType): Promise<{
      downloaded: boolean;
      printed: boolean;
      message: string;
    }> => {
      let isEmbedded = false;
      try {
        isEmbedded = typeof window !== "undefined" && window.self !== window.top;
      } catch {
        isEmbedded = true;
      }

      // In an embedded iframe (e.g. AI Studio preview), window.print() is blocked by browser sandbox
      // without allow-modals. Direct PDF download is 100% reliable and provides the printable document.
      if (isEmbedded) {
        try {
          const downloadMsg = await exportCurrentPagePdf(pageOverride);
          return {
            downloaded: true,
            printed: false,
            message: `${downloadMsg} (Browser print dialogs are restricted in preview frames).`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not export PDF.";
          throw new Error(msg);
        }
      }

      // Top-level tab: Try window.print()
      try {
        window.print();
        return {
          downloaded: false,
          printed: true,
          message: "Print dialog opened. Select 'Save as PDF' or your printer.",
        };
      } catch {
        // If window.print fails, automatically fallback to direct PDF generation
        const downloadMsg = await exportCurrentPagePdf(pageOverride);
        return {
          downloaded: true,
          printed: false,
          message: `${downloadMsg} (Generated directly via PDF download).`,
        };
      }
    },
    [exportCurrentPagePdf],
  );

  return {
    busy,
    busyAction,
    canExport,
    alertsCount: alerts.length,
    activePage,
    repFilter,
    asOf,
    exportReport,
    exportCurrentPagePdf,
    exportFocusHealthPdf,
    exportRepActionPlansPdf,
    exportFrequencyAlertsPdf,
    exportOrderAnalyticsPdf,
    exportProductTrendsPdf,
    triggerSafePrint,
    hasHealthData: Boolean(focusHealthInput),
    hasRepActionPlanData: Boolean(repActionPlansInput),
    hasOrderData: Boolean(orderAnalyticsInput),
    hasProductData: Boolean(productTrendsInput),
    hasAlertsData: Boolean(frequencyAlertsInput),
  };
}
