"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Grape, Upload } from "lucide-react";
import { AccountListDialog } from "@/components/account-list-dialog";
import { ClearDataButton } from "@/components/clear-data-button";
import { ExportReportButton } from "@/components/export-report-button";
import { PrintReportButton } from "@/components/print-report-button";
import { AccountTrackingSheet } from "@/components/order-tracking-sheet";
import {
  AccountProductOrdersDialog,
  type AccountProductSelection,
} from "@/components/account-product-orders-dialog";
import { RepFilterSelect } from "@/components/rep-filter-select";
import {
  NotificationSidebar,
  NotificationSidebarTrigger,
} from "@/components/notification-sidebar";
import { SiteNav } from "@/components/site-nav";
import { UploadDialog } from "@/components/upload-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildProductTrendData,
  detectSlowingProductAlerts,
} from "@/lib/product-trends";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { excludeOutOfStock } from "@/lib/out-of-stock-products";
import {
  formatDate,
  formatDays,
  formatFrequencyDeltaDays,
  formatIntervalDays,
  formatMoney,
  formatNumber,
  formatPct,
  frequencyDeltaTone,
  normalizeName,
} from "@/lib/format";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import { detectOrderFrequencyDrops } from "@/lib/frequency-alerts";
import {
  buildProjectionsAndChurn,
} from "@/lib/order-projections";
import { VolumeProjectionChurnPanel } from "@/components/volume-projection-churn-panel";
import { BottleSalesTrendChart } from "@/components/bottle-sales-trend-chart";
import type { AccountHealth } from "@/lib/types";
import {
  orderCadenceTone,
  orderCadenceToneClass,
  orderCadenceToneHintClass,
} from "@/lib/order-cadence";
import {
  buildOrderAnalytics,
  getRestaurantTracking,
  lastOrderGapsByAccount,
  listNewAccountsWithRecentOrders,
  listRetainedAccounts,
  listReturningCustomers,
  NEW_ACCOUNT_WINDOW_DAYS,
  sortAccountTrackingRows,
  sortRestaurantFrequencyRows,
  type AccountOrderTracking,
  type AccountTrackingSortKey,
  type RestaurantFrequencySortKey,
  type SortDirection,
} from "@/lib/order-analytics";

function LastOrderCell({
  lastOrderDate,
  daysSinceLastOrder,
  avgDaysBetweenOrders,
}: {
  lastOrderDate: string;
  daysSinceLastOrder: number;
  avgDaysBetweenOrders: number | null;
}) {
  const tone = orderCadenceTone({
    daysSinceOrder: daysSinceLastOrder,
    intervalDays: avgDaysBetweenOrders,
  });

  return (
    <TableCell className={orderCadenceToneClass(tone)}>
      <span className="font-medium">{formatDays(daysSinceLastOrder)}</span>
      <span className={`block text-xs ${orderCadenceToneHintClass(tone)}`}>
        {formatDate(lastOrderDate)}
      </span>
    </TableCell>
  );
}

function SortableTableHead<T extends string>({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: T;
  sort: { column: T; direction: SortDirection };
  onSort: (column: T) => void;
  className?: string;
}) {
  const active = sort.column === column;
  const Icon = active
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex w-full items-center gap-1 hover:text-foreground ${className?.includes("text-right") ? "justify-end" : ""} ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" />
      </button>
    </TableHead>
  );
}

function SortableAccountHead({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: AccountTrackingSortKey;
  sort: { column: AccountTrackingSortKey; direction: SortDirection };
  onSort: (column: AccountTrackingSortKey) => void;
  className?: string;
}) {
  return (
    <SortableTableHead
      label={label}
      column={column}
      sort={sort}
      onSort={onSort}
      className={className}
    />
  );
}

function FrequencyDeltaCell({ value }: { value: number | null }) {
  const tone = frequencyDeltaTone(value);
  const toneClass =
    tone === "shortened"
      ? "text-emerald-800"
      : tone === "lengthened"
        ? "text-amber-800"
        : tone === "neutral"
          ? "text-muted-foreground"
          : "text-muted-foreground";

  return (
    <TableCell className={`text-right tabular-nums ${toneClass}`}>
      {formatFrequencyDeltaDays(value)}
    </TableCell>
  );
}

function VolumeBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
      ) : null}
    </>
  );

  if (!onClick) {
    return <Card>{body}</Card>;
  }

  return (
    <Card className="transition hover:border-primary/40 hover:bg-primary/4">
      <button type="button" onClick={onClick} className="w-full text-left">
        {body}
      </button>
    </Card>
  );
}

type AccountListDialogState = {
  title: string;
  description: string;
  accounts: AccountHealth[];
  emptyMessage?: string;
  showPriorOrder?: boolean;
};

export function OrderAnalyticsDashboard() {
  const { state, fullState, snapshot, repFilter, setRepFilter, reps, importParseResult } =
    useFilteredPortfolio();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notificationSidebarOpen, setNotificationSidebarOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] =
    useState<AccountOrderTracking | null>(null);
  const [selectedAccountProduct, setSelectedAccountProduct] =
    useState<AccountProductSelection | null>(null);
  const [accountListDialog, setAccountListDialog] = useState<AccountListDialogState | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [accountSort, setAccountSort] = useState<{
    column: AccountTrackingSortKey;
    direction: SortDirection;
  }>({ column: "territoryRank", direction: "asc" });
  const [frequencySort, setFrequencySort] = useState<{
    column: RestaurantFrequencySortKey;
    direction: SortDirection;
  }>({ column: "orderFrequency", direction: "asc" });

  const analytics = useMemo(
    () => buildOrderAnalytics(state.orders, state.analysisAsOf),
    [state.orders, state.analysisAsOf],
  );

  const newAccounts = useMemo(
    () =>
      listNewAccountsWithRecentOrders(
        state.orders,
        state.analysisAsOf ?? analytics.asOf,
      ),
    [state.orders, state.analysisAsOf, analytics.asOf],
  );

  const retainedAccounts = useMemo(
    () =>
      listRetainedAccounts(
        state.orders,
        state.analysisAsOf ?? analytics.asOf,
      ),
    [state.orders, state.analysisAsOf, analytics.asOf],
  );

  const lastOrderGaps = useMemo(
    () => lastOrderGapsByAccount(state.orders),
    [state.orders],
  );

  const returningCustomers = useMemo(
    () =>
      listReturningCustomers(
        state.orders,
        state.analysisAsOf ?? analytics.asOf,
      ),
    [state.orders, state.analysisAsOf, analytics.asOf],
  );

  const enrichedAccounts = useMemo(
    () => enrichAccountsWithTerritoryValue(snapshot.accounts, state.orders),
    [snapshot.accounts, state.orders],
  );

  const frequencyAlerts = useMemo(
    () =>
      detectOrderFrequencyDrops(
        enrichedAccounts,
        state.orders,
        state.analysisAsOf ?? analytics.asOf,
      ),
    [enrichedAccounts, state.orders, state.analysisAsOf, analytics.asOf],
  );

  const productTrends = useMemo(
    () =>
      buildProductTrendData({
        orders: state.orders,
        selectedProducts: [],
        asOf: state.analysisAsOf ?? analytics.asOf,
      }),
    [state.orders, state.analysisAsOf, analytics.asOf],
  );

  const { ids: outOfStockIds } = useOutOfStockProducts();
  const productAlerts = useMemo(
    () =>
      excludeOutOfStock(
        detectSlowingProductAlerts(productTrends.productSummaries),
        outOfStockIds,
      ),
    [productTrends.productSummaries, outOfStockIds],
  );

  const criticalProductAlertsCount = useMemo(
    () => productAlerts.filter((a) => a.severity === "critical").length,
    [productAlerts],
  );

  const criticalAlertsCount = useMemo(
    () => frequencyAlerts.filter((a) => a.severity === "critical").length,
    [frequencyAlerts],
  );

  const totalAlertsCount = frequencyAlerts.length + productAlerts.length;
  const totalCriticalAlertsCount = criticalAlertsCount + criticalProductAlertsCount;

  const projectionsSummary = useMemo(
    () =>
      buildProjectionsAndChurn(
        analytics,
        enrichedAccounts,
        state.analysisAsOf ?? analytics.asOf,
      ),
    [analytics, enrichedAccounts, state.analysisAsOf],
  );

  const healthByAccountName = useMemo(
    () =>
      new Map(
        enrichedAccounts.map((item) => [normalizeName(item.account.name), item]),
      ),
    [enrichedAccounts],
  );

  const newAccountHealthRows = useMemo(
    () =>
      newAccounts
        .map((account) => healthByAccountName.get(normalizeName(account.accountName)))
        .filter((item): item is AccountHealth => item !== undefined),
    [newAccounts, healthByAccountName],
  );

  const retainedAccountHealthRows = useMemo(
    () =>
      retainedAccounts
        .map((account) => healthByAccountName.get(normalizeName(account.accountName)))
        .filter((item): item is AccountHealth => item !== undefined),
    [retainedAccounts, healthByAccountName],
  );

  const returningCustomerHealthRows = useMemo(
    () =>
      returningCustomers
        .map((account) => healthByAccountName.get(normalizeName(account.accountName)))
        .filter((item): item is AccountHealth => item !== undefined),
    [returningCustomers, healthByAccountName],
  );

  const sortedAccounts = useMemo(
    () =>
      sortAccountTrackingRows(
        analytics.byAccount.map((row) => {
          const health = healthByAccountName.get(normalizeName(row.accountName));
          return {
            ...row,
            healthScore: health?.score ?? null,
            territoryRank: health?.territoryRank ?? null,
          };
        }),
        accountSort.column,
        accountSort.direction,
      ),
    [analytics.byAccount, accountSort, healthByAccountName],
  );

  const sortedFrequencyRows = useMemo(
    () =>
      sortRestaurantFrequencyRows(
        analytics.byFrequency,
        frequencySort.column,
        frequencySort.direction,
      ),
    [analytics.byFrequency, frequencySort],
  );

  function toggleAccountSort(column: AccountTrackingSortKey) {
    setAccountSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            column,
            direction:
              column === "accountName" ||
              column === "orderFrequency" ||
              column === "territoryRank"
                ? "asc"
                : "desc",
          },
    );
  }

  function toggleFrequencySort(column: RestaurantFrequencySortKey) {
    setFrequencySort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            column,
            direction:
              column === "accountName" || column === "orderFrequency" ? "asc" : "desc",
          },
    );
  }

  const selectedAccountTracking = selectedAccount
    ? getRestaurantTracking(analytics, selectedAccount.accountName)
    : null;

  const selectedAccountHealth = selectedAccount
    ? (healthByAccountName.get(normalizeName(selectedAccount.accountName)) ?? null)
    : null;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }

  function openAccountFromHealth(accountId: string) {
    const health = enrichedAccounts.find((item) => item.account.id === accountId);
    if (!health) return;
    const tracking =
      analytics.byAccount.find(
        (row) => normalizeName(row.accountName) === normalizeName(health.account.name),
      ) ?? null;
    if (tracking) setSelectedAccount(tracking);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-primary/15 bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Grape className="size-5" />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                  Wine distribution · order analytics
                </p>
              </div>
              <h1 className="font-heading mt-1 text-3xl tracking-tight sm:text-4xl">
                Order analytics
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Track how often each restaurant orders, which individual products
                they buy, and volume trends from your customer order uploads.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <NotificationSidebarTrigger
                alertsCount={totalAlertsCount}
                criticalCount={totalCriticalAlertsCount}
                onClick={() => setNotificationSidebarOpen(true)}
              />
              <PrintReportButton page="orders" onMessage={flash} />
              <ExportReportButton page="orders" onMessage={flash} />
              <ClearDataButton
                onCleared={(message) => {
                  setSelectedAccount(null);
                  flash(message);
                }}
              />
              <Button onClick={() => setUploadOpen(true)}>
                <Upload data-icon="inline-start" />
                Upload orders
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

      <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6">
        {toast ? (
          <div className="rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm">
            {toast}
          </div>
        ) : null}

        {repFilter !== "all" ? (
          <div className="rounded-lg border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
            Showing <span className="font-medium">{repFilter}</span>&apos;s book only.
          </div>
        ) : null}

        {fullState.orders.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <BarChart3 className="mb-2 size-10 text-muted-foreground" />
              <CardTitle className="font-heading text-2xl">No order data yet</CardTitle>
              <CardDescription className="max-w-lg">
                Upload a customer orders file with restaurant name, date, product
                purchased, and volume. We will break down sales by product,
                restaurant, and month.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => setUploadOpen(true)}>Upload orders</Button>
            </CardContent>
          </Card>
        ) : analytics.orders.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <CardTitle className="font-heading text-2xl">No orders for this rep</CardTitle>
              <CardDescription className="max-w-lg">
                {repFilter} has no order history in your uploaded data. Switch to
                another sales rep or choose All sales reps.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {frequencyAlerts.length > 0 ? (
              <div
                role="alert"
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-300/80 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/20 dark:text-amber-200"
              >
                <div className="flex items-start gap-3">
                  <BarChart3 className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">
                      {frequencyAlerts.length} account{frequencyAlerts.length === 1 ? "" : "s"} with significant order frequency drops
                    </p>
                    <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                      {criticalAlertsCount > 0 ? `${criticalAlertsCount} critical rate drops. ` : ""}
                      Reorder cadence has slowed or stalled past their historical typical pace.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 bg-white/90 hover:bg-white text-xs font-semibold text-amber-950 border-amber-300 shadow-2xs dark:bg-amber-900/50 dark:text-amber-100 dark:border-amber-700"
                  onClick={() => setNotificationSidebarOpen(true)}
                >
                  View Alerts Sidebar ({frequencyAlerts.length})
                </Button>
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi
                label="Total volume"
                value={`${formatNumber(analytics.totals.totalVolume)} btls`}
                hint="Total bottles purchased"
              />
              <Kpi
                label="Restaurants"
                value={formatNumber(analytics.totals.restaurantCount)}
                hint="Unique accounts ordering"
              />
              <Kpi
                label="New accounts"
                value={String(newAccounts.length)}
                hint={`First order in last ${NEW_ACCOUNT_WINDOW_DAYS} days · Click to view`}
                onClick={() =>
                  setAccountListDialog({
                    title: "New accounts",
                    description: `First order in the last ${NEW_ACCOUNT_WINDOW_DAYS} days with no order history before that window.`,
                    accounts: newAccountHealthRows,
                    emptyMessage: `No new accounts with orders in the last ${NEW_ACCOUNT_WINDOW_DAYS} days.`,
                  })
                }
              />
              <Kpi
                label="Retained customers"
                value={String(retainedAccounts.length)}
                hint={`Ordered in the last ${NEW_ACCOUNT_WINDOW_DAYS} days and before that · Click to view`}
                onClick={() =>
                  setAccountListDialog({
                    title: "Retained customers",
                    description: `Accounts that ordered in the last ${NEW_ACCOUNT_WINDOW_DAYS} days and also ordered before that window.`,
                    accounts: retainedAccountHealthRows,
                    emptyMessage: `No retained customers with orders in the last ${NEW_ACCOUNT_WINDOW_DAYS} days.`,
                    showPriorOrder: true,
                  })
                }
              />
              <Kpi
                label="Returning customers"
                value={String(returningCustomers.length)}
                hint={`Ordered in the last ${NEW_ACCOUNT_WINDOW_DAYS} days, not the prior ${NEW_ACCOUNT_WINDOW_DAYS} · Click to view`}
                onClick={() =>
                  setAccountListDialog({
                    title: "Returning customers",
                    description: `Accounts that ordered in the last ${NEW_ACCOUNT_WINDOW_DAYS} days, did not order in the prior ${NEW_ACCOUNT_WINDOW_DAYS} days, and had ordered before that.`,
                    accounts: returningCustomerHealthRows,
                    emptyMessage: `No returning customers who skipped the prior ${NEW_ACCOUNT_WINDOW_DAYS} days.`,
                  })
                }
              />
              <Kpi
                label="Products"
                value={formatNumber(analytics.totals.productCount)}
                hint="Unique products purchased"
              />
            </section>

            <Tabs defaultValue="accounts">
              <TabsList>
                <TabsTrigger value="accounts">Account tracking</TabsTrigger>
                <TabsTrigger value="trends">Bottle sales trends</TabsTrigger>
                <TabsTrigger value="projections" className="relative">
                  Forecast & Churn
                  {projectionsSummary.highChurnCount > 0 ? (
                    <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums leading-none">
                      {projectionsSummary.highChurnCount}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="frequency">Order frequency</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
              </TabsList>

              <TabsContent value="accounts" className="space-y-4">
                <Card className="overflow-hidden">
                  <CardHeader className="border-b">
                    <CardTitle className="font-heading text-xl">
                      Account order tracking
                    </CardTitle>
                    <CardDescription>
                      Volume trends and product mix changes per account. All uploaded
                      order history is kept — recent 45-day windows are used only for
                      trend comparison. Click a column header to sort. Click a row for
                      details.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableAccountHead
                              label="Account"
                              column="accountName"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                            />
                            <SortableAccountHead
                              label="Value rank"
                              column="territoryRank"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                            <SortableAccountHead
                              label="Health score"
                              column="healthScore"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                            <SortableAccountHead
                              label="Typical frequency"
                              column="orderFrequency"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                            />
                            <SortableAccountHead
                              label="Last order"
                              column="lastOrderDate"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                            />
                            <SortableAccountHead
                              label="All-time"
                              column="volumeAllTime"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                            <SortableAccountHead
                              label="Recent 45d"
                              column="volumeRecent90"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                            <SortableAccountHead
                              label="Prior 45d"
                              column="volumePrior90"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                            <SortableAccountHead
                              label="Volume Δ"
                              column="volumeDeltaPct"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                            <SortableAccountHead
                              label="Frequency Δ"
                              column="frequencyDeltaDays"
                              sort={accountSort}
                              onSort={toggleAccountSort}
                              className="text-right"
                            />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedAccounts.map((row) => (
                            <TableRow
                              key={row.accountName}
                              className="cursor-pointer"
                              onClick={() => setSelectedAccount(row)}
                            >
                              <TableCell className="font-medium">{row.accountName}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {row.territoryRank != null ? `#${row.territoryRank}` : "—"}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {row.healthScore ?? "—"}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatIntervalDays(row.frequency.avgDaysBetweenOrders)}
                              </TableCell>
                              <LastOrderCell
                                lastOrderDate={row.frequency.lastOrderDate}
                                daysSinceLastOrder={row.frequency.daysSinceLastOrder}
                                avgDaysBetweenOrders={row.frequency.avgDaysBetweenOrders}
                              />
                              <TableCell className="text-right tabular-nums">
                                {formatNumber(row.volumeAllTime)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatNumber(row.volumeRecent90)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatNumber(row.volumePrior90)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPct(row.volumeDeltaPct)}
                              </TableCell>
                              <FrequencyDeltaCell value={row.frequencyDeltaDays} />
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="projections" className="space-y-4">
                <VolumeProjectionChurnPanel
                  summary={projectionsSummary}
                  repFilter={repFilter}
                  asOf={state.analysisAsOf ?? analytics.asOf}
                  onSelectAccount={(accountName) => {
                    const tracking =
                      analytics.byAccount.find(
                        (row) => normalizeName(row.accountName) === normalizeName(accountName),
                      ) ?? null;
                    if (tracking) {
                      setSelectedAccount(tracking);
                    }
                  }}
                />
              </TabsContent>

              <TabsContent value="frequency" className="space-y-4">
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="font-heading text-xl">
                      Order frequency by restaurant
                    </CardTitle>
                    <CardDescription>
                      How often each account places orders and how many individual
                      products they buy. Click a row for the full product mix.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableTableHead
                              label="Restaurant"
                              column="accountName"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                            />
                            <SortableTableHead
                              label="Typical frequency"
                              column="orderFrequency"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                            />
                            <SortableTableHead
                              label="Last order"
                              column="lastOrderDate"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                            />
                            <SortableTableHead
                              label="Orders"
                              column="orderEventCount"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                              className="text-right"
                            />
                            <SortableTableHead
                              label="Orders / mo"
                              column="ordersPerMonth"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                              className="text-right"
                            />
                            <SortableTableHead
                              label="Products"
                              column="productCount"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                              className="text-right"
                            />
                            <SortableTableHead
                              label="Volume"
                              column="totalVolume"
                              sort={frequencySort}
                              onSort={toggleFrequencySort}
                              className="text-right"
                            />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedFrequencyRows.map((row) => (
                            <TableRow
                              key={row.accountName}
                              className="cursor-pointer"
                              onClick={() => {
                                const tracking = analytics.byAccount.find(
                                  (item) => item.accountName === row.accountName,
                                );
                                if (tracking) setSelectedAccount(tracking);
                              }}
                            >
                              <TableCell className="font-medium">{row.accountName}</TableCell>
                              <TableCell className="tabular-nums">
                                {formatIntervalDays(row.avgDaysBetweenOrders)}
                              </TableCell>
                              <LastOrderCell
                                lastOrderDate={row.lastOrderDate}
                                daysSinceLastOrder={row.daysSinceLastOrder}
                                avgDaysBetweenOrders={row.avgDaysBetweenOrders}
                              />
                              <TableCell className="text-right tabular-nums">
                                {row.orderEventCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.ordersPerMonth
                                  ? row.ordersPerMonth.toFixed(1)
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.productCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatNumber(row.totalVolume)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="trends" className="space-y-4">
                <BottleSalesTrendChart
                  orders={analytics.orders}
                  asOf={state.analysisAsOf ?? snapshot.asOf}
                  onSelectAccount={(accountName) => {
                    const row = analytics.byAccount.find(
                      (a) => normalizeName(a.accountName) === normalizeName(accountName),
                    );
                    if (row) setSelectedAccount(row);
                  }}
                />
              </TabsContent>

              <TabsContent value="overview" className="space-y-4">
                <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="font-heading text-xl">Top products</CardTitle>
                  <CardDescription>By total volume purchased</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {analytics.byProduct.slice(0, 8).map((row) => (
                    <div key={row.product} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{row.product}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(row.volume)} · {Math.round(row.sharePct)}%
                        </span>
                      </div>
                      <VolumeBar pct={row.sharePct} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="font-heading text-xl">Top restaurants</CardTitle>
                  <CardDescription>By total volume ordered</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {analytics.byRestaurant.slice(0, 8).map((row) => (
                    <div key={row.accountName} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{row.accountName}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(row.volume)} btls
                        </span>
                      </div>
                      <VolumeBar
                        pct={
                          analytics.totals.totalVolume > 0
                            ? (row.volume / analytics.totals.totalVolume) * 100
                            : 0
                        }
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
                </section>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="font-heading text-xl">Volume by month</CardTitle>
                <CardDescription>Order activity over time</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {analytics.byMonth.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No dated orders to chart.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Volume</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.byMonth.map((row) => (
                          <TableRow key={row.month}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(row.volume)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.revenue > 0 ? formatMoney(row.revenue) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <AccountTrackingSheet
        tracking={selectedAccountTracking}
        accountHealth={selectedAccountHealth}
        onOpenChange={(open) => {
          if (!open) setSelectedAccount(null);
        }}
        onSelectProduct={(product) => {
          if (selectedAccountTracking) {
            setSelectedAccountProduct({
              accountName: selectedAccountTracking.accountName,
              product,
            });
          }
        }}
      />

      <AccountListDialog
        open={accountListDialog !== null}
        onOpenChange={(open) => {
          if (!open) setAccountListDialog(null);
        }}
        title={accountListDialog?.title ?? ""}
        description={accountListDialog?.description ?? ""}
        accounts={accountListDialog?.accounts ?? []}
        emptyMessage={accountListDialog?.emptyMessage}
        orderGaps={accountListDialog?.showPriorOrder ? lastOrderGaps : undefined}
        onSelectAccount={(accountId) => {
          openAccountFromHealth(accountId);
          setAccountListDialog(null);
        }}
      />

      <AccountProductOrdersDialog
        selection={selectedAccountProduct}
        orders={state.orders}
        asOf={state.analysisAsOf ?? analytics.asOf}
        onOpenChange={(open) => {
          if (!open) setSelectedAccountProduct(null);
        }}
      />

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
        alerts={frequencyAlerts}
        productAlerts={productAlerts}
        open={notificationSidebarOpen}
        onOpenChange={setNotificationSidebarOpen}
        onSelectAccount={(accountName, accountId) => {
          const tracking =
            analytics.byAccount.find(
              (row) => normalizeName(row.accountName) === normalizeName(accountName),
            ) ?? null;
          if (tracking) {
            setSelectedAccount(tracking);
          } else {
            openAccountFromHealth(accountId);
          }
        }}
      />
    </div>
  );
}
