"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Printer,
  Store,
  TrendingUp,
} from "lucide-react";
import { OrderCadenceAlert } from "@/components/order-cadence-alert";
import { HealthScoreExplainer } from "@/components/health-score-explainer";
import { RiskBadge } from "@/components/risk-badge";
import { TerritoryValueBadge } from "@/components/territory-value-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { projectSingleAccount } from "@/lib/order-projections";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  formatFrequencyDeltaDays,
  formatNumber,
  formatOrderFrequency,
  formatPct,
} from "@/lib/format";
import {
  orderCadenceStatus,
  orderCadenceTone,
  orderCadenceToneClass,
  orderCadenceToneHintClass,
} from "@/lib/order-cadence";
import {
  buildAccountProductChanges,
  PRODUCT_CHANGE_PERIOD_OPTIONS,
  sortProductCadenceRows,
  type AccountOrderTracking,
  type AccountProductCadence,
  type AccountProductChange,
  type AccountProductChangeAnalysis,
  type ProductCadenceSortKey,
  type ProductChangePeriodDays,
  type ProductChangeStatus,
  type ProductPurchaseTracking,
  type RestaurantOrderFrequency,
  type RestaurantProductMix,
  type SortDirection,
} from "@/lib/order-analytics";
import { downloadAccountProductsPdf } from "@/lib/generate-account-products-pdf";
import type { AccountHealth } from "@/lib/types";

function productChangeLabel(status: ProductChangeStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "dropped":
      return "Dropped";
    case "increasing":
      return "Up";
    case "decreasing":
      return "Down";
    case "stable":
      return "Stable";
  }
}

export function useProductChangePeriodAnalysis(
  tracking: AccountOrderTracking,
  initialPeriod: ProductChangePeriodDays = 90,
) {
  const [changePeriodDays, setChangePeriodDays] =
    useState<ProductChangePeriodDays>(initialPeriod);

  const analysis = useMemo(
    () =>
      buildAccountProductChanges(
        tracking.orders,
        tracking.analysisAsOf,
        changePeriodDays,
      ),
    [tracking.orders, tracking.analysisAsOf, changePeriodDays],
  );

  return { changePeriodDays, setChangePeriodDays, analysis };
}

function ProductChangePeriodControl({
  value,
  onChange,
  className,
}: {
  value: ProductChangePeriodDays;
  onChange: (days: ProductChangePeriodDays) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-2", className)}
      role="group"
      aria-label="Product change comparison period"
    >
      <span className="text-xs font-medium text-muted-foreground">Period</span>
      <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
        {PRODUCT_CHANGE_PERIOD_OPTIONS.map((days) => (
          <Button
            key={days}
            type="button"
            variant={value === days ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs tabular-nums"
            aria-pressed={value === days}
            onClick={() => onChange(days)}
          >
            {days} days
          </Button>
        ))}
      </div>
    </div>
  );
}

function productChangeVariant(
  status: ProductChangeStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "new":
      return "default";
    case "dropped":
      return "destructive";
    case "increasing":
      return "default";
    case "decreasing":
      return "secondary";
    case "stable":
      return "outline";
  }
}

