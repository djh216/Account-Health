import {
  differenceInCalendarDays,
  differenceInMonths,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import type { Order } from "./types";
import { normalizeName } from "./format";

export type ProductTrendGranularity = "monthly" | "weekly";
export type ProductTrendTimeframe = "all" | "12m" | "6m" | "90d";
export type ProductTrendMetric = "bottles" | "revenue" | "accounts";
export type ProductTrajectory = "accelerating" | "steady" | "decelerating" | "new" | "dormant";

export type ProductAccountPlacement = {
  accountName: string;
  bottles: number;
  revenue: number;
  orderCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  shareOfProductPct: number;
};

export type ProductSlowingAlert = {
  id: string;
  productName: string;
  severity: "critical" | "warning" | "watch";
  recentVolume28d: number;
  priorVolume28d: number;
  volumeDropBtls: number;
  dropPercentage: number;
  lastOrderDate: string;
  accountCount: number;
  message: string;
  recommendation: string;
  topAtRiskAccounts: string[];
};

export type ProductSummary = {
  productName: string;
  totalBottles: number;
  totalRevenue: number;
  orderCount: number;
  accountCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  avgBottlesPerMonth: number;
  avgBottlesPerOrder: number;
  recentVolume: number;
  priorVolume: number;
  historicalVolume: number;
  velocityDeltaPct: number | null;
  trajectory: ProductTrajectory;
  topAccounts: ProductAccountPlacement[];
};

export type ProductTrendPoint = {
  key: string;
  label: string;
  date: string;
  timestamp: number;
  totalBottles: number;
  totalRevenue: number;
  activeAccountsCount: number;
  orderCount: number;
  [productKey: string]: number | string;
};

export const PRODUCT_PALETTE = [
  "#881337", // rose-900 (wine burgundy)
  "#2563eb", // blue-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
  "#db2777", // pink-600
  "#4f46e5", // indigo-600
  "#ea580c", // orange-600
  "#16a34a", // green-600
  "#ca8a04", // yellow-600
  "#64748b", // slate-500
  "#9333ea", // purple-600
  "#0284c7", // sky-600
  "#b45309", // amber-700
  "#047857", // emerald-700
];

const PERIOD_DAYS = 28;

/**
 * Calculates time-series trend data and analytics summaries for all individual products.
 */
export function buildProductTrendData({
  orders,
  selectedProducts,
  granularity = "monthly",
  timeframe = "all",
  asOf,
}: {
  orders: Order[];
  selectedProducts: string[];
  granularity?: ProductTrendGranularity;
  timeframe?: ProductTrendTimeframe;
  asOf?: string;
}): {
  data: ProductTrendPoint[];
  productSummaries: ProductSummary[];
  allProductsSorted: string[];
  totalActiveProducts: number;
  totalBottles: number;
  totalRevenue: number;
  topPerformer: ProductSummary | null;
  topGrowing: ProductSummary | null;
  atRiskProduct: ProductSummary | null;
  peakPeriod: { label: string; bottles: number; revenue: number } | null;
  avgMonthlyBottles: number;
} {
  const validOrders = orders.filter(
    (order) => Boolean(order.product?.trim()) && Boolean(order.date),
  );

  const asOfDate = asOf ? parseISO(asOf.slice(0, 10)) : new Date();

  // Determine timeframe cutoff
  let cutoffDate: Date | null = null;
  if (timeframe === "90d") {
    cutoffDate = subDays(asOfDate, 90);
  } else if (timeframe === "6m") {
    cutoffDate = subMonths(asOfDate, 6);
  } else if (timeframe === "12m") {
    cutoffDate = subMonths(asOfDate, 12);
  }

  // Windows for trajectory: recent 45 days vs prior 45 days
  const recentStart = subDays(asOfDate, PERIOD_DAYS);
  const priorStart = subDays(asOfDate, PERIOD_DAYS * 2);

  // Group all valid orders by product
  const productOrderMap = new Map<string, Order[]>();
  for (const order of validOrders) {
    const pName = order.product!.trim();
    const existing = productOrderMap.get(pName);
    if (existing) {
      existing.push(order);
    } else {
      productOrderMap.set(pName, [order]);
    }
  }

  // Build product summaries
  const allSummaries: ProductSummary[] = [];

  for (const [pName, pOrders] of productOrderMap.entries()) {
    let totalBottles = 0;
    let totalRevenue = 0;
    let recentVolume = 0;
    let priorVolume = 0;
    const accountMap = new Map<
      string,
      { bottles: number; revenue: number; orderCount: number; dates: string[] }
    >();

    const sortedOrders = [...pOrders].sort((a, b) => a.date.localeCompare(b.date));
    const firstOrderDate = sortedOrders[0]?.date.slice(0, 10) ?? "";
    const lastOrderDate = sortedOrders.at(-1)?.date.slice(0, 10) ?? "";

    for (const order of pOrders) {
      const btls = order.cases > 0 ? order.cases : 1;
      const rev = order.revenue || 0;
      totalBottles += btls;
      totalRevenue += rev;

      const orderDate = parseISO(order.date.slice(0, 10));
      if (!isNaN(orderDate.getTime())) {
        if (orderDate >= recentStart && orderDate <= asOfDate) {
          recentVolume += btls;
        } else if (orderDate >= priorStart && orderDate < recentStart) {
          priorVolume += btls;
        }
      }

      const accName = order.accountName || "Unknown Account";
      const accExisting = accountMap.get(accName);
      if (accExisting) {
        accExisting.bottles += btls;
        accExisting.revenue += rev;
        accExisting.orderCount += 1;
        accExisting.dates.push(order.date);
      } else {
        accountMap.set(accName, {
          bottles: btls,
          revenue: rev,
          orderCount: 1,
          dates: [order.date],
        });
      }
    }

    // Top accounts for this product
    const topAccounts: ProductAccountPlacement[] = Array.from(accountMap.entries())
      .map(([accName, info]) => {
        info.dates.sort();
        return {
          accountName: accName,
          bottles: info.bottles,
          revenue: info.revenue,
          orderCount: info.orderCount,
          firstOrderDate: info.dates[0] ?? "",
          lastOrderDate: info.dates.at(-1) ?? "",
          shareOfProductPct: totalBottles > 0 ? (info.bottles / totalBottles) * 100 : 0,
        };
      })
      .sort((a, b) => b.bottles - a.bottles);

    // Calculate monthly velocity
    let avgBottlesPerMonth = totalBottles;
    if (firstOrderDate && lastOrderDate) {
      const monthsSpan = Math.max(
        1,
        differenceInMonths(parseISO(lastOrderDate), parseISO(firstOrderDate)) + 1,
      );
      avgBottlesPerMonth = Math.round(totalBottles / monthsSpan);
    }

    // Trajectory calculation
    let velocityDeltaPct: number | null = null;
    if (priorVolume > 0) {
      velocityDeltaPct = ((recentVolume - priorVolume) / priorVolume) * 100;
    } else if (recentVolume > 0 && priorVolume === 0) {
      velocityDeltaPct = 100;
    }

    const firstDateObj = firstOrderDate ? parseISO(firstOrderDate) : null;
    const lastDateObj = lastOrderDate ? parseISO(lastOrderDate) : null;
    const isNew = firstDateObj ? differenceInCalendarDays(asOfDate, firstDateObj) <= 60 : false;
    const isDormant = lastDateObj ? differenceInCalendarDays(asOfDate, lastDateObj) > 60 : true;

    let trajectory: ProductTrajectory = "steady";
    if (isNew) {
      trajectory = "new";
    } else if (isDormant) {
      trajectory = "dormant";
    } else if (velocityDeltaPct !== null && velocityDeltaPct >= 15) {
      trajectory = "accelerating";
    } else if (velocityDeltaPct !== null && velocityDeltaPct <= -15) {
      trajectory = "decelerating";
    } else {
      trajectory = "steady";
    }

    allSummaries.push({
      productName: pName,
      totalBottles,
      totalRevenue,
      orderCount: pOrders.length,
      accountCount: accountMap.size,
      firstOrderDate,
      lastOrderDate,
      avgBottlesPerMonth,
      avgBottlesPerOrder: Math.round(totalBottles / Math.max(1, pOrders.length)),
      recentVolume,
      priorVolume,
      historicalVolume: totalBottles,
      velocityDeltaPct,
      trajectory,
      topAccounts,
    });
  }

  // Sort summaries by total bottle volume descending
  allSummaries.sort((a, b) => b.totalBottles - a.totalBottles);

  const allProductsSorted = allSummaries.map((s) => s.productName);

  // Filter orders for time series by cutoff and product selection
  const selectedSet = new Set(selectedProducts.map((p) => normalizeName(p)));
  const isAllSelected = selectedProducts.length === 0;

  const relevantOrders = validOrders.filter((order) => {
    const orderDate = parseISO(order.date);
    if (isNaN(orderDate.getTime())) return false;
    if (cutoffDate && isBefore(orderDate, cutoffDate)) return false;
    if (asOf && isAfter(orderDate, asOfDate)) return false;

    if (!isAllSelected && !selectedSet.has(normalizeName(order.product!.trim()))) {
      return false;
    }
    return true;
  });

  // Group by time bucket
  const buckets = new Map<string, ProductTrendPoint>();
  const bucketAccountsMap = new Map<string, Set<string>>();

  for (const order of relevantOrders) {
    const pName = order.product!.trim();
    const orderDate = parseISO(order.date);
    const bottles = order.cases > 0 ? order.cases : 1;
    const revenue = order.revenue || 0;

    let bucketKey: string;
    let bucketLabel: string;
    let bucketTimestamp: number;

    if (granularity === "weekly") {
      const weekStart = startOfWeek(orderDate, { weekStartsOn: 1 });
      bucketKey = format(weekStart, "yyyy-'W'II");
      bucketLabel = `Wk ${format(weekStart, "MMM d, yyyy")}`;
      bucketTimestamp = weekStart.getTime();
    } else {
      const monthStart = startOfMonth(orderDate);
      bucketKey = format(monthStart, "yyyy-MM");
      bucketLabel = format(monthStart, "MMM yyyy");
      bucketTimestamp = monthStart.getTime();
    }

    let point = buckets.get(bucketKey);
    let accountsSet = bucketAccountsMap.get(bucketKey);

    if (!point) {
      point = {
        key: bucketKey,
        label: bucketLabel,
        date: order.date,
        timestamp: bucketTimestamp,
        totalBottles: 0,
        totalRevenue: 0,
        activeAccountsCount: 0,
        orderCount: 0,
      };
      buckets.set(bucketKey, point);
      accountsSet = new Set<string>();
      bucketAccountsMap.set(bucketKey, accountsSet);
    }

    point.totalBottles += bottles;
    point.totalRevenue += revenue;
    point.orderCount += 1;

    if (order.accountName) {
      accountsSet!.add(normalizeName(order.accountName));
    }

    // Per-product bottle metrics on the point
    const currentVal = (point[pName] as number) || 0;
    point[pName] = currentVal + bottles;

    // Per-product revenue metrics
    const revKey = `${pName}__rev`;
    point[revKey] = ((point[revKey] as number) || 0) + revenue;
  }

  // Update activeAccountsCount on each point
  for (const [bKey, p] of buckets.entries()) {
    const accSet = bucketAccountsMap.get(bKey);
    p.activeAccountsCount = accSet ? accSet.size : 0;
  }

  // Sort time points chronologically
  const timePoints = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);

  // Overall totals across relevant orders
  const totalBottles = relevantOrders.reduce(
    (sum, order) => sum + (order.cases > 0 ? order.cases : 1),
    0,
  );
  const totalRevenue = relevantOrders.reduce((sum, order) => sum + (order.revenue || 0), 0);

  // Peak period
  let peakPeriod: { label: string; bottles: number; revenue: number } | null = null;
  for (const point of timePoints) {
    if (!peakPeriod || point.totalBottles > peakPeriod.bottles) {
      peakPeriod = {
        label: point.label,
        bottles: point.totalBottles,
        revenue: point.totalRevenue,
      };
    }
  }

  // Velocity
  const activeMonths = Math.max(1, timePoints.length);
  const avgMonthlyBottles = Math.round(totalBottles / activeMonths);

  // Top performer (highest overall bottle volume)
  const topPerformer = allSummaries[0] || null;

  // Top growing (highest positive velocity delta with at least 4 bottles recent)
  const growingSummaries = allSummaries
    .filter((s) => s.trajectory === "accelerating" && s.recentVolume >= 4)
    .sort((a, b) => (b.velocityDeltaPct ?? 0) - (a.velocityDeltaPct ?? 0));
  const topGrowing = growingSummaries[0] || null;

  // At risk (decelerating with prior history)
  const deceleratingSummaries = allSummaries
    .filter((s) => s.trajectory === "decelerating" && s.priorVolume >= 4)
    .sort((a, b) => (a.velocityDeltaPct ?? 0) - (b.velocityDeltaPct ?? 0));
  const atRiskProduct = deceleratingSummaries[0] || null;

  return {
    data: timePoints,
    productSummaries: allSummaries,
    allProductsSorted,
    totalActiveProducts: allSummaries.length,
    totalBottles,
    totalRevenue,
    topPerformer,
    topGrowing,
    atRiskProduct,
    peakPeriod,
    avgMonthlyBottles,
  };
}

