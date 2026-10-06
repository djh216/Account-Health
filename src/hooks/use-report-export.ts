"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { excludeHomeBaseFromPortfolio } from "@/lib/account-filters";
import { buildFocusHealthPdfArtifact } from "@/lib/generate-focus-health-pdf";
import { buildFrequencyAlertsPdfArtifact } from "@/lib/generate-frequency-alerts-pdf";
import { buildOrderAnalyticsPdfArtifact } from "@/lib/generate-order-analytics-pdf";
import { buildProductTrendsPdfArtifact } from "@/lib/generate-product-trends-pdf";
import { buildRepActionPlansPdfArtifact } from "@/lib/generate-rep-action-plan-pdf";
import { buildProductSlowdownPdfArtifact } from "@/lib/generate-product-slowdown-pdf";
import { buildImminentChurnPdfArtifact } from "@/lib/generate-imminent-churn-pdf";
import {
  buildRepActionPlans,
  buildPdfAccountVisitLookup,
} from "@/lib/report-export";
import { revokePdfArtifact, type PdfExportArtifact } from "@/lib/pdf-present";
import { closedBusinessAccountId } from "@/lib/closed-business-accounts";
import { useClosedBusinessAccounts } from "@/hooks/use-closed-business-accounts";
import {
  excludeOutOfStockWinBackSkus,
  outOfStockProductId,
} from "@/lib/out-of-stock-products";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { focusAccountsByHorizon } from "@/lib/score";
import { todayIso } from "@/lib/format";
import { useSalesInsights } from "@/hooks/use-sales-insights";
import { buildWeeklyBriefingPdfArtifact } from "@/lib/generate-weekly-briefing-pdf";
import { buildSalesInsightsPdfArtifact } from "@/lib/generate-sales-insights-pdf";

export type ReportPageType = "health" | "orders" | "products" | "insights";

export type PdfPreviewSession = {
  title: string;
  artifact: PdfExportArtifact;
};

/** Single instance — mount via ReportExportProvider only. */
export function useReportExportController() {
  const pathname = usePathname();
  const {
    state,
    fullState,
    snapshot,
    repFilter,
    reps,
    enrichedAccounts,
    frequencyAlerts,
    orderAnalytics,
    productTrends,
    productAlerts,
    projectionsSummary,
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
    return "health";
  }, [pathname]);

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
  const hasInsightsData = insights !== null;
  const hasWeeklyBriefingData = hasInsightsData;
  const hasSalesInsightsPackData = hasInsightsData;

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

  const exportRepActionPlansPdf = useCallback(async () => {
    const plans = buildRepActionPlans(visibleFullState, reps, repFilter);
    if (plans.length === 0) {
      throw new Error(
        "No account data available to build rep action plans. Load sample data or upload records first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Rep Action Plan PDF…");
    try {
      openPdfPreview(
        "Rep action plan (weeks 1–3)",
        buildRepActionPlansPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          plans,
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [visibleFullState, reps, repFilter, asOf, openPdfPreview]);

  const exportFrequencyAlertsPdf = useCallback(async () => {
    if (!hasAlertsData) {
      throw new Error(
        "No account data available to generate frequency alerts. Load sample data or upload records first.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Frequency Alerts PDF…");
    try {
      openPdfPreview(
        "Frequency drop alerts",
        buildFrequencyAlertsPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          alerts: frequencyAlerts,
          accountVisitLookup: buildPdfAccountVisitLookup(enrichedAccounts),
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    hasAlertsData,
    openPdfPreview,
    repFilter,
    asOf,
    frequencyAlerts,
    enrichedAccounts,
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

  const exportProductSlowdownPdf = useCallback(async () => {
    if (!hasProductSlowdownData) {
      throw new Error(
        "No product slowdown alerts to export. Load orders and check the alerts panel.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Product Slowdown PDF…");
    try {
      openPdfPreview(
        "Product slowdown report",
        buildProductSlowdownPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          alerts: productAlerts,
          accountVisitLookup: buildPdfAccountVisitLookup(enrichedAccounts),
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    hasProductSlowdownData,
    openPdfPreview,
    repFilter,
    asOf,
    productAlerts,
    enrichedAccounts,
  ]);

  const exportImminentChurnPdf = useCallback(async () => {
    if (!hasImminentChurnData) {
      throw new Error(
        "No high-churn accounts to export. Open volume projections after loading order history.",
      );
    }
    setBusy(true);
    setBusyAction("Generating Imminent Churn PDF…");
    try {
      openPdfPreview(
        "Imminent churn intervention",
        buildImminentChurnPdfArtifact({
          repFilter,
          asOf,
          generatedAt: asOf,
          accounts: imminentChurnAccounts,
          accountVisitLookup: buildPdfAccountVisitLookup(enrichedAccounts),
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [
    hasImminentChurnData,
    openPdfPreview,
    repFilter,
    asOf,
    imminentChurnAccounts,
    enrichedAccounts,
  ]);

  const exportWeeklyBriefingPdf = useCallback(async () => {
    if (!insights) {
      throw new Error("Insights are not ready yet. Wait for analytics to load.");
    }
    setBusy(true);
    setBusyAction("Generating Weekly Briefing PDF…");
    try {
      openPdfPreview(
        "Weekly book briefing",
        buildWeeklyBriefingPdfArtifact({
          repFilter,
          generatedAt: asOf,
          briefing: insights.weeklyBriefing,
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [insights, openPdfPreview, repFilter, asOf]);

  const exportSalesInsightsPackPdf = useCallback(async () => {
    if (!insights) {
      throw new Error("Insights are not ready yet. Wait for analytics to load.");
    }
    setBusy(true);
    setBusyAction("Generating Sales Insights PDF…");
    try {
      openPdfPreview(
        "Sales insights pack",
        buildSalesInsightsPdfArtifact({
          repFilter,
          generatedAt: asOf,
          insights: {
            ...insights,
            winBackSkus: excludeOutOfStockWinBackSkus(insights.winBackSkus, outOfStockIds),
          },
        }),
      );
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [insights, openPdfPreview, repFilter, asOf, outOfStockIds]);

  const exportCurrentPagePdf = useCallback(
    async (pageOverride?: ReportPageType) => {
      const page = pageOverride ?? activePage;
      switch (page) {
        case "insights":
          if (hasWeeklyBriefingData) {
            await exportWeeklyBriefingPdf();
            return "Weekly book briefing PDF opened.";
          }
          break;
        case "orders":
          if (hasOrderData) {
            await exportOrderAnalyticsPdf();
            return "Order analytics PDF opened.";
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
          if (hasHealthData) {
            await exportFocusHealthPdf();
            return "Account health PDF opened.";
          }
          break;
      }

      if (hasAlertsData) {
        await exportFrequencyAlertsPdf();
        return "Frequency alerts PDF opened.";
      }
      throw new Error("No data loaded. Please load sample data or upload accounts/orders first.");
    },
    [
      activePage,
      hasOrderData,
      hasProductData,
      hasHealthData,
      hasAlertsData,
      exportOrderAnalyticsPdf,
      exportProductTrendsPdf,
      exportFocusHealthPdf,
      exportFrequencyAlertsPdf,
      hasWeeklyBriefingData,
      exportWeeklyBriefingPdf,
    ],
  );

  const exportReport = useCallback(
    async (page?: ReportPageType) => {
      if (page) {
        return exportCurrentPagePdf(page);
      }
      return exportFrequencyAlertsPdf();
    },
    [exportCurrentPagePdf, exportFrequencyAlertsPdf],
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
