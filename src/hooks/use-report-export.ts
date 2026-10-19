"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parseDashboardView, dashboardViewToReportPage } from "@/lib/dashboard-view";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { excludeHomeBaseFromPortfolio } from "@/lib/account-filters";
import { buildFocusHealthPdfArtifact } from "@/lib/generate-focus-health-pdf";
import { buildAccountOrderTrackingPdfArtifact } from "@/lib/generate-account-order-tracking-pdf";
import { buildOrderAnalyticsPdfArtifact } from "@/lib/generate-order-analytics-pdf";
import { buildProductTrendsPdfArtifact } from "@/lib/generate-product-trends-pdf";
import { buildSalesInsightsPdfArtifact } from "@/lib/generate-sales-insights-pdf";
import {
  buildRepActionPlans,
  buildPdfAccountVisitLookup,
} from "@/lib/report-export";
import { revokePdfArtifact, type PdfExportArtifact } from "@/lib/pdf-present";
import {
  closedBusinessAccountId,
  isAccountClosedBusiness,
} from "@/lib/closed-business-accounts";
import { useClosedBusinessAccounts } from "@/hooks/use-closed-business-accounts";
import {
  excludeOutOfStockWinBackSkus,
  outOfStockProductId,
} from "@/lib/out-of-stock-products";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { focusAccountsByHorizon } from "@/lib/score";
import { normalizeName, todayIso } from "@/lib/format";
import { sortAccountTrackingRows } from "@/lib/order-analytics";
import { assembleSalesInsightsInput, useSalesInsights } from "@/hooks/use-sales-insights";
import { portfolioStateCacheKey } from "@/lib/portfolio-analytics-bundle";
import {
  getOrBuildSalesInsights,
} from "@/lib/sales-insights/sales-insights-cache";
import type { SalesInsightsBundle } from "@/lib/sales-insights/types";

export type ReportPageType = "health" | "orders" | "products" | "insights";

export type PdfPreviewSession = {
  title: string;
  artifact: PdfExportArtifact;
};