/**
 * Detects wine products whose reorder volume or sales velocity has slowed significantly over the last 28 days.
 */
export function detectSlowingProductAlerts(
  summaries: ProductSummary[],
): ProductSlowingAlert[] {
  const alerts: ProductSlowingAlert[] = [];

  for (const s of summaries) {
    // Only evaluate wines with established sales history (at least 3 bottles in prior 28-day cycle or multiple orders)
    if (s.priorVolume < 3 && s.orderCount < 2) continue;

    // Check if volume is slowing over the last 28 days
    const delta = s.velocityDeltaPct ?? 0;
    const dropBtls = Math.max(0, s.priorVolume - s.recentVolume);

    if (s.recentVolume < s.priorVolume || delta <= -15) {
      let severity: "critical" | "warning" | "watch" = "watch";
      let message = "";
      let recommendation = "";

      const dropPct = s.priorVolume > 0
        ? Math.round(((s.priorVolume - s.recentVolume) / s.priorVolume) * 100)
        : Math.abs(Math.round(delta));

      if (s.recentVolume === 0 && s.priorVolume >= 4) {
        severity = "critical";
        message = `Zero reorders in the last 28 days (down from ${s.priorVolume} btls in the prior 28-day window).`;
        recommendation = `Target top previous purchasing accounts (${s.topAccounts.slice(0, 3).map((a) => a.accountName).join(", ") || "historical buyers"}) to check depletion levels and restock before losing placement.`;
      } else if (dropPct >= 50 && s.priorVolume >= 4) {
        severity = "critical";
        message = `Severe 28-day slowdown: volume plunged ${dropPct}% (${s.recentVolume} btls vs ${s.priorVolume} btls prior).`;
        recommendation = `Review BTG (by-the-glass) and menu rotation status with key placements to determine if wine was rotated off the list.`;
      } else if (dropPct >= 25 || (s.recentVolume === 0 && s.priorVolume >= 2)) {
        severity = "warning";
        message = `Notable 28-day sales deceleration: volume down ${dropPct}% vs prior 28-day period.`;
        recommendation = `Schedule staff re-tasting or distributor check-in with accounts carrying this SKU to revitalize momentum.`;
      } else if (dropPct >= 15) {
        severity = "watch";
        message = `Mild 28-day sales cooling: down ${dropPct}% compared to prior 28 days.`;
        recommendation = `Monitor upcoming order cadence across active placements over the next 2-4 weeks.`;
      } else {
        continue;
      }

      alerts.push({
        id: `prod_alert_${normalizeName(s.productName)}`,
        productName: s.productName,
        severity,
        recentVolume28d: s.recentVolume,
        priorVolume28d: s.priorVolume,
        volumeDropBtls: dropBtls,
        dropPercentage: dropPct,
        lastOrderDate: s.lastOrderDate,
        accountCount: s.accountCount,
        message,
        recommendation,
        topAtRiskAccounts: s.topAccounts.slice(0, 4).map((a) => a.accountName),
      });
    }
  }

  // Sort alerts by severity (critical > warning > watch), then by drop volume descending
  const severityRank = { critical: 0, warning: 1, watch: 2 };
  alerts.sort((a, b) => {
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.volumeDropBtls - a.volumeDropBtls;
  });

  return alerts;
}
