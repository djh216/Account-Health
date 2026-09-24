"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { OrderCadenceAlert } from "@/components/order-cadence-alert";
import { RiskBadge } from "@/components/risk-badge";
import { TerritoryValueBadge } from "@/components/territory-value-badge";
import { Badge } from "@/components/ui/badge";
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
  sortProductCadenceRows,
  type AccountOrderTracking,
  type AccountProductCadence,
  type AccountProductChange,
  type ProductCadenceSortKey,
  type ProductChangeStatus,
  type ProductPurchaseTracking,
  type RestaurantOrderFrequency,
  type RestaurantProductMix,
  type SortDirection,
} from "@/lib/order-analytics";
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
  const cadence = tracking
    ? orderCadenceStatus({
        daysSinceOrder: tracking.frequency.daysSinceLastOrder,
        lastOrderDate: tracking.frequency.lastOrderDate,
        intervalDays: tracking.frequency.avgDaysBetweenOrders,
      })
    : null;

  return (
    <Dialog open={Boolean(tracking)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-1.5rem)] w-[min(96rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {tracking ? (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
              {accountHealth ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <RiskBadge risk={accountHealth.risk} />
                  {accountHealth.territoryTier ? (
                    <TerritoryValueBadge tier={accountHealth.territoryTier} />
                  ) : null}
                  <span className="text-sm text-muted-foreground">
                    Health score {accountHealth.score}
                    {accountHealth.territoryRank
                      ? ` · Territory rank #${accountHealth.territoryRank}`
                      : ""}
                  </span>
                </div>
              ) : null}
              <DialogTitle className="font-heading text-2xl">
                {tracking.accountName}
              </DialogTitle>
              <DialogDescription>
                Order trends and product mix with 45-day comparisons. Older orders
                are included in all-time totals and monthly breakdowns. Click any product to view its individual orders.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:gap-8 xl:overflow-hidden">
              <div className="min-w-0 space-y-4 xl:overflow-y-auto xl:pr-1">
                {cadence ? <OrderCadenceAlert cadence={cadence} /> : null}

                <AccountTrackingSummary tracking={tracking} compact />
              </div>

              <div className="min-w-0 space-y-4 xl:overflow-y-auto xl:pl-1">
                <ProductCadenceTable
                  cadence={tracking.productCadence}
                  onSelectProduct={onSelectProduct}
                />

                <ProductChangesTable
                  changes={tracking.productChanges}
                  periodDays={tracking.periodDays}
                  onSelectProduct={onSelectProduct}
                />

                <div>
                  <h3 className="font-heading mb-3 text-lg">Monthly volume</h3>
                  <div className="max-h-56 overflow-y-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-hidden">
                    <Table className="table-fixed text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[38%]">Month</TableHead>
                          <TableHead className="w-[22%] text-right">Vol</TableHead>
                          <TableHead className="w-[20%] text-right">Ord</TableHead>
                          <TableHead className="w-[20%] text-right">Prod</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tracking.monthlyVolume.map((row) => (
                          <TableRow key={row.month}>
                            <TableCell className="truncate">{row.label}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(row.volume)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.orderEventCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.products.length}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
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
                        ? `${frequency.ordersPerMonth.toFixed(1)} orders / month`
                        : undefined
                    }
                  />
                  <Stat
                    label="Total orders"
                    value={String(frequency.orderEventCount)}
                    hint={`${frequency.lineCount} product lines`}
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
                    hint={`${formatNumber(catalog.avgVolumePerLine)} avg per line`}
                  />
                  <Stat
                    label="Restaurants"
                    value={String(catalog.restaurantCount)}
                    hint={`${catalog.lineCount} order lines`}
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
  compact = false,
}: {
  tracking: AccountOrderTracking;
  compact?: boolean;
}) {
  const { frequency } = tracking;

  return (
    <>
      <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
        <Stat
          label="All-time volume"
          value={formatNumber(tracking.volumeAllTime)}
          hint={`${formatNumber(tracking.volumeRecent90)} recent · ${formatNumber(tracking.volumePrior90)} prior 45d`}
        />
        <Stat
          label="Frequency change (45d)"
          value={formatFrequencyDeltaDays(tracking.frequencyDeltaDays)}
          hint="Recent 45d cadence vs prior 45d (days)"
        />
        <Stat
          label="Order frequency"
          value={formatOrderFrequency(frequency.avgDaysBetweenOrders)}
          hint={
            frequency.ordersPerMonth
              ? `${frequency.ordersPerMonth.toFixed(1)} orders / month`
              : undefined
          }
        />
        <Stat
          label="Last order"
          value={formatDate(frequency.lastOrderDate)}
          hint={`${frequency.daysSinceLastOrder} days ago`}
        />
        <Stat
          label="Products"
          value={String(frequency.productCount)}
          hint={
            tracking.newProducts.length > 0 || tracking.droppedProducts.length > 0
              ? `${tracking.newProducts.length} new · ${tracking.droppedProducts.length} dropped`
              : `${formatNumber(frequency.totalVolume)} total volume`
          }
        />
      </div>

      {(tracking.newProducts.length > 0 || tracking.droppedProducts.length > 0) && (
        <div className="space-y-3">
          {tracking.newProducts.length > 0 ? (
            <div className="rounded-lg border border-primary/20 bg-primary/6 px-3 py-3 text-sm">
              <p className="font-medium">New products</p>
              <ul className="mt-2 space-y-1.5">
                {tracking.newProducts.map((product) => (
                  <li key={product}>{product}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {tracking.droppedProducts.length > 0 ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/6 px-3 py-3 text-sm">
              <p className="font-medium">Dropped products</p>
              <ul className="mt-2 space-y-1.5">
                {tracking.droppedProducts.map((product) => (
                  <li key={product}>{product}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
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

function ProductCadenceTable({
  cadence,
  onSelectProduct,
}: {
  cadence: AccountProductCadence[];
  onSelectProduct?: (product: string) => void;
}) {
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
    <div className="min-w-0">
      <h3 className="font-heading mb-3 text-lg">
        Product order cadence
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({cadence.length} product{cadence.length === 1 ? "" : "s"})
        </span>
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Typical reorder interval for each product since its first purchase, compared
        to days since the last order for that product. Click any product to view its individual orders.
      </p>
      <div className="max-h-[min(36rem,calc(100vh-14rem))] overflow-y-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-hidden">
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <SortableCadenceHead
                label="Product"
                column="product"
                sort={sort}
                onSort={toggleSort}
                className="w-[28%]"
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
                  className={`cursor-pointer transition-colors hover:bg-primary/6 ${
                    row.risk === "healthy" ? "text-muted-foreground" : undefined
                  }`}
                  onClick={() => onSelectProduct?.(row.product)}
                  title={`Click to view individual orders for ${row.product}`}
                >
                  <TableCell className="truncate font-medium text-primary hover:underline" title={row.product}>
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
}: {
  changes: AccountProductChange[];
  periodDays: {
    recent: number;
    prior: number;
    before: number | null;
  };
  onSelectProduct?: (product: string) => void;
}) {
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
    <div className="min-w-0">
      <h3 className="font-heading mb-3 text-lg">
        Product changes
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({changes.length} product{changes.length === 1 ? "" : "s"})
        </span>
      </h3>
      <div className="max-h-[min(36rem,calc(100vh-14rem))] overflow-y-auto rounded-lg border [&_[data-slot=table-container]]:overflow-x-hidden">
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[34%]">Product</TableHead>
              <TableHead className="w-[12%]">Change</TableHead>
              <TableHead className="w-[14%] text-right">
                Recent ({periodDays.recent}d)
              </TableHead>
              <TableHead className="w-[14%] text-right">
                Prior ({periodDays.prior}d)
              </TableHead>
              <TableHead className="w-[14%] text-right">{beforeHeader}</TableHead>
              <TableHead className="w-[12%] text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((row) => (
              <TableRow
                key={row.product}
                className={`cursor-pointer transition-colors hover:bg-primary/6 ${
                  row.status === "stable" ? "text-muted-foreground" : undefined
                }`}
                onClick={() => onSelectProduct?.(row.product)}
                title={`Click to view individual orders for ${row.product}`}
              >
                <TableCell className="truncate font-medium text-primary hover:underline" title={row.product}>
                  {row.product}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Badge variant={productChangeVariant(row.status)} className="text-[10px]">
                    {productChangeLabel(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.recentVolume)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.priorVolume)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.historicalVolume)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
