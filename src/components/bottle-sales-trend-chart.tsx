"use client";

import { parseISO, startOfMonth, startOfWeek } from "date-fns";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Check,
  Layers,
  Search,
  Square,
  TrendingUp,
  Wine,
  X,
  Sparkles,
} from "lucide-react";
import {
  augmentDataWithTrendlines,
  getSafeTrendKey,
  describeFitConfidence,
  formatTrendSlope,
  type TrendlineDefinition,
} from "@/lib/trendline";
import { TrendPointAnalyticsDialog } from "@/components/trend-point-analytics-dialog";
import type { ProductTrendPoint } from "@/lib/product-trends";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import {
  buildBottleTrendData,
  bottleTrendOrdersScopeKey,
  TREND_PALETTE,
  type TrendGranularity,
  type TrendTimeframe,
} from "@/lib/bottle-trends";
import type { Order } from "@/lib/types";
import type { ProductTrajectory } from "@/lib/product-trends";
import { cn } from "@/lib/utils";

function AccountTrajectoryPill({
  trajectory,
  windowLabel,
}: {
  trajectory: ProductTrajectory;
  windowLabel: "30d" | "90d";
}) {
  const ageLabel = windowLabel;
  switch (trajectory) {
    case "accelerating":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <ArrowUpRight className="size-3" />
          Accelerating ({windowLabel})
        </span>
      );
    case "steady":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Steady ({windowLabel})
        </span>
      );
    case "decelerating":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
          <ArrowDownRight className="size-3" />
          Decelerating ({windowLabel})
        </span>
      );
    case "new":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
          <Sparkles className="size-3" />
          New (&lt;{ageLabel})
        </span>
      );
    case "dormant":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          Dormant (&gt;{ageLabel})
        </span>
      );
  }
}

function paceDeltaPercent(recent: number, prior: number): number | null {
  if (prior > 0) return Math.round(((recent - prior) / prior) * 100);
  if (recent > 0) return 100;
  return null;
}

