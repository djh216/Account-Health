"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  Wine,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  X,
  Store,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatMoney, formatNumber, normalizeName } from "@/lib/format";
import type { Order } from "@/lib/types";
import {
  PRODUCT_TREND_30D_PERIOD_DAYS,
  productTrendBucketKey,
  productTrendBucketLabel,
  thirtyDayTrendPeriodKey,
  thirtyDayTrendPeriodLabel,
  type ProductTrendGranularity,
  type ProductTrendPoint,
} from "@/lib/product-trends";
import {
  differenceInCalendarDays,
  parseISO,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { todayIso } from "@/lib/format";

export interface DataPointClickPayload {
  productName: string; // Specific product name or "All Products"
  periodLabel: string; // e.g. "May 2026" or "Wk May 12, 2026"
  periodKey: string;   // e.g. "2026-05" or "2026-W19"
  periodTimestamp?: number;
  allPoints?: ProductTrendPoint[];
  availableProducts?: string[];
}

export function ProductDataPointAccountsDialog({
  open,
  onOpenChange,
  clickedPoint,
  orders,
  granularity = "monthly",
  asOf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clickedPoint: DataPointClickPayload | null;
  orders: Order[];
  granularity?: ProductTrendGranularity;
  asOf?: string;
}) {
  const trendAsOf = parseISO((asOf ?? todayIso()).slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductOverride, setSelectedProductOverride] = useState<string | null>(null);
  const [showDroppedAccounts, setShowDroppedAccounts] = useState(false);

  // Active product being inspected
  const activeProductName = selectedProductOverride ?? clickedPoint?.productName ?? "All Products";

  // Compute period helper keys
  const periodAnalysis = useMemo(() => {
    if (!clickedPoint) return null;

    const isAllProducts = activeProductName === "All Products" || !activeProductName;

    // Filter orders by product if specified
    const productOrders = orders.filter((o) => {
      if (!o.product?.trim() || !o.date) return false;
      if (isAllProducts) return true;
      return normalizeName(o.product.trim()) === normalizeName(activeProductName.trim());
    });

    // Helper to extract bucket key from order date
    const getBucketKey = (dateStr: string) => {
      const parsed = parseISO(dateStr.slice(0, 10));
      if (isNaN(parsed.getTime())) return "";
      return productTrendBucketKey(parsed, granularity, trendAsOf);
    };

    // Build all unique bucket keys sorted
    const allBucketKeysSet = new Set<string>();
    productOrders.forEach((o) => {
      const bk = getBucketKey(o.date);
      if (bk) allBucketKeysSet.add(bk);
    });
    const sortedBucketKeys = Array.from(allBucketKeysSet).sort();

    // Find current period index
    const currentKey = clickedPoint.periodKey;
    const currentIndex = sortedBucketKeys.indexOf(currentKey);

    let priorKey = "";
    if (currentIndex > 0) {
      priorKey = sortedBucketKeys[currentIndex - 1];
    } else if (clickedPoint.allPoints && clickedPoint.allPoints.length > 0) {
      const ptIdx = clickedPoint.allPoints.findIndex((p) => p.key === currentKey);
      if (ptIdx > 0) {
        priorKey = clickedPoint.allPoints[ptIdx - 1].key;
      }
    }

    // Fallback prior key calculation using date-fns if not found in list
    if (!priorKey && currentKey) {
      try {
        if (granularity === "weekly") {
          const refDate = parseISO(clickedPoint.allPoints?.find(p => p.key === currentKey)?.date || new Date().toISOString());
          const priorW = subWeeks(refDate, 1);
          priorKey = format(startOfWeek(priorW, { weekStartsOn: 1 }), "yyyy-'W'II");
        } else if (granularity === "30d" && currentKey.startsWith("30d:")) {
          const endStr = currentKey.slice(4);
          const endDate = parseISO(endStr);
          if (!isNaN(endDate.getTime())) {
            const daysFromAsOf = differenceInCalendarDays(startOfDay(trendAsOf), endDate);
            const periodIndex = Math.floor(
              daysFromAsOf / PRODUCT_TREND_30D_PERIOD_DAYS,
            );
            priorKey = thirtyDayTrendPeriodKey(periodIndex + 1, trendAsOf);
          }
        } else {
          const parts = currentKey.split("-");
          if (parts.length === 2) {
            const yr = parseInt(parts[0], 10);
            const mo = parseInt(parts[1], 10) - 1;
            const refDate = new Date(yr, mo, 1);
            priorKey = format(subMonths(refDate, 1), "yyyy-MM");
          }
        }
      } catch {
        priorKey = "";
      }
    }

    // Helper to derive readable label for prior key
    let priorLabel = "Prior Period";
    if (priorKey) {
      if (granularity === "weekly") {
        priorLabel = `Prior Week (${priorKey})`;
      } else if (granularity === "30d" && priorKey.startsWith("30d:")) {
        const endDate = parseISO(priorKey.slice(4));
        if (!isNaN(endDate.getTime())) {
          const daysFromAsOf = differenceInCalendarDays(startOfDay(trendAsOf), endDate);
          const periodIndex = Math.floor(
            daysFromAsOf / PRODUCT_TREND_30D_PERIOD_DAYS,
          );
          priorLabel = thirtyDayTrendPeriodLabel(periodIndex, trendAsOf);
        } else {
          priorLabel = priorKey;
        }
      } else {
        const parts = priorKey.split("-");
        if (parts.length === 2) {
          try {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
            priorLabel = format(d, "MMM yyyy");
          } catch {
            priorLabel = priorKey;
          }
        }
      }
    }

    // Group orders for current and prior periods by account
    type AccountStats = {
      accountName: string;
      currentBottles: number;
      currentOrders: number;
      lastOrderDateCurrent: string;
      priorBottles: number;
      priorOrders: number;
      lastOrderDatePrior: string;
    };

    const accountMap = new Map<string, AccountStats>();

    for (const order of productOrders) {
      const bKey = getBucketKey(order.date);
      if (bKey !== currentKey && bKey !== priorKey) continue;

      const accName = order.accountName?.trim() || "Unknown Account";
      const btls = order.cases > 0 ? order.cases : 1;
      const orderDate = order.date.slice(0, 10);

      let stats = accountMap.get(accName);
      if (!stats) {
        stats = {
          accountName: accName,
          currentBottles: 0,
          currentOrders: 0,
          lastOrderDateCurrent: "",
          priorBottles: 0,
          priorOrders: 0,
          lastOrderDatePrior: "",
        };
        accountMap.set(accName, stats);
      }

      if (bKey === currentKey) {
        stats.currentBottles += btls;
        stats.currentOrders += 1;
        if (!stats.lastOrderDateCurrent || orderDate > stats.lastOrderDateCurrent) {
          stats.lastOrderDateCurrent = orderDate;
        }
      } else if (bKey === priorKey) {
        stats.priorBottles += btls;
        stats.priorOrders += 1;
        if (!stats.lastOrderDatePrior || orderDate > stats.lastOrderDatePrior) {
          stats.lastOrderDatePrior = orderDate;
        }
      }
    }

    // Compute detailed list
    const accountList = Array.from(accountMap.values()).map((acc) => {
      const deltaBottles = acc.currentBottles - acc.priorBottles;

      let pctChange: number | null = null;
      if (acc.priorBottles > 0) {
        pctChange = Math.round(((acc.currentBottles - acc.priorBottles) / acc.priorBottles) * 100);
      } else if (acc.currentBottles > 0) {
        pctChange = 100;
      }

      let statusTag: "new" | "increased" | "decreased" | "unchanged" | "dropped" = "unchanged";
      if (acc.priorBottles === 0 && acc.currentBottles > 0) {
        statusTag = "new";
      } else if (acc.currentBottles === 0 && acc.priorBottles > 0) {
        statusTag = "dropped";
      } else if (acc.currentBottles > acc.priorBottles) {
        statusTag = "increased";
      } else if (acc.currentBottles < acc.priorBottles) {
        statusTag = "decreased";
      } else {
        statusTag = "unchanged";
      }

      return {
        ...acc,
        deltaBottles,
        pctChange,
        statusTag,
      };
    });

    // Summary calculations
    const currentPurchasers = accountList.filter((a) => a.currentBottles > 0);
    const priorPurchasers = accountList.filter((a) => a.priorBottles > 0);

    const totalCurrentBottles = currentPurchasers.reduce((sum, a) => sum + a.currentBottles, 0);
    const totalPriorBottles = priorPurchasers.reduce((sum, a) => sum + a.priorBottles, 0);

    const newPurchaserCount = accountList.filter((a) => a.statusTag === "new").length;
    const droppedCount = accountList.filter((a) => a.statusTag === "dropped").length;
    const increasedCount = accountList.filter((a) => a.statusTag === "increased").length;
    const decreasedCount = accountList.filter((a) => a.statusTag === "decreased").length;

    return {
      currentKey,
      priorKey,
      priorLabel,
      accountList,
      currentPurchasersCount: currentPurchasers.length,
      priorPurchasersCount: priorPurchasers.length,
      totalCurrentBottles,
      totalPriorBottles,
      bottleDelta: totalCurrentBottles - totalPriorBottles,
      newPurchaserCount,
      droppedCount,
      increasedCount,
      decreasedCount,
    };
  }, [clickedPoint, orders, granularity, activeProductName]);

  if (!clickedPoint || !periodAnalysis) return null;

  // Filter accounts by search query and dropped toggle
  const filteredAccounts = periodAnalysis.accountList
    .filter((acc) => {
      if (!showDroppedAccounts && acc.currentBottles === 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return acc.accountName.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => b.currentBottles - a.currentBottles || b.priorBottles - a.priorBottles);

  const availableProductsList = clickedPoint.availableProducts ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl sm:max-w-6xl lg:max-w-7xl overflow-hidden p-0 flex flex-col">
        {/* Modal Header */}
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 font-mono text-xs">
                  <Calendar className="size-3 text-primary" />
                  {clickedPoint.periodLabel}
                </Badge>
                {activeProductName !== "All Products" && (
                  <Badge variant="outline" className="gap-1 text-xs border-primary/40 text-primary">
                    <Wine className="size-3" />
                    {activeProductName}
                  </Badge>
                )}
              </div>
              <DialogTitle className="font-heading mt-2 text-xl font-bold tracking-tight">
                Account Sales Breakdown
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Accounts that purchased {activeProductName === "All Products" ? "wine" : activeProductName} during {clickedPoint.periodLabel} compared to {periodAnalysis.priorLabel}.
              </DialogDescription>
            </div>

            {/* Product Switcher if multiple products exist */}
            {availableProductsList.length > 0 && (
              <div className="flex items-center gap-2 pr-6">
                <span className="text-xs font-medium text-muted-foreground">Product:</span>
                <Select
                  value={activeProductName}
                  onValueChange={(val) => setSelectedProductOverride(val)}
                >
                  <SelectTrigger className="h-8 w-56 text-xs bg-background">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Products">All Selected Products</SelectItem>
                    {availableProductsList.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Quick Metrics Cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Buying Accounts
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground">
                  {periodAnalysis.currentPurchasersCount}
                </span>
                <span className="text-xs text-muted-foreground">
                  (vs {periodAnalysis.priorPurchasersCount} prior)
                </span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Volume Sold
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground">
                  {formatNumber(periodAnalysis.totalCurrentBottles)} btls
                </span>
                <span
                  className={`text-xs font-semibold ${
                    periodAnalysis.bottleDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {periodAnalysis.bottleDelta >= 0 ? `+${periodAnalysis.bottleDelta}` : periodAnalysis.bottleDelta} btls
                </span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Account Dynamics
              </span>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
                {periodAnalysis.newPurchaserCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-blue-600">
                    <Sparkles className="size-3" />
                    +{periodAnalysis.newPurchaserCount} New
                  </span>
                )}
                {periodAnalysis.increasedCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
                    <ArrowUpRight className="size-3" />
                    {periodAnalysis.increasedCount} Up
                  </span>
                )}
                {periodAnalysis.decreasedCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-rose-600">
                    <ArrowDownRight className="size-3" />
                    {periodAnalysis.decreasedCount} Down
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search account name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={showDroppedAccounts ? "secondary" : "outline"}
              size="xs"
              onClick={() => setShowDroppedAccounts((prev) => !prev)}
              className="text-xs"
            >
              {showDroppedAccounts ? "Showing All Accounts" : "Show Dropped Accounts"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Accounts Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredAccounts.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed text-center p-6">
              <Building2 className="size-8 text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground text-sm">No account purchases found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                No accounts match your current filter query for {clickedPoint.periodLabel}.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold text-xs">Account Name</TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      Current Volume ({clickedPoint.periodLabel})
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-right">
                      Prior Volume ({periodAnalysis.priorLabel})
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-center">
                      Change vs Prior
                    </TableHead>
                    <TableHead className="font-semibold text-xs text-right">Last Order Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {filteredAccounts.map((acc) => {
                    return (
                      <TableRow key={acc.accountName} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <Store className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="break-words">{acc.accountName}</span>
                          </div>
                        </TableCell>

                        <TableCell className="text-right font-semibold tabular-nums">
                          {acc.currentBottles > 0 ? (
                            <span>{formatNumber(acc.currentBottles)} btls</span>
                          ) : (
                            <span className="text-muted-foreground italic">0 btls</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {acc.priorBottles > 0 ? (
                            <span>{formatNumber(acc.priorBottles)} btls</span>
                          ) : (
                            <span>0 btls</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {acc.statusTag === "new" && (
                            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 gap-1 border-blue-200">
                              <Sparkles className="size-3" />
                              New (+{acc.currentBottles} btls)
                            </Badge>
                          )}

                          {acc.statusTag === "increased" && (
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 gap-0.5 border-emerald-200">
                              <ArrowUpRight className="size-3" />
                              +{acc.deltaBottles} btls ({acc.pctChange ? `+${acc.pctChange}%` : ""})
                            </Badge>
                          )}

                          {acc.statusTag === "decreased" && (
                            <Badge className="bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 gap-0.5 border-rose-200">
                              <ArrowDownRight className="size-3" />
                              {acc.deltaBottles} btls ({acc.pctChange}% )
                            </Badge>
                          )}

                          {acc.statusTag === "dropped" && (
                            <Badge className="bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 gap-1 border-amber-200">
                              <Minus className="size-3" />
                              No Orders (was {acc.priorBottles} btls)
                            </Badge>
                          )}

                          {acc.statusTag === "unchanged" && (
                            <Badge variant="outline" className="text-muted-foreground font-normal">
                              No Change
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {acc.lastOrderDateCurrent ? formatDate(acc.lastOrderDateCurrent) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
