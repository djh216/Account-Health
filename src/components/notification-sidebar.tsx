"use client";

import { useId, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Clock,
  ExternalLink,
  Info,
  RotateCcw,
  Search,
  TrendingDown,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDate,
  formatDays,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { territoryTierLabel } from "@/lib/territory-value";
import {
  getAcknowledgedAlertIds,
  saveAcknowledgedAlertIds,
  type AccountFrequencyAlert,
} from "@/lib/frequency-alerts";
import { ExportReportButton } from "@/components/export-report-button";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "critical" | "warning" | "acknowledged";

export function NotificationSidebar({
  alerts,
  open,
  onOpenChange,
  onSelectAccount,
}: {
  alerts: AccountFrequencyAlert[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAccount?: (accountName: string, accountId: string) => void;
}) {
  const searchInputId = useId();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() =>
    getAcknowledgedAlertIds(),
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toggle acknowledge/snooze for an alert
  function handleToggleAcknowledge(id: string) {
    setAcknowledgedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveAcknowledgedAlertIds(next);
      return next;
    });
  }

  // Acknowledge all active alerts
  function handleAcknowledgeAll() {
    setAcknowledgedIds((prev) => {
      const next = new Set(prev);
      for (const alert of alerts) {
        next.add(alert.id);
      }
      saveAcknowledgedAlertIds(next);
      return next;
    });
  }

  // Reset all acknowledged alerts
  function handleResetAcknowledged() {
    const next = new Set<string>();
    setAcknowledgedIds(next);
    saveAcknowledgedAlertIds(next);
  }

  // Copy quick briefing for rep outreach
  function handleCopyBriefing(alert: AccountFrequencyAlert) {
    const text = [
      `[Account Alert] ${alert.accountName}`,
      alert.salesRep ? `Rep: ${alert.salesRep}` : null,
      `Severity: ${alert.severity.toUpperCase()} (${alert.dropPercentage}% frequency drop)`,
      `Typical rate: Every ${alert.typicalIntervalDays} days (~${alert.typicalOrdersPerMonth} orders/mo)`,
      `Current state: Last ordered ${alert.currentDaysSinceOrder} days ago (${formatDate(alert.lastOrderDate)})`,
      `Days overdue: +${alert.daysPastTypical} days past typical schedule`,
      alert.revenueAtRisk > 0 ? `Est. volume deficit: ${formatMoney(alert.revenueAtRisk)}` : null,
      `Action: ${alert.actionRecommendation}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(alert.id);
      window.setTimeout(() => setCopiedId(null), 2500);
    }
  }

  // Counts
  const unacknowledgedAlerts = useMemo(
    () => alerts.filter((a) => !acknowledgedIds.has(a.id)),
    [alerts, acknowledgedIds],
  );

  const criticalCount = useMemo(
    () => unacknowledgedAlerts.filter((a) => a.severity === "critical").length,
    [unacknowledgedAlerts],
  );

  const warningCount = useMemo(
    () => unacknowledgedAlerts.filter((a) => a.severity === "warning").length,
    [unacknowledgedAlerts],
  );

  const acknowledgedCount = useMemo(
    () => alerts.filter((a) => acknowledgedIds.has(a.id)).length,
    [alerts, acknowledgedIds],
  );

  // Total revenue at risk across active alerts
  const totalRevenueAtRisk = useMemo(
    () => unacknowledgedAlerts.reduce((sum, a) => sum + a.revenueAtRisk, 0),
    [unacknowledgedAlerts],
  );

  const totalBottlesAtRisk = useMemo(
    () => unacknowledgedAlerts.reduce((sum, a) => sum + (a.bottlesAtRisk || 0), 0),
    [unacknowledgedAlerts],
  );

  // Filtered display list
  const filteredAlerts = useMemo(() => {
    let list: AccountFrequencyAlert[];
    if (filterTab === "acknowledged") {
      list = alerts.filter((a) => acknowledgedIds.has(a.id));
    } else {
      list = unacknowledgedAlerts;
      if (filterTab === "critical") {
        list = list.filter((a) => a.severity === "critical");
      } else if (filterTab === "warning") {
        list = list.filter((a) => a.severity === "warning");
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.accountName.toLowerCase().includes(q) ||
          (a.salesRep && a.salesRep.toLowerCase().includes(q)) ||
          a.message.toLowerCase().includes(q),
      );
    }

    return list;
  }, [alerts, unacknowledgedAlerts, acknowledgedIds, filterTab, searchQuery]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 border-b border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Bell className="size-4" />
                <span className="text-xs font-semibold tracking-wider uppercase">
                  Order Cadence Intelligence
                </span>
              </div>
              <SheetTitle className="font-heading mt-1 text-2xl font-bold tracking-tight">
                Frequency Drop Alerts
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs text-muted-foreground">
                Alerts when an account’s average order frequency drops significantly
                below their typical rate.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <ExportReportButton size="xs" variant="outline" label="Export PDF" />
              <SheetClose
                render={
                  <Button variant="ghost" size="icon-sm" className="rounded-lg">
                    <X className="size-4" />
                    <span className="sr-only">Close sidebar</span>
                  </Button>
                }
              />
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border/80 bg-muted/30 p-2.5 text-left">
            <div>
              <span className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Active Alerts
              </span>
              <span className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {unacknowledgedAlerts.length}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Critical Drops
              </span>
              <span className="mt-0.5 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {criticalCount}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Bottles at Risk
              </span>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatNumber(totalBottlesAtRisk)}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  btls ({formatMoney(totalRevenueAtRisk)})
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="mt-3 flex flex-col gap-2">
            <div className="relative">
              <label htmlFor={searchInputId} className="sr-only">
                Filter alerts by account or sales rep
              </label>
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                id={searchInputId}
                type="search"
                placeholder="Filter by account or rep..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-xs"
              />
            </div>

            {/* Segmented Filter Buttons */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pt-1">
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setFilterTab("all")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    filterTab === "all"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  All ({unacknowledgedAlerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("critical")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    filterTab === "critical"
                      ? "bg-rose-100 text-rose-900 shadow-2xs dark:bg-rose-950 dark:text-rose-200"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Critical ({criticalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("warning")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition",
                    filterTab === "warning"
                      ? "bg-amber-100 text-amber-900 shadow-2xs dark:bg-amber-950 dark:text-amber-200"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Warning ({warningCount})
                </button>
                {acknowledgedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setFilterTab("acknowledged")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition",
                      filterTab === "acknowledged"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Reviewed ({acknowledgedCount})
                  </button>
                ) : null}
              </div>

              {/* Batch Actions */}
              {unacknowledgedAlerts.length > 0 && filterTab !== "acknowledged" ? (
                <button
                  type="button"
                  onClick={handleAcknowledgeAll}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all reviewed
                </button>
              ) : acknowledgedCount > 0 && filterTab === "acknowledged" ? (
                <button
                  type="button"
                  onClick={handleResetAcknowledged}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" />
                  Reset all
                </button>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable Alert List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6 text-muted-foreground">
              {alerts.length === 0 ? (
                <>
                  <div className="rounded-full bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCheck className="size-6" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    All accounts on cadence
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    No accounts are currently experiencing a significant drop in their
                    average order frequency.
                  </p>
                </>
              ) : unacknowledgedAlerts.length === 0 ? (
                <>
                  <div className="rounded-full bg-muted p-3 text-muted-foreground">
                    <CheckCheck className="size-6" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    All alerts have been reviewed
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    You have acknowledged all active frequency drop notifications.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => setFilterTab("acknowledged")}
                  >
                    View reviewed accounts ({acknowledgedCount})
                  </Button>
                </>
              ) : (
                <>
                  <div className="rounded-full bg-muted p-3 text-muted-foreground">
                    <Search className="size-6" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    No matching alerts found
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    No frequency alerts match &ldquo;{searchQuery}&rdquo;. Clear the search query to
                    see all alerts.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                </>
              )}
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isAcknowledged = acknowledgedIds.has(alert.id);
              const isCritical = alert.severity === "critical";
              const isWarning = alert.severity === "warning";

              // Cadence progress: what percentage of typical cycle has elapsed
              const progressPct = Math.min(
                300,
                Math.round(alert.cadenceMultiplier * 100),
              );

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-xl border bg-card p-4 transition shadow-2xs",
                    isCritical
                      ? "border-l-4 border-l-rose-500 border-border/80"
                      : isWarning
                        ? "border-l-4 border-l-amber-500 border-border/80"
                        : "border-l-4 border-l-stone-400 border-border/80",
                    isAcknowledged && "opacity-60 bg-muted/20",
                  )}
                >
                  {/* Account Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={cn(
                            "font-semibold uppercase tracking-wider text-[11px]",
                            isCritical
                              ? "text-rose-600 dark:text-rose-400"
                              : isWarning
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-stone-500",
                          )}
                        >
                          {isCritical
                            ? "Critical Frequency Drop"
                            : isWarning
                              ? "Significant Slowdown"
                              : "Order Pace Watch"}
                        </span>
                        {alert.territoryTier ? (
                          <>
                            <span className="text-muted-foreground/60" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-medium text-foreground">
                              {territoryTierLabel(alert.territoryTier)} Tier
                            </span>
                          </>
                        ) : null}
                        {alert.salesRep ? (
                          <>
                            <span className="text-muted-foreground/60" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-muted-foreground">{alert.salesRep}</span>
                          </>
                        ) : null}
                      </div>

                      <h4 className="mt-1 text-base font-semibold text-foreground">
                        {alert.accountName}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-heading text-base font-bold tabular-nums",
                          isCritical
                            ? "text-rose-600 dark:text-rose-400"
                            : isWarning
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-foreground",
                        )}
                      >
                        <TrendingDown className="size-4 shrink-0" />
                        -{alert.dropPercentage}%
                      </span>
                    </div>
                  </div>

                  {/* Frequency Comparison Grid */}
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium">
                        Typical Reorder Rate
                      </span>
                      <div className="mt-0.5 font-medium text-foreground">
                        Every {alert.typicalIntervalDays} days
                        <span className="ml-1 text-muted-foreground">
                          (~{alert.typicalOrdersPerMonth}/mo)
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium">
                        Current Status
                      </span>
                      <div className="mt-0.5 font-medium text-foreground">
                        {formatDays(alert.currentDaysSinceOrder)}
                        <span
                          className={cn(
                            "ml-1 font-semibold",
                            isCritical
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          (+{alert.daysPastTypical}d overdue)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cadence Elapsed Bar */}
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-muted-foreground/70" />
                        Cycle Elapsed: {progressPct}% of normal interval
                      </span>
                      <span>
                        Last order: {formatDate(alert.lastOrderDate)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isCritical
                            ? "bg-rose-500"
                            : isWarning
                              ? "bg-amber-500"
                              : "bg-stone-400",
                        )}
                        style={{ width: `${Math.min(100, (progressPct / 200) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Context Narrative */}
                  <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                    {alert.message}
                  </p>

                  {/* Action Recommendation Box */}
                  <div className="mt-2.5 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-foreground">
                    <span className="font-semibold text-primary block mb-0.5">
                      Recommended Next Step:
                    </span>
                    <span className="leading-snug text-muted-foreground">
                      {alert.actionRecommendation}
                    </span>
                  </div>

                  {/* Revenue / Volume Deficit if available */}
                  {alert.revenueAtRisk > 0 || alert.bottlesAtRisk > 0 ? (
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Recent 90d Revenue: {formatMoney(alert.revenueRecent90)}</span>
                      <span className="font-semibold text-amber-800 dark:text-amber-300">
                        At Risk: {alert.bottlesAtRisk > 0 ? `${formatNumber(alert.bottlesAtRisk)} btls` : ""}
                        {alert.revenueAtRisk > 0 ? ` (${formatMoney(alert.revenueAtRisk)})` : ""}
                      </span>
                    </div>
                  ) : null}

                  {/* Card Actions Footer */}
                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="flex items-center gap-2">
                      {onSelectAccount ? (
                        <Button
                          size="xs"
                          variant="default"
                          className="text-xs"
                          onClick={() => {
                            onSelectAccount(alert.accountName, alert.id);
                            onOpenChange(false);
                          }}
                        >
                          <ExternalLink className="size-3" data-icon="inline-start" />
                          View Account
                        </Button>
                      ) : null}

                      <Button
                        size="xs"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleCopyBriefing(alert)}
                      >
                        {copiedId === alert.id ? "Copied!" : "Copy Briefing"}
                      </Button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleAcknowledge(alert.id)}
                      className="text-xs text-muted-foreground hover:text-foreground transition underline underline-offset-2"
                    >
                      {isAcknowledged ? "Mark unread" : "Mark reviewed"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="shrink-0 border-t border-border bg-card p-3 text-xs text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Info className="size-3.5 text-muted-foreground/80" />
            <span>Updates dynamically based on orders and account history.</span>
          </div>
          <SheetClose
            render={
              <Button variant="ghost" size="xs" className="text-xs">
                Close
              </Button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Polished Notification Bell trigger button to place in site headers.
 */
export function NotificationSidebarTrigger({
  alertsCount,
  criticalCount,
  onClick,
  className,
}: {
  alertsCount: number;
  criticalCount?: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      aria-label={`Order frequency alerts (${alertsCount} accounts flagged)`}
      className={cn(
        "relative flex items-center gap-2 border-border transition",
        alertsCount > 0 &&
          "border-amber-500/50 bg-amber-50/50 text-amber-950 hover:bg-amber-100/70 hover:border-amber-600 dark:bg-amber-950/20 dark:text-amber-200 dark:border-amber-800",
        className,
      )}
    >
      <div className="relative">
        <Bell className="size-4 shrink-0 text-foreground" />
        {alertsCount > 0 ? (
          <span
            className={cn(
              "absolute -top-1 -right-1 size-2 rounded-full",
              (criticalCount ?? 0) > 0 ? "bg-rose-500 animate-pulse" : "bg-amber-500",
            )}
          />
        ) : null}
      </div>
      <span className="hidden sm:inline font-medium">Frequency Alerts</span>
      {alertsCount > 0 ? (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.2 text-xs font-bold tabular-nums",
            (criticalCount ?? 0) > 0
              ? "bg-rose-600 text-white"
              : "bg-amber-600 text-white",
          )}
        >
          {alertsCount}
        </span>
      ) : null}
    </Button>
  );
}
