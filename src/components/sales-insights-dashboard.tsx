"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Grape,
  LineChart,
  RotateCcw,
  Upload,
} from "lucide-react";
import { ExcludeProductOutOfStockButton } from "@/components/analytics-exclusion-controls";
import { ClearDataButton } from "@/components/clear-data-button";
import { PrintReportButton } from "@/components/print-report-button";
import {
  NotificationSidebar,
  NotificationSidebarTrigger,
} from "@/components/notification-sidebar";
import { RepFilterSelect } from "@/components/rep-filter-select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import { useOutOfStockProducts } from "@/hooks/use-out-of-stock-products";
import { useSalesInsights } from "@/hooks/use-sales-insights";
import {
  excludeOutOfStockWinBackSkus,
  outOfStockProductId,
} from "@/lib/out-of-stock-products";
import type { WinBackSkuRow } from "@/lib/sales-insights/types";
import { formatDate, formatNumber, reportKindLabel } from "@/lib/format";
import { buildPdfAccountVisitLookup } from "@/lib/report-export";
import { territoryTierLabel } from "@/lib/territory-value";

type KpiDetailConfig = {
  title: string;
  description: string;
  headers: string[];
  rows: (string | number)[][];
  emptyMessage: string;
};

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

function SnapshotBox({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {onClick ? (
          <span className="normal-case tracking-normal text-muted-foreground/80">
            {" "}
            · Click to view
          </span>
        ) : null}
      </p>
      <div className="mt-2">{children}</div>
    </>
  );

  if (!onClick) {
    return <div className="rounded-lg border bg-muted/30 p-4 text-sm">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-muted/30 p-4 text-left text-sm transition hover:border-primary/40 hover:bg-primary/6"
    >
      {inner}
    </button>
  );
}

function InsightKpiDialog({
  config,
  open,
  onOpenChange,
}: {
  config: KpiDetailConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!config) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,calc(100vh-2rem))] w-[min(90rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:max-w-none">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle className="font-heading text-2xl">{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {config.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{config.emptyMessage}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {config.headers.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex} className="align-top text-sm">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LazyTabPanel({
  activeTab,
  value,
  children,
  className,
}: {
  activeTab: string;
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContent value={value} className={`min-h-0 overflow-visible ${className ?? ""}`}>
      {activeTab === value ? children : null}
    </TabsContent>
  );
}

type WinBackSortKey =
  | "account"
  | "product"
  | "priorVolume90"
  | "lastOrder"
  | "daysSince";

type SortDirection = "asc" | "desc";

function compareWinBackRows(
  a: WinBackSkuRow,
  b: WinBackSkuRow,
  column: WinBackSortKey,
  direction: SortDirection,
): number {
  const sign = direction === "asc" ? 1 : -1;

  switch (column) {
    case "account":
      return sign * a.accountName.localeCompare(b.accountName);
    case "product":
      return sign * a.product.localeCompare(b.product);
    case "priorVolume90":
      return sign * (a.priorVolume90 - b.priorVolume90);
    case "lastOrder": {
      const aDate = a.lastOrderedDate ?? "";
      const bDate = b.lastOrderedDate ?? "";
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return sign * aDate.localeCompare(bDate);
    }
    case "daysSince": {
      const aDays = a.daysSinceLastOrder;
      const bDays = b.daysSinceLastOrder;
      if (aDays === null && bDays === null) return 0;
      if (aDays === null) return 1;
      if (bDays === null) return -1;
      return sign * (aDays - bDays);
    }
    default:
      return 0;
  }
}

