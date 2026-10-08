"use client";

import {
  startTransition,
  useDeferredValue,
  useId,
  useMemo,
  useState,
} from "react";
import { parseISO, startOfMonth, startOfWeek } from "date-fns";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart2,
  Bell,
  Check,
  Download,
  FileText,
  Printer,
  Search,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Upload,
  Wine,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { SiteNav } from "@/components/site-nav";
import { RepFilterSelect } from "@/components/rep-filter-select";
import { ClearDataButton } from "@/components/clear-data-button";
import { PrintReportButton } from "@/components/print-report-button";
import { UploadDialog } from "@/components/upload-dialog";
import { TrendPointAnalyticsDialog } from "@/components/trend-point-analytics-dialog";
import { ProductSlowdownReportDialog } from "@/components/product-slowdown-report-dialog";
import {
  NotificationSidebar,
  NotificationSidebarTrigger,
} from "@/components/notification-sidebar";
import {
  augmentDataWithTrendlines,
  getSafeTrendKey,
  describeFitConfidence,
  formatTrendSlope,
  type TrendlineDefinition,
} from "@/lib/trendline";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney, formatNumber, formatPct } from "@/lib/format";
import { generateSampleWinePortfolio } from "@/lib/sample-data";
import { setPortfolio } from "@/lib/portfolio-store";
import { excludeOutOfStock, outOfStockProductId } from "@/lib/out-of-stock-products";
import {
  buildProductTrendData,
  deriveProductTrendHighlights,
  PRODUCT_PALETTE,
  type ProductTrendDataResult,
  type ProductSummary,
  type ProductTrajectory,
  type ProductTrendGranularity,
  type ProductTrendMetric,
  type ProductTrendTimeframe,
  type ProductTrendPoint,
  detectSlowingProductAlerts,
  formatProductTrendChartAxisTick,
  productTrendGranularityLabel,
  thirtyDayTrendPeriodBounds,
} from "@/lib/product-trends";
import {
  ExcludeProductOutOfStockButton,
  ExcludedProductsPanel,
} from "@/components/analytics-exclusion-controls";
import { cn } from "@/lib/utils";
import { buildPdfAccountVisitLookup } from "@/lib/report-export";

