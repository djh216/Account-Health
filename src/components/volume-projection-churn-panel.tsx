"use client";

import { useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDays,
  formatMoney,
  formatNumber,
  formatPct,
  todayIso,
} from "@/lib/format";
import { downloadImminentChurnPdf } from "@/lib/report-export";
import { territoryTierLabel } from "@/lib/territory-value";
import { cn } from "@/lib/utils";
import {
  sortProjectionRows,
  type ChurnRiskTier,
  type PortfolioProjectionSummary,
  type ProjectionHorizon,
  type ProjectionSortKey,
  type SortDirection,
  type VolumeTrendTrajectory,
} from "@/lib/order-projections";

function ChurnBadge({
  tier,
  score,
}: {
  tier: ChurnRiskTier;
  score: number;
}) {
  switch (tier) {
    case "high":
      return (
        <span className="inline-flex max-w-full flex-wrap items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
          <ShieldAlert className="size-3.5 shrink-0" />
          <span className="break-words">High ({score}%)</span>
        </span>
      );
    case "moderate":
      return (
        <span className="inline-flex max-w-full flex-wrap items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="break-words">Moderate ({score}%)</span>
        </span>
      );
    case "low":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>Low ({score}%)</span>
        </span>
      );
  }
}

function TrajectoryBadge({ trajectory }: { trajectory: VolumeTrendTrajectory }) {
  switch (trajectory) {
    case "expanding":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <TrendingUp className="size-3.5" />
          Expanding
        </span>
      );
    case "steady":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Steady
        </span>
      );
    case "decelerating":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          <TrendingDown className="size-3.5" />
          Slowing
        </span>
      );
    case "churning":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
          <TrendingDown className="size-3.5" />
          Churn Risk
        </span>
      );
  }
}

