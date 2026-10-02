"use client";

import { Fragment, useMemo, useState } from "react";
import { format, isAfter, parseISO, startOfMonth, startOfWeek } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wine,
  ChevronLeft,
  ChevronRight,
  Store,
  Search,
  ShoppingCart,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  TrendingUp,
  Minus,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
  RotateCcw,
  X,
} from "lucide-react";
import { formatMoney, formatNumber, formatDate, normalizeName } from "@/lib/format";
import type { Order } from "@/lib/types";
import type { ProductTrendPoint, ProductTrendGranularity } from "@/lib/product-trends";
import { PRODUCT_PALETTE } from "@/lib/product-trends";

type PaceCategory = "all" | "accelerating" | "new" | "returning" | "steady" | "decelerating" | "lapsed";

export type TrendPointAnalyticsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  point: ProductTrendPoint | null;
  allPoints: ProductTrendPoint[];
  orders: Order[];
  granularity: ProductTrendGranularity;
  asOf?: string;
  selectedProducts?: string[];
  focusedProduct?: string | null;
  onSelectFocusedProduct?: (productName: string | null) => void;
  onToggleProduct?: (productName: string) => void;
  onSelectPoint?: (point: ProductTrendPoint) => void;
};

interface AccountPaceRecord {
  accountName: string;
  accountType?: string;
  currentBottles: number;
  currentOrders: Order[];
  priorBottles: number;
  priorOrderCount: number;
  bottleDelta: number;
  paceDeltaPct: number | null;
  status: "new" | "returning" | "surging" | "accelerating" | "steady" | "decelerating" | "lapsed";
  hasEverOrderedProduct?: boolean;
}