/** Read a series value by its real key. Recharts string dataKeys split on "." */
function seriesValue(point: ProductTrendPoint, key: string): number {
  const value = point[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Recharts treats "." as a nested path, which breaks names like "1.5L". */
function chartFieldKey(sourceKey: string): string {
  return sourceKey.includes(".") ? `series__${sourceKey.replace(/\./g, "_")}` : sourceKey;
}

type SortField =
  | "productName"
  | "totalBottles"
  | "avgBottlesPerOrder"
  | "avgBottlesPerMonth"
  | "accountCount"
  | "velocityDeltaPct"
  | "quarterlyPaceDeltaPct"
  | "paceDelta30dPct"
  | "paceLast3Months"
  | "lastOrderDate";

type TrajectoryScope = "28d" | "30d" | "90d";

type TrajectoryFilter = "all" | ProductTrajectory;

function trajectoryForScope(summary: ProductSummary, scope: TrajectoryScope): ProductTrajectory {
  if (scope === "90d") return summary.quarterlyTrajectory;
  if (scope === "30d") return summary.pace30dTrajectory;
  return summary.trajectory;
}

function trajectoryScopeWindowLabel(scope: TrajectoryScope): string {
  if (scope === "90d") return "90d";
  if (scope === "30d") return "30d";
  return "28d";
}

function TrajectoryPill({
  trajectory,
  showWindow = false,
  windowLabel,
  compact = false,
}: {
  trajectory: ProductTrajectory;
  showWindow?: boolean;
  windowLabel?: string;
  compact?: boolean;
}) {
  const windowText = windowLabel ?? (showWindow ? "28d" : "");
  const suffix = windowText && !compact ? ` (${windowText})` : "";
  const base = compact
    ? "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
    : "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

  switch (trajectory) {
    case "accelerating":
      return (
        <span
          className={cn(
            base,
            "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400",
          )}
        >
          {!compact && <ArrowUpRight className="size-3" />}
          {compact ? "Accel" : `Accelerating${suffix}`}
        </span>
      );
    case "steady":
      return (
        <span
          className={cn(
            base,
            compact ? "font-medium" : "",
            "bg-muted text-muted-foreground",
          )}
        >
          {compact ? "Steady" : `Steady${suffix}`}
        </span>
      );
    case "decelerating":
      return (
        <span
          className={cn(
            base,
            "bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400",
          )}
        >
          {!compact && <ArrowDownRight className="size-3" />}
          {compact ? "Decel" : `Decelerating${suffix}`}
        </span>
      );
    case "new":
      return (
        <span
          className={cn(
            base,
            "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400",
          )}
        >
          {!compact && <Sparkles className="size-3" />}
          {compact ? "New" : `New Wine${suffix}`}
        </span>
      );
    case "dormant":
      return (
        <span
          className={cn(
            base,
            compact ? "font-medium" : "",
            "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400",
          )}
        >
          {compact ? "Dormant" : `Dormant${suffix}`}
        </span>
      );
  }
}

function catalogDeltaClass(delta: number): string {
  if (delta > 0) return "text-emerald-700 dark:text-emerald-400";
  if (delta < 0) return "text-rose-700 dark:text-rose-400";
  return "text-muted-foreground";
}

function catalogTrajectorySortField(scope: TrajectoryScope): SortField {
  if (scope === "90d") return "quarterlyPaceDeltaPct";
  if (scope === "30d") return "paceDelta30dPct";
  return "velocityDeltaPct";
}

function catalogTrajectoryHeader(scope: TrajectoryScope): string {
  if (scope === "90d") return "90d pace vs prior";
  if (scope === "30d") return "30d pace vs prior";
  return "28d velocity";
}

function CatalogTrajectoryCell({
  summary,
  scope,
}: {
  summary: ProductSummary;
  scope: TrajectoryScope;
}) {
  const trajectory = trajectoryForScope(summary, scope);
  const delta =
    scope === "90d"
      ? summary.quarterlyPaceDeltaPct
      : scope === "30d"
        ? summary.paceDelta30dPct
        : summary.velocityDeltaPct;
  const paceDetail =
    scope === "90d"
      ? `${formatNumber(summary.paceLast3Months)} vs ${formatNumber(summary.pacePrior3Months)} btls in prior 90d`
      : scope === "30d"
        ? `${formatNumber(summary.paceLast30Days)} vs ${formatNumber(summary.pacePrior30Days)} btls in prior 30d`
        : "Change vs prior 28-day window";

  return (
    <div className="space-y-0.5" title={paceDetail}>
      <TrajectoryPill trajectory={trajectory} compact />
      {delta !== null ? (
        <div className={cn("text-[11px] tabular-nums font-medium", catalogDeltaClass(delta))}>
          {delta > 0 ? "+" : ""}
          {scope === "28d" ? delta.toFixed(0) : delta}%
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">—</div>
      )}
    </div>
  );
}

function CatalogSortHead({
  label,
  active,
  align = "center",
  className,
  onClick,
}: {
  label: string;
  active: boolean;
  align?: "left" | "center";
  className?: string;
  onClick: () => void;
}) {
  return (
    <TableHead
      className={cn(
        "h-auto min-h-9 cursor-pointer whitespace-normal break-words px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        align === "left" ? "text-left" : "text-center",
        className,
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          "inline-flex max-w-full flex-wrap items-center gap-1 leading-snug",
          align === "center" ? "mx-auto justify-center" : "justify-start",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        <ArrowUpDown className={cn("size-3 shrink-0 opacity-60", active && "opacity-100")} />
      </span>
    </TableHead>
  );
}

export function ProductSalesTrendsDashboard() {
  const {
    state,
    fullState,
    snapshot,
    repFilter,
    repFilterPending,
    setRepFilter,
    reps,
    importParseResult,
    enrichedAccounts,
    frequencyAlerts,
    productTrends: cachedProductTrends,
  } = useFilteredPortfolio();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notificationSidebarOpen, setNotificationSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Filters & Chart Controls
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<ProductTrendGranularity>("monthly");
  const [timeframe, setTimeframe] = useState<ProductTrendTimeframe>("all");
  const [metric, setMetric] = useState<ProductTrendMetric>("bottles");
  const [trajectoryFilter, setTrajectoryFilter] = useState<TrajectoryFilter>("all");
  const [trajectoryScope, setTrajectoryScope] = useState<TrajectoryScope>("28d");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<ProductSummary | null>(null);
  const [placementProduct, setPlacementProduct] = useState<ProductSummary | null>(null);
  const [selectedTrendPoint, setSelectedTrendPoint] = useState<ProductTrendPoint | null>(null);
  const [pointModalOpen, setPointModalOpen] = useState(false);
  const [focusedProduct, setFocusedProduct] = useState<string | null>(null);
  const [slowdownReportOpen, setSlowdownReportOpen] = useState(false);

  const handleOpenPointModal = (pt: ProductTrendPoint, productName?: string | null) => {
    setSelectedTrendPoint(pt);
    // Default to the selected product for the trajectory curve
    const defaultProduct =
      productName && productName.trim().length > 0
        ? productName
        : selectedProducts.length > 0
        ? selectedProducts[0]
        : null;
    setFocusedProduct(defaultProduct);
    setPointModalOpen(true);
  };

  // Sorting
  const [sortField, setSortField] = useState<SortField>("totalBottles");
  const [sortAsc, setSortAsc] = useState(false);

  const searchInputId = useId();

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }

  function handleLoadSample() {
    const sample = generateSampleWinePortfolio();
    setPortfolio(sample);
    flash("Sample wine distribution book loaded.");
  }

  const criticalAlertsCount = useMemo(
    () => frequencyAlerts.filter((a) => a.severity === "critical").length,
    [frequencyAlerts],
  );

  const accountVisitLookup = useMemo(
    () => buildPdfAccountVisitLookup(enrichedAccounts),
    [enrichedAccounts],
  );

  const useCachedProductTrends =
    selectedProducts.length === 0 &&
    granularity === "monthly" &&
    timeframe === "all";

  const trends = useMemo((): ProductTrendDataResult => {
    if (useCachedProductTrends || repFilterPending) {
      return cachedProductTrends;
    }
    return buildProductTrendData({
      orders: state.orders,
      selectedProducts,
      granularity,
      timeframe,
      asOf: state.analysisAsOf,
    });
  }, [
    useCachedProductTrends,
    cachedProductTrends,
    repFilterPending,
    state.orders,
    selectedProducts,
    granularity,
    timeframe,
    state.analysisAsOf,
  ]);

  // Alerts for slowing wine products over the last 28 days.
  // Out-of-stock marks stay on the full list so the report can restore them.
  const alertSummaries = useDeferredValue(trends.productSummaries);
  const detectedProductAlerts = useMemo(
    () => detectSlowingProductAlerts(alertSummaries),
    [alertSummaries],
  );
  const { ids: outOfStockIds } = useOutOfStockProducts();
  const productAlerts = useMemo(
    () => excludeOutOfStock(detectedProductAlerts, outOfStockIds),
    [detectedProductAlerts, outOfStockIds],
  );

  const visibleProductSummaries = useMemo(
    () =>
      trends.productSummaries.filter(
        (summary) => !outOfStockIds.has(outOfStockProductId(summary.productName)),
      ),
    [trends.productSummaries, outOfStockIds],
  );

  const visibleTrends = useMemo(
    () => ({
      ...trends,
      productSummaries: visibleProductSummaries,
      ...deriveProductTrendHighlights(visibleProductSummaries),
    }),
    [trends, visibleProductSummaries],
  );

  function handleProductExcludedFromLists(productName: string) {
    setSelectedProducts((prev) => prev.filter((name) => name !== productName));
    if (selectedDetailProduct?.productName === productName) {
      setSelectedDetailProduct(null);
    }
    if (placementProduct?.productName === productName) {
      setPlacementProduct(null);
    }
    flash(`Removed ${productName} from wine lists (out of stock).`);
  }

  const criticalProductAlertsCount = useMemo(
    () => productAlerts.filter((a) => a.severity === "critical").length,
    [productAlerts],
  );

  const totalAlertsCount = frequencyAlerts.length + productAlerts.length;
  const totalCriticalAlertsCount = criticalAlertsCount + criticalProductAlertsCount;

  // Assign distinct colors to each selected product
  const productColorMap = useMemo(() => {
    const map = new Map<string, string>();
    selectedProducts.forEach((p, idx) => {
      map.set(p, PRODUCT_PALETTE[idx % PRODUCT_PALETTE.length]);
    });
    return map;
  }, [selectedProducts]);

  const [showTrendlines, setShowTrendlines] = useState(true);
  const [includeCurrentMonth, setIncludeCurrentMonth] = useState(true);

  const chartSeriesBase = useMemo(() => {
    if (includeCurrentMonth) return trends.data;
    const asOfDate = parseISO((state.analysisAsOf ?? new Date().toISOString()).slice(0, 10));
    const currentPeriodStart =
      granularity === "weekly"
        ? startOfWeek(asOfDate, { weekStartsOn: 1 }).getTime()
        : granularity === "30d"
          ? thirtyDayTrendPeriodBounds(0, asOfDate).start.getTime()
          : startOfMonth(asOfDate).getTime();
    return trends.data.filter((point) => point.timestamp < currentPeriodStart);
  }, [includeCurrentMonth, trends.data, state.analysisAsOf, granularity]);

  const chartSeriesDeferred = useDeferredValue(chartSeriesBase);
  const chartSeries = chartSeriesDeferred;
  const chartSeriesPending = chartSeriesDeferred !== chartSeriesBase;

  // Compute linear trendline definitions for products / metric
  const productTrendlineDefs = useMemo<TrendlineDefinition[]>(() => {
    const defs: TrendlineDefinition[] = [];
    if (selectedProducts.length === 0) {
      const activeKey =
        metric === "accounts" ? "activeAccountsCount" : "totalBottles";
      defs.push({ sourceKey: activeKey, trendKey: `${activeKey}_trend` });
    } else {
      for (const pName of selectedProducts) {
        const sourceKey = pName;
        defs.push({ sourceKey, trendKey: getSafeTrendKey(sourceKey) });
      }
    }
    return defs;
  }, [selectedProducts, metric]);

  const { data: chartDataWithTrendlines, statsMap: productTrendStatsMap } = useMemo(() => {
    if (!showTrendlines || productTrendlineDefs.length === 0) {
      return { data: chartSeries, statsMap: new Map() };
    }
    const augmented = augmentDataWithTrendlines(chartSeries, productTrendlineDefs);
    if (selectedProducts.length === 0) return augmented;

    const data = augmented.data.map((point) => {
      const next: ProductTrendPoint = { ...point };
      for (const pName of selectedProducts) {
        const seriesKey = pName;
        const fieldKey = chartFieldKey(seriesKey);
        if (fieldKey !== seriesKey) {
          next[fieldKey] = seriesValue(point, seriesKey);
        }
      }
      return next;
    });

    return { data, statsMap: augmented.statsMap };
  }, [chartSeries, productTrendlineDefs, selectedProducts, metric, showTrendlines]);

  const chartXAxisDense =
    chartDataWithTrendlines.length > (granularity === "monthly" ? 14 : 8);
  const chartXAxisTilt = granularity === "30d" || (granularity === "weekly" && chartXAxisDense);

  function runChartFilterUpdate(update: () => void) {
    startTransition(update);
  }

  // Aggregate stats when 0 products selected
  const aggregateProductTrendStats = useMemo(() => {
    if (selectedProducts.length === 0) {
      const activeKey =
        metric === "accounts" ? "activeAccountsCount" : "totalBottles";
      return productTrendStatsMap.get(activeKey);
    }
    return null;
  }, [selectedProducts.length, metric, productTrendStatsMap]);

  // Handle Quick Selections
  function handleSelectTopVolume(count = 5) {
    const top = visibleProductSummaries.slice(0, count).map((s) => s.productName);
    setSelectedProducts(top);
  }

  function handleSelectGrowing(count = 5) {
    const growing = visibleProductSummaries
      .filter((s) => s.trajectory === "accelerating")
      .slice(0, count)
      .map((s) => s.productName);
    setSelectedProducts(growing.length > 0 ? growing : visibleProductSummaries.slice(0, 5).map((s) => s.productName));
  }

  function handleSelectAll() {
    setSelectedProducts([...trends.allProductsSorted]);
  }

  function handleClearAll() {
    setSelectedProducts([]);
  }

  function handleToggleProduct(productName: string) {
    if (selectedProducts.includes(productName)) {
      const remaining = selectedProducts.filter((p) => p !== productName);
      setSelectedProducts(remaining);
      if (focusedProduct === productName) {
        setFocusedProduct(remaining.length > 0 ? remaining[0] : null);
      }
    } else {
      setSelectedProducts([...selectedProducts, productName]);
      setFocusedProduct(productName);
    }
  }

  // Filtered & Sorted Table Rows
  const displayedSummaries = useMemo(() => {
    return visibleProductSummaries
      .filter((s) => {
        const activeTrajectory = trajectoryForScope(s, trajectoryScope);
        if (trajectoryFilter !== "all" && activeTrajectory !== trajectoryFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return s.productName.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        const valA: string | number = a[sortField] ?? 0;
        const valB: string | number = b[sortField] ?? 0;
        if (typeof valA === "string") {
          return sortAsc
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        }
        return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      });
  }, [visibleProductSummaries, trajectoryFilter, trajectoryScope, searchQuery, sortField, sortAsc]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  // Export CSV of product sales
  function handleExportCsv() {
    const headers = [
      "Product Name",
      "Total Bottles Sold",
      "Avg Bottles / Order",
      "Monthly Velocity (Btls/Mo)",
      "Buying Accounts Count",
      "28d Trajectory",
      "28d Velocity Δ (%)",
      "Pace Last 3 Months (Btls)",
      "Pace Prior 3 Months (Btls)",
      "90-Day Pace Δ (%)",
      "90-Day Trajectory",
      "First Order Date",
      "Last Order Date",
    ];

    const rows = visibleProductSummaries.map((s) => [
      `"${s.productName.replace(/"/g, '""')}"`,
      s.totalBottles,
      s.avgBottlesPerOrder,
      s.avgBottlesPerMonth,
      s.accountCount,
      s.trajectory,
      s.velocityDeltaPct !== null ? `${s.velocityDeltaPct.toFixed(1)}%` : "N/A",
      s.paceLast3Months,
      s.pacePrior3Months,
      s.quarterlyPaceDeltaPct !== null ? `${s.quarterlyPaceDeltaPct}%` : "N/A",
      s.quarterlyTrajectory,
      s.firstOrderDate,
      s.lastOrderDate,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `product-sales-trends-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    flash("Product sales trends CSV downloaded.");
  }

  function handleOpenSlowdownReport() {
    setSlowdownReportOpen(true);
  }

  return (
    <div className="min-h-screen">
      {/* App Header */}
      <header className="border-b border-primary/15 bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Wine className="size-5" />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                  Wine distribution · product sales analytics
                </p>
              </div>
              <h1 className="font-heading mt-1 text-3xl tracking-tight sm:text-4xl">
                Product Sales Trends
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Track volume velocity, historical sales trajectories, account placement penetration,
                and momentum for every individual wine SKU in your catalog.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {fullState.accounts.length === 0 ? (
                <Button variant="outline" onClick={handleLoadSample}>
                  <Sparkles data-icon="inline-start" />
                  Load sample book
                </Button>
              ) : null}
              <NotificationSidebarTrigger
                alertsCount={totalAlertsCount}
                criticalCount={totalCriticalAlertsCount}
                onClick={() => setNotificationSidebarOpen(true)}
              />
              <PrintReportButton page="products" onMessage={flash} />
              <ClearDataButton onCleared={flash} />
              <Button onClick={() => setUploadOpen(true)}>
                <Upload data-icon="inline-start" />
                Upload reports
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SiteNav />
            <RepFilterSelect
              reps={reps}
              value={repFilter}
              pending={repFilterPending}
              onValueChange={setRepFilter}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 sm:px-6 lg:px-8 py-6">
        {toast ? (
          <div className="rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm">
            {toast}
          </div>
        ) : null}

        {repFilter !== "all" ? (
          <div className="rounded-lg border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
            Showing <span className="font-medium">{repFilter}</span>&apos;s product sales only.
          </div>
        ) : null}

        {/* 28-Day Slowing Wine Sales Alert Banner */}
        {productAlerts.length > 0 && (
          <div
            className={cn(
              "rounded-xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs",
              criticalProductAlertsCount > 0
                ? "border-rose-300 bg-rose-50/70 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
                : "border-amber-300 bg-amber-50/70 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "p-2 rounded-lg shrink-0 mt-0.5",
                  criticalProductAlertsCount > 0
                    ? "bg-rose-500 text-white"
                    : "bg-amber-500 text-white",
                )}
              >
                <TrendingDown className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-sm sm:text-base">
                    {productAlerts.length} Wine SKU{productAlerts.length === 1 ? "" : "s"} Slowing in Sales (Last 28 Days)
                  </span>
                  {criticalProductAlertsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
                      {criticalProductAlertsCount} Critical
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 opacity-90 max-w-3xl leading-relaxed">
                  Sales velocity or reorder volume dropped noticeably over the last 28 days compared to the prior 28-day cycle:{" "}
                  <span className="font-semibold">
                    {productAlerts.slice(0, 3).map((a) => `${a.productName} (-${a.dropPercentage}%)`).join(", ")}
                    {productAlerts.length > 3 ? `, +${productAlerts.length - 3} more` : ""}.
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "text-xs font-semibold h-8 gap-1.5 shadow-2xs transition-all",
                  criticalProductAlertsCount > 0
                    ? "bg-white/95 border-rose-300 text-rose-900 hover:bg-white hover:border-rose-400 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-100"
                    : "bg-white/95 border-amber-300 text-amber-900 hover:bg-white hover:border-amber-400 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-100",
                )}
                onClick={handleOpenSlowdownReport}
                title="Open the monthly product slowdown report (print or export from the report)"
              >
                <FileText className="size-3.5" />
                <span>Monthly Slowdown Report</span>
              </Button>

              <Button
                size="sm"
                variant={criticalProductAlertsCount > 0 ? "default" : "secondary"}
                className={cn(
                  "text-xs font-semibold h-8",
                  criticalProductAlertsCount > 0
                    ? "bg-rose-700 hover:bg-rose-800 text-white"
                    : "bg-amber-700 hover:bg-amber-800 text-white",
                )}
                onClick={() => setNotificationSidebarOpen(true)}
              >
                <Bell className="size-3.5 mr-1.5" />
                View 28d Slowdown Briefing
              </Button>
            </div>
          </div>
        )}

        {trends.totalActiveProducts === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <Wine className="size-10 text-muted-foreground/60 mb-2" />
              <CardTitle className="font-heading text-2xl">No Product Orders Found</CardTitle>
              <CardDescription className="max-w-lg">
                Upload order history files or load sample data to analyze individual product volume
                trends, monthly velocities, and wine placement penetration.
              </CardDescription>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleLoadSample}>
                  <Sparkles className="size-4 mr-2" />
                  Load Sample Book
                </Button>
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload className="size-4 mr-2" />
                  Upload Reports
                </Button>
              </div>
            </CardHeader>
          </Card>
        ) : (
          <>
            {/* Top KPI Cards */}
            <section className="grid gap-3 md:grid-cols-2">
              <Card className="border-border">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <Wine className="size-4 text-primary" />
                    <span>Active Wine SKUs</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-2xl">
                    {formatNumber(visibleTrends.totalActiveProducts)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">products</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Across {formatNumber(trends.totalBottles)} total bottles sold (
                  {formatNumber(trends.totalBottles)} btls)
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <BarChart2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>#1 Volume Leader (All-Time)</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-xl break-words leading-tight" title={visibleTrends.topPerformer?.productName}>
                    {visibleTrends.topPerformer ? visibleTrends.topPerformer.productName : "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {visibleTrends.topPerformer ? (
                    <>
                      <span className="font-medium text-foreground">
                        {formatNumber(visibleTrends.topPerformer.totalBottles)} btls
                      </span>{" "}
                      ({formatNumber(visibleTrends.topPerformer.totalBottles)} btls) · {visibleTrends.topPerformer.accountCount} accounts
                    </>
                  ) : (
                    "No product volume"
                  )}
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "border-border",
                  visibleTrends.topGrowing &&
                    "cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/[0.03]",
                )}
                onClick={() => {
                  if (visibleTrends.topGrowing) setSelectedDetailProduct(visibleTrends.topGrowing);
                }}
                onKeyDown={(event) => {
                  if (
                    visibleTrends.topGrowing &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    setSelectedDetailProduct(visibleTrends.topGrowing);
                  }
                }}
                role={visibleTrends.topGrowing ? "button" : undefined}
                tabIndex={visibleTrends.topGrowing ? 0 : undefined}
                title={
                  visibleTrends.topGrowing
                    ? `Open catalog detail for ${visibleTrends.topGrowing.productName}`
                    : undefined
                }
              >
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <TrendingUp className="size-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Top Growth Momentum (28-Day Window)</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-xl break-words leading-tight" title={visibleTrends.topGrowing?.productName}>
                    {visibleTrends.topGrowing ? visibleTrends.topGrowing.productName : "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {visibleTrends.topGrowing ? (
                    <>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {visibleTrends.topGrowing.velocityDeltaPct !== null
                          ? `+${visibleTrends.topGrowing.velocityDeltaPct.toFixed(0)}%`
                          : "Expanding"}
                      </span>{" "}
                      velocity vs prior 28d ({visibleTrends.topGrowing.recentVolume} btls in last 28d vs {visibleTrends.topGrowing.priorVolume} btls prior)
                      <span className="mt-1 block text-[11px] text-primary/80">
                        Click for Individual Wine Catalog & Sales Velocities
                      </span>
                    </>
                  ) : (
                    "All products steady"
                  )}
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "border-border",
                  visibleTrends.atRiskProduct &&
                    "cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/[0.03]",
                )}
                onClick={() => {
                  if (visibleTrends.atRiskProduct) setSelectedDetailProduct(visibleTrends.atRiskProduct);
                }}
                onKeyDown={(event) => {
                  if (
                    visibleTrends.atRiskProduct &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    setSelectedDetailProduct(visibleTrends.atRiskProduct);
                  }
                }}
                role={visibleTrends.atRiskProduct ? "button" : undefined}
                tabIndex={visibleTrends.atRiskProduct ? 0 : undefined}
                title={
                  visibleTrends.atRiskProduct
                    ? `Open catalog detail for ${visibleTrends.atRiskProduct.productName}`
                    : undefined
                }
              >
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
                    <span>Cooling SKU (28-Day Window)</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-xl break-words leading-tight" title={visibleTrends.atRiskProduct?.productName}>
                    {visibleTrends.atRiskProduct ? visibleTrends.atRiskProduct.productName : "None"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {visibleTrends.atRiskProduct ? (
                    <>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {visibleTrends.atRiskProduct.velocityDeltaPct !== null
                          ? `${visibleTrends.atRiskProduct.velocityDeltaPct.toFixed(0)}%`
                          : "Decelerating"}
                      </span>{" "}
                      velocity vs prior 28d ({visibleTrends.atRiskProduct.recentVolume} btls in last 28d vs {visibleTrends.atRiskProduct.priorVolume} btls prior)
                      <span className="mt-1 block text-[11px] text-primary/80">
                        Click for Individual Wine Catalog & Sales Velocities
                      </span>
                    </>
                  ) : (
                    "No steep deceleration detected"
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Unified Multi-Product Sales Trend Visualizer & Wine Catalog */}
            <Card
              className={cn(
                "border-border overflow-hidden shadow-xs",
                (repFilterPending || chartSeriesPending) && "opacity-70",
              )}
            >
              <CardHeader className="pb-4 border-b bg-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    {repFilterPending || chartSeriesPending ? (
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Updating aggregates for the selected rep…
                      </p>
                    ) : null}
                    <CardTitle className="font-heading text-xl flex flex-wrap items-center gap-2">
                      <span>Multi-Product Sales Trend Visualizer & Wine Catalog</span>
                      <span className="text-xs font-normal text-muted-foreground bg-muted/80 border px-2.5 py-0.5 rounded-full">
                        {selectedProducts.length === 0
                          ? "All Products Aggregate"
                          : `${selectedProducts.length} Product${selectedProducts.length === 1 ? "" : "s"} Plotted on Chart`}
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Tracking {productTrendGranularityLabel(granularity)} sales trajectory curves over{" "}
                      {timeframe === "90d"
                        ? "the last 90 days"
                        : timeframe === "6m"
                        ? "the last 6 months"
                        : timeframe === "12m"
                        ? "the last 12 months"
                        : "all recorded order history"}{" "}
                      in {metric === "accounts" ? "active purchasing accounts" : "bottles sold"}.
                      {includeCurrentMonth
                        ? granularity === "monthly"
                          ? " The current month is included."
                          : granularity === "weekly"
                            ? " The current week is included."
                            : " The current 30-day period is included."
                        : granularity === "monthly"
                          ? " The current month is hidden."
                          : granularity === "weekly"
                            ? " The current week is hidden."
                            : " The current 30-day period is hidden."}{" "}
                      Select any wine in the catalog below to plot its sales trajectory curve on the visualizer.
                    </CardDescription>
                  </div>

                  {/* Metric, Granularity, and Timeframe Selectors */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Metric Switch */}
                    <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => runChartFilterUpdate(() => setMetric("bottles"))}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          metric === "bottles"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Bottles
                      </button>
                      <button
                        type="button"
                        onClick={() => runChartFilterUpdate(() => setMetric("accounts"))}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          metric === "accounts"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Active Accounts
                      </button>
                    </div>

                    {/* Granularity Switch */}
                    <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          runChartFilterUpdate(() => setGranularity("monthly"))
                        }
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          granularity === "monthly"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runChartFilterUpdate(() => setGranularity("30d"))
                        }
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          granularity === "30d"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        30 Days
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runChartFilterUpdate(() => setGranularity("weekly"))
                        }
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          granularity === "weekly"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Week
                      </button>
                    </div>

                    {/* Timeframe Select */}
                    <Select
                      value={timeframe}
                      onValueChange={(val) =>
                        runChartFilterUpdate(() =>
                          setTimeframe(val as ProductTrendTimeframe),
                        )
                      }
                    >
                      <SelectTrigger className="w-[125px] h-8 text-xs">
                        <SelectValue placeholder="Timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All History</SelectItem>
                        <SelectItem value="12m">Last 12 Mos</SelectItem>
                        <SelectItem value="6m">Last 6 Mos</SelectItem>
                        <SelectItem value="90d">Last 90 Days</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      size="xs"
                      variant={includeCurrentMonth ? "default" : "outline"}
                      onClick={() =>
                        runChartFilterUpdate(() => setIncludeCurrentMonth((prev) => !prev))
                      }
                      className={cn(
                        "h-8 text-xs gap-1.5 transition-colors font-medium",
                        includeCurrentMonth
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title={
                        includeCurrentMonth
                          ? granularity === "monthly"
                            ? "Hide the current month from the chart"
                            : granularity === "weekly"
                              ? "Hide the current week from the chart"
                              : "Hide the current 30-day period from the chart"
                          : granularity === "monthly"
                            ? "Show the current month on the chart"
                            : granularity === "weekly"
                              ? "Show the current week on the chart"
                              : "Show the current 30-day period on the chart"
                      }
                    >
                      {granularity === "monthly"
                        ? "Current Month"
                        : granularity === "weekly"
                          ? "Current Week"
                          : "Current Period"}{" "}
                      {includeCurrentMonth ? "ON" : "OFF"}
                    </Button>

                    {/* Trendlines Toggle */}
                    <Button
                      size="xs"
                      variant={showTrendlines ? "default" : "outline"}
                      onClick={() =>
                        runChartFilterUpdate(() => setShowTrendlines((prev) => !prev))
                      }
                      className={cn(
                        "h-8 text-xs gap-1.5 transition-colors font-medium",
                        showTrendlines
                          ? "bg-rose-950 text-rose-100 hover:bg-rose-900 border-rose-800"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <TrendingUp className="size-3.5" />
                      Trendlines {showTrendlines ? "ON" : "OFF"}
                    </Button>
                  </div>
                </div>

                {/* Quick Selection Presets */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t text-xs">
                  <span className="text-muted-foreground mr-1 font-medium">Quick comparison:</span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleSelectTopVolume(5)}
                    className="h-7 text-xs"
                  >
                    Top 5 Volume
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleSelectGrowing(5)}
                    className="h-7 text-xs"
                  >
                    🚀 Growing SKUs
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleSelectAll}
                    className="h-7 text-xs"
                  >
                    Compare All ({visibleTrends.totalActiveProducts})
                  </Button>
                  {selectedProducts.length > 0 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={handleClearAll}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Aggregate Total
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Chart Canvas */}
                {chartSeries.length === 0 ? (
                  <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed text-center p-6">
                    <Wine className="size-10 text-muted-foreground/60 mb-2" />
                    <p className="font-heading font-semibold text-foreground text-lg">
                      No product sales data in selected timeframe
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mt-1">
                      Try expanding the timeframe to 12 Months or All History.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-1.5 text-primary font-medium">
                        <Sparkles className="size-3.5 shrink-0" />
                        <span>Interactive Analytics: Click any point or dot on the chart to inspect full period data & accounts</span>
                      </div>
                      {selectedTrendPoint &&
                        chartSeries.some((point) => point.key === selectedTrendPoint.key) && (
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-6 text-[11px] gap-1 shrink-0"
                          onClick={() => setPointModalOpen(true)}
                        >
                          Inspect {selectedTrendPoint.label}
                        </Button>
                      )}
                    </div>

                    {/* Trendline Regression Analytics Banner */}
                    {showTrendlines && chartDataWithTrendlines.length >= 2 && (
                      selectedProducts.length === 0 && aggregateProductTrendStats ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200/60 bg-rose-50/50 p-2.5 text-xs dark:border-rose-950/40 dark:bg-rose-950/20">
                          <div className="flex flex-wrap items-center gap-3.5">
                            <div className="flex items-center gap-1.5 font-semibold text-rose-900 dark:text-rose-100">
                              <TrendingUp className="size-4 text-rose-600 dark:text-rose-400" />
                              <span>
                                {metric === "accounts"
                                  ? "Active Accounts Trendline:"
                                  : "Aggregate Bottle Trendline:"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span>Slope:</span>
                              <span className="font-bold text-foreground tabular-nums">
                                {formatTrendSlope(
                                  aggregateProductTrendStats.slope,
                                  metric === "accounts" ? "accs" : "btls",
                                  granularity
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">Trajectory:</span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold",
                                  aggregateProductTrendStats.direction === "up"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : aggregateProductTrendStats.direction === "down"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                )}
                              >
                                {aggregateProductTrendStats.direction === "up" ? (
                                  <ArrowUpRight className="size-3" />
                                ) : aggregateProductTrendStats.direction === "down" ? (
                                  <ArrowDownRight className="size-3" />
                                ) : null}
                                {aggregateProductTrendStats.direction === "up"
                                  ? "Expanding Velocity"
                                  : aggregateProductTrendStats.direction === "down"
                                  ? "Contracting Velocity"
                                  : "Steady"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span>Fit Confidence:</span>
                              <span
                                className={cn(
                                  "text-[11px] px-1.5 py-0.5 rounded font-medium border",
                                  describeFitConfidence(aggregateProductTrendStats.rSquared).badgeClass
                                )}
                              >
                                R² = {(aggregateProductTrendStats.rSquared * 100).toFixed(0)}% ·{" "}
                                {describeFitConfidence(aggregateProductTrendStats.rSquared).label}
                              </span>
                            </div>
                            {aggregateProductTrendStats.pctChange !== null && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span>Projected Net Drift:</span>
                                <span className="font-semibold text-foreground tabular-nums">
                                  {aggregateProductTrendStats.pctChange > 0 ? "+" : ""}
                                  {aggregateProductTrendStats.pctChange}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground hidden sm:block">
                            Dashed lines show OLS linear regressions
                          </div>
                        </div>
                      ) : selectedProducts.length > 0 ? (
                        <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <TrendingUp className="size-3.5 text-primary" />
                              Plotted Product Trendline Fits (OLS):
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Dashed curves represent linear trajectories
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 max-h-24 overflow-y-auto">
                            {selectedProducts.map((pName) => {
                              const sourceKey = pName;
                              const stats = productTrendStatsMap.get(sourceKey);
                              const color = productColorMap.get(pName) || "#881337";
                              if (!stats) return null;
                              return (
                                <div
                                  key={pName}
                                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] shadow-2xs"
                                >
                                  <span
                                    className="size-2 rounded-full shrink-0"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="font-medium text-foreground whitespace-nowrap" title={pName}>
                                    {pName}
                                  </span>
                                  <span className="font-bold tabular-nums text-foreground">
                                    {formatTrendSlope(
                                      stats.slope,
                                      "btls",
                                      granularity
                                    )}
                                  </span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold",
                                      stats.direction === "up"
                                        ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
                                        : stats.direction === "down"
                                        ? "text-rose-700 bg-rose-50 dark:bg-rose-950 dark:text-rose-300"
                                        : "text-muted-foreground bg-muted"
                                    )}
                                  >
                                    {stats.direction === "up" ? (
                                      <ArrowUpRight className="size-2.5" />
                                    ) : stats.direction === "down" ? (
                                      <ArrowDownRight className="size-2.5" />
                                    ) : null}
                                    R² {(stats.rSquared * 100).toFixed(0)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null
                    )}

                    <div className="h-96 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartDataWithTrendlines}
                          margin={{
                            top: 10,
                            right: 30,
                            left: 10,
                            bottom: chartXAxisTilt ? 48 : 24,
                          }}
                          onClick={(state) => {
                            const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : -1;
                            const activeLabel = state?.activeLabel;
                            const point =
                              index >= 0
                                ? chartDataWithTrendlines[index]
                                : chartDataWithTrendlines.find((d) => {
                                    if (activeLabel != null && d.label === activeLabel) return true;
                                    const axisTs =
                                      typeof activeLabel === "number"
                                        ? activeLabel
                                        : typeof activeLabel === "string" && /^\d+$/.test(activeLabel)
                                          ? Number(activeLabel)
                                          : null;
                                    if (axisTs == null) return false;
                                    return (
                                      d.timestamp === axisTs ||
                                      Math.abs(d.timestamp - axisTs) < 12 * 60 * 60 * 1000
                                    );
                                  });
                            if (point) {
                              const chartPayload = (state as unknown as {
                                activePayload?: Array<{ name?: string }>;
                              })?.activePayload;
                              const activeName =
                                typeof chartPayload?.[0]?.name === "string"
                                  ? chartPayload[0].name.replace(/ \(Trend\)$/, "")
                                  : "";
                              const matchedProduct = selectedProducts.includes(activeName)
                                ? activeName
                                : null;
                              handleOpenPointModal(point, matchedProduct);
                            }
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-muted/60"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="timestamp"
                            type="number"
                            scale="time"
                            domain={["dataMin", "dataMax"]}
                            tickLine={false}
                            axisLine={{ stroke: "rgba(156, 163, 175, 0.3)" }}
                            tick={{
                              fill: "currentColor",
                              fontSize: 10,
                            }}
                            className="text-muted-foreground"
                            dy={chartXAxisTilt ? 4 : 8}
                            minTickGap={granularity === "monthly" ? 40 : 28}
                            angle={chartXAxisTilt ? -38 : 0}
                            textAnchor={chartXAxisTilt ? "end" : "middle"}
                            height={chartXAxisTilt ? 56 : 36}
                            tickFormatter={(value: number) =>
                              formatProductTrendChartAxisTick(
                                value,
                                chartDataWithTrendlines,
                                granularity,
                              )
                            }
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={{ stroke: "rgba(156, 163, 175, 0.3)" }}
                            tick={{ fill: "currentColor", fontSize: 11 }}
                            className="text-muted-foreground"
                            tickFormatter={(val: number) => {
                              if (metric === "accounts") return `${val} accs`;
                              return `${val} btls`;
                            }}
                            width={65}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || !payload.length) return null;
                              const point = payload[0]?.payload as ProductTrendPoint | undefined;
                              if (!point) return null;

                              return (
                                <div className="rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-md backdrop-blur-sm max-w-xs text-xs space-y-2">
                                  <div className="border-b pb-1">
                                    <p className="font-semibold text-foreground">{point.label}</p>
                                    <p className="text-muted-foreground">
                                      Total: {formatNumber(point.totalBottles)} btls · {point.activeAccountsCount} accounts
                                    </p>
                                    {showTrendlines && selectedProducts.length === 0 && (
                                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium pt-0.5">
                                        {metric === "accounts" && typeof point.activeAccountsCount_trend === "number"
                                          ? `Linear Trend: ${Math.round(point.activeAccountsCount_trend)} accounts`
                                          : typeof point.totalBottles_trend === "number"
                                          ? `Linear Trend: ${formatNumber(Math.round(point.totalBottles_trend))} btls`
                                          : null}
                                      </p>
                                    )}
                                  </div>
                                  {selectedProducts.length > 0 && (
                                    <div className="space-y-1 max-h-48 overflow-y-auto pt-1">
                                      {selectedProducts.map((pName) => {
                                        const color = productColorMap.get(pName) || "#881337";
                                        const btlVal = (point[pName] as number) || 0;
                                        const sourceKey = pName;
                                        const trendKey = getSafeTrendKey(sourceKey);
                                        const trendVal = point[trendKey] as number | undefined;

                                        return (
                                          <div key={pName} className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 truncate">
                                              <span
                                                className="size-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: color }}
                                              />
                                              <span className="truncate text-foreground font-medium">
                                                {pName}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <span className="tabular-nums font-semibold text-foreground">
                                                {`${formatNumber(btlVal)} btls`}
                                              </span>
                                              {showTrendlines && typeof trendVal === "number" && (
                                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                                  ~{`${formatNumber(Math.round(trendVal))} btls`}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div className="pt-1.5 border-t border-border/40 text-center">
                                    <span className="text-[10px] font-medium text-primary">
                                      👆 Click dot to open full period data & analytics
                                    </span>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          {selectedProducts.length === 0 && (
                            <Legend
                              verticalAlign="bottom"
                              height={36}
                              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
                            />
                          )}

                          {/* If no individual products selected, show overall aggregate line */}
                          {selectedProducts.length === 0 ? (
                            <>
                              <Line
                                type="monotone"
                                dataKey={
                                  metric === "accounts"
                                    ? "activeAccountsCount"
                                    : "totalBottles"
                                }
                                name={
                                  metric === "accounts"
                                    ? "Active Buying Accounts"
                                    : "Total Bottles Sold (btls)"
                                }
                                stroke="#881337"
                                strokeWidth={3}
                                dot={{
                                  r: 4.5,
                                  fill: "#881337",
                                  stroke: "#ffffff",
                                  strokeWidth: 1.5,
                                  className: "cursor-pointer transition-all hover:scale-125 hover:stroke-[2.5px]",
                                }}
                                activeDot={{
                                  r: 7,
                                  fill: "#881337",
                                  stroke: "#ffffff",
                                  strokeWidth: 2.5,
                                  className: "cursor-pointer filter drop-shadow-md",
                                  onClick: (dotProps: unknown) => {
                                    const pt = (dotProps as { payload?: ProductTrendPoint })?.payload;
                                    if (pt) {
                                      handleOpenPointModal(pt, null);
                                    }
                                  },
                                }}
                              />
                              {showTrendlines && (
                                <Line
                                  type="linear"
                                  dataKey={
                                    metric === "accounts"
                                      ? "activeAccountsCount_trend"
                                      : "totalBottles_trend"
                                  }
                                  name={
                                    metric === "accounts"
                                      ? "Active Accounts Trend (Linear Fit)"
                                      : "Total Bottles Trend (Linear Fit)"
                                  }
                                  stroke="#be123c"
                                  strokeWidth={2}
                                  strokeDasharray="6 4"
                                  dot={false}
                                  activeDot={false}
                                  isAnimationActive={false}
                                />
                              )}
                            </>
                          ) : (
                            <>
                              {selectedProducts.map((pName) => {
                                const color = productColorMap.get(pName) || "#881337";
                                const seriesKey = pName;
                                return (
                                  <Line
                                    key={pName}
                                    type="monotone"
                                    dataKey={chartFieldKey(seriesKey)}
                                    name={pName}
                                    stroke={color}
                                    strokeWidth={2.5}
                                    dot={{
                                      r: 3.5,
                                      fill: color,
                                      stroke: "#ffffff",
                                      strokeWidth: 1.2,
                                      className: "cursor-pointer transition-all hover:scale-125 hover:stroke-[2px]",
                                    }}
                                    activeDot={{
                                      r: 6.5,
                                      fill: color,
                                      stroke: "#ffffff",
                                      strokeWidth: 2,
                                      className: "cursor-pointer filter drop-shadow-md",
                                      onClick: (dotProps: unknown) => {
                                        const pt = (dotProps as { payload?: ProductTrendPoint })?.payload;
                                        if (pt) {
                                          handleOpenPointModal(pt, pName);
                                        }
                                      },
                                    }}
                                  />
                                );
                              })}
                              {showTrendlines &&
                                selectedProducts.map((pName) => {
                                  const color = productColorMap.get(pName) || "#881337";
                                  const sourceKey = pName;
                                  const trendKey = getSafeTrendKey(sourceKey);
                                  return (
                                    <Line
                                      key={trendKey}
                                      type="linear"
                                      dataKey={trendKey}
                                      name={`${pName} (Trend)`}
                                      stroke={color}
                                      strokeWidth={1.6}
                                      strokeDasharray="5 4"
                                      strokeOpacity={0.65}
                                      dot={false}
                                      activeDot={false}
                                      isAnimationActive={false}
                                    />
                                  );
                                })}
                            </>
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Plotted Trajectory Curves Toolbar */}
                {selectedProducts.length > 0 && (
                  <div className="pt-3 border-t flex max-h-32 flex-wrap items-center gap-1.5 overflow-y-auto">
                    <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                      <BarChart2 className="size-3.5 text-primary" />
                      Plotted Curves ({selectedProducts.length}):
                    </span>
                    {selectedProducts.map((pName) => {
                      const color = productColorMap.get(pName) || "#881337";
                      const isFocused = focusedProduct === pName;
                      return (
                        <span
                          key={pName}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all",
                            isFocused
                              ? "bg-foreground text-background font-bold ring-2 ring-primary/40 shadow-xs"
                              : "bg-muted/70 text-foreground border-border"
                          )}
                        >
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="whitespace-nowrap">{pName}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleProduct(pName)}
                            className="text-muted-foreground hover:text-foreground ml-0.5 rounded-full p-0.5 hover:bg-muted"
                            title={`Remove ${pName} from chart`}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      );
                    })}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={handleClearAll}
                      className="h-6 text-[11px] text-muted-foreground hover:text-foreground ml-1"
                    >
                      Reset to Aggregate
                    </Button>
                  </div>
                )}
              </CardContent>

              {/* Integrated Individual Wine Catalog & Sales Velocities Section */}
              <div className="border-t bg-muted/5">
                <div className="p-6 pb-3 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-base flex flex-wrap items-center gap-2 text-foreground">
                        <span>Individual Wine Catalog & Sales Velocities</span>
                        <span className="text-xs font-normal text-muted-foreground bg-muted border px-2 py-0.5 rounded-md">
                          Click row or checkbox to plot on chart above
                        </span>
                      </h3>
                      <CardDescription className="text-xs mt-0.5">
                        Detailed order velocity, bottle counts, and placement metrics for each individual wine SKU.
                      </CardDescription>
                    </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative w-48 sm:w-60">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        id={searchInputId}
                        placeholder="Search wine SKU..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>

                    {/* CSV Export */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportCsv}
                      className="h-8 text-xs"
                    >
                      <Download className="size-3.5 mr-1" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                {/* Trajectory Scope & Segment Tabs */}
                <div className="flex flex-col gap-2 pt-3 border-t border-border/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Trajectory Metric:</span>
                      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setTrajectoryScope("28d")}
                          className={cn(
                            "px-2.5 py-1 rounded-md transition text-xs",
                            trajectoryScope === "28d"
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          28-Day Velocity
                        </button>
                        <button
                          type="button"
                          onClick={() => setTrajectoryScope("30d")}
                          className={cn(
                            "px-2.5 py-1 rounded-md transition text-xs",
                            trajectoryScope === "30d"
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          30-Day Pace
                        </button>
                        <button
                          type="button"
                          onClick={() => setTrajectoryScope("90d")}
                          className={cn(
                            "px-2.5 py-1 rounded-md transition text-xs",
                            trajectoryScope === "90d"
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          90-Day Pace
                        </button>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Filtering by{" "}
                      {trajectoryScope === "90d"
                        ? "last 90 days vs the prior 90 days"
                        : trajectoryScope === "30d"
                          ? "last 30 days vs the prior 30 days"
                          : "28-day rolling velocity"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {(
                      [
                        { id: "all", label: `All Wines (${visibleTrends.totalActiveProducts})` },
                        {
                          id: "accelerating",
                          label: `🚀 Accelerating (${trajectoryScopeWindowLabel(trajectoryScope)}: ${
                            visibleProductSummaries.filter(
                              (s) => trajectoryForScope(s, trajectoryScope) === "accelerating",
                            ).length
                          })`,
                        },
                        {
                          id: "steady",
                          label: `Steady (${trajectoryScopeWindowLabel(trajectoryScope)}: ${
                            visibleProductSummaries.filter(
                              (s) => trajectoryForScope(s, trajectoryScope) === "steady",
                            ).length
                          })`,
                        },
                        {
                          id: "decelerating",
                          label: `📉 Decelerating (${trajectoryScopeWindowLabel(trajectoryScope)}: ${
                            visibleProductSummaries.filter(
                              (s) => trajectoryForScope(s, trajectoryScope) === "decelerating",
                            ).length
                          })`,
                        },
                        {
                          id: "new",
                          label: `🆕 New Wines (<${
                            trajectoryScope === "28d" ? "60d" : trajectoryScopeWindowLabel(trajectoryScope)
                          }: ${
                            visibleProductSummaries.filter(
                              (s) => trajectoryForScope(s, trajectoryScope) === "new",
                            ).length
                          })`,
                        },
                        {
                          id: "dormant",
                          label: `⏸️ Dormant (>${
                            trajectoryScope === "28d" ? "60d" : trajectoryScopeWindowLabel(trajectoryScope)
                          }: ${
                            visibleProductSummaries.filter(
                              (s) => trajectoryForScope(s, trajectoryScope) === "dormant",
                            ).length
                          })`,
                        },
                      ] as const
                    ).map((tab) => {
                      const active = trajectoryFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setTrajectoryFilter(tab.id as TrajectoryFilter)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Integrated Catalog Table */}
                <div className="w-full border-t border-border bg-card">
                  <Table className="w-full table-fixed text-xs [&_[data-slot=table-cell]]:whitespace-normal [&_[data-slot=table-head]]:whitespace-normal [&_td]:align-middle [&_th]:align-middle [&_th]:text-center [&_td]:text-center [&_th:first-child]:text-center [&_td:first-child]:text-center [&_th:nth-child(2)]:text-left [&_td:nth-child(2)]:text-left">
                    <TableHeader>
                      <TableRow className="border-b bg-muted/20 hover:bg-muted/20">
                        <TableHead className="h-auto w-10 whitespace-normal px-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Plot
                        </TableHead>
                        <CatalogSortHead
                          label="Wine / SKU"
                          align="left"
                          className="w-[22%] min-w-[8rem]"
                          active={sortField === "productName"}
                          onClick={() => handleSort("productName")}
                        />
                        <CatalogSortHead
                          label="Total btls"
                          className="w-[9%]"
                          active={sortField === "totalBottles"}
                          onClick={() => handleSort("totalBottles")}
                        />
                        <CatalogSortHead
                          label="Avg / order"
                          className="w-[9%]"
                          active={sortField === "avgBottlesPerOrder"}
                          onClick={() => handleSort("avgBottlesPerOrder")}
                        />
                        <CatalogSortHead
                          label="Btls / mo"
                          className="w-[9%]"
                          active={sortField === "avgBottlesPerMonth"}
                          onClick={() => handleSort("avgBottlesPerMonth")}
                        />
                        <CatalogSortHead
                          label="Accounts"
                          className="w-[8%]"
                          active={sortField === "accountCount"}
                          onClick={() => handleSort("accountCount")}
                        />
                        <CatalogSortHead
                          label={catalogTrajectoryHeader(trajectoryScope)}
                          className="w-[14%]"
                          active={sortField === catalogTrajectorySortField(trajectoryScope)}
                          onClick={() => handleSort(catalogTrajectorySortField(trajectoryScope))}
                        />
                        <CatalogSortHead
                          label="Last order"
                          className="w-[10%]"
                          active={sortField === "lastOrderDate"}
                          onClick={() => handleSort("lastOrderDate")}
                        />
                        <TableHead className="h-auto w-[11%] min-w-[7rem] whitespace-normal px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedSummaries.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="h-28 whitespace-normal py-8 text-center text-sm text-muted-foreground"
                          >
                            No wines match the selected filters or search query.
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedSummaries.map((summary) => {
                          const isSelectedInChart = selectedProducts.includes(summary.productName);
                          const chartColor = productColorMap.get(summary.productName);

                          return (
                            <TableRow
                              key={summary.productName}
                              className={cn(
                                "group cursor-pointer border-b border-border/60 transition-colors last:border-0",
                                isSelectedInChart
                                  ? "bg-primary/[0.04] hover:bg-primary/[0.07]"
                                  : "hover:bg-muted/30",
                              )}
                              onClick={() => {
                                handleToggleProduct(summary.productName);
                              }}
                            >
                              <TableCell
                                className="w-10 whitespace-normal px-1 py-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleProduct(summary.productName)}
                                  className={cn(
                                    "mx-auto flex size-4 items-center justify-center rounded border transition-colors",
                                    isSelectedInChart
                                      ? "border-transparent text-white"
                                      : "border-border bg-background text-transparent hover:border-primary/50",
                                  )}
                                  style={
                                    isSelectedInChart
                                      ? { backgroundColor: chartColor || "#881337" }
                                      : undefined
                                  }
                                  title={
                                    isSelectedInChart
                                      ? `Remove ${summary.productName} from chart`
                                      : `Plot ${summary.productName} on chart`
                                  }
                                >
                                  <Check
                                    className={cn(
                                      "size-3 stroke-[3]",
                                      isSelectedInChart ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                </button>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "w-[22%] min-w-[8rem] whitespace-normal px-2 py-2 text-left",
                                  isSelectedInChart && "border-l-2 border-l-primary/70",
                                )}
                              >
                                <span
                                  className={cn(
                                    "line-clamp-2 break-words text-[13px] leading-snug",
                                    isSelectedInChart
                                      ? "font-semibold text-foreground"
                                      : "font-medium text-foreground group-hover:text-primary",
                                  )}
                                  title={summary.productName}
                                >
                                  {summary.productName}
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-normal px-2 py-2 tabular-nums text-foreground">
                                {formatNumber(summary.totalBottles)}
                              </TableCell>
                              <TableCell className="whitespace-normal px-2 py-2 tabular-nums text-muted-foreground">
                                {summary.avgBottlesPerOrder}
                              </TableCell>
                              <TableCell className="whitespace-normal px-2 py-2 tabular-nums text-foreground">
                                {formatNumber(summary.avgBottlesPerMonth)}
                              </TableCell>
                              <TableCell
                                className="whitespace-normal px-2 py-2 tabular-nums"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="text-primary underline-offset-2 hover:underline"
                                  title={`Accounts that purchased ${summary.productName}`}
                                  onClick={() => setPlacementProduct(summary)}
                                >
                                  {summary.accountCount}
                                </button>
                              </TableCell>
                              <TableCell className="whitespace-normal px-2 py-2">
                                <CatalogTrajectoryCell summary={summary} scope={trajectoryScope} />
                              </TableCell>
                              <TableCell className="whitespace-normal px-2 py-2 tabular-nums text-[11px] text-muted-foreground">
                                {formatDate(summary.lastOrderDate)}
                              </TableCell>
                              <TableCell
                                className="whitespace-normal px-2 py-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex flex-wrap items-center justify-center gap-1">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setSelectedDetailProduct(summary)}
                                  >
                                    View
                                  </Button>
                                  <ExcludeProductOutOfStockButton
                                    productName={summary.productName}
                                    className="h-7 shrink-0 text-[11px]"
                                    onExcluded={handleProductExcludedFromLists}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <ExcludedProductsPanel
                  className="mx-4 mb-4 mt-3"
                  onRestore={(productName) =>
                    flash(`Restored ${productName} to wine lists.`)
                  }
                />
              </div>
            </Card>
          </>
        )}
      </main>

      <Dialog
        open={Boolean(placementProduct)}
        onOpenChange={(open) => {
          if (!open) setPlacementProduct(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] w-[min(42rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          {placementProduct ? (
            <>
              <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
                <DialogTitle className="font-heading text-lg">
                  {placementProduct.productName}
                </DialogTitle>
                <DialogDescription>
                  {placementProduct.accountCount} account
                  {placementProduct.accountCount === 1 ? "" : "s"} purchased this wine, sorted by
                  bottle volume.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Table className="text-sm">
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-12 px-4">#</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Last order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...placementProduct.topAccounts]
                      .sort((a, b) => b.bottles - a.bottles || a.accountName.localeCompare(b.accountName))
                      .map((account, index) => (
                        <TableRow key={account.accountName}>
                          <TableCell className="px-4 tabular-nums text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{account.accountName}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatNumber(account.bottles)} btls
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatPct(account.shareOfProductPct)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatDate(account.lastOrderDate)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {placementProduct.topAccounts.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No accounts have purchased this wine yet.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Individual Product Deep-Dive Dialog */}
      <Dialog
        open={Boolean(selectedDetailProduct)}
        onOpenChange={(open) => {
          if (!open) setSelectedDetailProduct(null);
        }}
      >
        <DialogContent className="w-[96vw] max-w-7xl sm:max-w-7xl md:max-w-7xl lg:max-w-[1450px] max-h-[92vh] flex flex-col p-6 overflow-hidden">
          {selectedDetailProduct && (
            <>
              <DialogHeader className="pb-3 border-b shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Wine className="size-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Individual Wine Catalog & Sales Velocities
                      </p>
                      <DialogTitle className="font-heading text-xl md:text-2xl text-foreground font-bold mt-0.5">
                        {selectedDetailProduct.productName}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        First Order: {formatDate(selectedDetailProduct.firstOrderDate)} · Last Order:{" "}
                        {formatDate(selectedDetailProduct.lastOrderDate)}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ExcludeProductOutOfStockButton
                      productName={selectedDetailProduct.productName}
                      onExcluded={(productName) => {
                        handleProductExcludedFromLists(productName);
                        setSelectedDetailProduct(null);
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium">28d Velocity:</span>
                      <TrajectoryPill trajectory={selectedDetailProduct.trajectory} showWindow />
                      {selectedDetailProduct.velocityDeltaPct !== null && (
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md",
                            selectedDetailProduct.velocityDeltaPct > 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : selectedDetailProduct.velocityDeltaPct < 0
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {selectedDetailProduct.velocityDeltaPct > 0 ? "+" : ""}
                          {selectedDetailProduct.velocityDeltaPct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:border-l sm:pl-3">
                      <span className="text-xs text-muted-foreground font-medium">30-Day Pace:</span>
                      <TrajectoryPill
                        trajectory={selectedDetailProduct.pace30dTrajectory}
                        windowLabel="30d"
                      />
                      {selectedDetailProduct.paceDelta30dPct !== null && (
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md",
                            selectedDetailProduct.paceDelta30dPct > 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : selectedDetailProduct.paceDelta30dPct < 0
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {selectedDetailProduct.paceDelta30dPct > 0 ? "+" : ""}
                          {selectedDetailProduct.paceDelta30dPct}% vs prior 30 days
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:border-l sm:pl-3">
                      <span className="text-xs text-muted-foreground font-medium">90-Day Pace:</span>
                      <TrajectoryPill trajectory={selectedDetailProduct.quarterlyTrajectory} windowLabel="90d" />
                      {selectedDetailProduct.quarterlyPaceDeltaPct !== null && (
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md",
                            selectedDetailProduct.quarterlyPaceDeltaPct > 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : selectedDetailProduct.quarterlyPaceDeltaPct < 0
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {selectedDetailProduct.quarterlyPaceDeltaPct > 0 ? "+" : ""}
                          {selectedDetailProduct.quarterlyPaceDeltaPct}% vs prior 90 days
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-5 pt-4 pr-1">
                {/* Product Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Total Volume (All-Time)</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.totalBottles)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Active Placements</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {selectedDetailProduct.accountCount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">accounts</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Monthly Velocity</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.avgBottlesPerMonth)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls/mo</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Avg per Order</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {selectedDetailProduct.avgBottlesPerOrder}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900/50">
                    <p className="text-xs text-sky-800 dark:text-sky-300 font-medium">Last 30 Days</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.paceLast30Days)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Prior 30 Days</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.pacePrior30Days)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50">
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Last 90 Days</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.paceLast3Months)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Prior 90 Days</p>
                    <p className="font-heading text-xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.pacePrior3Months)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                </div>

                {/* Top Buying Accounts Table */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading font-semibold text-sm flex items-center gap-2 text-foreground">
                      <Store className="size-4 text-primary" />
                      <span>Account Placements & Volume Distribution</span>
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {selectedDetailProduct.topAccounts.length} customer placement{selectedDetailProduct.topAccounts.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="rounded-lg border overflow-hidden">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="py-2.5 px-3 font-semibold text-foreground">Account Name</TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">Bottles Purchased</TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">Share of SKU Volume</TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">
                            Last 30-Day Pace vs Prior
                          </TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">
                            Last 90-Day Pace vs Prior
                          </TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">Total Orders</TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">First Order</TableHead>
                          <TableHead className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">Last Order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDetailProduct.topAccounts.map((acc) => (
                          <TableRow key={acc.accountName} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="py-2.5 px-3 font-medium text-foreground">
                              {acc.accountName}
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right font-semibold tabular-nums text-foreground whitespace-nowrap">
                              {formatNumber(acc.bottles)} btls
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${Math.min(100, Math.max(4, acc.shareOfProductPct))}%` }}
                                  />
                                </div>
                                <span className="font-medium text-foreground tabular-nums">
                                  {formatPct(acc.shareOfProductPct)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                              <div className="flex flex-col items-end">
                                <span
                                  className={cn(
                                    "font-semibold text-xs",
                                    acc.paceDelta30dPct !== null && acc.paceDelta30dPct > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : acc.paceDelta30dPct !== null && acc.paceDelta30dPct < 0
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {acc.paceDelta30dPct !== null
                                    ? `${acc.paceDelta30dPct > 0 ? "+" : ""}${acc.paceDelta30dPct}%`
                                    : "—"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatNumber(acc.paceLast30Days)} vs {formatNumber(acc.pacePrior30Days)} btls
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                              <div className="flex flex-col items-end">
                                <span
                                  className={cn(
                                    "font-semibold text-xs",
                                    acc.quarterlyPaceDeltaPct !== null && acc.quarterlyPaceDeltaPct > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : acc.quarterlyPaceDeltaPct !== null && acc.quarterlyPaceDeltaPct < 0
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {acc.quarterlyPaceDeltaPct !== null
                                    ? `${acc.quarterlyPaceDeltaPct > 0 ? "+" : ""}${acc.quarterlyPaceDeltaPct}%`
                                    : "—"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatNumber(acc.paceLast3Months)} vs {formatNumber(acc.pacePrior3Months)} btls
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                              {acc.orderCount} order{acc.orderCount === 1 ? "" : "s"}
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                              {formatDate(acc.firstOrderDate)}
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                              {formatDate(acc.lastOrderDate)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Dialog & Notification Drawer */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onImport={(result) => {
          const imported = importParseResult(result);
          const count =
            result.kind === "orders"
              ? imported.orders.length
              : result.kind === "visits"
                ? imported.visits.length
                : imported.accounts.length;
          flash(`Imported ${count} ${result.kind === "orders" ? "order lines" : "records"}.`);
        }}
        onUploadCleared={flash}
      />
      <NotificationSidebar
        open={notificationSidebarOpen}
        onOpenChange={setNotificationSidebarOpen}
        alerts={frequencyAlerts}
        productAlerts={productAlerts}
        accountVisitLookup={accountVisitLookup}
        defaultCategory="products"
        onSelectAccount={() => {
          setNotificationSidebarOpen(false);
        }}
        onSelectProduct={(productName) => {
          const summary = trends.productSummaries.find((s) => s.productName === productName);
          if (summary) setSelectedDetailProduct(summary);
          setNotificationSidebarOpen(false);
        }}
      />

      {/* Point Analytics Pop-up Dialog */}
      <TrendPointAnalyticsDialog
        open={pointModalOpen}
        onOpenChange={setPointModalOpen}
        point={selectedTrendPoint}
        allPoints={chartSeries}
        orders={state.orders}
        granularity={granularity}
        asOf={state.analysisAsOf}
        selectedProducts={selectedProducts}
        focusedProduct={focusedProduct}
        onSelectFocusedProduct={setFocusedProduct}
        onToggleProduct={handleToggleProduct}
        onSelectPoint={(pt) => setSelectedTrendPoint(pt)}
      />

      {/* 28-Day Product Slowdown Printable Report Dialog */}
      <ProductSlowdownReportDialog
        open={slowdownReportOpen}
        onOpenChange={setSlowdownReportOpen}
        alerts={detectedProductAlerts}
        repFilter={repFilter}
        asOf={state.analysisAsOf ?? snapshot.asOf}
        accountVisitLookup={accountVisitLookup}
        onMessage={flash}
      />
    </div>
  );
}