export function VolumeProjectionChurnPanel({
  summary,
  onSelectAccount,
  repFilter = "all",
  asOf,
}: {
  summary: PortfolioProjectionSummary;
  onSelectAccount?: (accountName: string) => void;
  repFilter?: string;
  asOf?: string;
}) {
  const searchInputId = useId();
  const [horizon, setHorizon] = useState<ProjectionHorizon>(30);
  const [churnFilter, setChurnFilter] = useState<"all" | ChurnRiskTier | "churning">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{
    column: ProjectionSortKey;
    direction: SortDirection;
  }>({ column: "churnScore", direction: "desc" });
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  function toggleSort(column: ProjectionSortKey) {
    setSort((curr) =>
      curr.column === column
        ? { column, direction: curr.direction === "asc" ? "desc" : "asc" }
        : {
            column,
            direction:
              column === "accountName" || column === "expectedNextOrderDate"
                ? "asc"
                : "desc",
          },
    );
  }

  // Filtered and sorted accounts
  const filteredAccounts = useMemo(() => {
    let list = summary.accounts;

    if (churnFilter !== "all") {
      if (churnFilter === "churning") {
        list = list.filter((a) => a.trendTrajectory === "churning" || a.churnTier === "high");
      } else {
        list = list.filter((a) => a.churnTier === churnFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.accountName.toLowerCase().includes(q) ||
          (a.salesRep && a.salesRep.toLowerCase().includes(q)),
      );
    }

    return sortProjectionRows(list, sort.column, sort.direction);
  }, [summary.accounts, churnFilter, searchQuery, sort]);

  // User-removed accounts from the Imminent Churn Intervention report
  const [removedAccountNames, setRemovedAccountNames] = useState<string[]>([]);
  const [lastRemovedAccount, setLastRemovedAccount] = useState<string | null>(null);

  // All high churn accounts identified by the model
  const rawHighChurnAccounts = useMemo(
    () => summary.accounts.filter((a) => a.churnTier === "high"),
    [summary.accounts],
  );

  // High Churn Accounts for quick intervention callouts (excluding any removed accounts)
  const imminentChurnAccounts = useMemo(
    () => rawHighChurnAccounts.filter((a) => !removedAccountNames.includes(a.accountName)),
    [rawHighChurnAccounts, removedAccountNames],
  );

  function handleRemoveAccount(accountName: string) {
    setRemovedAccountNames((prev) =>
      prev.includes(accountName) ? prev : [...prev, accountName],
    );
    setLastRemovedAccount(accountName);
    setExportFeedback(`Removed "${accountName}" from the report.`);
    setTimeout(() => {
      setExportFeedback((current) => (current?.includes(`"${accountName}"`) ? null : current));
    }, 4500);
  }

  function handleResetRemoved() {
    setRemovedAccountNames([]);
    setLastRemovedAccount(null);
    setExportFeedback("Restored all removed accounts to the report.");
    setTimeout(() => setExportFeedback(null), 3500);
  }

  function handleUndoLastRemove() {
    if (!lastRemovedAccount) return;
    const restoredName = lastRemovedAccount;
    setRemovedAccountNames((prev) => prev.filter((name) => name !== restoredName));
    setLastRemovedAccount(null);
    setExportFeedback(`Restored "${restoredName}" to the report.`);
    setTimeout(() => setExportFeedback(null), 3500);
  }

  async function handlePrintImminentChurn() {
    if (imminentChurnAccounts.length === 0) return;
    setIsExportingPdf(true);
    setExportFeedback(null);
    try {
      downloadImminentChurnPdf({
        repFilter: repFilter ?? "all",
        asOf: asOf ?? todayIso(),
        generatedAt: new Date().toISOString(),
        accounts: imminentChurnAccounts,
      });
      setExportFeedback("Printable Churn Action Plan PDF downloaded.");
      setTimeout(() => setExportFeedback(null), 4500);
    } catch {
      setExportFeedback("Could not generate PDF. Please try again.");
      setTimeout(() => setExportFeedback(null), 4500);
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <span>Projected Next {horizon}d Volume</span>
            </CardDescription>
            <CardTitle className="font-heading text-2xl">
              {formatNumber(
                horizon === 30
                  ? summary.totalProjectedVolume30
                  : horizon === 60
                    ? summary.totalProjectedVolume60
                    : summary.totalProjectedVolume90,
              )}{" "}
              <span className="text-sm font-normal text-muted-foreground">bottles</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Based on historical order frequency and recent volume momentum
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardDescription>Baseline 90d vs Risk-Adjusted</CardDescription>
            <CardTitle className="font-heading text-2xl">
              {formatNumber(summary.totalRiskAdjustedVolume90)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {formatNumber(summary.totalBaselineVolume90)} btls
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              -{formatNumber(summary.totalBaselineVolume90 - summary.totalRiskAdjustedVolume90)} bottles
            </span>{" "}
            discounted for active churn & lapse risk
          </CardContent>
        </Card>

        <Card className={cn(summary.highChurnCount > 0 && "border-rose-300/80 bg-rose-50/20 dark:bg-rose-950/10")}>
          <CardHeader>
            <CardDescription className="text-rose-700 dark:text-rose-400 font-medium">
              High Churn Risk Accounts
            </CardDescription>
            <CardTitle className="font-heading text-2xl text-rose-700 dark:text-rose-400">
              {summary.highChurnCount}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                of {summary.accounts.length} accounts
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {summary.moderateChurnCount} accounts in moderate risk drift
          </CardContent>
        </Card>

        <Card className={cn(summary.totalMonthlyVolumeAtRisk > 0 && "border-amber-300/80")}>
          <CardHeader>
            <CardDescription>Monthly Volume at Risk</CardDescription>
            <CardTitle className="font-heading text-2xl text-amber-700 dark:text-amber-400">
              {formatNumber(summary.totalMonthlyVolumeAtRisk)}{" "}
              <span className="text-sm font-normal text-muted-foreground">btls / mo</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Estimated bottle volume lost per month if at-risk accounts churn
          </CardContent>
        </Card>
      </section>

      {/* Immediate Churn Intervention Callout */}
      {rawHighChurnAccounts.length > 0 ? (
        <Card className="border-rose-300/80 bg-rose-50/40 dark:bg-rose-950/20">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                  <ShieldAlert className="size-5 shrink-0" />
                  <CardTitle className="font-heading text-lg">
                    Imminent Churn Intervention Required ({imminentChurnAccounts.length} accounts
                    {removedAccountNames.length > 0 ? `, ${removedAccountNames.length} removed` : ""})
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-rose-950/80 dark:text-rose-300/80">
                  These accounts have significantly missed their reorder cadence, experienced steep
                  volume decline, or dropped core wine products. Proactive outreach can save them
                  before they switch to another distributor.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {removedAccountNames.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 border border-rose-300/70 bg-white/80 text-rose-900 shadow-2xs hover:bg-rose-100 hover:text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                    onClick={handleResetRemoved}
                    title="Restore all removed accounts to this report"
                  >
                    <RotateCcw className="size-3.5" data-icon="inline-start" />
                    <span>Reset Removed ({removedAccountNames.length})</span>
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-rose-300 bg-white/95 text-rose-900 shadow-2xs hover:bg-rose-100 hover:text-rose-950 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60"
                  onClick={handlePrintImminentChurn}
                  disabled={isExportingPdf || imminentChurnAccounts.length === 0}
                  title="Print or export printable PDF for Imminent Churn Intervention accounts"
                >
                  {isExportingPdf ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                      <span>Preparing PDF…</span>
                    </>
                  ) : (
                    <>
                      <Printer className="size-3.5" data-icon="inline-start" />
                      <span>Print Churn Action Plan</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
            {exportFeedback ? (
              <div className="mt-2 flex items-center justify-between rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-rose-950 border border-rose-200 shadow-2xs dark:bg-card dark:border-rose-900 dark:text-rose-200">
                <span>{exportFeedback}</span>
                {lastRemovedAccount && removedAccountNames.includes(lastRemovedAccount) ? (
                  <button
                    type="button"
                    onClick={handleUndoLastRemove}
                    className="ml-2 inline-flex items-center gap-1 font-semibold text-rose-700 underline hover:no-underline dark:text-rose-300"
                  >
                    <Undo2 className="size-3" />
                    Undo
                  </button>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            {imminentChurnAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-rose-300 bg-white/60 p-6 text-center text-xs text-rose-900 dark:border-rose-900 dark:bg-card/40 dark:text-rose-300">
                <p className="font-medium">
                  All {rawHighChurnAccounts.length} imminent churn accounts have been removed from this report.
                </p>
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-rose-300 bg-white hover:bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-card dark:text-rose-200"
                    onClick={handleResetRemoved}
                  >
                    <RotateCcw className="size-3.5" data-icon="inline-start" />
                    Restore All Removed Accounts
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {imminentChurnAccounts.map((account) => (
                  <div
                    key={account.accountName}
                    className="group relative rounded-lg border border-rose-200 bg-white/90 p-3 text-xs shadow-2xs transition hover:border-rose-300 dark:border-rose-900/60 dark:bg-card"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-1">
                        <span className="font-semibold text-foreground block text-sm break-words leading-tight" title={account.accountName}>
                          {account.accountName}
                        </span>
                        <span className="text-[11px] text-muted-foreground block break-words mt-0.5">
                          {account.salesRep ? `Rep: ${account.salesRep} · ` : ""}
                          {account.territoryTier ? `${territoryTierLabel(account.territoryTier)} Tier` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                          {account.churnScore}% Churn Risk
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAccount(account.accountName)}
                          className="rounded p-1 text-muted-foreground hover:bg-rose-100 hover:text-rose-900 dark:hover:bg-rose-950/60 dark:hover:text-rose-200 transition"
                          title={`Remove ${account.accountName} from report`}
                          aria-label={`Remove ${account.accountName} from report`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 text-muted-foreground">
                      <p className="font-medium text-rose-900 dark:text-rose-200">
                        {account.churnSignals[0]}
                      </p>
                      <p className="text-[11px] leading-snug">
                        <span className="font-medium text-foreground">Playbook: </span>
                        {account.retentionRecommendation}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rose-100 dark:border-rose-900/40 pt-2">
                      <span className="text-[11px] text-muted-foreground">
                        Run-rate: {account.monthlyVolumeAtRisk} btls/mo
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="text-xs text-rose-700 hover:bg-rose-100 hover:text-rose-950 dark:text-rose-300 dark:hover:bg-rose-950/60"
                          onClick={() => handleRemoveAccount(account.accountName)}
                          title={`Remove ${account.accountName} from report`}
                        >
                          <Trash2 className="size-3" data-icon="inline-start" />
                          <span>Remove Account</span>
                        </Button>
                        {onSelectAccount ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="text-xs text-rose-900 dark:text-rose-200 border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-900/40"
                            onClick={() => onSelectAccount(account.accountName)}
                          >
                            <ExternalLink className="size-3" data-icon="inline-start" />
                            <span>Review</span>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Main Projections & Churn Table Card */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">
                Account Volume Projections & Churn Risk
              </CardTitle>
              <CardDescription>
                Projected future purchasing volume modeled on historical order frequency and
                basket volume, with automated churn risk indicators.
              </CardDescription>
            </div>

            {/* Timeframe & Horizon Switcher */}
            <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1">
              <span className="text-xs font-medium text-muted-foreground px-2">
                Projection:
              </span>
              {([30, 60, 90] as ProjectionHorizon[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setHorizon(days)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    horizon === days
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Next {days}d
                </button>
              ))}
            </div>
          </div>

          {/* Search & Churn Filter Controls */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <label htmlFor={searchInputId} className="sr-only">
                Filter accounts
              </label>
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id={searchInputId}
                type="search"
                placeholder="Search accounts or sales reps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Risk filter:</span>
              <button
                type="button"
                onClick={() => setChurnFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  churnFilter === "all"
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All ({summary.accounts.length})
              </button>
              <button
                type="button"
                onClick={() => setChurnFilter("high")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  churnFilter === "high"
                    ? "bg-rose-100 text-rose-900 font-semibold dark:bg-rose-950 dark:text-rose-200"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                High Risk ({summary.highChurnCount})
              </button>
              <button
                type="button"
                onClick={() => setChurnFilter("moderate")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  churnFilter === "moderate"
                    ? "bg-amber-100 text-amber-900 font-semibold dark:bg-amber-950 dark:text-amber-200"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Moderate ({summary.moderateChurnCount})
              </button>
              <button
                type="button"
                onClick={() => setChurnFilter("low")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  churnFilter === "low"
                    ? "bg-emerald-100 text-emerald-900 font-semibold dark:bg-emerald-950 dark:text-emerald-200"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Low ({summary.lowChurnCount})
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 [&_[data-slot=table-container]]:overflow-x-hidden">
          <Table className="table-fixed w-full min-w-0 text-xs [&_th]:whitespace-normal [&_th]:break-words [&_th]:align-top [&_th]:leading-snug [&_th]:px-1.5 [&_td]:whitespace-normal [&_td]:break-words [&_td]:align-top [&_td]:px-1.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[17%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("accountName")}
                      className="inline-flex max-w-full items-start gap-1 text-left font-medium hover:text-foreground"
                    >
                      Account
                      {sort.column === "accountName" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[12%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("daysSinceLastOrder")}
                      className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 font-medium hover:text-foreground"
                    >
                      Cadence & Elapsed
                      {sort.column === "daysSinceLastOrder" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[12%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("expectedNextOrderDate")}
                      className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 font-medium hover:text-foreground"
                    >
                      Next Order Target
                      {sort.column === "expectedNextOrderDate" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[11%] text-right">
                    <button
                      type="button"
                      onClick={() =>
                        toggleSort(
                          horizon === 30
                            ? "projectedVolume30"
                            : "projectedVolume90",
                        )
                      }
                      className="inline-flex w-full max-w-full flex-wrap items-center justify-end gap-1 font-medium hover:text-foreground"
                    >
                      Proj. Vol ({horizon}d)
                      {sort.column === (horizon === 30 ? "projectedVolume30" : "projectedVolume90") ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[12%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("trendTrajectory")}
                      className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 font-medium hover:text-foreground"
                    >
                      Trajectory
                      {sort.column === "trendTrajectory" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[24%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("churnScore")}
                      className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 font-medium hover:text-foreground"
                    >
                      Churn Risk
                      {sort.column === "churnScore" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[12%] text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("monthlyVolumeAtRisk")}
                      className="inline-flex w-full max-w-full flex-wrap items-center justify-end gap-1 font-medium hover:text-foreground"
                    >
                      Vol at Risk
                      {sort.column === "monthlyVolumeAtRisk" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No accounts found matching the current search and churn filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => {
                    const projectedVol =
                      horizon === 30
                        ? account.projectedVolume30
                        : horizon === 60
                          ? account.projectedVolume60
                          : account.projectedVolume90;

                    const projectedOrders =
                      horizon === 30
                        ? account.projectedOrderCount30
                        : account.projectedOrderCount90;

                    return (
                      <TableRow
                        key={account.accountName}
                        onClick={() => onSelectAccount?.(account.accountName)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/50",
                          account.churnTier === "high" && "bg-rose-50/20 dark:bg-rose-950/10",
                        )}
                      >
                        {/* Account Name & Info */}
                        <TableCell className="min-w-0">
                          <div className="font-medium text-foreground break-words">
                            {account.accountName}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                            {account.salesRep ? (
                              <span>{account.salesRep}</span>
                            ) : null}
                            {account.territoryTier ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{territoryTierLabel(account.territoryTier)}</span>
                              </>
                            ) : null}
                          </div>
                        </TableCell>

                        {/* Cadence & Elapsed */}
                        <TableCell>
                          <div className="text-xs">
                            <span className="font-medium text-foreground">
                              Every {account.typicalIntervalDays}d
                            </span>
                            <span className="block text-muted-foreground">
                              {formatDays(account.daysSinceLastOrder)}
                              {account.isOverdueForOrder ? (
                                <span className="text-rose-600 dark:text-rose-400 font-semibold ml-1">
                                  (+{account.daysOverdue}d)
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </TableCell>

                        {/* Next Order Target */}
                        <TableCell>
                          <div className="text-xs">
                            <span className="font-medium text-foreground block">
                              {formatDate(account.expectedNextOrderDate)}
                            </span>
                            {account.isOverdueForOrder ? (
                              <span className="text-rose-600 dark:text-rose-400 font-medium">
                                Overdue by {account.daysOverdue}d
                              </span>
                            ) : account.daysUntilExpectedOrder !== null ? (
                              <span className="text-muted-foreground">
                                in {account.daysUntilExpectedOrder} day{account.daysUntilExpectedOrder === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>

                        {/* Projected Volume */}
                        <TableCell className="text-right">
                          <div className="tabular-nums font-semibold text-foreground">
                            {formatNumber(projectedVol)} btls
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            ~{projectedOrders} orders
                          </div>
                        </TableCell>

                        {/* Trajectory & 45-day volume pace */}
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <TrajectoryBadge trajectory={account.trendTrajectory} />
                            <span
                              className={cn(
                                "text-[11px] font-medium tabular-nums",
                                account.quarterlyPaceDeltaPct !== null && account.quarterlyPaceDeltaPct > 0
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : account.quarterlyPaceDeltaPct !== null && account.quarterlyPaceDeltaPct < 0
                                  ? "text-rose-700 dark:text-rose-400"
                                  : "text-muted-foreground",
                              )}
                              title={`45-day volume: ${account.paceLast3Months} btls (recent) vs ${account.pacePrior3Months} btls (prior 45 days)`}
                            >
                              45d:{" "}
                              {account.quarterlyPaceDeltaPct !== null
                                ? formatPct(account.quarterlyPaceDeltaPct)
                                : "—"}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {account.paceLast3Months} vs {account.pacePrior3Months} btls
                            </span>
                          </div>
                        </TableCell>

                        {/* Churn Risk Score */}
                        <TableCell className="min-w-0">
                          <ChurnBadge tier={account.churnTier} score={account.churnScore} />
                          <span
                            className="mt-0.5 block text-[11px] leading-snug text-muted-foreground break-words"
                            title={account.churnSignals[0]}
                          >
                            {account.churnSignals[0]}
                          </span>
                        </TableCell>

                        {/* Monthly Volume at Risk */}
                        <TableCell className="text-right tabular-nums">
                          {account.monthlyVolumeAtRisk > 0 ? (
                            <div>
                              <span className="font-semibold text-rose-700 dark:text-rose-400">
                                {formatNumber(account.monthlyVolumeAtRisk)} btls/mo
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