export function TrendPointAnalyticsDialog({
  open,
  onOpenChange,
  point,
  allPoints,
  orders,
  granularity,
  asOf,
  selectedProducts = [],
  focusedProduct = null,
  onSelectFocusedProduct,
  onToggleProduct,
  onSelectPoint,
}: TrendPointAnalyticsDialogProps) {
  const [productSearch, setProductSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [paceFilter, setPaceFilter] = useState<PaceCategory>("all");
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pace" | "products" | "accounts" | "orders">("pace");

  type ProductSortCol = "productName" | "bottles" | "volumeSharePct" | "accountCount";
  const [productSort, setProductSort] = useState<{ column: ProductSortCol; direction: "asc" | "desc" }>({
    column: "bottles",
    direction: "desc",
  });

  type PaceSortCol =
    | "accountName"
    | "currentBottles"
    | "priorBottles"
    | "paceDeltaPct"
    | "status"
    | "invoices";
  const [paceSort, setPaceSort] = useState<{ column: PaceSortCol; direction: "asc" | "desc" }>({
    column: "currentBottles",
    direction: "desc",
  });

  type AccountSortCol = "accountName" | "currentBottles" | "invoices";
  const [accountSort, setAccountSort] = useState<{ column: AccountSortCol; direction: "asc" | "desc" }>({
    column: "currentBottles",
    direction: "desc",
  });

  type OrderSortCol = "date" | "accountName" | "product" | "bottles" | "ref";
  const [orderSort, setOrderSort] = useState<{ column: OrderSortCol; direction: "asc" | "desc" }>({
    column: "date",
    direction: "desc",
  });

  function toggleProductSort(col: ProductSortCol) {
    setProductSort((prev) => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column: col, direction: col === "productName" ? "asc" : "desc" };
    });
  }

  function togglePaceSort(col: PaceSortCol) {
    setPaceSort((prev) => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column: col, direction: col === "accountName" || col === "status" ? "asc" : "desc" };
    });
  }

  function toggleAccountSort(col: AccountSortCol) {
    setAccountSort((prev) => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column: col, direction: col === "accountName" ? "asc" : "desc" };
    });
  }

  function toggleOrderSort(col: OrderSortCol) {
    setOrderSort((prev) => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column: col, direction: col === "bottles" ? "desc" : "asc" };
    });
  }

  // Always default to Purchasing Accounts & Pace when period point changes
  const [prevPointKey, setPrevPointKey] = useState<string | null>(null);
  if (point && point.key !== prevPointKey) {
    setPrevPointKey(point.key);
    setActiveTab("pace");
    setPaceFilter("all");
    setAccountSearch("");
    setExpandedAccount(null);
  }

  // Active product focus:
  // - If explicitly "ALL", display aggregate view across all wines.
  // - If focusedProduct is specified, display that wine.
  // - Otherwise, default to the selected product for the trajectory curve.
  const activeFocus =
    focusedProduct === "ALL"
      ? null
      : (focusedProduct && focusedProduct.trim().length > 0)
      ? focusedProduct.trim()
      : selectedProducts.length > 0
      ? selectedProducts[0]
      : null;

  // Timeline index for previous / next navigation
  const currentIndex = useMemo(() => {
    if (!point) return -1;
    return allPoints.findIndex((p) => p.key === point.key);
  }, [allPoints, point]);

  const prevPoint = currentIndex > 0 ? allPoints[currentIndex - 1] : null;
  const nextPoint =
    currentIndex >= 0 && currentIndex < allPoints.length - 1 ? allPoints[currentIndex + 1] : null;

  // Helper function to check if an order belongs to a given point key
  const isOrderInKey = (orderDateStr: string | undefined | null, targetKey: string) => {
    if (!orderDateStr) return false;
    const date = parseISO(orderDateStr.slice(0, 10));
    if (isNaN(date.getTime())) return false;
    if (asOf && isAfter(date, parseISO(asOf.slice(0, 10)))) return false;

    if (granularity === "weekly") {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const key = format(weekStart, "yyyy-'W'II");
      return key === targetKey;
    } else {
      const monthStart = startOfMonth(date);
      const key = format(monthStart, "yyyy-MM");
      return key === targetKey;
    }
  };

  // Orders for current period
  const periodOrders = useMemo(() => {
    if (!point) return [];
    return orders.filter((o) => isOrderInKey(o.date, point.key));
  }, [orders, point, granularity, asOf]);

  // Orders for prior period (for pacing comparison)
  const priorPeriodOrders = useMemo(() => {
    if (!prevPoint) return [];
    return orders.filter((o) => isOrderInKey(o.date, prevPoint.key));
  }, [orders, prevPoint, granularity, asOf]);

  // If focused on an individual product, isolate its orders
  const focusedPeriodOrders = useMemo(() => {
    if (!activeFocus) return periodOrders;
    return periodOrders.filter(
      (o) => o.product && o.product.trim().toLowerCase() === activeFocus.toLowerCase()
    );
  }, [periodOrders, activeFocus]);

  const focusedPriorOrders = useMemo(() => {
    if (!activeFocus) return priorPeriodOrders;
    return priorPeriodOrders.filter(
      (o) => o.product && o.product.trim().toLowerCase() === activeFocus.toLowerCase()
    );
  }, [priorPeriodOrders, activeFocus]);

  // Aggregate product breakdown for this period (all products sold)
  const productBreakdown = useMemo(() => {
    if (!point) return [];
    const map = new Map<
      string,
      {
        productName: string;
        bottles: number;
        orderCount: number;
        accounts: Set<string>;
      }
    >();

    for (const order of periodOrders) {
      const pName = order.product?.trim();
      if (!pName) continue;
      const bottles = order.cases > 0 ? order.cases : 1;

      const existing = map.get(pName);
      if (existing) {
        existing.bottles += bottles;
        existing.orderCount += 1;
        existing.accounts.add(order.accountName);
      } else {
        map.set(pName, {
          productName: pName,
          bottles,
          orderCount: 1,
          accounts: new Set([order.accountName]),
        });
      }
    }

    const totalBottles = point.totalBottles || 1;

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        accountCount: item.accounts.size,
        volumeSharePct: (item.bottles / totalBottles) * 100,
      }))
      .sort((a, b) => b.bottles - a.bottles);
  }, [periodOrders, point]);

  // Account Pace Shift Analysis (For the focused product OR entire portfolio)
  const accountPaceAnalysis = useMemo(() => {
    const currentMap = new Map<
      string,
      {
        bottles: number;
        orders: Order[];
        accountType?: string;
      }
    >();

    const targetCurrentOrders = activeFocus ? focusedPeriodOrders : periodOrders;
    for (const o of targetCurrentOrders) {
      const acc = o.accountName || "Unknown Account";
      const btls = o.cases > 0 ? o.cases : 1;
      const existing = currentMap.get(acc);
      if (existing) {
        existing.bottles += btls;
        existing.orders.push(o);
      } else {
        currentMap.set(acc, {
          bottles: btls,
          orders: [o],
          accountType: (o as unknown as { accountType?: string }).accountType,
        });
      }
    }

    const priorMap = new Map<
      string,
      {
        bottles: number;
        orderCount: number;
      }
    >();

    const targetPriorOrders = activeFocus ? focusedPriorOrders : priorPeriodOrders;
    for (const o of targetPriorOrders) {
      const acc = o.accountName || "Unknown Account";
      const btls = o.cases > 0 ? o.cases : 1;
      const existing = priorMap.get(acc);
      if (existing) {
        existing.bottles += btls;
        existing.orderCount += 1;
      } else {
        priorMap.set(acc, {
          bottles: btls,
          orderCount: 1,
        });
      }
    }

    // Helper function to check if an order date occurred strictly before the current point
    const isOrderBeforePeriod = (orderDateStr: string | undefined | null) => {
      if (!orderDateStr || !point) return false;
      if (isOrderInKey(orderDateStr, point.key)) return false;
      const date = parseISO(orderDateStr.slice(0, 10));
      if (isNaN(date.getTime())) return false;

      if (typeof point.timestamp === "number" && !isNaN(point.timestamp)) {
        return date.getTime() < point.timestamp;
      }

      if (granularity === "weekly") {
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        const key = format(weekStart, "yyyy-'W'II");
        return key < point.key;
      } else {
        const monthStart = startOfMonth(date);
        const key = format(monthStart, "yyyy-MM");
        return key < point.key;
      }
    };

    // Pre-calculate set of accounts that have ordered the product prior to this period
    const targetFocusNormalized = activeFocus ? normalizeName(activeFocus) : null;
    const priorProductBuyers = new Set<string>();

    for (const o of orders) {
      if (!o.accountName || !o.date) continue;
      if (!isOrderBeforePeriod(o.date)) continue;

      const accNorm = normalizeName(o.accountName);
      const prodNorm = o.product ? normalizeName(o.product) : "";

      if (targetFocusNormalized) {
        if (prodNorm === targetFocusNormalized) {
          priorProductBuyers.add(accNorm);
        }
      } else {
        if (prodNorm) {
          priorProductBuyers.add(`${accNorm}:::${prodNorm}`);
        }
      }
    }

    // Combine all unique accounts across current and prior periods
    const allAccountNames = new Set([...currentMap.keys(), ...priorMap.keys()]);
    const records: AccountPaceRecord[] = [];

    for (const acc of allAccountNames) {
      const current = currentMap.get(acc);
      const prior = priorMap.get(acc);

      const currentBottles = current ? current.bottles : 0;
      const currentOrders = current ? current.orders : [];
      const priorBottles = prior ? prior.bottles : 0;
      const priorOrderCount = prior ? prior.orderCount : 0;

      const accNorm = normalizeName(acc);
      let hasEverOrderedProduct = false;
      if (targetFocusNormalized) {
        hasEverOrderedProduct = priorProductBuyers.has(accNorm);
      } else {
        const productsBought = currentOrders
          .map((o) => (o.product ? normalizeName(o.product) : ""))
          .filter(Boolean);
        hasEverOrderedProduct = productsBought.some((p) =>
          priorProductBuyers.has(`${accNorm}:::${p}`)
        );
      }

      const bottleDelta = currentBottles - priorBottles;
      let paceDeltaPct: number | null = null;
      if (priorBottles > 0) {
        paceDeltaPct = Math.round(((currentBottles - priorBottles) / priorBottles) * 100);
      }

      let status: AccountPaceRecord["status"] = "steady";
      if (priorBottles === 0 && currentBottles > 0) {
        // Do not consider them a new buyer unless they have never ordered the product
        if (!hasEverOrderedProduct) {
          status = "new";
        } else {
          status = "returning";
        }
      } else if (currentBottles === 0 && priorBottles > 0) {
        status = "lapsed";
      } else if (paceDeltaPct !== null) {
        if (paceDeltaPct >= 50) status = "surging";
        else if (paceDeltaPct > 10) status = "accelerating";
        else if (paceDeltaPct < -10) status = "decelerating";
        else status = "steady";
      }

      records.push({
        accountName: acc,
        accountType: current?.accountType,
        currentBottles,
        currentOrders,
        priorBottles,
        priorOrderCount,
        bottleDelta,
        paceDeltaPct,
        status,
        hasEverOrderedProduct,
      });
    }

    // Sort active buyers first by current bottles, then lapsed buyers
    return records.sort((a, b) => {
      if (a.currentBottles > 0 && b.currentBottles === 0) return -1;
      if (a.currentBottles === 0 && b.currentBottles > 0) return 1;
      return b.currentBottles - a.currentBottles;
    });
  }, [
    activeFocus,
    focusedPeriodOrders,
    periodOrders,
    focusedPriorOrders,
    priorPeriodOrders,
    orders,
    point,
    granularity,
  ]);

  // Filtered accounts for Pace tab based on pace filter and search text
  const filteredPaceAccounts = useMemo(() => {
    let result = accountPaceAnalysis;
    if (paceFilter === "accelerating") {
      result = result.filter((r) => r.status === "accelerating" || r.status === "surging");
    } else if (paceFilter === "new") {
      result = result.filter((r) => r.status === "new");
    } else if (paceFilter === "returning") {
      result = result.filter((r) => r.status === "returning");
    } else if (paceFilter === "steady") {
      result = result.filter((r) => r.status === "steady");
    } else if (paceFilter === "decelerating") {
      result = result.filter((r) => r.status === "decelerating");
    } else if (paceFilter === "lapsed") {
      result = result.filter((r) => r.status === "lapsed");
    }

    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      result = result.filter((r) => r.accountName.toLowerCase().includes(q));
    }

    return result;
  }, [accountPaceAnalysis, paceFilter, accountSearch]);

  // Filtered products for products tab
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productBreakdown;
    const q = productSearch.toLowerCase();
    return productBreakdown.filter((p) => p.productName.toLowerCase().includes(q));
  }, [productBreakdown, productSearch]);

  // Sorted products for products tab
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const dir = productSort.direction === "asc" ? 1 : -1;
      switch (productSort.column) {
        case "productName":
          return dir * a.productName.localeCompare(b.productName);
        case "bottles":
          return dir * (a.bottles - b.bottles);
        case "volumeSharePct":
          return dir * (a.volumeSharePct - b.volumeSharePct);
        case "accountCount":
          return dir * (a.accountCount - b.accountCount);
        default:
          return 0;
      }
    });
  }, [filteredProducts, productSort]);

  // Sorted pace accounts for Pace tab
  const sortedPaceAccounts = useMemo(() => {
    return [...filteredPaceAccounts].sort((a, b) => {
      const dir = paceSort.direction === "asc" ? 1 : -1;
      switch (paceSort.column) {
        case "accountName":
          return dir * a.accountName.localeCompare(b.accountName);
        case "currentBottles":
          return dir * (a.currentBottles - b.currentBottles || b.priorBottles - a.priorBottles);
        case "priorBottles":
          return dir * (a.priorBottles - b.priorBottles);
        case "paceDeltaPct": {
          const valA = a.paceDeltaPct ?? (a.currentBottles > 0 ? 999 : -999);
          const valB = b.paceDeltaPct ?? (b.currentBottles > 0 ? 999 : -999);
          return dir * (valA - valB);
        }
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "invoices":
          return dir * (a.currentOrders.length - b.currentOrders.length);
        default:
          return 0;
      }
    });
  }, [filteredPaceAccounts, paceSort]);

  // Sorted accounts for Portfolio tab
  const sortedActiveAccounts = useMemo(() => {
    const list = filteredPaceAccounts.filter((r) => r.currentBottles > 0);
    return [...list].sort((a, b) => {
      const dir = accountSort.direction === "asc" ? 1 : -1;
      switch (accountSort.column) {
        case "accountName":
          return dir * a.accountName.localeCompare(b.accountName);
        case "currentBottles":
          return dir * (a.currentBottles - b.currentBottles);
        case "invoices":
          return dir * (a.currentOrders.length - b.currentOrders.length);
        default:
          return 0;
      }
    });
  }, [filteredPaceAccounts, accountSort]);

  // Sorted orders for Orders tab
  const sortedOrdersList = useMemo(() => {
    const list = activeFocus ? focusedPeriodOrders : periodOrders;
    return [...list].sort((a, b) => {
      const dir = orderSort.direction === "asc" ? 1 : -1;
      switch (orderSort.column) {
        case "date":
          return dir * (a.date || "").localeCompare(b.date || "");
        case "accountName":
          return dir * (a.accountName || "").localeCompare(b.accountName || "");
        case "product":
          return dir * (a.product || "").localeCompare(b.product || "");
        case "bottles": {
          const bA = a.cases > 0 ? a.cases : 1;
          const bB = b.cases > 0 ? b.cases : 1;
          return dir * (bA - bB);
        }
        case "ref":
          return dir * (a.id || "").localeCompare(b.id || "");
        default:
          return 0;
      }
    });
  }, [activeFocus, focusedPeriodOrders, periodOrders, orderSort]);

  // Overall and focused metrics
  const activeProductSummary = useMemo(() => {
    if (!activeFocus) return null;
    const currentBottles = focusedPeriodOrders.reduce(
      (sum, o) => sum + (o.cases > 0 ? o.cases : 1),
      0
    );
    const currentAccounts = new Set(focusedPeriodOrders.map((o) => o.accountName)).size;
    const currentOrdersCount = focusedPeriodOrders.length;

    const priorBottles = focusedPriorOrders.reduce(
      (sum, o) => sum + (o.cases > 0 ? o.cases : 1),
      0
    );
    const priorAccounts = new Set(focusedPriorOrders.map((o) => o.accountName)).size;

    const bottleDiff = currentBottles - priorBottles;
    const bottlePct =
      priorBottles > 0 ? Math.round(((currentBottles - priorBottles) / priorBottles) * 100) : null;
    const accDiff = currentAccounts - priorAccounts;

    const avgBottlesPerAccount =
      currentAccounts > 0 ? Math.round((currentBottles / currentAccounts) * 10) / 10 : 0;
    const priorAvgBottlesPerAccount =
      priorAccounts > 0 ? Math.round((priorBottles / priorAccounts) * 10) / 10 : 0;
    const paceDiffPerAccount =
      avgBottlesPerAccount - priorAvgBottlesPerAccount;

    return {
      productName: activeFocus,
      currentBottles,
      currentAccounts,
      currentOrdersCount,
      priorBottles,
      priorAccounts,
      bottleDiff,
      bottlePct,
      accDiff,
      avgBottlesPerAccount,
      paceDiffPerAccount,
    };
  }, [activeFocus, focusedPeriodOrders, focusedPriorOrders]);

  // Overall period deltas (portfolio level)
  const portfolioDeltas = useMemo(() => {
    if (!point || !prevPoint) return null;
    const bottleDiff = point.totalBottles - prevPoint.totalBottles;
    const bottlePct =
      prevPoint.totalBottles > 0
        ? ((bottleDiff / prevPoint.totalBottles) * 100).toFixed(1)
        : null;

    const accDiff = point.activeAccountsCount - prevPoint.activeAccountsCount;

    return {
      bottleDiff,
      bottlePct,
      accDiff,
    };
  }, [point, prevPoint]);

  if (!point) return null;

  const topProduct = productBreakdown[0];
  const activeBuyerRecords = accountPaceAnalysis.filter((r) => r.currentBottles > 0);
  const newBuyersCount = accountPaceAnalysis.filter((r) => r.status === "new").length;
  const returningCount = accountPaceAnalysis.filter((r) => r.status === "returning").length;
  const acceleratingCount = accountPaceAnalysis.filter(
    (r) => r.status === "accelerating" || r.status === "surging"
  ).length;
  const steadyCount = accountPaceAnalysis.filter((r) => r.status === "steady").length;
  const deceleratingCount = accountPaceAnalysis.filter((r) => r.status === "decelerating").length;
  const lapsedCount = accountPaceAnalysis.filter((r) => r.status === "lapsed").length;

  const displayBottles = activeProductSummary
    ? activeProductSummary.currentBottles
    : point.totalBottles;
  const displayAccounts = activeProductSummary
    ? activeProductSummary.currentAccounts
    : point.activeAccountsCount;
  const displayOrders = activeProductSummary
    ? activeProductSummary.currentOrdersCount
    : point.orderCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[96vw] max-w-[96vw] sm:max-w-[95vw] lg:max-w-[94vw] xl:max-w-[1540px] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl border-border shadow-2xl bg-card min-w-0"
        showCloseButton={true}
      >
        {/* TOP HEADER: Wide & Responsive Toolbar */}
        <div className="p-4 sm:p-5 pb-3 sm:pb-4 border-b bg-card/90 backdrop-blur-md shrink-0 min-w-0 max-w-full overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 min-w-0 max-w-full">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="size-10 sm:size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
                <Wine className="size-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {activeFocus ? (
                      <span className="flex items-center gap-2">
                        <span className="text-primary">{activeFocus}</span>
                        <span className="text-muted-foreground font-normal text-lg">·</span>
                        <span>{point.label} Trajectory</span>
                      </span>
                    ) : (
                      <span>Period Analytics: {point.label}</span>
                    )}
                  </DialogTitle>
                  <Badge variant="secondary" className="font-mono text-xs capitalize">
                    {granularity} snapshot
                  </Badge>
                  {prevPoint && (
                    <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                      Comparing against {prevPoint.label}
                    </span>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {activeFocus
                    ? `Exclusive buyer breakdown and purchasing pace dynamics for ${activeFocus}. Showing accounts that ordered and pace shift vs prior ${granularity} period.`
                    : `Complete breakdown of sales volume, active wine SKUs, and restaurant purchasing velocity across the portfolio.`}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Timeline Navigation & Product Switcher */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border/60">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={!prevPoint}
                  onClick={() => prevPoint && onSelectPoint?.(prevPoint)}
                  className="h-7 gap-1 text-xs px-2"
                  title={prevPoint ? `Go to ${prevPoint.label}` : "First period"}
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <span className="text-xs font-medium px-2 text-foreground font-mono tabular-nums">
                  {currentIndex + 1} / {allPoints.length}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={!nextPoint}
                  onClick={() => nextPoint && onSelectPoint?.(nextPoint)}
                  className="h-7 gap-1 text-xs px-2"
                  title={nextPoint ? `Go to ${nextPoint.label}` : "Latest period"}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>

              {/* Reset to Portfolio View if currently focused */}
              {activeFocus && onSelectFocusedProduct && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onSelectFocusedProduct("ALL")}
                  className="h-9 gap-1.5 text-xs font-medium"
                >
                  <Layers className="size-3.5 text-primary" />
                  View All Wines (Aggregate)
                </Button>
              )}
            </div>
          </div>

          {/* ACTIVE CURVE SWITCHER BAR (If multiple trajectory curves exist) */}
          {selectedProducts.length > 0 && (
            <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-border/50 flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
              <span className="text-xs font-semibold text-muted-foreground mr-1.5 flex items-center gap-1 shrink-0">
                <Activity className="size-3.5 text-primary" />
                Trajectory Curves:
              </span>
              <button
                type="button"
                onClick={() => onSelectFocusedProduct?.("ALL")}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  !activeFocus
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                All Selected Wines (Aggregate)
              </button>
              {selectedProducts.map((pName, idx) => {
                const color = PRODUCT_PALETTE[idx % PRODUCT_PALETTE.length];
                const isCurrent = activeFocus?.toLowerCase() === pName.toLowerCase();
                return (
                  <button
                    key={pName}
                    type="button"
                    onClick={() => onSelectFocusedProduct?.(pName)}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-all max-w-[200px] ${
                      isCurrent
                        ? "bg-foreground text-background font-bold shadow-xs ring-2 ring-primary/40"
                        : "bg-muted hover:bg-muted/80 text-foreground"
                    }`}
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{pName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* TOP 5 HIGH-IMPACT KPI METRIC CARDS (Full-Width Responsive Grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5 mt-3 min-w-0 max-w-full">
            {/* 1. Volume & Growth */}
            <Card className="p-2.5 sm:p-3 border-border bg-background/60 shadow-2xs min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate">
                  <Wine className="size-3.5 text-primary shrink-0" />
                  <span className="truncate">{activeFocus ? "Product Vol" : "Total Volume"}</span>
                </span>
                {activeProductSummary ? (
                  activeProductSummary.bottlePct !== null && (
                    <span
                      className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        activeProductSummary.bottlePct >= 0
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}
                    >
                      {activeProductSummary.bottlePct >= 0 ? (
                        <ArrowUpRight className="size-3 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="size-3 mr-0.5" />
                      )}
                      {activeProductSummary.bottlePct > 0 ? "+" : ""}
                      {activeProductSummary.bottlePct}%
                    </span>
                  )
                ) : (
                  portfolioDeltas?.bottlePct && (
                    <span
                      className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        Number(portfolioDeltas.bottlePct) >= 0
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}
                    >
                      {Number(portfolioDeltas.bottlePct) >= 0 ? (
                        <ArrowUpRight className="size-3 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="size-3 mr-0.5" />
                      )}
                      {portfolioDeltas.bottlePct}%
                    </span>
                  )
                )}
              </div>
              <p className="font-heading font-bold text-xl sm:text-2xl mt-1 text-foreground tabular-nums truncate">
                {formatNumber(displayBottles)}{" "}
                <span className="text-xs font-normal text-muted-foreground">btls</span>
              </p>
              <p
                className="text-[11px] text-muted-foreground mt-0.5 truncate"
                title={
                  activeProductSummary
                    ? prevPoint
                      ? `${activeProductSummary.bottleDiff >= 0 ? "+" : ""}${
                          activeProductSummary.bottleDiff
                        } btls vs prior (${formatNumber(activeProductSummary.priorBottles)} btls prior)`
                      : "First recorded period"
                    : prevPoint
                    ? `${portfolioDeltas && portfolioDeltas.bottleDiff >= 0 ? "+" : ""}${
                        portfolioDeltas?.bottleDiff
                      } btls vs prior`
                    : "First recorded period"
                }
              >
                {activeProductSummary ? (
                  prevPoint ? (
                    `${activeProductSummary.bottleDiff >= 0 ? "+" : ""}${
                      activeProductSummary.bottleDiff
                    } btls vs prior`
                  ) : (
                    "First recorded period"
                  )
                ) : prevPoint ? (
                  `${portfolioDeltas && portfolioDeltas.bottleDiff >= 0 ? "+" : ""}${
                    portfolioDeltas?.bottleDiff
                  } btls vs prior`
                ) : (
                  "First recorded period"
                )}
              </p>
            </Card>

            {/* 2. Buying Accounts Breadth */}
            <Card className="p-2.5 sm:p-3 border-border bg-background/60 shadow-2xs min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate">
                  <Store className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="truncate">Accounts</span>
                </span>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  {newBuyersCount > 0 && (
                    <span
                      className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 shrink-0"
                      title={`${newBuyersCount} first-time buyer${newBuyersCount === 1 ? "" : "s"} who have never ordered this product before`}
                    >
                      +{newBuyersCount} New
                    </span>
                  )}
                  {returningCount > 0 && (
                    <span
                      className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 shrink-0"
                      title={`${returningCount} returning buyer${returningCount === 1 ? "" : "s"} who previously purchased this product`}
                    >
                      +{returningCount} Returning
                    </span>
                  )}
                </div>
              </div>
              <p className="font-heading font-bold text-xl sm:text-2xl mt-1 text-foreground tabular-nums truncate">
                {displayAccounts}{" "}
                <span className="text-xs font-normal text-muted-foreground">accounts</span>
              </p>
              <p
                className="text-[11px] text-muted-foreground mt-0.5 truncate"
                title={
                  activeProductSummary
                    ? `${activeProductSummary.accDiff >= 0 ? "+" : ""}${
                        activeProductSummary.accDiff
                      } net account shift vs prior`
                    : `${portfolioDeltas && portfolioDeltas.accDiff >= 0 ? "+" : ""}${
                        portfolioDeltas?.accDiff
                      } accounts vs prior`
                }
              >
                {activeProductSummary ? (
                  `${activeProductSummary.accDiff >= 0 ? "+" : ""}${
                    activeProductSummary.accDiff
                  } vs prior`
                ) : (
                  `${portfolioDeltas && portfolioDeltas.accDiff >= 0 ? "+" : ""}${
                    portfolioDeltas?.accDiff
                  } vs prior`
                )}
              </p>
            </Card>

            {/* 4. Purchasing Pace & Velocity */}
            <Card className="p-2.5 sm:p-3 border-border bg-background/60 shadow-2xs min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate">
                  <Activity className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="truncate">Pace</span>
                </span>
                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                  Run-rate
                </span>
              </div>
              <p className="font-heading font-bold text-xl sm:text-2xl mt-1 text-foreground tabular-nums truncate">
                {displayAccounts > 0
                  ? (displayBottles / displayAccounts).toFixed(1)
                  : "0.0"}{" "}
                <span className="text-xs font-normal text-muted-foreground">btls/acc</span>
              </p>
              <p
                className="text-[11px] text-muted-foreground mt-0.5 truncate"
                title={`${acceleratingCount} accelerating · ${steadyCount} steady · ${deceleratingCount} slowing`}
              >
                {acceleratingCount} fast · {steadyCount} steady · {deceleratingCount} slow
              </p>
            </Card>

            {/* 5. Orders Placed & Ticket Size */}
            <Card className="p-2.5 sm:p-3 border-border bg-background/60 shadow-2xs col-span-2 sm:col-span-1 lg:col-span-1 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate">
                  <ShoppingCart className="size-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="truncate">Orders</span>
                </span>
                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                  {displayOrders} Tkts
                </span>
              </div>
              <p className="font-heading font-bold text-xl sm:text-2xl mt-1 text-foreground tabular-nums truncate">
                {formatNumber(displayOrders)}{" "}
                <span className="text-xs font-normal text-muted-foreground">orders</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Avg{" "}
                {displayOrders > 0
                  ? Math.round(displayBottles / displayOrders)
                  : 0}{" "}
                btls / order
              </p>
            </Card>
          </div>
        </div>

        {/* TAB NAVIGATION & SEARCH CONTROLS */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-5 pt-2.5 sm:pt-3 space-y-2.5 min-w-0 max-w-full">
          <Tabs
            value={activeTab}
            onValueChange={(v) =>
              setActiveTab(v as "pace" | "products" | "accounts" | "orders")
            }
            className="w-full max-w-full flex-1 flex flex-col overflow-hidden min-w-0"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 min-w-0 max-w-full">
              <TabsList className="flex flex-wrap h-auto p-1 gap-1 w-full sm:w-auto max-w-full shrink-0">
                <TabsTrigger value="pace" className="text-xs font-medium gap-1.5 h-7 px-2.5">
                  <Activity className="size-3.5 text-primary" />
                  Accounts & Pace ({activeBuyerRecords.length})
                </TabsTrigger>
                <TabsTrigger value="products" className="text-xs font-medium gap-1.5 h-7 px-2.5">
                  <Wine className="size-3.5" />
                  Wine SKUs ({productBreakdown.length})
                </TabsTrigger>
                <TabsTrigger value="accounts" className="text-xs font-medium gap-1.5 h-7 px-2.5">
                  <Store className="size-3.5" />
                  All Accounts ({periodOrders.length > 0 ? new Set(periodOrders.map((o) => o.accountName)).size : 0})
                </TabsTrigger>
                <TabsTrigger value="orders" className="text-xs font-medium gap-1.5 h-7 px-2.5">
                  <ShoppingCart className="size-3.5" />
                  Orders ({activeFocus ? focusedPeriodOrders.length : periodOrders.length})
                </TabsTrigger>
              </TabsList>

              {/* Dynamic search bar */}
              {(activeTab === "pace" || activeTab === "accounts") && (
                <div className="relative w-full sm:w-64 md:w-72">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search account..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    className="h-7 pl-8 text-xs bg-background"
                  />
                  {accountSearch && (
                    <button
                      type="button"
                      onClick={() => setAccountSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              )}

              {activeTab === "products" && (
                <div className="relative w-full sm:w-64 md:w-72">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search wine SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-7 pl-8 text-xs bg-background"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* TAB 1: PURCHASING ACCOUNTS & PACE SHIFTS (Primary View) */}
            <TabsContent value="pace" className="mt-2.5 flex-1 overflow-hidden flex flex-col space-y-2 min-w-0 max-w-full">
              {/* Secondary Filter Chips for Purchasing Pace */}
              <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 py-1 border-b border-border/40 min-w-0 max-w-full">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs font-semibold text-muted-foreground mr-1 text-[11px]">
                    Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaceFilter("all")}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      paceFilter === "all"
                        ? "bg-foreground text-background font-semibold"
                        : "bg-muted hover:bg-muted/80 text-foreground"
                    }`}
                  >
                    All ({accountPaceAnalysis.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaceFilter("accelerating")}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                      paceFilter === "accelerating"
                        ? "bg-emerald-600 text-white font-semibold"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100"
                    }`}
                  >
                    <ArrowUpRight className="size-3" />
                    Accelerating ({acceleratingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaceFilter("new")}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                      paceFilter === "new"
                        ? "bg-blue-600 text-white font-semibold"
                        : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 hover:bg-blue-100"
                    }`}
                    title="First-time buyers with no previous order history for this product"
                  >
                    <Sparkles className="size-3" />
                    New ({newBuyersCount})
                  </button>
                  {returningCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaceFilter("returning")}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                        paceFilter === "returning"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 hover:bg-indigo-100"
                      }`}
                      title="Returning buyers who ordered previously but were not active in the immediate prior period"
                    >
                      <RotateCcw className="size-3" />
                      Returning ({returningCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPaceFilter("steady")}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                      paceFilter === "steady"
                        ? "bg-zinc-700 text-white font-semibold"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200"
                    }`}
                  >
                    <Minus className="size-3" />
                    Steady ({steadyCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaceFilter("decelerating")}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                      paceFilter === "decelerating"
                        ? "bg-rose-600 text-white font-semibold"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100"
                    }`}
                  >
                    <ArrowDownRight className="size-3" />
                    Slowing ({deceleratingCount})
                  </button>
                  {lapsedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaceFilter("lapsed")}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                        paceFilter === "lapsed"
                          ? "bg-amber-600 text-white font-semibold"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100"
                      }`}
                    >
                      Prior Lapsed ({lapsedCount})
                    </button>
                  )}
                </div>

                <div className="text-xs text-muted-foreground hidden sm:block">
                  <strong className="text-foreground">{filteredPaceAccounts.length}</strong> accounts
                </div>
              </div>

              {/* High-Density Responsive Data Table */}
              <div className="flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-border bg-card w-full max-w-full min-w-0">
                <Table className="w-full text-xs">
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                    <TableRow className="text-xs hover:bg-transparent border-b">
                      <TableHead className="w-8 text-center px-2 text-muted-foreground font-semibold">#</TableHead>
                      <TableHead
                        className="min-w-[150px] max-w-[220px] px-2.5 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => togglePaceSort("accountName")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <span>Account / Restaurant</span>
                          {paceSort.column === "accountName" ? (
                            paceSort.direction === "asc" ? (
                              <ArrowUp className="size-3 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right whitespace-nowrap px-2.5 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => togglePaceSort("currentBottles")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-foreground">
                          <span>Current Vol</span>
                          {paceSort.column === "currentBottles" ? (
                            paceSort.direction === "asc" ? (
                              <ArrowUp className="size-3 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right whitespace-nowrap px-2.5 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => togglePaceSort("priorBottles")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-foreground">
                          <span>Prior Vol</span>
                          {paceSort.column === "priorBottles" ? (
                            paceSort.direction === "asc" ? (
                              <ArrowUp className="size-3 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right whitespace-nowrap px-2.5 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => togglePaceSort("paceDeltaPct")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-foreground">
                          <span>Pace Shift</span>
                          {paceSort.column === "paceDeltaPct" ? (
                            paceSort.direction === "asc" ? (
                              <ArrowUp className="size-3 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="whitespace-nowrap px-2.5 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => togglePaceSort("status")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <span>Status</span>
                          {paceSort.column === "status" ? (
                            paceSort.direction === "asc" ? (
                              <ArrowUp className="size-3 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-center whitespace-nowrap w-20 px-2 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => togglePaceSort("invoices")}
                      >
                        <div className="flex items-center justify-center gap-1 font-semibold text-foreground">
                          <span>Invoices</span>
                          {paceSort.column === "invoices" ? (
                            paceSort.direction === "asc" ? (
                              <ArrowUp className="size-3 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPaceAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-44 text-center text-xs text-muted-foreground"
                        >
                          No accounts match the selected pace filters or search terms.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedPaceAccounts.map((rec, index) => {
                        const isExpanded = expandedAccount === rec.accountName;
                        return (
                          <Fragment key={rec.accountName}>
                            <TableRow
                              className={`text-xs hover:bg-muted/40 transition-colors ${
                                rec.status === "lapsed" ? "opacity-60 bg-muted/20" : ""
                              }`}
                            >
                              <TableCell className="text-center font-mono font-medium text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-bold text-foreground hover:text-primary transition-colors">
                                    {rec.accountName}
                                  </span>
                                  {rec.accountType && (
                                    <span className="text-[11px] text-muted-foreground capitalize">
                                      {rec.accountType}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {rec.currentBottles > 0 ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-foreground">
                                      {formatNumber(rec.currentBottles)} btls
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {(rec.currentBottles / 12).toFixed(1)} cases
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground font-mono">0 btls</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {rec.priorBottles > 0 ? (
                                  <div className="flex flex-col items-end">
                                    <span className="font-medium text-muted-foreground">
                                      {formatNumber(rec.priorBottles)} btls
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {(rec.priorBottles / 12).toFixed(1)} cases
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/60 font-mono">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {rec.status === "new" ? (
                                  <span
                                    className="text-blue-600 dark:text-blue-400 font-bold inline-flex items-center gap-1"
                                    title="First-time buyer — never ordered this product before"
                                  >
                                    <Sparkles className="size-3" />
                                    +{formatNumber(rec.currentBottles)} btls
                                  </span>
                                ) : rec.status === "returning" ? (
                                  <span
                                    className="text-indigo-600 dark:text-indigo-400 font-bold inline-flex items-center gap-1"
                                    title="Returning buyer — has ordered this product before"
                                  >
                                    <RotateCcw className="size-3" />
                                    +{formatNumber(rec.currentBottles)} btls
                                  </span>
                                ) : rec.status === "lapsed" ? (
                                  <span className="text-rose-600 dark:text-rose-400 font-medium inline-flex items-center gap-1">
                                    <ArrowDownRight className="size-3" />
                                    -{formatNumber(rec.priorBottles)} btls (-100%)
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-end">
                                    <span
                                      className={`font-bold inline-flex items-center gap-0.5 ${
                                        rec.bottleDelta > 0
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : rec.bottleDelta < 0
                                          ? "text-rose-600 dark:text-rose-400"
                                          : "text-muted-foreground"
                                      }`}
                                    >
                                      {rec.bottleDelta > 0 ? (
                                        <ArrowUpRight className="size-3" />
                                      ) : rec.bottleDelta < 0 ? (
                                        <ArrowDownRight className="size-3" />
                                      ) : (
                                        <Minus className="size-3" />
                                      )}
                                      {rec.bottleDelta > 0 ? "+" : ""}
                                      {formatNumber(rec.bottleDelta)} btls
                                    </span>
                                    {rec.paceDeltaPct !== null && (
                                      <span
                                        className={`text-[10px] font-semibold ${
                                          rec.paceDeltaPct > 0
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : rec.paceDeltaPct < 0
                                            ? "text-rose-600 dark:text-rose-400"
                                            : "text-muted-foreground"
                                        }`}
                                      >
                                        {rec.paceDeltaPct > 0 ? "+" : ""}
                                        {rec.paceDeltaPct}% pace shift
                                      </span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {rec.status === "new" && (
                                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-medium text-[11px] gap-1">
                                    <Sparkles className="size-3" />
                                    New Buyer (First Time)
                                  </Badge>
                                )}
                                {rec.status === "returning" && (
                                  <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-medium text-[11px] gap-1">
                                    <RotateCcw className="size-3" />
                                    Returning Buyer
                                  </Badge>
                                )}
                                {rec.status === "surging" && (
                                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-bold text-[11px] gap-1">
                                    <TrendingUp className="size-3" />
                                    Surging Pace (+{rec.paceDeltaPct}%)
                                  </Badge>
                                )}
                                {rec.status === "accelerating" && (
                                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 font-medium text-[11px] gap-1">
                                    <ArrowUpRight className="size-3" />
                                    Accelerating (+{rec.paceDeltaPct}%)
                                  </Badge>
                                )}
                                {rec.status === "steady" && (
                                  <Badge variant="secondary" className="font-normal text-[11px] gap-1">
                                    <Minus className="size-3" />
                                    Steady Pace (0%)
                                  </Badge>
                                )}
                                {rec.status === "decelerating" && (
                                  <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800 font-medium text-[11px] gap-1">
                                    <ArrowDownRight className="size-3" />
                                    Decelerating ({rec.paceDeltaPct}%)
                                  </Badge>
                                )}
                                {rec.status === "lapsed" && (
                                  <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-medium text-[11px] gap-1">
                                    Prior Lapsed (0 btls)
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {rec.currentOrders.length > 0 ? (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() =>
                                      setExpandedAccount(
                                        isExpanded ? null : rec.accountName
                                      )
                                    }
                                    className="h-7 text-[11px] gap-1 px-2 font-medium"
                                  >
                                    <span>{rec.currentOrders.length} ord</span>
                                    {isExpanded ? (
                                      <ChevronUp className="size-3" />
                                    ) : (
                                      <ChevronDown className="size-3" />
                                    )}
                                  </Button>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">0</span>
                                )}
                              </TableCell>
                            </TableRow>

                            {/* EXPANDABLE INLINE ORDER TICKETS FOR THIS ACCOUNT */}
                            {isExpanded && rec.currentOrders.length > 0 && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell colSpan={7} className="p-3 pl-12">
                                  <div className="rounded-lg border border-border/70 bg-background/90 p-3 space-y-2">
                                    <div className="flex items-center justify-between text-xs border-b pb-1.5">
                                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                                        <ShoppingCart className="size-3.5 text-primary" />
                                        Invoice Details for {rec.accountName} in {point.label}
                                      </span>
                                      <span className="text-muted-foreground text-[11px]">
                                        Total: {formatNumber(rec.currentBottles)} bottles
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {rec.currentOrders.map((ord, idx) => (
                                        <div
                                          key={`${ord.id || idx}-${ord.date}`}
                                          className="p-2.5 rounded-md border border-border/50 bg-card/60 text-xs space-y-1"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-semibold text-foreground">
                                              {ord.date ? formatDate(ord.date) : "Recent Order"}
                                            </span>
                                            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                              {ord.id ? `#${ord.id.slice(0, 7)}` : `ORD-${idx + 1}`}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-[11px] pt-0.5">
                                            <span className="text-muted-foreground truncate max-w-[140px]">
                                              {ord.product || activeFocus || "Wine SKU"}
                                            </span>
                                            <span className="font-bold text-foreground">
                                              {ord.cases > 0 ? ord.cases : 1} btls
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB 2: ALL WINE SKUS IN THIS PERIOD */}
            <TabsContent value="products" className="mt-3 flex-1 overflow-hidden flex flex-col space-y-2">
              <div className="flex-1 overflow-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <TableRow className="text-xs hover:bg-transparent border-b">
                      <TableHead className="w-12 text-center text-xs font-semibold text-muted-foreground">#</TableHead>
                      <TableHead
                        className="min-w-[220px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleProductSort("productName")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span>Wine / Product SKU</span>
                          {productSort.column === "productName" ? (
                            productSort.direction === "asc" ? (
                              <ArrowUp className="size-3.5 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3.5 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right min-w-[130px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleProductSort("bottles")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-xs text-foreground">
                          <span>Volume (btls)</span>
                          {productSort.column === "bottles" ? (
                            productSort.direction === "asc" ? (
                              <ArrowUp className="size-3.5 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3.5 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="w-48 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleProductSort("volumeSharePct")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span>Volume Share</span>
                          {productSort.column === "volumeSharePct" ? (
                            productSort.direction === "asc" ? (
                              <ArrowUp className="size-3.5 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3.5 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right min-w-[130px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleProductSort("accountCount")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-xs text-foreground">
                          <span>Buying Accounts</span>
                          {productSort.column === "accountCount" ? (
                            productSort.direction === "asc" ? (
                              <ArrowUp className="size-3.5 text-primary shrink-0" />
                            ) : (
                              <ArrowDown className="size-3.5 text-primary shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="text-center w-36 font-semibold text-xs text-muted-foreground">Focus Trajectory</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedProducts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-44 text-center text-xs text-muted-foreground"
                        >
                          No products found in this period matching the search query.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedProducts.map((p, index) => {
                        const isSelected = selectedProducts.includes(p.productName);
                        const isFocused = activeFocus === p.productName;
                        return (
                          <TableRow
                            key={p.productName}
                            className={`text-xs hover:bg-muted/40 transition-colors ${
                              isFocused ? "bg-primary/5 font-semibold" : ""
                            }`}
                          >
                            <TableCell className="text-center font-mono font-medium text-muted-foreground">
                              {index + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">
                                  {p.productName}
                                </span>
                                {isFocused && (
                                  <Badge className="text-[10px] py-0 px-1.5 bg-primary/20 text-primary border-primary/30">
                                    Current Focus
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground tabular-nums">
                              {formatNumber(p.bottles)} btls
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{
                                      width: `${Math.min(100, Math.max(2, p.volumeSharePct))}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] text-muted-foreground w-11 text-right tabular-nums">
                                  {p.volumeSharePct.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              <span className="font-bold text-foreground">{p.accountCount}</span> accounts
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="xs"
                                variant={isFocused ? "default" : "outline"}
                                onClick={() => {
                                  onSelectFocusedProduct?.(p.productName);
                                  setActiveTab("pace");
                                }}
                                className="h-7 text-xs px-2.5 font-medium"
                              >
                                {isFocused ? "Focused" : "Inspect Pace"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB 3: ALL ORDERING ACCOUNTS (Portfolio Level) */}
            <TabsContent value="accounts" className="mt-3 flex-1 overflow-hidden flex flex-col space-y-2">
              <div className="flex-1 overflow-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <TableRow className="text-xs hover:bg-transparent border-b">
                      <TableHead className="w-12 text-center text-xs font-semibold text-muted-foreground">#</TableHead>
                      <TableHead
                        className="min-w-[220px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleAccountSort("accountName")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span>Account / Restaurant</span>
                          {accountSort.column === "accountName" ? (
                            accountSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right min-w-[130px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleAccountSort("currentBottles")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-xs text-foreground">
                          <span>Bottles Purchased</span>
                          {accountSort.column === "currentBottles" ? (
                            accountSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right min-w-[100px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleAccountSort("invoices")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-xs text-foreground">
                          <span>Order Tickets</span>
                          {accountSort.column === "invoices" ? (
                            accountSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead className="min-w-[260px] font-semibold text-xs text-muted-foreground">Wines Placed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedActiveAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-44 text-center text-xs text-muted-foreground">
                          No accounts found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedActiveAccounts.map((acc, index) => {
                          return (
                            <TableRow key={acc.accountName} className="text-xs hover:bg-muted/40 transition-colors">
                              <TableCell className="text-center font-mono font-medium text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-bold text-foreground">
                                {acc.accountName}
                              </TableCell>
                              <TableCell className="text-right font-bold text-foreground tabular-nums">
                                {formatNumber(acc.currentBottles)} btls
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                {acc.currentOrders.length}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-md">
                                  {Array.from(
                                    new Set(acc.currentOrders.map((o) => o.product).filter(Boolean))
                                  )
                                    .slice(0, 3)
                                    .map((prod) => (
                                      <Badge
                                        key={prod}
                                        variant="secondary"
                                        className="text-[10px] py-0 px-1.5 font-normal truncate max-w-[160px]"
                                      >
                                        {prod}
                                      </Badge>
                                    ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB 4: RAW ORDER INVOICES LOG */}
            <TabsContent value="orders" className="mt-3 flex-1 overflow-hidden flex flex-col space-y-2">
              <div className="flex-1 overflow-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                    <TableRow className="text-xs hover:bg-transparent border-b">
                      <TableHead
                        className="w-28 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleOrderSort("date")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span>Date</span>
                          {orderSort.column === "date" ? (
                            orderSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="min-w-[200px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleOrderSort("accountName")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span>Account / Restaurant</span>
                          {orderSort.column === "accountName" ? (
                            orderSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="min-w-[220px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleOrderSort("product")}
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span>Wine / Product</span>
                          {orderSort.column === "product" ? (
                            orderSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right min-w-[110px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleOrderSort("bottles")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-xs text-foreground">
                          <span>Bottles</span>
                          {orderSort.column === "bottles" ? (
                            orderSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right min-w-[120px] cursor-pointer select-none hover:bg-muted/60 transition-colors"
                        onClick={() => toggleOrderSort("ref")}
                      >
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-xs text-foreground">
                          <span>Order Ref</span>
                          {orderSort.column === "ref" ? (
                            orderSort.direction === "asc" ? <ArrowUp className="size-3.5 text-primary shrink-0" /> : <ArrowDown className="size-3.5 text-primary shrink-0" />
                          ) : (
                            <ArrowUpDown className="size-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedOrdersList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-44 text-center text-xs text-muted-foreground">
                          No order tickets found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedOrdersList.map((o, idx) => (
                        <TableRow
                          key={`${o.id || idx}-${o.date}`}
                          className="text-xs hover:bg-muted/40 transition-colors"
                        >
                          <TableCell className="font-mono text-muted-foreground">
                            {o.date ? formatDate(o.date) : "—"}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {o.accountName}
                          </TableCell>
                          <TableCell className="text-foreground">{o.product || "—"}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            {o.cases > 0 ? o.cases : 1}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                            {o.id ? `#${o.id.slice(0, 7)}` : `ORD-${idx + 1}`}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* BOTTOM FOOTER: Summary Bar & Quick Dismiss */}
        <div className="p-4 px-6 border-t bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Period Total:{" "}
              <strong className="text-foreground font-semibold">
                {formatNumber(displayBottles)} bottles
              </strong>{" "}
            </span>
            <span className="hidden sm:inline text-muted-foreground/60">•</span>
            <span>
              Active Accounts:{" "}
              <strong className="text-foreground font-semibold">
                {displayAccounts} restaurants
              </strong>
            </span>
            {activeFocus && (
              <>
                <span className="hidden sm:inline text-muted-foreground/60">•</span>
                <span className="text-primary font-medium">
                  Filtering exclusively for: <strong>{activeFocus}</strong>
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              size="sm"
              variant="default"
              onClick={() => onOpenChange(false)}
              className="h-8 px-4 text-xs font-semibold"
            >
              Close Analytics
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