function SortableWinBackHead({
  label,
  column,
  sort,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  column: WinBackSortKey;
  sort: { column: WinBackSortKey; direction: SortDirection };
  onSort: (column: WinBackSortKey) => void;
  className?: string;
  align?: "left" | "right";
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
        className={`inline-flex w-full items-center gap-1 hover:text-foreground ${
          align === "right" ? "justify-end" : "justify-start"
        } ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        <Icon className="size-3.5 shrink-0 opacity-70" />
      </button>
    </TableHead>
  );
}

function WinBackSkusPanel({
  rows,
  onProductExcluded,
  onMessage,
}: {
  rows: WinBackSkuRow[];
  onProductExcluded?: (productName: string) => void;
  onMessage?: (message: string) => void;
}) {
  const { ids: outOfStockIds, restore } = useOutOfStockProducts();
  const [sort, setSort] = useState<{
    column: WinBackSortKey;
    direction: SortDirection;
  }>({ column: "priorVolume90", direction: "desc" });

  const filteredRows = useMemo(
    () => excludeOutOfStockWinBackSkus(rows, outOfStockIds),
    [rows, outOfStockIds],
  );

  const visibleRows = useMemo(
    () =>
      [...filteredRows].sort((a, b) => compareWinBackRows(a, b, sort.column, sort.direction)),
    [filteredRows, sort],
  );

  function toggleSort(column: WinBackSortKey) {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            column,
            direction:
              column === "account" || column === "product" || column === "lastOrder"
                ? "asc"
                : "desc",
          },
    );
  }
  const excludedProducts = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; productName: string }[] = [];
    for (const row of rows) {
      const id = outOfStockProductId(row.product);
      if (!outOfStockIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      list.push({ id, productName: row.product });
    }
    return list.sort((a, b) => a.productName.localeCompare(b.productName));
  }, [rows, outOfStockIds]);

  return (
    <Card className="overflow-visible">
      <CardHeader className="border-b">
        <CardTitle className="font-heading text-xl">Win-back SKUs</CardTitle>
        <CardDescription>
          Products with prior-period volume but no recent orders. Mark out-of-stock SKUs to remove
          them from this list and the Sales insights pack PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 pt-4">
        {excludedProducts.length > 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-xs">
            <p className="font-medium text-foreground">
              Out of stock — removed from this report ({excludedProducts.length})
            </p>
            <ul className="mt-2 space-y-1.5">
              {excludedProducts.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-muted-foreground">
                    {product.productName}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="shrink-0"
                    onClick={() => {
                      restore(product.id);
                      onMessage?.(`Restored "${product.productName}" to win-back report.`);
                    }}
                  >
                    <RotateCcw className="size-3" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {visibleRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {excludedProducts.length > 0
              ? "No win-back rows left in this view. Out-of-stock products are listed above."
              : "No win-back SKU opportunities."}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {visibleRows.length} row{visibleRows.length === 1 ? "" : "s"} · click column headers
              to sort
            </p>
            <div className="w-full max-w-full overflow-x-auto rounded-lg border bg-background">
              <Table className="min-w-[52rem] [&_td]:text-left [&_th]:text-left">
                <TableHeader>
                  <TableRow>
                    <SortableWinBackHead
                      label="Account"
                      column="account"
                      sort={sort}
                      onSort={toggleSort}
                      className="min-w-[11rem] whitespace-normal"
                    />
                    <SortableWinBackHead
                      label="Product"
                      column="product"
                      sort={sort}
                      onSort={toggleSort}
                      className="min-w-[12rem] whitespace-normal"
                    />
                    <SortableWinBackHead
                      label="Prior 90d btl"
                      column="priorVolume90"
                      sort={sort}
                      onSort={toggleSort}
                      className="whitespace-nowrap"
                      align="right"
                    />
                    <SortableWinBackHead
                      label="Last order"
                      column="lastOrder"
                      sort={sort}
                      onSort={toggleSort}
                      className="whitespace-nowrap"
                    />
                    <SortableWinBackHead
                      label="Days since"
                      column="daysSince"
                      sort={sort}
                      onSort={toggleSort}
                      className="whitespace-nowrap"
                      align="right"
                    />
                    <TableHead className="w-[1%] whitespace-nowrap">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={`${row.accountName}::${row.product}`}>
                      <TableCell className="align-top whitespace-normal break-words text-sm">
                        {row.accountName}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal break-words text-sm">
                        {row.product}
                      </TableCell>
                      <TableCell className="align-top text-right text-sm tabular-nums whitespace-nowrap">
                        {formatNumber(row.priorVolume90)}
                      </TableCell>
                      <TableCell className="align-top text-sm whitespace-nowrap">
                        {row.lastOrderedDate ? formatDate(row.lastOrderedDate) : "—"}
                      </TableCell>
                      <TableCell className="align-top text-right text-sm tabular-nums whitespace-nowrap">
                        {row.daysSinceLastOrder ?? "—"}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        <ExcludeProductOutOfStockButton
                          productName={row.product}
                          onExcluded={onProductExcluded}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InsightTable({
  title,
  description,
  headers,
  rows,
  emptyMessage,
}: {
  title: string;
  description?: string;
  headers: string[];
  rows: (string | number)[][];
  emptyMessage: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle className="font-heading text-xl">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-4">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="align-top text-sm">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SalesInsightsDashboard() {
  const {
    reps,
    repFilter,
    setRepFilter,
    repFilterPending,
    fullState,
    snapshot,
    importParseResult,
    frequencyAlerts,
    productAlerts,
    enrichedAccounts,
    newAccounts,
    retainedAccounts,
    returningCustomers,
    projectionsSummary,
  } = useFilteredPortfolio();
  const { insights, insightsPending } = useSalesInsights();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notificationSidebarOpen, setNotificationSidebarOpen] = useState(false);
  const [activeInsightsTab, setActiveInsightsTab] = useState("briefing");
  const [kpiDetail, setKpiDetail] = useState<KpiDetailConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function openKpiDetail(config: KpiDetailConfig) {
    setKpiDetail(config);
  }

  const accountVisitLookup = useMemo(() => {
    if (!notificationSidebarOpen) return undefined;
    return buildPdfAccountVisitLookup(enrichedAccounts);
  }, [enrichedAccounts, notificationSidebarOpen]);

  const totalAlertsCount = frequencyAlerts.length + productAlerts.length;
  const totalCriticalAlertsCount =
    frequencyAlerts.filter((a) => a.severity === "critical").length +
    productAlerts.filter((a) => a.severity === "critical").length;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }

  const b = insights?.weeklyBriefing;

  return (
    <div className="min-h-screen">
      <header className="border-b border-primary/15 bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Grape className="size-5" />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                  Wine distribution · sales insights
                </p>
              </div>
              <h1 className="font-heading mt-1 text-3xl tracking-tight sm:text-4xl">
                Sales insights
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Reorder windows, visit coverage, strike rate, assortment depth, and momentum for
                the active sales book.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <NotificationSidebarTrigger
                alertsCount={totalAlertsCount}
                criticalCount={totalCriticalAlertsCount}
                onClick={() => setNotificationSidebarOpen(true)}
              />
              <PrintReportButton page="insights" onMessage={flash} />
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

      <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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

        {fullState.accounts.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <LineChart className="mb-2 size-10 text-muted-foreground" />
              <CardTitle className="font-heading text-2xl">No account data yet</CardTitle>
              <CardDescription className="max-w-lg">
                Upload order history and visit activity to unlock sales insight reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => setUploadOpen(true)}>Upload reports</Button>
            </CardContent>
          </Card>
        ) : snapshot.accounts.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <CardTitle className="font-heading text-2xl">No accounts for this rep</CardTitle>
              <CardDescription className="max-w-lg">
                {repFilter} has no assigned accounts in your uploaded data. Switch to another
                sales rep or choose All sales reps.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : repFilterPending ? (
          <Card className="border-dashed py-12">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading book analytics…
            </CardContent>
          </Card>
        ) : insightsPending || !insights || !b ? (
          <Card className="border-dashed py-12">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Building sales insight reports…
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi
                label="Due to reorder (14d)"
                value={String(b.dueToReorderCount)}
                hint="Expected reorder within two weeks · Click to view"
                onClick={() =>
                  openKpiDetail({
                    title: "Due to reorder (14d)",
                    description:
                      "Accounts expected to reorder within the next 14 days and not yet overdue on cadence.",
                    headers: ["Account", "Expected", "Days out", "Typ days", "Score", "Risk"],
                    emptyMessage: "No accounts in the proactive 14-day reorder window.",
                    rows: insights.dueToReorder.map((row) => [
                      row.accountName,
                      formatDate(row.expectedOrderDate),
                      row.daysUntilExpected,
                      row.typicalIntervalDays,
                      row.score,
                      row.risk,
                    ]),
                  })
                }
              />
              <Kpi
                label="Visit coverage gaps"
                value={String(insights.visitCoverageAccounts.length)}
                hint="Overdue visit cadence or 60+ days silent · Click to view"
                onClick={() =>
                  openKpiDetail({
                    title: "Visit coverage gaps",
                    description:
                      "Accounts with overdue visit cadence or no visit logged in 60+ days.",
                    headers: ["Account", "Rep", "Days since visit", "Overdue?", "Last visit"],
                    emptyMessage: "No visit coverage gaps for this book.",
                    rows: insights.visitCoverageAccounts.map((row) => [
                      row.accountName,
                      row.salesRep ?? "—",
                      row.daysSinceVisit ?? "—",
                      row.visitCadenceOverdue ? "Yes" : "No",
                      row.lastVisitDate ? formatDate(row.lastVisitDate) : "—",
                    ]),
                  })
                }
              />
              <Kpi
                label="Strike rate (90d)"
                value={b.strikeRateAllRepsPct !== null ? `${b.strikeRateAllRepsPct}%` : "—"}
                hint="Visits with order within 7 days · Click to view"
                onClick={() =>
                  openKpiDetail({
                    title: "Strike rate by rep (90d)",
                    description:
                      b.strikeRateAllRepsPct !== null
                        ? `Portfolio strike rate ${b.strikeRateAllRepsPct}% — share of visits followed by an order within 7 days.`
                        : "Share of visits followed by an order within 7 days (last 90 days).",
                    headers: ["Rep", "Visits", "Converted", "Strike rate"],
                    emptyMessage: "No visit activity in the last 90 days.",
                    rows: insights.visitConversionByRep.map((row) => [
                      row.repName,
                      row.visitCount90,
                      row.convertedVisits90,
                      `${row.strikeRatePct}%`,
                    ]),
                  })
                }
              />
            </section>

            <Tabs
              value={activeInsightsTab}
              onValueChange={setActiveInsightsTab}
              className="space-y-4"
            >
              <div className="overflow-x-auto pb-1">
                <TabsList className="inline-flex h-9 w-max min-w-full justify-start sm:min-w-0">
                  <TabsTrigger value="briefing">Weekly briefing</TabsTrigger>
                  <TabsTrigger value="reorder">Due to reorder</TabsTrigger>
                  <TabsTrigger value="visits">Visit coverage</TabsTrigger>
                  <TabsTrigger value="strike">Strike rate</TabsTrigger>
                  <TabsTrigger value="assortment">Assortment</TabsTrigger>
                  <TabsTrigger value="winback">Win-back SKUs</TabsTrigger>
                  <TabsTrigger value="momentum">Momentum</TabsTrigger>
                  <TabsTrigger value="volume">Volume breakdown</TabsTrigger>
                </TabsList>
              </div>

              <LazyTabPanel activeTab={activeInsightsTab} value="briefing" className="space-y-4">
                <Card className="overflow-hidden">
                  <CardHeader className="border-b">
                    <CardTitle className="font-heading text-xl">Weekly book snapshot</CardTitle>
                    <CardDescription>
                      As of {formatDate(b.asOf)} · {b.totalAccounts} accounts · average health
                      score {b.avgScore}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2">
                    <SnapshotBox
                      label="Risk & volume"
                      onClick={() =>
                        openKpiDetail({
                          title: "Risk & volume",
                          description: `${b.criticalCount} critical and ${b.atRiskCount} at-risk accounts · ${formatNumber(b.volumeAtRisk90)} bottles at risk (90d).`,
                          headers: ["Account", "Risk", "Score", "Btl 90d", "Rep"],
                          emptyMessage: "No critical or at-risk accounts on this book.",
                          rows: enrichedAccounts
                            .filter(
                              (item) => item.risk === "critical" || item.risk === "at_risk",
                            )
                            .sort((a, b) => b.volume90 - a.volume90)
                            .map((item) => [
                              item.account.name,
                              item.risk,
                              item.score,
                              formatNumber(item.volume90),
                              item.account.salesRep ?? "—",
                            ]),
                        })
                      }
                    >
                      {b.criticalCount} critical · {b.atRiskCount} at risk ·{" "}
                      {formatNumber(b.volumeAtRisk90)} btl at risk (90d)
                    </SnapshotBox>
                    <SnapshotBox
                      label="Lifecycle"
                      onClick={() =>
                        openKpiDetail({
                          title: "Account lifecycle",
                          description: `${b.newAccountsCount} new, ${b.retainedCount} retained, and ${b.returningCount} returning customers on this book.`,
                          headers: ["Segment", "Account", "Last order", "Recent volume"],
                          emptyMessage: "No lifecycle segments for this window.",
                          rows: [
                            ...newAccounts.map((row) => [
                              "New",
                              row.accountName,
                              formatDate(row.lastOrderDate),
                              formatNumber(row.recentVolume),
                            ]),
                            ...retainedAccounts.map((row) => [
                              "Retained",
                              row.accountName,
                              formatDate(row.lastOrderDate),
                              formatNumber(row.recentVolume),
                            ]),
                            ...returningCustomers.map((row) => [
                              "Returning",
                              row.accountName,
                              formatDate(row.lastOrderDate),
                              formatNumber(row.recentVolume),
                            ]),
                          ],
                        })
                      }
                    >
                      {b.newAccountsCount} new · {b.retainedCount} retained ·{" "}
                      {b.returningCount} returning
                    </SnapshotBox>
                    <SnapshotBox
                      label="Alerts"
                      onClick={() =>
                        openKpiDetail({
                          title: "Active alerts",
                          description: `${b.frequencyAlertCount} frequency · ${b.productAlertCount} product · ${b.highChurnCount} high churn.`,
                          headers: ["Type", "Name", "Severity", "Detail"],
                          emptyMessage: "No frequency, product, or high-churn alerts.",
                          rows: [
                            ...frequencyAlerts.map((alert) => [
                              "Frequency",
                              alert.accountName,
                              alert.severity,
                              `${Math.round(alert.dropPercentage)}% drop · ${alert.reason.replace(/_/g, " ")}`,
                            ]),
                            ...productAlerts.map((alert) => [
                              "Product",
                              alert.productName,
                              alert.severity,
                              alert.message,
                            ]),
                            ...projectionsSummary.accounts
                              .filter((account) => account.churnTier === "high")
                              .sort(
                                (a, b) => b.churnProbabilityPct - a.churnProbabilityPct,
                              )
                              .map((account) => [
                                "High churn",
                                account.accountName,
                                "high",
                                `${Math.round(account.churnProbabilityPct)}% churn risk`,
                              ]),
                          ],
                        })
                      }
                    >
                      {b.frequencyAlertCount} frequency · {b.productAlertCount} product ·{" "}
                      {b.highChurnCount} high churn
                    </SnapshotBox>
                    <SnapshotBox
                      label="Export"
                      onClick={() =>
                        openKpiDetail({
                          title: "Export these insights",
                          description:
                            "Generate PDFs from the Export PDF menu in the page header (same book and rep filter as this view).",
                          headers: ["Report", "Contents"],
                          emptyMessage: "",
                          rows: [
                            [
                              "Weekly book briefing",
                              "Snapshot KPIs, top due reorders, and momentum summary",
                            ],
                            [
                              "Sales insights pack",
                              "Full insight tables: reorder window, visits, strike rate, assortment, and more",
                            ],
                          ],
                        })
                      }
                    >
                      Use <span className="font-medium">Weekly book briefing</span> or{" "}
                      <span className="font-medium">Sales insights pack</span> from Export PDF.
                    </SnapshotBox>
                  </CardContent>
                </Card>
              </LazyTabPanel>

              <LazyTabPanel activeTab={activeInsightsTab} value="reorder">
                <InsightTable
                  title="Proactive reorder window"
                  description="Accounts expected to reorder within the next 14 days (not yet overdue)."
                  headers={["Account", "Expected", "Days out", "Typ days", "Score", "Risk"]}
                  emptyMessage="No accounts in the proactive 14-day reorder window."
                  rows={insights.dueToReorder.map((r) => [
                    r.accountName,
                    formatDate(r.expectedOrderDate),
                    r.daysUntilExpected,
                    r.typicalIntervalDays,
                    r.score,
                    r.risk,
                  ])}
                />
              </LazyTabPanel>

              <LazyTabPanel activeTab={activeInsightsTab} value="visits" className="space-y-4">
                <InsightTable
                  title="Visit coverage by rep"
                  description="Visit volume and overdue account counts for the filtered book."
                  headers={["Rep", "Accounts", "Visits 30d", "Visit overdue", "No visit 60d+"]}
                  emptyMessage="No rep visit stats."
                  rows={insights.visitCoverageByRep.map((r) => [
                    r.repName,
                    r.accountCount,
                    r.visitsLast30Days,
                    r.visitOverdueCount,
                    r.noVisit60DaysCount,
                  ])}
                />
                <InsightTable
                  title="Accounts needing coverage"
                  headers={["Account", "Rep", "Days since visit", "Overdue?", "Last visit"]}
                  emptyMessage="No visit coverage gaps for this book."
                  rows={insights.visitCoverageAccounts.slice(0, 100).map((r) => [
                    r.accountName,
                    r.salesRep ?? "—",
                    r.daysSinceVisit ?? "—",
                    r.visitCadenceOverdue ? "Yes" : "No",
                    r.lastVisitDate ? formatDate(r.lastVisitDate) : "—",
                  ])}
                />
              </LazyTabPanel>

              <LazyTabPanel activeTab={activeInsightsTab} value="strike">
                <InsightTable
                  title="Visit → order conversion"
                  description="Share of visits followed by an order within 7 days (last 90 days)."
                  headers={["Rep", "Visits", "Converted", "Strike rate"]}
                  emptyMessage="No visit activity in the last 90 days."
                  rows={insights.visitConversionByRep.map((r) => [
                    r.repName,
                    r.visitCount90,
                    r.convertedVisits90,
                    `${r.strikeRatePct}%`,
                  ])}
                />
              </LazyTabPanel>

              <LazyTabPanel activeTab={activeInsightsTab} value="assortment">
                <InsightTable
                  title="SKU breadth"
                  description="Distinct products ordered in the last 90 days vs the prior 90 days."
                  headers={["Account", "SKUs (90d)", "Prior 90d", "Δ", "Volume 90d", "Tier"]}
                  emptyMessage="No SKU breadth data."
                  rows={insights.skuBreadth.slice(0, 100).map((r) => [
                    r.accountName,
                    r.skuCountRecent90,
                    r.skuCountPrior90,
                    r.skuDelta,
                    formatNumber(r.volume90),
                    r.territoryTier ? territoryTierLabel(r.territoryTier) : "—",
                  ])}
                />
              </LazyTabPanel>

              <LazyTabPanel activeTab={activeInsightsTab} value="winback">
                <WinBackSkusPanel
                  rows={insights.winBackSkus}
                  onMessage={flash}
                  onProductExcluded={(productName) =>
                    flash(`Marked "${productName}" out of stock — removed from win-back report.`)
                  }
                />
              </LazyTabPanel>

              <LazyTabPanel
                activeTab={activeInsightsTab}
                value="momentum"
                className="grid gap-4 lg:grid-cols-2"
              >
                <InsightTable
                  title="Improving accounts"
                  description="Largest 14-day health score gains."
                  headers={["Account", "Score", "Δ14d"]}
                  emptyMessage="No improving accounts."
                  rows={insights.improving.map((r) => [
                    r.account.account.name,
                    r.account.score,
                    `+${r.scoreChange14d}`,
                  ])}
                />
                <InsightTable
                  title="Declining accounts"
                  description="Largest 14-day health score drops."
                  headers={["Account", "Score", "Δ14d"]}
                  emptyMessage="No declining accounts."
                  rows={insights.declining.map((r) => [
                    r.account.account.name,
                    r.account.score,
                    r.scoreChange14d,
                  ])}
                />
              </LazyTabPanel>

              <LazyTabPanel activeTab={activeInsightsTab} value="volume" className="space-y-4">
                <InsightTable
                  title="Volume by territory tier"
                  headers={["Tier", "Accounts", "Btl 90d", "At-risk btl", "Critical"]}
                  emptyMessage="No tier breakdown."
                  rows={insights.volumeByTier.map((r) => [
                    r.label,
                    r.accountCount,
                    formatNumber(r.bottles90),
                    formatNumber(r.atRiskVolume90),
                    r.criticalCount,
                  ])}
                />
                <InsightTable
                  title="Volume by region"
                  headers={["Region", "Accounts", "Btl 90d", "At-risk btl", "Critical"]}
                  emptyMessage="No region breakdown."
                  rows={insights.volumeByRegion.map((r) => [
                    r.label,
                    r.accountCount,
                    formatNumber(r.bottles90),
                    formatNumber(r.atRiskVolume90),
                    r.criticalCount,
                  ])}
                />
                <InsightTable
                  title="Volume by rep"
                  headers={["Rep", "Accounts", "Btl 90d", "At-risk btl", "Critical"]}
                  emptyMessage="No rep volume breakdown."
                  rows={insights.volumeByRep.map((r) => [
                    r.label,
                    r.accountCount,
                    formatNumber(r.bottles90),
                    formatNumber(r.atRiskVolume90),
                    r.criticalCount,
                  ])}
                />
              </LazyTabPanel>

            </Tabs>
          </>
        )}
      </main>

      <InsightKpiDialog
        config={kpiDetail}
        open={kpiDetail !== null}
        onOpenChange={(open) => {
          if (!open) setKpiDetail(null);
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
          flash(
            `Imported ${count} ${reportKindLabel(result.kind)} rows from ${result.fileName}. Scores updated.`,
          );
        }}
        onUploadCleared={flash}
      />

      <NotificationSidebar
        alerts={frequencyAlerts}
        productAlerts={productAlerts}
        accountVisitLookup={accountVisitLookup}
        open={notificationSidebarOpen}
        onOpenChange={setNotificationSidebarOpen}
      />
    </div>
  );
}
