import {
  addDays,
  differenceInCalendarDays,
  differenceInMonths,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import type { Order } from "./types";
import { normalizeName } from "./format";
import { rollingPaceWindow } from "./pace-windows";

export type ProductTrendGranularity = "monthly" | "weekly" | "30d";

export const PRODUCT_TREND_30D_PERIOD_DAYS = 30;

/** Rolling 30-day windows ending on `asOf` (index 0 = last 30 days inclusive). */
export function thirtyDayTrendPeriodIndex(orderDate: Date, asOf: Date): number | null {
  const asOfDay = startOfDay(asOf);
  const orderDay = startOfDay(orderDate);
  if (isAfter(orderDay, asOfDay)) return null;
  return Math.floor(
    differenceInCalendarDays(asOfDay, orderDay) / PRODUCT_TREND_30D_PERIOD_DAYS,
  );
}

export function thirtyDayTrendPeriodBounds(
  periodIndex: number,
  asOf: Date,
): { start: Date; end: Date } {
  const asOfDay = startOfDay(asOf);
  const end = subDays(asOfDay, periodIndex * PRODUCT_TREND_30D_PERIOD_DAYS);
  const start = subDays(end, PRODUCT_TREND_30D_PERIOD_DAYS - 1);
  return { start, end };
}

export function thirtyDayTrendPeriodKey(periodIndex: number, asOf: Date): string {
  const { end } = thirtyDayTrendPeriodBounds(periodIndex, asOf);
  return `30d:${format(end, "yyyy-MM-dd")}`;
}

export function thirtyDayTrendPeriodLabel(
  periodIndex: number,
  asOf: Date,
): string {
  const { start, end } = thirtyDayTrendPeriodBounds(periodIndex, asOf);
  const range = `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  return periodIndex === 0 ? `Last 30 days (${range})` : range;
}

export function productTrendBucketKey(
  date: Date,
  granularity: ProductTrendGranularity,
  asOf?: Date,
): string {
  if (granularity === "weekly") {
    return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-'W'II");
  }
  if (granularity === "30d") {
    const anchor = asOf ?? date;
    const periodIndex = thirtyDayTrendPeriodIndex(date, anchor);
    if (periodIndex === null) return "";
    return thirtyDayTrendPeriodKey(periodIndex, anchor);
  }
  return format(startOfMonth(date), "yyyy-MM");
}

export function productTrendBucketLabel(
  bucketStart: Date,
  granularity: ProductTrendGranularity,
  options?: { asOf?: Date; periodIndex?: number },
): string {
  if (granularity === "weekly") {
    return `Wk ${format(bucketStart, "MMM d, yyyy")}`;
  }
  if (granularity === "30d" && options?.asOf != null && options.periodIndex != null) {
    return thirtyDayTrendPeriodLabel(options.periodIndex, options.asOf);
  }
  if (granularity === "30d") {
    const end = addDays(bucketStart, PRODUCT_TREND_30D_PERIOD_DAYS - 1);
    return `${format(bucketStart, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return format(bucketStart, "MMM yyyy");
}

export function productTrendBucketForDate(
  date: Date,
  granularity: ProductTrendGranularity,
  asOf?: Date,
): { key: string; label: string; timestamp: number } | null {
  if (granularity === "30d") {
    const anchor = asOf ?? date;
    const periodIndex = thirtyDayTrendPeriodIndex(date, anchor);
    if (periodIndex === null) return null;
    const { start } = thirtyDayTrendPeriodBounds(periodIndex, anchor);
    return {
      key: thirtyDayTrendPeriodKey(periodIndex, anchor),
      label: thirtyDayTrendPeriodLabel(periodIndex, anchor),
      timestamp: start.getTime(),
    };
  }

  const bucketStart =
    granularity === "weekly"
      ? startOfWeek(date, { weekStartsOn: 1 })
      : startOfMonth(date);

  return {
    key: productTrendBucketKey(date, granularity, asOf),
    label: productTrendBucketLabel(bucketStart, granularity),
    timestamp: bucketStart.getTime(),
  };
}

export function snapProductTrendCutoffDate(
  cutoff: Date,
  granularity: ProductTrendGranularity,
  asOf?: Date,
): Date {
  if (granularity === "weekly") return startOfWeek(cutoff, { weekStartsOn: 1 });
  if (granularity === "30d" && asOf) {
    const periodIndex = thirtyDayTrendPeriodIndex(cutoff, asOf);
    if (periodIndex === null) return cutoff;
    return thirtyDayTrendPeriodBounds(periodIndex, asOf).start;
  }
  return startOfMonth(cutoff);
}

export function productTrendGranularityLabel(granularity: ProductTrendGranularity): string {
  if (granularity === "weekly") return "weekly";
  if (granularity === "30d") return "rolling 30-day";
  return "monthly";
}
export type ProductTrendTimeframe = "all" | "12m" | "6m" | "90d";
export type ProductTrendMetric = "bottles" | "accounts";
export type ProductTrajectory = "accelerating" | "steady" | "decelerating" | "new" | "dormant";

export type ProductAccountPlacement = {
  accountName: string;
  bottles: number;
  orderCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  shareOfProductPct: number;
  paceLast3Months: number;
  pacePrior3Months: number;
  quarterlyPaceDeltaPct: number | null;
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
  paceLast3Months: number;
  pacePrior3Months: number;
  quarterlyPaceDeltaPct: number | null;
  quarterlyPaceDeltaBtls: number;
  quarterlyTrajectory: ProductTrajectory;
  topAccounts: ProductAccountPlacement[];
};

export type ProductTrendPoint = {
  key: string;
  label: string;
  date: string;
  timestamp: number;
  totalBottles: number;
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
  topPerformer: ProductSummary | null;
  topGrowing: ProductSummary | null;
  atRiskProduct: ProductSummary | null;
  topGrowingQuarterly: ProductSummary | null;
  coolingQuarterly: ProductSummary | null;
  portfolioPaceLast3Months: number;
  portfolioPacePrior3Months: number;
  portfolioQuarterlyPaceDeltaPct: number | null;
  peakPeriod: { label: string; bottles: number } | null;
  avgMonthlyBottles: number;
} {
  const validOrders = orders.filter(
    (order) => Boolean(order.product?.trim()) && Boolean(order.date),
  );

  const asOfDate = asOf ? parseISO(asOf.slice(0, 10)) : new Date();

  // Determine timeframe cutoff. Snap to the start of the first week or month so a
  // bucket on the chart is a complete period. The current period still ends at asOf.
  let cutoffDate: Date | null = null;
  if (timeframe === "90d") {
    cutoffDate = subDays(asOfDate, 90);
  } else if (timeframe === "6m") {
    cutoffDate = subMonths(asOfDate, 6);
  } else if (timeframe === "12m") {
    cutoffDate = subMonths(asOfDate, 12);
  }
  if (cutoffDate) {
    cutoffDate = snapProductTrendCutoffDate(cutoffDate, granularity, asOfDate);
  }

  // Windows for trajectory:
  // Short-term: recent 28 days vs prior 28 days
  const recentStart = subDays(asOfDate, PERIOD_DAYS);
  const priorStart = subDays(asOfDate, PERIOD_DAYS * 2);

  // Last 90 days vs the 90 days immediately before that.
  const quarterWindow = rollingPaceWindow(asOfDate, 90);

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
    let recentVolume = 0;
    let priorVolume = 0;
    let paceLast3Months = 0;
    let pacePrior3Months = 0;

    const accountMap = new Map<
      string,
      {
        bottles: number;
        orderCount: number;
        dates: string[];
        paceLast3Months: number;
        pacePrior3Months: number;
      }
    >();

    const sortedOrders = [...pOrders].sort((a, b) => a.date.localeCompare(b.date));
    const firstOrderDate = sortedOrders[0]?.date.slice(0, 10) ?? "";
    const lastOrderDate = sortedOrders.at(-1)?.date.slice(0, 10) ?? "";

    for (const order of pOrders) {
      const btls = order.cases > 0 ? order.cases : 1;
      totalBottles += btls;

      const orderDate = parseISO(order.date.slice(0, 10));
      if (!isNaN(orderDate.getTime())) {
        // 28-day window
        if (orderDate >= recentStart && orderDate <= asOfDate) {
          recentVolume += btls;
        } else if (orderDate >= priorStart && orderDate < recentStart) {
          priorVolume += btls;
        }

        if (orderDate >= quarterWindow.currentStart && orderDate <= quarterWindow.currentEnd) {
          paceLast3Months += btls;
        } else if (orderDate >= quarterWindow.priorStart && orderDate < quarterWindow.currentStart) {
          pacePrior3Months += btls;
        }
      }

      const accName = order.accountName || "Unknown Account";
      const isRecent3M =
        !isNaN(orderDate.getTime()) &&
        orderDate >= quarterWindow.currentStart &&
        orderDate <= quarterWindow.currentEnd;
      const isPrior3M =
        !isNaN(orderDate.getTime()) &&
        orderDate >= quarterWindow.priorStart &&
        orderDate < quarterWindow.currentStart;

      const accExisting = accountMap.get(accName);
      if (accExisting) {
        accExisting.bottles += btls;
        accExisting.orderCount += 1;
        accExisting.dates.push(order.date);
        if (isRecent3M) accExisting.paceLast3Months += btls;
        if (isPrior3M) accExisting.pacePrior3Months += btls;
      } else {
        accountMap.set(accName, {
          bottles: btls,
          orderCount: 1,
          dates: [order.date],
          paceLast3Months: isRecent3M ? btls : 0,
          pacePrior3Months: isPrior3M ? btls : 0,
        });
      }
    }

    // Top accounts for this product
    const topAccounts: ProductAccountPlacement[] = Array.from(accountMap.entries())
      .map(([accName, info]) => {
        info.dates.sort();
        let quarterlyPaceDeltaPct: number | null = null;
        if (info.pacePrior3Months > 0) {
          quarterlyPaceDeltaPct = Math.round(
            ((info.paceLast3Months - info.pacePrior3Months) / info.pacePrior3Months) * 100,
          );
        } else if (info.paceLast3Months > 0 && info.pacePrior3Months === 0) {
          quarterlyPaceDeltaPct = 100;
        }

        return {
          accountName: accName,
          bottles: info.bottles,
          orderCount: info.orderCount,
          firstOrderDate: info.dates[0] ?? "",
          lastOrderDate: info.dates.at(-1) ?? "",
          shareOfProductPct: totalBottles > 0 ? (info.bottles / totalBottles) * 100 : 0,
          paceLast3Months: info.paceLast3Months,
          pacePrior3Months: info.pacePrior3Months,
          quarterlyPaceDeltaPct,
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

    // 28-day Trajectory calculation
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

    // 3-Month Macro Pace calculation
    let quarterlyPaceDeltaPct: number | null = null;
    if (pacePrior3Months > 0) {
      quarterlyPaceDeltaPct = Math.round(
        ((paceLast3Months - pacePrior3Months) / pacePrior3Months) * 100,
      );
    } else if (paceLast3Months > 0 && pacePrior3Months === 0) {
      quarterlyPaceDeltaPct = 100;
    }
    const quarterlyPaceDeltaBtls = paceLast3Months - pacePrior3Months;

    const isNewQuarterly = firstDateObj
      ? differenceInCalendarDays(asOfDate, firstDateObj) <= 90
      : false;
    const isDormantQuarterly = lastDateObj
      ? differenceInCalendarDays(asOfDate, lastDateObj) > 90
      : true;

    let quarterlyTrajectory: ProductTrajectory = "steady";
    if (isNewQuarterly) {
      quarterlyTrajectory = "new";
    } else if (isDormantQuarterly) {
      quarterlyTrajectory = "dormant";
    } else if (quarterlyPaceDeltaPct !== null && quarterlyPaceDeltaPct >= 15) {
      quarterlyTrajectory = "accelerating";
    } else if (quarterlyPaceDeltaPct !== null && quarterlyPaceDeltaPct <= -15) {
      quarterlyTrajectory = "decelerating";
    } else {
      quarterlyTrajectory = "steady";
    }

    allSummaries.push({
      productName: pName,
      totalBottles,
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
      paceLast3Months,
      pacePrior3Months,
      quarterlyPaceDeltaPct,
      quarterlyPaceDeltaBtls,
      quarterlyTrajectory,
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

    const bucket = productTrendBucketForDate(orderDate, granularity, asOfDate);
    if (!bucket) continue;
    const { key: bucketKey, label: bucketLabel, timestamp: bucketTimestamp } = bucket;

    let point = buckets.get(bucketKey);
    let accountsSet = bucketAccountsMap.get(bucketKey);

    if (!point) {
      point = {
        key: bucketKey,
        label: bucketLabel,
        date: order.date,
        timestamp: bucketTimestamp,
        totalBottles: 0,
        activeAccountsCount: 0,
        orderCount: 0,
      };
      buckets.set(bucketKey, point);
      accountsSet = new Set<string>();
      bucketAccountsMap.set(bucketKey, accountsSet);
    }

    point.totalBottles += bottles;
    point.orderCount += 1;

    if (order.accountName) {
      accountsSet!.add(normalizeName(order.accountName));
    }

    // Per-product bottle metrics on the point
    const currentVal = (point[pName] as number) || 0;
    point[pName] = currentVal + bottles;
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
  // Peak period
  let peakPeriod: { label: string; bottles: number } | null = null;
  for (const point of timePoints) {
    if (!peakPeriod || point.totalBottles > peakPeriod.bottles) {
      peakPeriod = {
        label: point.label,
        bottles: point.totalBottles,
      };
    }
  }

  // Velocity
  const activeMonths = Math.max(1, timePoints.length);
  const avgMonthlyBottles = Math.round(totalBottles / activeMonths);

  const highlights = deriveProductTrendHighlights(allSummaries);

  return {
    data: timePoints,
    productSummaries: allSummaries,
    allProductsSorted,
    totalBottles,
    peakPeriod,
    avgMonthlyBottles,
    ...highlights,
  };
}

export function deriveProductTrendHighlights(allSummaries: ProductSummary[]) {
  const topPerformer = allSummaries[0] || null;

  const growingSummaries = allSummaries
    .filter((s) => s.trajectory === "accelerating" && s.recentVolume >= 4)
    .sort((a, b) => (b.velocityDeltaPct ?? 0) - (a.velocityDeltaPct ?? 0));
  const topGrowing = growingSummaries[0] || null;

  const deceleratingSummaries = allSummaries
    .filter((s) => s.trajectory === "decelerating" && s.priorVolume >= 4)
    .sort((a, b) => (a.velocityDeltaPct ?? 0) - (b.velocityDeltaPct ?? 0));
  const atRiskProduct = deceleratingSummaries[0] || null;

  const growingQuarterlySummaries = allSummaries
    .filter((s) => s.quarterlyTrajectory === "accelerating" && s.paceLast3Months >= 6)
    .sort((a, b) => (b.quarterlyPaceDeltaPct ?? 0) - (a.quarterlyPaceDeltaPct ?? 0));
  const topGrowingQuarterly = growingQuarterlySummaries[0] || null;

  const coolingQuarterlySummaries = allSummaries
    .filter((s) => s.quarterlyTrajectory === "decelerating" && s.pacePrior3Months >= 6)
    .sort((a, b) => (a.quarterlyPaceDeltaPct ?? 0) - (b.quarterlyPaceDeltaPct ?? 0));
  const coolingQuarterly = coolingQuarterlySummaries[0] || null;

  const portfolioPaceLast3Months = allSummaries.reduce((acc, s) => acc + s.paceLast3Months, 0);
  const portfolioPacePrior3Months = allSummaries.reduce((acc, s) => acc + s.pacePrior3Months, 0);
  let portfolioQuarterlyPaceDeltaPct: number | null = null;
  if (portfolioPacePrior3Months > 0) {
    portfolioQuarterlyPaceDeltaPct = Math.round(
      ((portfolioPaceLast3Months - portfolioPacePrior3Months) / portfolioPacePrior3Months) * 100,
    );
  } else if (portfolioPaceLast3Months > 0 && portfolioPacePrior3Months === 0) {
    portfolioQuarterlyPaceDeltaPct = 100;
  }

  return {
    totalActiveProducts: allSummaries.length,
    topPerformer,
    topGrowing,
    atRiskProduct,
    topGrowingQuarterly,
    coolingQuarterly,
    portfolioPaceLast3Months,
    portfolioPacePrior3Months,
    portfolioQuarterlyPaceDeltaPct,
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

export type ProductTrendDataResult = ReturnType<typeof buildProductTrendData>;

const aggregateProductTrendCache = new Map<string, ProductTrendDataResult>();

/** Cached monthly/all-time aggregate trends (empty product selection). */
export function buildAggregateProductTrendDataCached(
  portfolioKey: string,
  orders: Order[],
  asOf?: string,
): ProductTrendDataResult {
  const cacheKey = `${portfolioKey}:${asOf ?? ""}`;
  const cached = aggregateProductTrendCache.get(cacheKey);
  if (cached) return cached;
  const result = buildProductTrendData({
    orders,
    selectedProducts: [],
    granularity: "monthly",
    timeframe: "all",
    asOf,
  });
  aggregateProductTrendCache.set(cacheKey, result);
  return result;
}