export function AccountTrackingSheet({
  tracking,
  accountHealth,
  onOpenChange,
  onSelectProduct,
}: {
  tracking: AccountOrderTracking | null;
  accountHealth?: AccountHealth | null;
  onOpenChange: (open: boolean) => void;
  onSelectProduct?: (product: string) => void;
}) {
  return (
    <Dialog open={Boolean(tracking)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-7xl flex-col overflow-hidden p-6 sm:max-w-7xl md:max-w-7xl lg:max-w-[1450px]">
        {tracking ? (
          <AccountTrackingSheetBody
            tracking={tracking}
            accountHealth={accountHealth}
            onSelectProduct={onSelectProduct}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AccountTrackingSheetBody({
  tracking,
  accountHealth,
  onSelectProduct,
}: {
  tracking: AccountOrderTracking;
  accountHealth?: AccountHealth | null;
  onSelectProduct?: (product: string) => void;
}) {
  const cadence = orderCadenceStatus({
    daysSinceOrder: tracking.frequency.daysSinceLastOrder,
    lastOrderDate: tracking.frequency.lastOrderDate,
    intervalDays: tracking.frequency.avgDaysBetweenOrders,
  });

  const projection = projectSingleAccount(tracking, accountHealth, tracking.analysisAsOf);
  const productChangePeriod = useProductChangePeriodAnalysis(tracking);
  const { frequency } = tracking;

  const firstOrderDate = useMemo(() => {
    const dates = tracking.orders.map((order) => order.date).filter(Boolean);
    if (dates.length === 0) return null;
    return dates.reduce((min, date) => (date < min ? date : min));
  }, [tracking.orders]);

  return (
          <>
            <DialogHeader className="shrink-0 border-b pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Store className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Account Order Tracking
                    </p>
                    <DialogTitle className="font-heading mt-0.5 text-xl font-bold text-foreground md:text-2xl">
                      {tracking.accountName}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                      First Order: {formatDate(firstOrderDate)} · Last Order:{" "}
                      {formatDate(frequency.lastOrderDate)}
                      {accountHealth?.lastVisitDate
                        ? ` · Last Visit: ${formatDate(accountHealth.lastVisitDate)}`
                        : ""}
                    </DialogDescription>
                  </div>
                </div>
                {accountHealth ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <RiskBadge risk={accountHealth.risk} />
                    {accountHealth.territoryTier ? (
                      <TerritoryValueBadge tier={accountHealth.territoryTier} />
                    ) : null}
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Health{" "}
                      <HealthScoreExplainer account={accountHealth} />
                      {accountHealth.territoryRank
                        ? ` · Rank #${accountHealth.territoryRank}`
                        : ""}
                    </span>
                    {tracking.volumeDeltaPct !== null ? (
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                          tracking.volumeDeltaPct > 0
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : tracking.volumeDeltaPct < 0
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {tracking.volumeDeltaPct > 0 ? "+" : ""}
                        {formatPct(tracking.volumeDeltaPct)} recent vs prior 45d
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pt-4 pr-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
                <CatalogMetricCard
                  label="All-Time Volume"
                  value={formatNumber(tracking.volumeAllTime)}
                  unit="btls"
                />
                <CatalogMetricCard
                  label="Recent 45 Days"
                  value={formatNumber(tracking.volumeRecent90)}
                  unit="btls"
                  tone="sky"
                />
                <CatalogMetricCard
                  label="Prior 45 Days"
                  value={formatNumber(tracking.volumePrior90)}
                  unit="btls"
                />
                <CatalogMetricCard
                  label="Products Ordered"
                  value={String(frequency.productCount)}
                  unit="SKUs"
                />
                <CatalogMetricCard
                  label="Typical Frequency"
                  value={formatOrderFrequency(frequency.avgDaysBetweenOrders)}
                />
                <CatalogMetricCard
                  label="Last Order"
                  value={formatDays(frequency.daysSinceLastOrder)}
                  hint={formatDate(frequency.lastOrderDate)}
                />
                <CatalogMetricCard
                  label="Frequency Change"
                  value={formatFrequencyDeltaDays(tracking.frequencyDeltaDays)}
                  tone={
                    tracking.frequencyDeltaDays !== null && tracking.frequencyDeltaDays > 0
                      ? "rose"
                      : undefined
                  }
                />
                <CatalogMetricCard
                  label="Before Recent Window"
                  value={formatNumber(tracking.volumeBeforeRecent90)}
                  unit="btls"
                />
              </div>

              {cadence ? <OrderCadenceAlert cadence={cadence} /> : null}

              <AccountTrackingSummary
                tracking={tracking}
                accountHealth={accountHealth}
                compact
                showStatsGrid={false}
                productChangeAnalysis={productChangePeriod.analysis}
                changePeriodDays={productChangePeriod.changePeriodDays}
                onChangePeriodDays={productChangePeriod.setChangePeriodDays}
              />

              {projection ? (
                  <div className="space-y-2.5">
                    <h4 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
                      <TrendingUp className="size-4 text-primary" />
                      Forecast & Churn Risk
                    </h4>
                  <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-medium text-sm text-muted-foreground">Churn score</span>
                      <span
                        className={cn(
                          "font-bold tabular-nums",
                          projection.churnTier === "high"
                            ? "text-rose-600 dark:text-rose-400"
                            : projection.churnTier === "moderate"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {projection.churnScore}% ({projection.churnTier.toUpperCase()})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <span className="text-[11px] text-muted-foreground block">Proj. Next 30d</span>
                        <span className="font-semibold text-foreground text-sm">
                          {formatNumber(projection.projectedVolume30)} btls
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          ~{projection.projectedOrderCount30} orders
                        </span>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <span className="text-[11px] text-muted-foreground block">Proj. Next 90d</span>
                        <span className="font-semibold text-foreground text-sm">
                          {formatNumber(projection.projectedVolume90)} btls
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          Risk-adj: {formatNumber(projection.riskAdjustedVolume90)} btls
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Expected Next Order:</span>
                        <span className="font-medium text-foreground">
                          {formatDate(projection.expectedNextOrderDate)}
                        </span>
                      </div>
                      {projection.isOverdueForOrder ? (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium text-right">
                          Overdue by +{projection.daysOverdue} days
                        </div>
                      ) : null}
                    </div>

                    {projection.churnSignals.length > 0 && projection.churnTier !== "low" ? (
                      <div className="rounded-lg border border-amber-300/80 bg-amber-50/60 p-2.5 dark:border-amber-800/80 dark:bg-amber-950/20">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-1">
                          <AlertTriangle className="size-3 text-amber-600 shrink-0" />
                          Key Churn Signals
                        </span>
                        <ul className="space-y-1 text-[11px] text-muted-foreground">
                          {projection.churnSignals.map((signal, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-amber-600 font-bold shrink-0">·</span>
                              <span>{signal}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 pt-1.5 border-t border-amber-200 dark:border-amber-900/60 text-[11px]">
                          <span className="font-semibold text-foreground">Retention Play: </span>
                          <span className="text-muted-foreground">{projection.retentionRecommendation}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  </div>
                ) : null}

              <ProductCadenceTable
                cadence={tracking.productCadence}
                onSelectProduct={onSelectProduct}
                presentation="catalog"
              />

              <ProductChangesTable
                changes={productChangePeriod.analysis.productChanges}
                periodDays={productChangePeriod.analysis.periodDays}
                onSelectProduct={onSelectProduct}
                presentation="catalog"
              />

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
                    <BarChart3 className="size-4 text-primary" />
                    Monthly Volume
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {tracking.monthlyVolume.length} month
                    {tracking.monthlyVolume.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="px-3 py-2.5 font-semibold text-foreground">
                          Month
                        </TableHead>
                        <TableHead className="px-3 py-2.5 text-right font-semibold text-foreground">
                          Volume
                        </TableHead>
                        <TableHead className="px-3 py-2.5 text-right font-semibold text-foreground">
                          Orders
                        </TableHead>
                        <TableHead className="px-3 py-2.5 text-right font-semibold text-foreground">
                          Products
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tracking.monthlyVolume.map((row) => (
                        <TableRow key={row.month} className="transition-colors hover:bg-muted/40">
                          <TableCell className="px-3 py-2.5 font-medium text-foreground">
                            {row.label}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                            {formatNumber(row.volume)} btls
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.orderEventCount}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.products.length}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </>
  );
}

export function RestaurantTrackingSheet({
  frequency,
  products,
  onOpenChange,
  onSelectProduct,
}: {
  frequency: RestaurantOrderFrequency | null;
  products: RestaurantProductMix[];
  onOpenChange: (open: boolean) => void;
  onSelectProduct?: (product: string) => void;
}) {
  return (
    <Dialog open={Boolean(frequency)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-1.5rem)] w-[min(96rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {frequency ? (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
              <DialogTitle className="font-heading text-2xl">
                {frequency.accountName}
              </DialogTitle>
              <DialogDescription>
                Order frequency and product mix. Click any product to view its individual orders.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 xl:grid-cols-[minmax(0,22rem)_1fr] xl:overflow-hidden">
              <div className="space-y-4 xl:overflow-y-auto xl:pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Order frequency"
                    value={formatOrderFrequency(frequency.avgDaysBetweenOrders)}
                    hint={
                      frequency.ordersPerMonth
                        ? `${frequency.ordersPerMonth} orders / month (lifetime)`
                        : undefined
                    }
                  />
                  <Stat
                    label="Total orders"
                    value={String(frequency.orderEventCount)}
                  />
                  <Stat
                    label="Last order"
                    value={formatDate(frequency.lastOrderDate)}
                    hint={`${frequency.daysSinceLastOrder} days ago`}
                  />
                  <Stat
                    label="Products ordered"
                    value={String(frequency.productCount)}
                    hint={`${formatNumber(frequency.totalVolume)} total volume`}
                  />
                </div>

                <div>
                  <h3 className="font-heading mb-2 text-lg">Active since</h3>
                  <p className="text-sm text-muted-foreground">
                    First order {formatDate(frequency.firstOrderDate)} · tracking{" "}
                    {frequency.productCount} individual product
                    {frequency.productCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="min-h-0 xl:overflow-y-auto xl:pl-1">
                <h3 className="font-heading mb-3 text-lg">Products ordered</h3>
                <div className="max-h-[min(28rem,calc(100vh-14rem))] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                        <TableHead className="text-right">Times</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((row) => (
                        <TableRow
                          key={row.product}
                          className="cursor-pointer transition-colors hover:bg-primary/6"
                          onClick={() => onSelectProduct?.(row.product)}
                        >
                          <TableCell className="font-medium text-primary hover:underline">
                            {row.product}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatNumber(row.volume)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.orderEventCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {Math.round(row.shareOfRestaurantVolumePct)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ProductTrackingSheet({
  catalog,
  restaurantRows,
  onOpenChange,
  onSelectAccountProduct,
}: {
  catalog: ProductPurchaseTracking | null;
  restaurantRows: RestaurantProductMix[];
  onOpenChange: (open: boolean) => void;
  onSelectAccountProduct?: (accountName: string, product: string) => void;
}) {
  return (
    <Dialog open={Boolean(catalog)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-1.5rem)] w-[min(96rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {catalog ? (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
              <DialogTitle className="font-heading text-2xl">{catalog.product}</DialogTitle>
              <DialogDescription>
                Individual product purchase history. Click a restaurant to view its orders for this product.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 xl:grid-cols-[minmax(0,22rem)_1fr] xl:overflow-hidden">
              <div className="space-y-4 xl:overflow-y-auto xl:pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Repurchase frequency"
                    value={formatOrderFrequency(catalog.avgDaysBetweenPurchases)}
                    hint={`${catalog.orderEventCount} purchase events`}
                  />
                  <Stat
                    label="Total volume"
                    value={formatNumber(catalog.volume)}
                    hint={`${formatNumber(catalog.avgVolumePerLine)} avg per purchase`}
                  />
                  <Stat
                    label="Restaurants"
                    value={String(catalog.restaurantCount)}
                  />
                  <Stat
                    label="Last purchased"
                    value={formatDate(catalog.lastOrdered)}
                    hint={`Since ${formatDate(catalog.firstOrdered)}`}
                  />
                </div>
              </div>

              <div className="min-h-0 xl:overflow-y-auto xl:pl-1">
                <h3 className="font-heading mb-3 text-lg">Restaurants ordering this product</h3>
                <div className="max-h-[min(28rem,calc(100vh-14rem))] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Restaurant</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Last</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {restaurantRows.map((row) => (
                        <TableRow
                          key={row.accountName}
                          className="cursor-pointer transition-colors hover:bg-primary/6"
                          onClick={() =>
                            onSelectAccountProduct?.(row.accountName, catalog.product)
                          }
                        >
                          <TableCell className="font-medium text-primary hover:underline">
                            {row.accountName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatNumber(row.volume)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.orderEventCount}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDate(row.lastOrdered)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function AccountTrackingSummary({
  tracking,
  accountHealth,
  compact = false,
  showStatsGrid = true,
  productChangeAnalysis: productChangeAnalysisProp,
  changePeriodDays: changePeriodDaysProp,
  onChangePeriodDays: onChangePeriodDaysProp,
}: {
  tracking: AccountOrderTracking;
  accountHealth?: AccountHealth | null;
  compact?: boolean;
  showStatsGrid?: boolean;
  productChangeAnalysis?: AccountProductChangeAnalysis;
  changePeriodDays?: ProductChangePeriodDays;
  onChangePeriodDays?: (days: ProductChangePeriodDays) => void;
}) {
  const { frequency } = tracking;
  const [productsOpen, setProductsOpen] = useState(false);
  const internalPeriod = useProductChangePeriodAnalysis(tracking);
  const changePeriodDays = changePeriodDaysProp ?? internalPeriod.changePeriodDays;
  const setChangePeriodDays =
    onChangePeriodDaysProp ?? internalPeriod.setChangePeriodDays;
  const productChangeAnalysis =
    productChangeAnalysisProp ?? internalPeriod.analysis;

  const { newProducts, droppedProducts, productChanges } = productChangeAnalysis;

  const purchasedProducts = useMemo(() => {
    const statusByProduct = new Map(
      productChanges.map((change) => [change.product, change.status]),
    );
    return [...tracking.products]
      .sort((a, b) => b.volume - a.volume || a.product.localeCompare(b.product))
      .map((row) => ({
        ...row,
        status: statusByProduct.get(row.product) ?? "stable",
      }));
  }, [productChanges, tracking.products]);

  function exportProductsPdf() {
    downloadAccountProductsPdf({
      accountName: tracking.accountName,
      salesRep: accountHealth?.account.salesRep,
      lastVisitDate: accountHealth?.lastVisitDate,
      daysSinceVisit: accountHealth?.daysSinceVisit,
      asOf: tracking.analysisAsOf,
      generatedAt: new Date().toISOString(),
      products: purchasedProducts.map((row) => ({
        product: row.product,
        volume: row.volume,
        sharePct: row.shareOfRestaurantVolumePct,
        orderEventCount: row.orderEventCount,
        firstOrdered: row.firstOrdered,
        lastOrdered: row.lastOrdered,
      })),
    });
  }

  return (
    <>
      {showStatsGrid ? (
        <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
          <Stat
            label="All-time volume"
            value={formatNumber(tracking.volumeAllTime)}
            hint={`${formatNumber(tracking.volumeRecent90)} recent · ${formatNumber(tracking.volumePrior90)} prior 45d`}
          />
          <Stat
            label="Frequency change"
            value={formatFrequencyDeltaDays(tracking.frequencyDeltaDays)}
            hint="Change in typical frequency after the latest order (weekly events)"
          />
          <Stat
            label="Order frequency"
            value={formatOrderFrequency(frequency.avgDaysBetweenOrders)}
            hint={
              frequency.ordersPerMonth
                ? `${frequency.ordersPerMonth} orders / month (lifetime)`
                : undefined
            }
          />
          <Stat
            label="Last order"
            value={formatDate(frequency.lastOrderDate)}
            hint={`${frequency.daysSinceLastOrder} days ago`}
          />
          <Stat
            label="Last visit"
            value={formatDate(accountHealth?.lastVisitDate ?? null)}
            hint={
              accountHealth?.daysSinceVisit != null
                ? formatDays(accountHealth.daysSinceVisit)
                : "No visit on file"
            }
          />
          <Stat
            label="Products"
            value={String(frequency.productCount)}
            hint={
              newProducts.length > 0 || droppedProducts.length > 0
                ? `${newProducts.length} new · ${droppedProducts.length} dropped (${changePeriodDays}d)`
                : `${formatNumber(frequency.totalVolume)} total volume`
            }
            onClick={() => setProductsOpen(true)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => setProductsOpen(true)}
          >
            View all {frequency.productCount} products purchased
          </button>
          {accountHealth?.daysSinceVisit != null ? (
            <span className="text-xs text-muted-foreground">
              Last visit {formatDays(accountHealth.daysSinceVisit)} ago (
              {formatDate(accountHealth.lastVisitDate)})
            </span>
          ) : null}
        </div>
      )}

      <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[min(72rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <DialogTitle className="font-heading text-xl">
                  Products purchased
                </DialogTitle>
                <DialogDescription>
                  Every wine {tracking.accountName} has ordered, {purchasedProducts.length}{" "}
                  product{purchasedProducts.length === 1 ? "" : "s"} all time.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={purchasedProducts.length === 0}
                onClick={exportProductsPdf}
              >
                <Printer className="size-4" />
                Export PDF
              </Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {purchasedProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products have been purchased by this account yet.
              </p>
            ) : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Bottles</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">First ordered</TableHead>
                    <TableHead className="text-right">Last ordered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchasedProducts.map((row) => (
                    <TableRow key={row.product}>
                      <TableCell className="max-w-[24rem] whitespace-normal font-medium">
                        {row.product}
                      </TableCell>
                      <TableCell>
                        <Badge variant={productChangeVariant(row.status)} className="text-[10px]">
                          {productChangeLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.volume)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(row.shareOfRestaurantVolumePct)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.orderEventCount}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatDate(row.firstOrdered)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatDate(row.lastOrdered)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {tracking.orders.length > 0 ? (
        <div className="space-y-3">
          <ProductChangePeriodControl
            value={changePeriodDays}
            onChange={setChangePeriodDays}
          />
          {newProducts.length > 0 ? (
            <div className="rounded-lg border border-primary/20 bg-primary/6 px-3 py-3 text-sm">
              <p className="font-medium">
                New products
                <span className="ml-1.5 font-normal text-muted-foreground">
                  (last {changePeriodDays} days)
                </span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {newProducts.map((product) => (
                  <li key={product}>{product}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {droppedProducts.length > 0 ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/6 px-3 py-3 text-sm">
              <p className="font-medium">
                Dropped products
                <span className="ml-1.5 font-normal text-muted-foreground">
                  (last {changePeriodDays} days)
                </span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {droppedProducts.map((product) => (
                  <li key={product}>{product}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {newProducts.length === 0 && droppedProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No new or dropped products in the last {changePeriodDays} days (vs prior{" "}
              {changePeriodDays} days and earlier history).
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SortableCadenceHead({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: ProductCadenceSortKey;
  sort: { column: ProductCadenceSortKey; direction: SortDirection };
  onSort: (column: ProductCadenceSortKey) => void;
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

type TrackingTablePresentation = "default" | "catalog";

function ProductCadenceTable({
  cadence,
  onSelectProduct,
  presentation = "default",
}: {
  cadence: AccountProductCadence[];
  onSelectProduct?: (product: string) => void;
  presentation?: TrackingTablePresentation;
}) {
  const catalog = presentation === "catalog";
  const headClass = catalog ? "px-3 py-2.5 font-semibold text-foreground" : undefined;
  const cellPad = catalog ? "px-3 py-2.5" : undefined;
  const [sort, setSort] = useState<{
    column: ProductCadenceSortKey;
    direction: SortDirection;
  }>({ column: "typicalCadence", direction: "asc" });

  const sortedCadence = useMemo(
    () => sortProductCadenceRows(cadence, sort.column, sort.direction),
    [cadence, sort],
  );

  function toggleSort(column: ProductCadenceSortKey) {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            column,
            direction:
              column === "product" || column === "typicalCadence" || column === "lastOrder"
                ? "asc"
                : "desc",
          },
    );
  }

  if (cadence.length === 0) {
    return (
      <div>
        <h3 className="font-heading mb-2 text-lg">Product order cadence</h3>
        <p className="text-sm text-muted-foreground">
          No products ordered for this account yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2.5">
      {catalog ? (
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
            <TrendingUp className="size-4 text-primary" />
            Product Order Cadence
          </h4>
          <span className="text-xs text-muted-foreground">
            {cadence.length} product{cadence.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : (
        <>
          <h3 className="font-heading mb-3 text-lg">
            Product order cadence
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({cadence.length} product{cadence.length === 1 ? "" : "s"})
            </span>
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Typical reorder interval for each product since its first purchase, compared
            to days since the last order for that product. Click any product to view its
            individual orders.
          </p>
        </>
      )}
      <div
        className={cn(
          catalog
            ? "overflow-hidden rounded-lg border"
            : "max-h-[min(36rem,calc(100vh-14rem))] overflow-y-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-hidden",
        )}
      >
        <Table className={catalog ? "text-xs" : "table-fixed text-xs"}>
          <TableHeader>
            <TableRow className={catalog ? "bg-muted/40" : undefined}>
              <SortableCadenceHead
                label="Product"
                column="product"
                sort={sort}
                onSort={toggleSort}
                className={catalog ? headClass : "w-[28%]"}
              />
              <SortableCadenceHead
                label="Typical cadence"
                column="typicalCadence"
                sort={sort}
                onSort={toggleSort}
                className="w-[14%]"
              />
              <SortableCadenceHead
                label="Last order"
                column="lastOrder"
                sort={sort}
                onSort={toggleSort}
                className="w-[14%]"
              />
              <SortableCadenceHead
                label="Days since"
                column="daysSince"
                sort={sort}
                onSort={toggleSort}
                className="w-[12%] text-right"
              />
              <SortableCadenceHead
                label="vs typical"
                column="vsTypical"
                sort={sort}
                onSort={toggleSort}
                className="w-[12%] text-right"
              />
              <SortableCadenceHead
                label="Risk"
                column="risk"
                sort={sort}
                onSort={toggleSort}
                className="w-[12%]"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCadence.map((row) => {
              const tone = orderCadenceTone({
                daysSinceOrder: row.daysSinceLastOrder,
                intervalDays: row.avgDaysBetweenOrders,
              });

              return (
                <TableRow
                  key={row.product}
                  className={cn(
                    "cursor-pointer transition-colors",
                    catalog ? "hover:bg-muted/40" : "hover:bg-primary/6",
                    row.risk === "healthy" ? "text-muted-foreground" : undefined,
                  )}
                  onClick={() => onSelectProduct?.(row.product)}
                  title={`Click to view individual orders for ${row.product}`}
                >
                  <TableCell className="align-top font-medium whitespace-normal break-words text-primary hover:underline" title={row.product}>
                    {row.product}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">
                      {formatOrderFrequency(row.avgDaysBetweenOrders)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {row.orderEventCount} order{row.orderEventCount === 1 ? "" : "s"} since{" "}
                      {formatDate(row.firstOrdered)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span>{formatDate(row.lastOrdered)}</span>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${orderCadenceToneClass(tone)}`}
                  >
                    {formatDays(row.daysSinceLastOrder)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${orderCadenceToneHintClass(tone)}`}
                  >
                    {row.daysPastTypical === null
                      ? "—"
                      : row.daysPastTypical <= 0
                        ? `${Math.abs(row.daysPastTypical)}d early`
                        : `${row.daysPastTypical}d late`}
                  </TableCell>
                  <TableCell>
                    <RiskBadge risk={row.risk} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ProductChangesTable({
  changes,
  periodDays,
  onSelectProduct,
  presentation = "default",
}: {
  changes: AccountProductChange[];
  periodDays: {
    recent: number;
    prior: number;
    before: number | null;
  };
  onSelectProduct?: (product: string) => void;
  presentation?: TrackingTablePresentation;
}) {
  const catalog = presentation === "catalog";
  const headClass = "px-3 py-2.5 font-semibold text-foreground";
  if (changes.length === 0) {
    return (
      <div>
        <h3 className="font-heading mb-2 text-lg">Product changes</h3>
        <p className="text-sm text-muted-foreground">
          No products ordered for this account yet.
        </p>
      </div>
    );
  }

  const beforeHeader =
    periodDays.before !== null
      ? `Before (${periodDays.before}d)`
      : "Before";

  return (
    <div className="min-w-0 space-y-2.5">
      {catalog ? (
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
            <Store className="size-4 text-primary" />
            Product Mix & Volume Changes
          </h4>
          <span className="text-xs text-muted-foreground">
            {periodDays.recent}d vs prior {periodDays.prior}d · {changes.length} SKU
            {changes.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : (
        <h3 className="font-heading mb-3 text-lg">
          Product changes
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({changes.length} product{changes.length === 1 ? "" : "s"})
          </span>
        </h3>
      )}
      <div
        className={cn(
          catalog
            ? "overflow-hidden rounded-lg border"
            : "max-h-[min(36rem,calc(100vh-14rem))] overflow-y-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-hidden",
        )}
      >
        <Table className={catalog ? "text-xs" : "table-fixed text-xs"}>
          <TableHeader>
            <TableRow className={catalog ? "bg-muted/40" : undefined}>
              <TableHead className={catalog ? headClass : "w-[34%]"}>Product</TableHead>
              <TableHead className={catalog ? headClass : "w-[12%]"}>Change</TableHead>
              <TableHead className={catalog ? cn(headClass, "text-right") : "w-[14%] text-right"}>
                Recent ({periodDays.recent}d)
              </TableHead>
              <TableHead className={catalog ? cn(headClass, "text-right") : "w-[14%] text-right"}>
                Prior ({periodDays.prior}d)
              </TableHead>
              <TableHead className={catalog ? cn(headClass, "text-right") : "w-[14%] text-right"}>
                {beforeHeader}
              </TableHead>
              <TableHead className={catalog ? cn(headClass, "text-right") : "w-[12%] text-right"}>
                Δ
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((row) => (
              <TableRow
                key={row.product}
                className={cn(
                  "cursor-pointer transition-colors",
                  catalog ? "hover:bg-muted/40" : "hover:bg-primary/6",
                  row.status === "stable" ? "text-muted-foreground" : undefined,
                )}
                onClick={() => onSelectProduct?.(row.product)}
                title={`Click to view individual orders for ${row.product}`}
              >
                <TableCell
                  className={cn(
                    "align-top font-medium whitespace-normal break-words text-primary hover:underline",
                    catalog && "px-3 py-2.5",
                  )}
                  title={row.product}
                >
                  {row.product}
                </TableCell>
                <TableCell className={cn("whitespace-normal", catalog && "px-3 py-2.5")}>
                  <Badge variant={productChangeVariant(row.status)} className="text-[10px]">
                    {productChangeLabel(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", catalog && "px-3 py-2.5")}>
                  {formatNumber(row.recentVolume)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", catalog && "px-3 py-2.5")}>
                  {formatNumber(row.priorVolume)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", catalog && "px-3 py-2.5")}>
                  {formatNumber(row.historicalVolume)}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", catalog && "px-3 py-2.5")}>
                  {formatPct(row.volumeDeltaPct)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CatalogMetricCard({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "sky" | "emerald" | "rose";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3.5",
        tone === "sky" && "border-sky-200 bg-sky-50/50 dark:border-sky-900/50 dark:bg-sky-950/20",
        tone === "emerald" &&
          "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20",
        tone === "rose" &&
          "border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20",
        !tone && "bg-muted/20",
      )}
    >
      <p
        className={cn(
          "text-xs font-medium",
          tone === "sky" && "text-sky-800 dark:text-sky-300",
          tone === "emerald" && "text-emerald-800 dark:text-emerald-300",
          tone === "rose" && "text-rose-800 dark:text-rose-300",
          !tone && "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="mt-1 font-heading text-xl font-bold text-foreground">
        {value}{" "}
        {unit ? (
          <span className="text-xs font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Stat({
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
  const className = "rounded-lg border bg-card px-3 py-2 text-left";
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </>
  );

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        className,
        "cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5",
      )}
      title="View every product this account has purchased"
    >
      {body}
    </button>
  );
}
