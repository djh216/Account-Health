"use client";

import { useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
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
} from "@/lib/format";
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
        <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-400">
          <ShieldAlert className="size-3.5 shrink-0" />
          <span>High ({score}%)</span>
        </span>
      );
    case "moderate":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>Moderate ({score}%)</span>
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
}: {
  summary: PortfolioProjectionSummary;
  onSelectAccount?: (accountName: string) => void;
}) {
  const searchInputId = useId();
  const [horizon, setHorizon] = useState<ProjectionHorizon>(30);
  const [churnFilter, setChurnFilter] = useState<"all" | ChurnRiskTier | "churning">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{
    column: ProjectionSortKey;
    direction: SortDirection;
  }>({ column: "churnScore", direction: "desc" });

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

  // High Churn Accounts for quick intervention callouts
  const imminentChurnAccounts = useMemo(
    () => summary.accounts.filter((a) => a.churnTier === "high"),
    [summary.accounts],
  );

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
            Est. Revenue:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(
                horizon === 30
                  ? summary.totalProjectedRevenue30
                  : summary.totalProjectedRevenue90,
              )}
            </span>{" "}
            based on historical frequency
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
            Est. Monthly Revenue at Risk:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(summary.totalMonthlyRevenueAtRisk)}
            </span>
          </CardContent>
        </Card>
      </section>

      {/* Immediate Churn Intervention Callout */}
      {imminentChurnAccounts.length > 0 ? (
        <Card className="border-rose-300/80 bg-rose-50/40 dark:bg-rose-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <ShieldAlert className="size-5" />
              <CardTitle className="font-heading text-lg">
                Imminent Churn Intervention Required ({imminentChurnAccounts.length} accounts)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-rose-950/80 dark:text-rose-300/80">
              These accounts have significantly missed their reorder cadence, experienced steep
              volume decline, or dropped core wine products. Proactive outreach can save them
              before they switch to another distributor.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {imminentChurnAccounts.map((account) => (
                <div
                  key={account.accountName}
                  className="rounded-lg border border-rose-200 bg-white/90 p-3 text-xs shadow-2xs dark:border-rose-900/60 dark:bg-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-foreground block text-sm">
                        {account.accountName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {account.salesRep ? `Rep: ${account.salesRep} · ` : ""}
                        {account.territoryTier ? `${territoryTierLabel(account.territoryTier)} Tier` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                      {account.churnScore}% Churn Risk
                    </span>
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

                  <div className="mt-3 flex items-center justify-between border-t pt-2">
                    <span className="text-[11px] text-muted-foreground">
                      Run-rate: {account.monthlyVolumeAtRisk} btls/mo
                    </span>
                    {onSelectAccount ? (
                      <Button
                        size="xs"
                        variant="outline"
                        className="text-xs text-rose-900 dark:text-rose-200 border-rose-300 hover:bg-rose-50"
                        onClick={() => onSelectAccount(account.accountName)}
                      >
                        <ExternalLink className="size-3" data-icon="inline-start" />
                        Review Account
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
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

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("accountName")}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      Account
                      {sort.column === "accountName" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[14%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("daysSinceLastOrder")}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      Cadence & Elapsed
                      {sort.column === "daysSinceLastOrder" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[14%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("expectedNextOrderDate")}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      Next Order Target
                      {sort.column === "expectedNextOrderDate" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[12%] text-right">
                    <button
                      type="button"
                      onClick={() =>
                        toggleSort(
                          horizon === 30
                            ? "projectedVolume30"
                            : "projectedVolume90",
                        )
                      }
                      className="inline-flex w-full items-center justify-end gap-1 font-medium hover:text-foreground"
                    >
                      Proj. Vol ({horizon}d)
                      {sort.column === (horizon === 30 ? "projectedVolume30" : "projectedVolume90") ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[11%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("trendTrajectory")}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      Trajectory
                      {sort.column === "trendTrajectory" ? (
                        sort.direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>

                  <TableHead className="w-[13%]">
                    <button
                      type="button"
                      onClick={() => toggleSort("churnScore")}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
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
                      className="inline-flex w-full items-center justify-end gap-1 font-medium hover:text-foreground"
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

                    const projectedRev =
                      horizon === 30
                        ? account.projectedRevenue30
                        : account.projectedRevenue90;

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
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {account.accountName}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                            ~{projectedOrders} ord · {formatMoney(projectedRev)}
                          </div>
                        </TableCell>

                        {/* Trajectory */}
                        <TableCell>
                          <TrajectoryBadge trajectory={account.trendTrajectory} />
                        </TableCell>

                        {/* Churn Risk Score */}
                        <TableCell>
                          <ChurnBadge tier={account.churnTier} score={account.churnScore} />
                          <span className="block text-[11px] text-muted-foreground truncate max-w-[140px]" title={account.churnSignals[0]}>
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
                              <span className="block text-[11px] text-muted-foreground">
                                {formatMoney(account.monthlyRevenueAtRisk)}/mo
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