/** Single instance — mount via ReportExportProvider only. */
export function useReportExportController() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    state,
    fullState,
    snapshot,
    repFilter,
    repFilterPending,
    reps,
    enrichedAccounts,
    frequencyAlerts,
    orderAnalytics,
    productTrends,
    productAlerts,
    projectionsSummary,
    newAccounts,
    retainedAccounts,
    returningCustomers,
  } = useFilteredPortfolio();
  const { ids: outOfStockIds } = useOutOfStockProducts();
  const { ids: closedAccountIds } = useClosedBusinessAccounts();
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewSession | null>(null);

  const openPdfPreview = useCallback((title: string, artifact: PdfExportArtifact) => {
    setPdfPreview((previous) => {
      revokePdfArtifact(previous?.artifact);
      return { title, artifact };
    });
  }, []);

  const closePdfPreview = useCallback(() => {
    setPdfPreview((previous) => {
      revokePdfArtifact(previous?.artifact);
      return null;
    });
  }, []);

  const { insights } = useSalesInsights();

  const activePage: ReportPageType = useMemo(() => {
    if (pathname === "/orders") return "orders";
    if (pathname === "/products") return "products";
    if (pathname === "/insights") return "insights";
    if (pathname === "/") {
      const view = parseDashboardView(searchParams.get("view"));
      const grain = searchParams.get("grain") === "product" ? "product" : "account";
      return dashboardViewToReportPage(view, grain);
    }
    return "health";
  }, [pathname, searchParams]);

  const visibleFullState = useMemo(
    () => excludeHomeBaseFromPortfolio(fullState),
    [fullState],
  );

  const asOf = state.analysisAsOf ?? snapshot.asOf ?? todayIso();

  const hasRepActionPlanData = useMemo(() => {
    if (visibleFullState.accounts.length === 0) return false;
    return buildRepActionPlans(visibleFullState, reps, repFilter).length > 0;
  }, [visibleFullState, reps, repFilter]);

  const canExport = snapshot.accounts.length > 0 || state.orders.length > 0;
  const hasHealthData = enrichedAccounts.length > 0;
  const hasAlertsData = frequencyAlerts.length > 0;
  const hasOrderData =
    orderAnalytics.totals.orderEvents > 0 ||
    state.orders.length > 0 ||
    enrichedAccounts.length > 0;
  const hasProductData = productTrends.productSummaries.length > 0;
  const hasProductSlowdownData = productAlerts.length > 0;

  const imminentChurnAccounts = useMemo(
    () =>
      projectionsSummary.accounts.filter(
        (account) =>
          account.churnTier === "high" &&
          !closedAccountIds.has(closedBusinessAccountId(account.accountName)),
      ),
    [projectionsSummary.accounts, closedAccountIds],
  );

  const hasImminentChurnData = imminentChurnAccounts.length > 0;

  const insightsBuildInput = useMemo(
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
    ],
  );

  const hasInsightsData = insights !== null;
  const hasWeeklyBriefingData = hasInsightsData || insightsBuildInput !== null;
  const hasSalesInsightsPackData = hasWeeklyBriefingData;

  const resolveInsightsBundle = useCallback((): SalesInsightsBundle => {
    if (insights) return insights;
    if (!insightsBuildInput) {
      throw new Error(
        "No account data available to generate reports. Load sample data or upload records first.",
      );
    }
    const portfolioKey = portfolioStateCacheKey(insightsBuildInput.portfolioState);
    return getOrBuildSalesInsights(portfolioKey, insightsBuildInput);
  }, [insights, insightsBuildInput]);

  const exportFocusHealthPdf = useCallback(async () => {
    if (!hasHealthData) {
      throw new Error(
        "No account health data available to generate report. Load sample data or upload records first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Account Health PDF…");
    try {
      openPdfPreview(
        "Account health",
        buildFocusHealthPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          focusByHorizon: focusAccountsByHorizon(enrichedAccounts),
          allAccounts: enrichedAccounts,
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [hasHealthData, openPdfPreview, repFilter, asOf, enrichedAccounts]);

  const buildWeeklyRepPackArtifact = useCallback(() => {
    const bundle = resolveInsightsBundle();
    return buildSalesInsightsPdfArtifact({
      repFilter,
      generatedAt: asOf,
      insights: {
        ...bundle,
        winBackSkus: excludeOutOfStockWinBackSkus(bundle.winBackSkus, outOfStockIds),
      },
      focusByHorizon: focusAccountsByHorizon(enrichedAccounts),
      frequencyAlerts,
      churnAccounts: imminentChurnAccounts,
      productSlowdownAlerts: productAlerts,
    });
  }, [
    resolveInsightsBundle,
    repFilter,
    asOf,
    outOfStockIds,
    enrichedAccounts,
    frequencyAlerts,
    imminentChurnAccounts,
    productAlerts,
  ]);

  const exportRepActionPlansPdf = useCallback(async () => {
    setBusy(true);
    setBusyAction("Generating weekly rep pack…");
    try {
      openPdfPreview("Weekly rep pack", buildWeeklyRepPackArtifact());
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [buildWeeklyRepPackArtifact, openPdfPreview]);

  const exportFrequencyAlertsPdf = useCallback(async () => {
    if (!hasAlertsData && !insightsBuildInput) {
      throw new Error(
        "No account data available to generate reports. Load sample data or upload records first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating weekly rep pack…");
    try {
      openPdfPreview("Weekly rep pack", buildWeeklyRepPackArtifact());
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [hasAlertsData, insightsBuildInput, buildWeeklyRepPackArtifact, openPdfPreview]);

  const accountOrderTrackingRows = useMemo(() => {
    const healthByAccountName = new Map(
      enrichedAccounts.map((item) => [normalizeName(item.account.name), item]),
    );
    return sortAccountTrackingRows(
      orderAnalytics.byAccount
        .filter((row) => !isAccountClosedBusiness(row.accountName, closedAccountIds))
        .map((row) => {
          const health = healthByAccountName.get(normalizeName(row.accountName));
          return {
            ...row,
            healthScore: health?.score ?? null,
            healthScoreChange14d: health?.scoreChange14d ?? null,
            territoryRank: health?.territoryRank ?? null,
          };
        }),
      "territoryRank",
      "asc",
    );
  }, [orderAnalytics.byAccount, enrichedAccounts, closedAccountIds]);

  const exportAccountOrderTrackingPdf = useCallback(async () => {
    if (!hasOrderData || accountOrderTrackingRows.length === 0) {
      throw new Error(
        "No account order tracking data available. Load sample data or upload orders first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating account order tracking PDF…");
    try {
      openPdfPreview(
        "Account order tracking",
        buildAccountOrderTrackingPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          rows: accountOrderTrackingRows,
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    hasOrderData,
    accountOrderTrackingRows,
    openPdfPreview,
    repFilter,
    asOf,
  ]);

  const exportOrderAnalyticsPdf = useCallback(async () => {
    if (!hasOrderData) {
      throw new Error(
        "No order analytics data available to generate report. Load sample data or upload orders first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Order Analytics PDF…");
    try {
      openPdfPreview(
        "Order analytics",
        buildOrderAnalyticsPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          restaurantFrequency: orderAnalytics.byFrequency,
          topRestaurants: orderAnalytics.byRestaurant,
          totalOrders: orderAnalytics.totals.orderEvents || state.orders.length,
          totalBottles: orderAnalytics.totals.totalVolume,
          accountVisitLookup: buildPdfAccountVisitLookup(enrichedAccounts),
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    hasOrderData,
    openPdfPreview,
    repFilter,
    asOf,
    orderAnalytics,
    state.orders.length,
    enrichedAccounts,
  ]);

  const exportProductTrendsPdf = useCallback(async () => {
    if (!hasProductData) {
      throw new Error(
        "No product trends data available to generate report. Load sample data or upload orders first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Product Trends PDF…");
    try {
      const products = productTrends.productSummaries.filter(
        (summary) => !outOfStockIds.has(outOfStockProductId(summary.productName)),
      );
      openPdfPreview(
        "Product sales trends",
        buildProductTrendsPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          products,
          slowingAlerts: productAlerts,
          totalBottles: productTrends.totalBottles,
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    hasProductData,
    openPdfPreview,
    repFilter,
    asOf,
    productTrends,
    productAlerts,
    outOfStockIds,
    enrichedAccounts,
  ]);

  const exportSalesInsightsPackPdf = useCallback(async () => {
    setBusy(true);
    setBusyAction("Generating weekly rep pack…");
    try {
      openPdfPreview("Weekly rep pack", buildWeeklyRepPackArtifact());
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [buildWeeklyRepPackArtifact, openPdfPreview]);

  const exportProductSlowdownPdf = useCallback(async () => {
    await exportProductTrendsPdf();
  }, [exportProductTrendsPdf]);

  const exportImminentChurnPdf = useCallback(async () => {
    await exportSalesInsightsPackPdf();
  }, [exportSalesInsightsPackPdf]);

  const exportWeeklyBriefingPdf = useCallback(async () => {
    await exportSalesInsightsPackPdf();
  }, [exportSalesInsightsPackPdf]);

  const exportCurrentPagePdf = useCallback(
    async (pageOverride?: ReportPageType) => {
      const page = pageOverride ?? activePage;
      switch (page) {
        case "insights":
          if (hasWeeklyBriefingData) {
            await exportSalesInsightsPackPdf();
            return "Weekly rep pack PDF opened.";
          }
          break;
        case "orders":
          if (hasOrderData) {
            await exportAccountOrderTrackingPdf();
            return "Account order tracking PDF opened.";
          }
          break;
        case "products":
          if (hasProductData) {
            await exportProductTrendsPdf();
            return "Product trends PDF opened.";
          }
          break;
        case "health":
        default:
          if (hasHealthData || hasWeeklyBriefingData) {
            await exportSalesInsightsPackPdf();
            return "Weekly rep pack PDF opened.";
          }
          break;
      }

      if (hasAlertsData || hasWeeklyBriefingData) {
        await exportSalesInsightsPackPdf();
        return "Weekly rep pack PDF opened.";
      }
      throw new Error("No data loaded. Please load sample data or upload accounts/orders first.");
    },
    [
      activePage,
      hasOrderData,
      hasProductData,
      hasHealthData,
      hasAlertsData,
      exportAccountOrderTrackingPdf,
      exportOrderAnalyticsPdf,
      exportProductTrendsPdf,
      exportSalesInsightsPackPdf,
      hasWeeklyBriefingData,
    ],
  );

  const exportReport = useCallback(
    async (page?: ReportPageType) => {
      if (page) {
        return exportCurrentPagePdf(page);
      }
      return exportSalesInsightsPackPdf();
    },
    [exportCurrentPagePdf, exportSalesInsightsPackPdf],
  );

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

      try {
        window.print();
        return {
          downloaded: false,
          printed: true,
          message: "Print dialog opened. Select 'Save as PDF' or your printer.",
        };
      } catch {
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
    alertsCount: frequencyAlerts.length,
    activePage,
    repFilter,
    asOf,
    exportReport,
    exportCurrentPagePdf,
    exportFocusHealthPdf,
    exportRepActionPlansPdf,
    exportFrequencyAlertsPdf,
    exportAccountOrderTrackingPdf,
    exportOrderAnalyticsPdf,
    exportProductTrendsPdf,
    exportProductSlowdownPdf,
    exportImminentChurnPdf,
    exportWeeklyBriefingPdf,
    exportSalesInsightsPackPdf,
    triggerSafePrint,
    hasHealthData,
    hasRepActionPlanData,
    hasOrderData,
    hasProductData,
    hasAlertsData,
    hasProductSlowdownData,
    hasImminentChurnData,
    hasWeeklyBriefingData,
    hasSalesInsightsPackData,
    pdfPreview,
    closePdfPreview,
  };
}

export type ReportExportController = ReturnType<typeof useReportExportController>;