function PaceSummaryCard({
  label,
  deltaPct,
  detail,
}: {
  label: string;
  deltaPct: number | null;
  detail: string;
}) {
  const direction =
    deltaPct !== null && deltaPct > 0
      ? "expanding"
      : deltaPct !== null && deltaPct < 0
        ? "slowing"
        : "steady";

  return (
    <Card className="border-border">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {deltaPct !== null && deltaPct < 0 ? (
            <ArrowDownRight className="size-4 text-rose-600 dark:text-rose-400" />
          ) : (
            <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{label}</span>
        </CardDescription>
        <CardTitle className="font-heading text-2xl flex items-baseline gap-2">
          <span
            className={cn(
              "tabular-nums",
              deltaPct !== null && deltaPct > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : deltaPct !== null && deltaPct < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground",
            )}
          >
            {deltaPct !== null ? `${deltaPct > 0 ? "+" : ""}${deltaPct}%` : "—"}
          </span>
          <span className="text-xs font-normal text-muted-foreground">{direction}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground tabular-nums">{detail}</CardContent>
    </Card>
  );
}

function PaceComparisonCell({
  deltaPct,
  recent,
  prior,
  title,
}: {
  deltaPct: number | null;
  recent: number;
  prior: number;
  title: string;
}) {
  return (
    <TableCell className="text-right tabular-nums">
      <div className="flex flex-col items-end">
        <span
          className={cn(
            "font-semibold text-xs tabular-nums",
            deltaPct !== null && deltaPct > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : deltaPct !== null && deltaPct < 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground",
          )}
          title={title}
        >
          {deltaPct !== null ? `${deltaPct > 0 ? "+" : ""}${deltaPct}%` : "—"}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatNumber(recent)} vs {formatNumber(prior)} btls
        </span>
      </div>
    </TableCell>
  );
}

type BottleSalesTrendChartProps = {
  orders: Order[];
  asOf?: string;
  initialSelectedAccounts?: string[];
  onSelectAccount?: (accountName: string) => void;
  /** When true, chart data updates in a transition so the rep filter stays responsive. */
  deferHeavyCompute?: boolean;
};

export function BottleSalesTrendChart({
  orders,
  asOf,
  initialSelectedAccounts,
  onSelectAccount,
  deferHeavyCompute = false,
}: BottleSalesTrendChartProps) {
  const searchInputId = useId();
  const chartOrders = useDeferredValue(orders);
  const trendOrders = deferHeavyCompute || orders.length > 800 ? chartOrders : orders;
  const chartDataStale =
    (deferHeavyCompute || orders.length > 800) && trendOrders !== orders;
  /** Keep chart + account picker aligned while deferred rep switches catch up. */
  const activeOrders = chartDataStale ? trendOrders : orders;

  // Distinct account names ordered by volume
  const allAccountsSorted = useMemo(() => {
    const volMap = new Map<string, number>();
    for (const o of activeOrders) {
      const b = o.cases > 0 ? o.cases : 1;
      volMap.set(o.accountName, (volMap.get(o.accountName) || 0) + b);
    }
    return Array.from(volMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [activeOrders]);

  const ordersScopeKey = useMemo(
    () => bottleTrendOrdersScopeKey(activeOrders),
    [activeOrders],
  );

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    () => initialSelectedAccounts ?? [],
  );

  const appliedInitialSelectionRef = useRef(
    Boolean(initialSelectedAccounts && initialSelectedAccounts.length > 0),
  );

  useEffect(() => {
    if (appliedInitialSelectionRef.current) return;
    setSelectedAccounts(allAccountsSorted.length ? [...allAccountsSorted] : []);
  }, [ordersScopeKey, allAccountsSorted]);

  const effectiveSelectedAccounts = useMemo(() => {
    if (selectedAccounts.length === 0) return [];
    const valid = new Set(allAccountsSorted);
    const filtered = selectedAccounts.filter((account) => valid.has(account));
    if (filtered.length > 0) return filtered;
    return allAccountsSorted;
  }, [selectedAccounts, allAccountsSorted]);

  const [granularity, setGranularity] = useState<TrendGranularity>("monthly");
  const [timeframe, setTimeframe] = useState<TrendTimeframe>("all");
  const [includeCurrentMonth, setIncludeCurrentMonth] = useState(true);
  const [showAggregateLine, setShowAggregateLine] = useState(true);
  const [showIndividualLines, setShowIndividualLines] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Color mapping per selected account
  const accountColorMap = useMemo(() => {
    const map = new Map<string, string>();
    effectiveSelectedAccounts.forEach((acc, index) => {
      // Pick color from palette, cycling if more than palette length
      map.set(acc, TREND_PALETTE[index % TREND_PALETTE.length]);
    });
    return map;
  }, [effectiveSelectedAccounts]);

  // Build aggregate trend data
  const {
    data,
    accountSummaries,
    totalBottles,
    peakPeriod,
    avgMonthlyBottles,
  } = useMemo(() => {
    return buildBottleTrendData({
      orders: trendOrders,
      selectedAccounts: effectiveSelectedAccounts,
      granularity,
      timeframe,
      asOf,
      includeAccountBreakdown: showIndividualLines,
    });
  }, [
    trendOrders,
    effectiveSelectedAccounts,
    granularity,
    timeframe,
    asOf,
    showIndividualLines,
  ]);

  const chartSeries = useMemo(() => {
    if (includeCurrentMonth) return data;
    const asOfDate = parseISO((asOf ?? new Date().toISOString()).slice(0, 10));
    const periodStart =
      granularity === "weekly"
        ? startOfWeek(asOfDate, { weekStartsOn: 1 }).getTime()
        : startOfMonth(asOfDate).getTime();
    return data.filter((point) => point.timestamp < periodStart);
  }, [includeCurrentMonth, data, asOf, granularity]);

  const [showTrendlines, setShowTrendlines] = useState(true);

  // Compute trendline definitions for aggregate and selected accounts
  const trendlineDefs = useMemo<TrendlineDefinition[]>(() => {
    const defs: TrendlineDefinition[] = [];
    if (showAggregateLine) {
      defs.push({ sourceKey: "totalBottles", trendKey: "totalBottles_trend" });
    }
    if (showIndividualLines) {
      for (const acc of effectiveSelectedAccounts) {
        defs.push({ sourceKey: acc, trendKey: getSafeTrendKey(acc) });
      }
    }
    return defs;
  }, [showAggregateLine, showIndividualLines, effectiveSelectedAccounts]);

  const { data: chartDataWithTrendlines, statsMap: trendStatsMap } = useMemo(() => {
    if (!showTrendlines || trendlineDefs.length === 0) {
      return { data: chartSeries, statsMap: new Map() };
    }
    return augmentDataWithTrendlines(chartSeries, trendlineDefs);
  }, [chartSeries, trendlineDefs, showTrendlines]);

  const aggregateTrendStats = trendStatsMap.get("totalBottles");

  const [selectedPoint, setSelectedPoint] = useState<ProductTrendPoint | null>(null);
  const [pointModalOpen, setPointModalOpen] = useState(false);

  const convertedPoints = useMemo((): ProductTrendPoint[] => {
    return chartDataWithTrendlines.map((d) => ({
      ...d,
      activeAccountsCount: 0,
    }));
  }, [chartDataWithTrendlines]);

  // Filtered account list for selector
  const filteredAccountsForSelection = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allAccountsSorted;
    return allAccountsSorted.filter((name) => name.toLowerCase().includes(q));
  }, [allAccountsSorted, searchQuery]);

  function runChartFilterUpdate(update: () => void) {
    startTransition(update);
  }

  function handleToggleAccount(account: string) {
    setSelectedAccounts((prev) => {
      if (prev.includes(account)) {
        return prev.filter((a) => a !== account);
      }
      return [...prev, account];
    });
  }

  function handleSelectTop(count: number) {
    setSelectedAccounts(allAccountsSorted.slice(0, count));
  }

  function handleSelectAll() {
    setSelectedAccounts([...allAccountsSorted]);
  }

  function handleClearAll() {
    setSelectedAccounts([]);
  }

  const aggregatePaceLastMonth = useMemo(() => {
    return accountSummaries.reduce((sum, a) => sum + a.paceLastMonth, 0);
  }, [accountSummaries]);

  const aggregatePacePriorMonth = useMemo(() => {
    return accountSummaries.reduce((sum, a) => sum + a.pacePriorMonth, 0);
  }, [accountSummaries]);

  const aggregateMonthPaceDeltaPct = useMemo(
    () => paceDeltaPercent(aggregatePaceLastMonth, aggregatePacePriorMonth),
    [aggregatePaceLastMonth, aggregatePacePriorMonth],
  );

  // Aggregate 3-month pace across selected accounts
  const aggregatePaceLast3Months = useMemo(() => {
    return accountSummaries.reduce((sum, a) => sum + a.paceLast3Months, 0);
  }, [accountSummaries]);

  const aggregatePacePrior3Months = useMemo(() => {
    return accountSummaries.reduce((sum, a) => sum + a.pacePrior3Months, 0);
  }, [accountSummaries]);

  const aggregatePaceDeltaPct = useMemo(
    () => paceDeltaPercent(aggregatePaceLast3Months, aggregatePacePrior3Months),
    [aggregatePaceLast3Months, aggregatePacePrior3Months],
  );

  return (
    <div className="space-y-6">
      {/* KPI Overview Cards */}
      <section className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wine className="size-4 text-primary shrink-0" />
              <span className="font-medium text-xs">Total Bottles Sold</span>
            </CardDescription>
            <CardTitle className="font-heading text-2xl">
              {formatNumber(totalBottles)}{" "}
              <span className="text-sm font-normal text-muted-foreground">btls</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across{" "}
            <span className="font-medium text-foreground">
              {selectedAccounts.length} selected account{selectedAccounts.length === 1 ? "" : "s"}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Avg. Monthly Velocity</span>
            </CardDescription>
            <CardTitle className="font-heading text-2xl">
              {formatNumber(avgMonthlyBottles)}{" "}
              <span className="text-sm font-normal text-muted-foreground">btls / mo</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            ~{formatNumber(avgMonthlyBottles)} bottles/mo aggregate pace
          </CardContent>
        </Card>

        <PaceSummaryCard
          label="30-Day Pace vs Prior"
          deltaPct={aggregateMonthPaceDeltaPct}
          detail={`${formatNumber(aggregatePaceLastMonth)} btls last 30 days vs ${formatNumber(aggregatePacePriorMonth)} prior 30 days`}
        />

        <PaceSummaryCard
          label="Last 90-Day Pace vs Prior"
          deltaPct={aggregatePaceDeltaPct}
          detail={`${formatNumber(aggregatePaceLast3Months)} btls in the last 90 days vs ${formatNumber(aggregatePacePrior3Months)} in the prior 90 days`}
        />

        <Card className="border-border">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <BarChart2 className="size-4 text-amber-600 dark:text-amber-400" />
              <span>Peak Sales Period</span>
            </CardDescription>
            <CardTitle className="font-heading text-2xl">
              {peakPeriod ? formatNumber(peakPeriod.bottles) : "0"}{" "}
              <span className="text-sm font-normal text-muted-foreground">btls</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {peakPeriod ? `Reached in ${peakPeriod.label}` : "No order history in period"}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Layers className="size-4 text-primary" />
              <span>Selected Accounts</span>
            </CardDescription>
            <CardTitle className="font-heading text-2xl">
              {selectedAccounts.length}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                of {allAccountsSorted.length} accounts
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {selectedAccounts.length === 0
              ? "Select accounts below to view trends"
              : "Active in aggregate & breakdown lines"}
          </CardContent>
        </Card>
      </section>

      {/* Main Chart Card */}
      <Card className="overflow-hidden border-border">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">
                Bottle Sales Trend Over Time
              </CardTitle>
              <CardDescription>
                Historical bottle purchasing trajectory for selected accounts, showing aggregate
                volume and per-account distribution patterns.
                {includeCurrentMonth
                  ? granularity === "monthly"
                    ? " The current month is included."
                    : " The current week is included."
                  : granularity === "monthly"
                    ? " The current month is hidden."
                    : " The current week is hidden."}
              </CardDescription>
            </div>

            {/* Granularity & Timeframe Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Granularity */}
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => runChartFilterUpdate(() => setGranularity("monthly"))}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium transition",
                    granularity === "monthly"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => runChartFilterUpdate(() => setGranularity("weekly"))}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium transition",
                    granularity === "weekly"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Weekly
                </button>
              </div>

              {/* Timeframe */}
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
                {(
                  [
                    { id: "all", label: "All Time" },
                    { id: "12m", label: "12 Mos" },
                    { id: "6m", label: "6 Mos" },
                    { id: "90d", label: "90 Days" },
                  ] as const
                ).map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => runChartFilterUpdate(() => setTimeframe(tf.id))}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition",
                      timeframe === tf.id
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

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
                      : "Hide the current week from the chart"
                    : granularity === "monthly"
                      ? "Show the current month on the chart"
                      : "Show the current week on the chart"
                }
              >
                {granularity === "monthly" ? "Current Month" : "Current Week"}{" "}
                {includeCurrentMonth ? "ON" : "OFF"}
              </Button>

              {/* Line Visibility Toggles */}
              <div className="flex items-center gap-2 text-xs">
                <Button
                  size="xs"
                  variant={showAggregateLine ? "default" : "outline"}
                  onClick={() =>
                    runChartFilterUpdate(() => setShowAggregateLine((prev) => !prev))
                  }
                  className="text-xs"
                >
                  Aggregate Line
                </Button>
                <Button
                  size="xs"
                  variant={showIndividualLines ? "secondary" : "outline"}
                  onClick={() =>
                    runChartFilterUpdate(() => setShowIndividualLines((prev) => !prev))
                  }
                  className="text-xs"
                >
                  Account Lines
                </Button>
                <Button
                  size="xs"
                  variant={showTrendlines ? "default" : "outline"}
                  onClick={() =>
                    runChartFilterUpdate(() => setShowTrendlines((prev) => !prev))
                  }
                  className={cn(
                    "text-xs gap-1.5 transition-colors font-medium",
                    showTrendlines
                      ? "bg-rose-950 text-rose-100 hover:bg-rose-900 border-rose-800"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TrendingUp className="size-3" />
                  Trendlines {showTrendlines ? "ON" : "OFF"}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className={cn("pt-6", chartDataStale && "opacity-60")}>
          {chartDataStale ? (
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              Updating chart for the selected rep…
            </p>
          ) : null}
          {chartSeries.length === 0 || effectiveSelectedAccounts.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed text-center p-6">
              <Wine className="size-10 text-muted-foreground/60 mb-2" />
              <p className="font-heading font-semibold text-foreground text-lg">
                {selectedAccounts.length === 0
                  ? "No accounts selected"
                  : "No sales data found for the selected timeframe"}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                {selectedAccounts.length === 0
                  ? "Select one or more accounts below to render the bottle sales trend."
                  : "Try expanding the timeframe to 12 Months or All Time."}
              </p>
              {selectedAccounts.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => handleSelectTop(5)}
                >
                  Select Top 5 Accounts
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-primary font-medium">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>Interactive Analytics: Click any point or dot on the chart to inspect period analytics & orders</span>
                </div>
                {selectedPoint && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 text-[11px] gap-1 shrink-0"
                    onClick={() => setPointModalOpen(true)}
                  >
                    Inspect {selectedPoint.label}
                  </Button>
                )}
              </div>

              {/* Trendline Regression Analytics Banner */}
              {showTrendlines && aggregateTrendStats && chartDataWithTrendlines.length >= 2 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200/60 bg-rose-50/50 p-2.5 text-xs dark:border-rose-950/40 dark:bg-rose-950/20">
                  <div className="flex flex-wrap items-center gap-3.5">
                    <div className="flex items-center gap-1.5 font-semibold text-rose-900 dark:text-rose-100">
                      <TrendingUp className="size-4 text-rose-600 dark:text-rose-400" />
                      <span>Aggregate Trendline:</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>Velocity:</span>
                      <span className="font-bold text-foreground tabular-nums">
                        {formatTrendSlope(aggregateTrendStats.slope, "btls", granularity)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Trajectory:</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold",
                          aggregateTrendStats.direction === "up"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : aggregateTrendStats.direction === "down"
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        {aggregateTrendStats.direction === "up" ? (
                          <ArrowUpRight className="size-3" />
                        ) : aggregateTrendStats.direction === "down" ? (
                          <ArrowDownRight className="size-3" />
                        ) : null}
                        {aggregateTrendStats.direction === "up"
                          ? "Expanding Pace"
                          : aggregateTrendStats.direction === "down"
                          ? "Contracting Pace"
                          : "Steady"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span>Confidence:</span>
                      <span
                        className={cn(
                          "text-[11px] px-1.5 py-0.5 rounded font-medium border",
                          describeFitConfidence(aggregateTrendStats.rSquared).badgeClass
                        )}
                      >
                        R² = {(aggregateTrendStats.rSquared * 100).toFixed(0)}% ·{" "}
                        {describeFitConfidence(aggregateTrendStats.rSquared).label}
                      </span>
                    </div>
                    {aggregateTrendStats.pctChange !== null && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>Net Drift:</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {aggregateTrendStats.pctChange > 0 ? "+" : ""}
                          {aggregateTrendStats.pctChange}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground hidden sm:block">
                    Dashed lines represent linear regression fits
                  </div>
                </div>
              )}

              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartDataWithTrendlines}
                    margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
                    onClick={(state) => {
                      const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : -1;
                      const raw =
                        index >= 0
                          ? chartDataWithTrendlines[index]
                          : chartDataWithTrendlines.find((d) => d.label === state?.activeLabel);
                      if (raw) {
                        setSelectedPoint(
                          convertedPoints.find((p) => p.key === raw.key) || {
                            ...raw,
                            activeAccountsCount: 0,
                          },
                        );
                        setPointModalOpen(true);
                      }
                    }}
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
                      tickFormatter={(val: number) => `${val} btls`}
                      width={65}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const point = payload[0].payload as (typeof chartDataWithTrendlines)[0];

                        return (
                          <div className="rounded-xl border border-border bg-popover/95 p-3.5 shadow-xl backdrop-blur-md text-xs min-w-[210px]">
                            <div className="border-b pb-2 mb-2">
                              <span className="font-heading font-semibold text-sm text-foreground block">
                                {label}
                              </span>
                              <div className="flex items-center justify-between text-muted-foreground mt-0.5">
                                <span>Aggregate Total:</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-foreground tabular-nums">
                                    {formatNumber(point.totalBottles)} bottles
                                  </span>
                                  {showTrendlines && typeof point.totalBottles_trend === "number" && (
                                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                                      (trend: {formatNumber(Math.round(point.totalBottles_trend))})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {showIndividualLines && selectedAccounts.length > 0 && (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                  Account Breakdown
                                </span>
                                {selectedAccounts
                                  .filter((acc) => (point[acc] as number) > 0)
                                  .sort(
                                    (a, b) =>
                                      ((point[b] as number) || 0) -
                                      ((point[a] as number) || 0),
                                  )
                                  .map((acc) => {
                                    const trendKey = getSafeTrendKey(acc);
                                    const trendVal = point[trendKey] as number | undefined;
                                    return (
                                      <div
                                        key={acc}
                                        className="flex items-center justify-between gap-3 text-[11px]"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span
                                            className="size-2 rounded-full shrink-0"
                                            style={{
                                              backgroundColor:
                                                accountColorMap.get(acc) || "#9f1239",
                                            }}
                                          />
                                          <span className="text-muted-foreground whitespace-normal break-words">
                                            {acc}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="font-semibold tabular-nums text-foreground">
                                            {formatNumber(point[acc] as number)} btls
                                          </span>
                                          {showTrendlines && typeof trendVal === "number" && (
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                              ~{formatNumber(Math.round(trendVal))}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}

                            <div className="pt-2 mt-2 border-t border-border/40 text-center">
                              <span className="text-[10px] font-medium text-primary">
                                👆 Click dot to open full period data & analytics
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      wrapperStyle={{ paddingTop: "15px" }}
                      formatter={(value) => (
                        <span className="text-xs text-foreground font-medium mr-2">
                          {value}
                        </span>
                      )}
                    />

                    {/* Highlighted Aggregate Line */}
                    {showAggregateLine && (
                      <Line
                        type="monotone"
                        dataKey="totalBottles"
                        name="Aggregate Total (Bottles)"
                        stroke="#881337"
                        strokeWidth={3.5}
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
                            const raw = (dotProps as { payload?: (typeof chartDataWithTrendlines)[0] })?.payload;
                            if (raw) {
                              setSelectedPoint(
                                convertedPoints.find((p) => p.key === raw.key) || {
                                  ...raw,
                                  activeAccountsCount: 0,
                                },
                              );
                              setPointModalOpen(true);
                            }
                          },
                        }}
                      />
                    )}

                    {/* Aggregate Linear Trendline */}
                    {showAggregateLine && showTrendlines && (
                      <Line
                        type="linear"
                        dataKey="totalBottles_trend"
                        name="Aggregate Trend (Linear Fit)"
                        stroke="#be123c"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                      />
                    )}

                    {/* Individual Selected Account Lines */}
                    {showIndividualLines &&
                      selectedAccounts.map((account) => (
                        <Line
                          key={account}
                          type="monotone"
                          dataKey={account}
                          name={account}
                          stroke={accountColorMap.get(account) || "#2563eb"}
                          strokeWidth={1.8}
                          strokeDasharray={selectedAccounts.length > 6 ? "4 4" : undefined}
                          dot={{
                            r: 3.5,
                            fill: accountColorMap.get(account) || "#2563eb",
                            stroke: "#ffffff",
                            strokeWidth: 1.2,
                            className: "cursor-pointer transition-all hover:scale-125 hover:stroke-[2px]",
                          }}
                          activeDot={{
                            r: 6.5,
                            fill: accountColorMap.get(account) || "#2563eb",
                            stroke: "#ffffff",
                            strokeWidth: 2,
                            className: "cursor-pointer",
                            onClick: (dotProps: unknown) => {
                              const raw = (dotProps as { payload?: (typeof chartDataWithTrendlines)[0] })?.payload;
                              if (raw) {
                                setSelectedPoint(
                                  convertedPoints.find((p) => p.key === raw.key) || {
                                    ...raw,
                                    activeAccountsCount: 0,
                                  },
                                );
                                setPointModalOpen(true);
                              }
                            },
                          }}
                        />
                      ))}

                    {/* Individual Selected Account Linear Trendlines */}
                    {showIndividualLines &&
                      showTrendlines &&
                      selectedAccounts.map((account) => {
                        const trendKey = getSafeTrendKey(account);
                        const color = accountColorMap.get(account) || "#2563eb";
                        return (
                          <Line
                            key={trendKey}
                            type="linear"
                            dataKey={trendKey}
                            name={`${account} (Trend)`}
                            stroke={color}
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            strokeOpacity={0.65}
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                          />
                        );
                      })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Selection Management Section */}
      <Card className="border-border">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-heading text-lg">
                Select Accounts for Trend Comparison
              </CardTitle>
              <CardDescription>
                Choose which accounts to include in the aggregate total and breakdown lines.
              </CardDescription>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                className="text-xs"
                onClick={() => handleSelectTop(5)}
              >
                Top 5
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="text-xs"
                onClick={() => handleSelectTop(10)}
              >
                Top 10
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="text-xs"
                onClick={handleSelectAll}
              >
                Select All ({allAccountsSorted.length})
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClearAll}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Search Input for Account Filter */}
          <div className="mt-3 relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id={searchInputId}
              type="search"
              placeholder="Search accounts to select or compare…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* Active Selection Chips */}
          {selectedAccounts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Currently Comparing ({selectedAccounts.length})
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Click &apos;×&apos; on any chip to remove
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                {selectedAccounts.map((account) => {
                  const color = accountColorMap.get(account) || "#881337";
                  return (
                    <Badge
                      key={account}
                      variant="outline"
                      className="flex items-center gap-1.5 py-1 px-2.5 text-xs bg-card hover:bg-muted/60 transition"
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium">{account}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleAccount(account)}
                        className="ml-1 rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                        title={`Remove ${account}`}
                      >
                        <X className="size-3" />
                        <span className="sr-only">Remove {account}</span>
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Account Selection Multi-grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-64 overflow-y-auto pr-1 border rounded-lg p-2.5 bg-muted/20">
            {filteredAccountsForSelection.map((account) => {
              const isSelected = selectedAccounts.includes(account);
              const color = accountColorMap.get(account);

              return (
                <button
                  key={account}
                  type="button"
                  onClick={() => handleToggleAccount(account)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs text-left transition border",
                    isSelected
                      ? "bg-card border-primary/40 font-semibold shadow-2xs text-foreground"
                      : "bg-background/80 border-transparent hover:bg-card hover:border-border text-muted-foreground",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isSelected ? (
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: color || "#881337" }}
                      />
                    ) : (
                      <Square className="size-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span className="break-words leading-tight">{account}</span>
                  </div>
                  {isSelected && (
                    <Check className="size-3.5 text-primary shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Accounts Performance Table */}
      {accountSummaries.length > 0 && (
        <Card className="border-border overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="font-heading text-lg">
              Selected Accounts Bottle Breakdown
            </CardTitle>
            <CardDescription>
              Volume and purchasing history for selected accounts. The 30-day pace is the last 30 days versus the prior 30 days. The 90-day pace is the last 90 days versus the 90 days before that.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Total Bottles</TableHead>
                    <TableHead className="text-right">Avg Bottles / Order</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Monthly Velocity</TableHead>
                    <TableHead className="text-right whitespace-nowrap">30-Day Pace vs Prior</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Trajectory (30d)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Last 90-Day Pace vs Prior</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Trajectory (90d)</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Last Order Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountSummaries.map((summary) => {
                    const color = accountColorMap.get(summary.accountName);
                    const avgPerOrder = Math.round(
                      summary.totalBottles / Math.max(1, summary.orderCount),
                    );
                    return (
                      <TableRow
                        key={summary.accountName}
                        onClick={() => onSelectAccount?.(summary.accountName)}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <TableCell>
                          <span
                            className="size-3 rounded-full inline-block"
                            style={{ backgroundColor: color || "#881337" }}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {summary.accountName}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-foreground">
                          {formatNumber(summary.totalBottles)} btls
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatNumber(avgPerOrder)} btls/order
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">
                          {formatNumber(summary.avgBottlesPerMonth)} btls/mo
                        </TableCell>
                        <PaceComparisonCell
                          deltaPct={summary.monthlyPaceDeltaPct}
                          recent={summary.paceLastMonth}
                          prior={summary.pacePriorMonth}
                          title={`30-day pace: ${formatNumber(summary.paceLastMonth)} btls last 30 days vs ${formatNumber(summary.pacePriorMonth)} btls prior 30 days`}
                        />
                        <TableCell className="text-right whitespace-nowrap">
                          <AccountTrajectoryPill
                            trajectory={summary.monthlyTrajectory}
                            windowLabel="30d"
                          />
                        </TableCell>
                        <PaceComparisonCell
                          deltaPct={summary.quarterlyPaceDeltaPct}
                          recent={summary.paceLast3Months}
                          prior={summary.pacePrior3Months}
                          title={`Last 90 days: ${formatNumber(summary.paceLast3Months)} btls vs ${formatNumber(summary.pacePrior3Months)} btls in the prior 90 days`}
                        />
                        <TableCell className="text-right whitespace-nowrap">
                          <AccountTrajectoryPill
                            trajectory={summary.quarterlyTrajectory}
                            windowLabel="90d"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {summary.orderCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                          {formatDate(summary.lastOrderDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactive Trend Point Analytics Dialog */}
      <TrendPointAnalyticsDialog
        open={pointModalOpen}
        onOpenChange={setPointModalOpen}
        point={selectedPoint}
        allPoints={convertedPoints}
        orders={orders}
        granularity={granularity}
        asOf={asOf}
        onSelectPoint={(pt) => setSelectedPoint(pt)}
      />
    </div>
  );
}
