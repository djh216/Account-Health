"use client";

import { useId, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart2,
  Bell,
  Download,
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
import { SiteNav } from "@/components/site-nav";
import { RepFilterSelect } from "@/components/rep-filter-select";
import { ClearDataButton } from "@/components/clear-data-button";
import { ExportReportButton } from "@/components/export-report-button";
import { PrintReportButton } from "@/components/print-report-button";
import { UploadDialog } from "@/components/upload-dialog";
import {
  NotificationSidebar,
  NotificationSidebarTrigger,
} from "@/components/notification-sidebar";
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
import { detectOrderFrequencyDrops } from "@/lib/frequency-alerts";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import {
  buildProductTrendData,
  PRODUCT_PALETTE,
  type ProductSummary,
  type ProductTrajectory,
  type ProductTrendGranularity,
  type ProductTrendMetric,
  type ProductTrendTimeframe,
  detectSlowingProductAlerts,
} from "@/lib/product-trends";
import { cn } from "@/lib/utils";

type SortField =
  | "productName"
  | "totalBottles"
  | "totalRevenue"
  | "avgBottlesPerOrder"
  | "avgBottlesPerMonth"
  | "accountCount"
  | "velocityDeltaPct"
  | "lastOrderDate";

type TrajectoryFilter = "all" | ProductTrajectory;

function TrajectoryPill({
  trajectory,
  showWindow = false,
}: {
  trajectory: ProductTrajectory;
  showWindow?: boolean;
}) {
  switch (trajectory) {
    case "accelerating":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <ArrowUpRight className="size-3" />
          Accelerating{showWindow ? " (28d)" : ""}
        </span>
      );
    case "steady":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Steady{showWindow ? " (28d)" : ""}
        </span>
      );
    case "decelerating":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
          <ArrowDownRight className="size-3" />
          Decelerating{showWindow ? " (28d)" : ""}
        </span>
      );
    case "new":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
          <Sparkles className="size-3" />
          New Wine{showWindow ? " (<60d)" : ""}
        </span>
      );
    case "dormant":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          Dormant{showWindow ? " (>60d)" : ""}
        </span>
      );
  }
}

export function ProductSalesTrendsDashboard() {
  const { state, fullState, snapshot, repFilter, setRepFilter, reps, importParseResult } =
    useFilteredPortfolio();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notificationSidebarOpen, setNotificationSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Filters & Chart Controls
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<ProductTrendGranularity>("monthly");
  const [timeframe, setTimeframe] = useState<ProductTrendTimeframe>("all");
  const [metric, setMetric] = useState<ProductTrendMetric>("bottles");
  const [trajectoryFilter, setTrajectoryFilter] = useState<TrajectoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<ProductSummary | null>(null);

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

  const enrichedAccounts = useMemo(
    () => enrichAccountsWithTerritoryValue(snapshot.accounts, state.orders),
    [snapshot.accounts, state.orders],
  );

  // Alerts for notification drawer
  const frequencyAlerts = useMemo(
    () =>
      detectOrderFrequencyDrops(
        enrichedAccounts,
        state.orders,
        state.analysisAsOf,
      ),
    [enrichedAccounts, state.orders, state.analysisAsOf],
  );
  const criticalAlertsCount = useMemo(
    () => frequencyAlerts.filter((a) => a.severity === "critical").length,
    [frequencyAlerts],
  );

  // Compute trend metrics (28-day trajectory window)
  const trends = useMemo(
    () =>
      buildProductTrendData({
        orders: state.orders,
        selectedProducts,
        granularity,
        timeframe,
        asOf: state.analysisAsOf,
      }),
    [state.orders, selectedProducts, granularity, timeframe, state.analysisAsOf],
  );

  // Alerts for slowing wine products over the last 28 days
  const productAlerts = useMemo(
    () => detectSlowingProductAlerts(trends.productSummaries),
    [trends.productSummaries],
  );

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

  // Handle Quick Selections
  function handleSelectTopVolume(count = 5) {
    const top = trends.productSummaries.slice(0, count).map((s) => s.productName);
    setSelectedProducts(top);
  }

  function handleSelectTopRevenue(count = 5) {
    const topRev = [...trends.productSummaries]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, count)
      .map((s) => s.productName);
    setSelectedProducts(topRev);
  }

  function handleSelectGrowing(count = 5) {
    const growing = trends.productSummaries
      .filter((s) => s.trajectory === "accelerating")
      .slice(0, count)
      .map((s) => s.productName);
    setSelectedProducts(growing.length > 0 ? growing : trends.productSummaries.slice(0, 5).map((s) => s.productName));
  }

  function handleSelectAll() {
    setSelectedProducts([...trends.allProductsSorted]);
  }

  function handleClearAll() {
    setSelectedProducts([]);
  }

  function handleToggleProduct(productName: string) {
    if (selectedProducts.includes(productName)) {
      setSelectedProducts(selectedProducts.filter((p) => p !== productName));
    } else {
      setSelectedProducts([...selectedProducts, productName]);
    }
  }

  // Filtered & Sorted Table Rows
  const displayedSummaries = useMemo(() => {
    return trends.productSummaries
      .filter((s) => {
        if (trajectoryFilter !== "all" && s.trajectory !== trajectoryFilter) return false;
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
  }, [trends.productSummaries, trajectoryFilter, searchQuery, sortField, sortAsc]);

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
      "Total Revenue ($)",
      "Avg Bottles / Order",
      "Monthly Velocity (Btls/Mo)",
      "Buying Accounts Count",
      "Trend Trajectory",
      "Velocity Δ (%)",
      "First Order Date",
      "Last Order Date",
    ];

    const rows = trends.productSummaries.map((s) => [
      `"${s.productName.replace(/"/g, '""')}"`,
      s.totalBottles,
      s.totalRevenue.toFixed(2),
      s.avgBottlesPerOrder,
      s.avgBottlesPerMonth,
      s.accountCount,
      s.trajectory,
      s.velocityDeltaPct !== null ? `${s.velocityDeltaPct.toFixed(1)}%` : "N/A",
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
              <PrintReportButton />
              <ExportReportButton page="orders" onMessage={flash} />
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

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
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
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <Wine className="size-4 text-primary" />
                    <span>Active Wine SKUs</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-2xl">
                    {formatNumber(trends.totalActiveProducts)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">products</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Across {formatNumber(trends.totalBottles)} total bottles sold (
                  {formatMoney(trends.totalRevenue)})
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <BarChart2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>#1 Volume Leader (All-Time)</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-xl truncate" title={trends.topPerformer?.productName}>
                    {trends.topPerformer ? trends.topPerformer.productName : "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {trends.topPerformer ? (
                    <>
                      <span className="font-medium text-foreground">
                        {formatNumber(trends.topPerformer.totalBottles)} btls
                      </span>{" "}
                      ({formatMoney(trends.topPerformer.totalRevenue)}) · {trends.topPerformer.accountCount} accounts
                    </>
                  ) : (
                    "No product volume"
                  )}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <TrendingUp className="size-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Top Growth Momentum (28-Day Window)</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-xl truncate" title={trends.topGrowing?.productName}>
                    {trends.topGrowing ? trends.topGrowing.productName : "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {trends.topGrowing ? (
                    <>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {trends.topGrowing.velocityDeltaPct !== null
                          ? `+${trends.topGrowing.velocityDeltaPct.toFixed(0)}%`
                          : "Expanding"}
                      </span>{" "}
                      velocity vs prior 28d ({trends.topGrowing.recentVolume} btls in last 28d vs {trends.topGrowing.priorVolume} btls prior)
                    </>
                  ) : (
                    "All products steady"
                  )}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
                    <span>Cooling SKU (28-Day Window)</span>
                  </CardDescription>
                  <CardTitle className="font-heading text-xl truncate" title={trends.atRiskProduct?.productName}>
                    {trends.atRiskProduct ? trends.atRiskProduct.productName : "None"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {trends.atRiskProduct ? (
                    <>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {trends.atRiskProduct.velocityDeltaPct !== null
                          ? `${trends.atRiskProduct.velocityDeltaPct.toFixed(0)}%`
                          : "Decelerating"}
                      </span>{" "}
                      velocity vs prior 28d ({trends.atRiskProduct.recentVolume} btls in last 28d vs {trends.atRiskProduct.priorVolume} btls prior)
                    </>
                  ) : (
                    "No steep deceleration detected"
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Interactive Product Sales Trend Chart Card */}
            <Card className="border-border">
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="font-heading text-xl flex items-center gap-2">
                      <span>Multi-Product Sales Trend Visualizer</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        ({selectedProducts.length === 0 ? "All Products Aggregate" : `${selectedProducts.length} Product${selectedProducts.length === 1 ? "" : "s"} Compared`})
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Tracking {granularity === "monthly" ? "monthly" : "weekly"} sales trajectory curves over{" "}
                      {timeframe === "90d"
                        ? "the last 90 days"
                        : timeframe === "6m"
                        ? "the last 6 months"
                        : timeframe === "12m"
                        ? "the last 12 months"
                        : "all recorded order history"}{" "}
                      in {metric === "revenue" ? "revenue ($)" : metric === "accounts" ? "active purchasing accounts" : "bottles sold"}.
                    </CardDescription>
                  </div>

                  {/* Metric, Granularity, and Timeframe Selectors */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Metric Switch */}
                    <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setMetric("bottles")}
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
                        onClick={() => setMetric("revenue")}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          metric === "revenue"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Revenue ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetric("accounts")}
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
                        onClick={() => setGranularity("monthly")}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          granularity === "monthly"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        onClick={() => setGranularity("weekly")}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-medium transition-colors",
                          granularity === "weekly"
                            ? "bg-background text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Weekly
                      </button>
                    </div>

                    {/* Timeframe Select */}
                    <Select
                      value={timeframe}
                      onValueChange={(val) => setTimeframe(val as ProductTrendTimeframe)}
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
                    onClick={() => handleSelectTopRevenue(5)}
                    className="h-7 text-xs"
                  >
                    Top 5 Revenue
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
                    Compare All ({trends.totalActiveProducts})
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
                {trends.data.length === 0 ? (
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
                  <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trends.data}
                        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-muted/60"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={{ stroke: "rgba(156, 163, 175, 0.3)" }}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          className="text-muted-foreground"
                          dy={10}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={{ stroke: "rgba(156, 163, 175, 0.3)" }}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          className="text-muted-foreground"
                          tickFormatter={(val: number) => {
                            if (metric === "revenue") return formatMoney(val);
                            if (metric === "accounts") return `${val} accs`;
                            return `${val} btls`;
                          }}
                          width={metric === "revenue" ? 75 : 65}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const point = payload[0]?.payload;
                            if (!point) return null;

                            return (
                              <div className="rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-md backdrop-blur-sm max-w-xs text-xs space-y-2">
                                <div className="border-b pb-1">
                                  <p className="font-semibold text-foreground">{label}</p>
                                  <p className="text-muted-foreground">
                                    Total: {formatNumber(point.totalBottles)} btls · {formatMoney(point.totalRevenue)} · {point.activeAccountsCount} accounts
                                  </p>
                                </div>
                                {selectedProducts.length > 0 && (
                                  <div className="space-y-1 max-h-48 overflow-y-auto pt-1">
                                    {selectedProducts.map((pName) => {
                                      const color = productColorMap.get(pName) || "#881337";
                                      const btlVal = (point[pName] as number) || 0;
                                      const revVal = (point[`${pName}__rev`] as number) || 0;

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
                                          <span className="tabular-nums font-semibold text-foreground shrink-0">
                                            {metric === "revenue"
                                              ? formatMoney(revVal)
                                              : `${formatNumber(btlVal)} btls`}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
                        />

                        {/* If no individual products selected, show overall aggregate line */}
                        {selectedProducts.length === 0 ? (
                          <Line
                            type="monotone"
                            dataKey={
                              metric === "revenue"
                                ? "totalRevenue"
                                : metric === "accounts"
                                ? "activeAccountsCount"
                                : "totalBottles"
                            }
                            name={
                              metric === "revenue"
                                ? "Total Product Revenue ($)"
                                : metric === "accounts"
                                ? "Active Buying Accounts"
                                : "Total Bottles Sold (btls)"
                            }
                            stroke="#881337"
                            strokeWidth={3}
                            dot={{ r: 4, fill: "#881337" }}
                            activeDot={{ r: 6 }}
                          />
                        ) : (
                          selectedProducts.map((pName) => {
                            const color = productColorMap.get(pName) || "#881337";
                            const dataKey = metric === "revenue" ? `${pName}__rev` : pName;
                            return (
                              <Line
                                key={pName}
                                type="monotone"
                                dataKey={dataKey}
                                name={pName}
                                stroke={color}
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: color }}
                                activeDot={{ r: 5 }}
                              />
                            );
                          })
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Product Selection Chip Cloud */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Click wines below to toggle on chart:
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {selectedProducts.length} of {trends.allProductsSorted.length} selected
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-muted/20 rounded-md">
                    {trends.productSummaries.map((summary) => {
                      const isSelected = selectedProducts.includes(summary.productName);
                      const color = productColorMap.get(summary.productName);

                      return (
                        <button
                          key={summary.productName}
                          type="button"
                          onClick={() => handleToggleProduct(summary.productName)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all border",
                            isSelected
                              ? "bg-primary/10 border-primary/40 text-foreground font-semibold shadow-xs"
                              : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {isSelected && (
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: color || "#881337" }}
                            />
                          )}
                          <span className="truncate max-w-[180px]">{summary.productName}</span>
                          <span className="text-[10px] tabular-nums opacity-75">
                            ({formatNumber(summary.totalBottles)} btls)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product Performance Matrix & Catalog Table */}
            <Card className="border-border overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="font-heading text-lg">
                      Individual Wine Catalog & Sales Velocities
                    </CardTitle>
                    <CardDescription>
                      Detailed order velocity, bottle counts, revenue, and placement metrics for each individual wine SKU.
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

                {/* Trajectory Segment Tabs */}
                <div className="flex flex-wrap gap-1 pt-3">
                  {(
                    [
                      { id: "all", label: `All Wines (${trends.totalActiveProducts})` },
                      {
                        id: "accelerating",
                        label: `🚀 Accelerating (28d: ${trends.productSummaries.filter((s) => s.trajectory === "accelerating").length})`,
                      },
                      {
                        id: "steady",
                        label: `Steady (28d: ${trends.productSummaries.filter((s) => s.trajectory === "steady").length})`,
                      },
                      {
                        id: "decelerating",
                        label: `📉 Decelerating (28d: ${trends.productSummaries.filter((s) => s.trajectory === "decelerating").length})`,
                      },
                      {
                        id: "new",
                        label: `🆕 New Wines (<60d: ${trends.productSummaries.filter((s) => s.trajectory === "new").length})`,
                      },
                      {
                        id: "dormant",
                        label: `⏸️ Dormant (>60d: ${trends.productSummaries.filter((s) => s.trajectory === "dormant").length})`,
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
              </CardHeader>

              <CardContent className="p-0">
                <div className="w-full">
                  <Table className="w-full text-xs">
                    <TableHeader>
                      <TableRow className="border-b hover:bg-transparent">
                        <TableHead
                          className="py-2.5 px-3 cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("productName")}
                        >
                          <div className="flex items-center gap-1 font-semibold text-foreground">
                            <span>Wine Product / SKU</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("totalBottles")}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                            <span>Total Bottles</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("avgBottlesPerOrder")}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                            <span>Avg / Order (btls)</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("avgBottlesPerMonth")}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                            <span>Monthly Velocity</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("accountCount")}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                            <span>Placements</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("velocityDeltaPct")}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                            <span>Trajectory (28d vs Prior)</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead
                          className="py-2.5 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => handleSort("lastOrderDate")}
                        >
                          <div className="flex items-center justify-end gap-1 font-semibold text-foreground">
                            <span>Last Ordered</span>
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                          </div>
                        </TableHead>
                        <TableHead className="py-2.5 px-2 w-12 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedSummaries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
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
                              className="cursor-pointer hover:bg-muted/50 transition-colors group border-b last:border-0"
                              onClick={() => setSelectedDetailProduct(summary)}
                            >
                              <TableCell className="py-2.5 px-3 font-medium text-foreground">
                                <div className="flex items-center gap-2">
                                  {isSelectedInChart && (
                                    <span
                                      className="size-2 rounded-full shrink-0"
                                      style={{ backgroundColor: chartColor || "#881337" }}
                                    />
                                  )}
                                  <span className="group-hover:text-primary transition-colors font-medium">
                                    {summary.productName}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right font-semibold tabular-nums text-foreground whitespace-nowrap">
                                {formatNumber(summary.totalBottles)} btls
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                {summary.avgBottlesPerOrder} btls/order
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right font-medium tabular-nums text-foreground whitespace-nowrap">
                                {formatNumber(summary.avgBottlesPerMonth)} btls/mo
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                {summary.accountCount} acc{summary.accountCount === 1 ? "" : "s"}
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <TrajectoryPill trajectory={summary.trajectory} />
                                  {summary.velocityDeltaPct !== null && (
                                    <span
                                      className={cn(
                                        "text-xs font-semibold tabular-nums",
                                        summary.velocityDeltaPct > 0
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : summary.velocityDeltaPct < 0
                                          ? "text-rose-600 dark:text-rose-400"
                                          : "text-muted-foreground",
                                      )}
                                      title="Velocity change over the last 28 days compared to prior 28 days"
                                    >
                                      {summary.velocityDeltaPct > 0 ? "+" : ""}
                                      {summary.velocityDeltaPct.toFixed(0)}% (28d)
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                                {formatDate(summary.lastOrderDate)}
                              </TableCell>
                              <TableCell className="py-2.5 px-2 text-right whitespace-nowrap">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-primary font-medium hover:bg-primary/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDetailProduct(summary);
                                  }}
                                >
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Individual Product Deep-Dive Dialog */}
      <Dialog
        open={Boolean(selectedDetailProduct)}
        onOpenChange={(open) => {
          if (!open) setSelectedDetailProduct(null);
        }}
      >
        <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[96vw] max-h-[92vh] flex flex-col p-6 overflow-hidden">
          {selectedDetailProduct && (
            <>
              <DialogHeader className="pb-3 border-b shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Wine className="size-5" />
                    </div>
                    <div>
                      <DialogTitle className="font-heading text-xl md:text-2xl text-foreground font-bold">
                        {selectedDetailProduct.productName}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        First Order: {formatDate(selectedDetailProduct.firstOrderDate)} · Last Order:{" "}
                        {formatDate(selectedDetailProduct.lastOrderDate)}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Trajectory (28-Day):</span>
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
                        {selectedDetailProduct.velocityDeltaPct.toFixed(0)}% (last 28d vs prior 28d)
                      </span>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-5 pt-4 pr-1">
                {/* Product Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Total Volume (All-Time)</p>
                    <p className="font-heading text-2xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.totalBottles)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Active Placements</p>
                    <p className="font-heading text-2xl font-bold mt-1 text-foreground">
                      {selectedDetailProduct.accountCount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">accounts</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Monthly Velocity</p>
                    <p className="font-heading text-2xl font-bold mt-1 text-foreground">
                      {formatNumber(selectedDetailProduct.avgBottlesPerMonth)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls/month</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3.5 bg-muted/20">
                    <p className="text-xs text-muted-foreground font-medium">Avg per Order Event</p>
                    <p className="font-heading text-2xl font-bold mt-1 text-foreground">
                      {selectedDetailProduct.avgBottlesPerOrder}{" "}
                      <span className="text-xs font-normal text-muted-foreground">btls/event</span>
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
      />
      <NotificationSidebar
        open={notificationSidebarOpen}
        onOpenChange={setNotificationSidebarOpen}
        alerts={frequencyAlerts}
        productAlerts={productAlerts}
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
    </div>
  );
}
