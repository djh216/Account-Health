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
import { rollingPaceWindow } from "./pace-windows";
import type { ProductTrajectory } from "./product-trends";

export type TrendGranularity = "monthly" | "weekly";
export type TrendTimeframe = "all" | "12m" | "6m" | "90d";

export type AccountTrendPoint = {
  key: string;
  label: string;
  date: string;
  timestamp: number;
  totalBottles: number;
  totalCases: number;
  totalRevenue: number;
  orderCount: number;
  [accountName: string]: number | string;
};

export type AccountBottleSummary = {
  accountName: string;
  totalBottles: number;
  totalCases: number;
  totalRevenue: number;
  orderCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  avgBottlesPerMonth: number;
  paceLastMonth: number;
  pacePriorMonth: number;
  monthlyPaceDeltaPct: number | null;
  monthlyPaceDeltaBtls: number;
  monthlyTrajectory: ProductTrajectory;
  paceLast3Months: number;
  pacePrior3Months: number;
  revenueLast3Months: number;
  revenuePrior3Months: number;
  quarterlyPaceDeltaPct: number | null;
  quarterlyPaceDeltaBtls: number;
  quarterlyTrajectory: ProductTrajectory;
};

function paceDeltaPct(recent: number, prior: number): number | null {
  if (prior > 0) {
    return Math.round(((recent - prior) / prior) * 100);
  }
  if (recent > 0) return 100;
  return null;
}

function classifyPaceTrajectory({
  firstOrderDate,
  lastOrderDate,
  asOfDate,
  windowDays,
  paceDeltaPct: deltaPct,
}: {
  firstOrderDate: string;
  lastOrderDate: string;
  asOfDate: Date;
  windowDays: number;
  paceDeltaPct: number | null;
}): ProductTrajectory {
  const firstDate = firstOrderDate ? parseISO(firstOrderDate) : null;
  const lastDate = lastOrderDate ? parseISO(lastOrderDate) : null;
  const isNew = firstDate
    ? differenceInCalendarDays(asOfDate, firstDate) <= windowDays
    : false;
  const isDormant = lastDate
    ? differenceInCalendarDays(asOfDate, lastDate) > windowDays
    : true;

  if (isNew) return "new";
  if (isDormant) return "dormant";
  if (deltaPct !== null && deltaPct >= 15) return "accelerating";
  if (deltaPct !== null && deltaPct <= -15) return "decelerating";
  return "steady";
}

export const TREND_PALETTE = [
  "#9f1239", // rose-800 (wine burgundy)
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
];

/**
 * Calculates aggregate bottle trends over time for selected accounts.
 */
export type BottleTrendDataResult = {
  data: AccountTrendPoint[];
  accountSummaries: AccountBottleSummary[];
  totalBottles: number;
  totalRevenue: number;
  peakPeriod: { label: string; bottles: number } | null;
  avgMonthlyBottles: number;
};

const bottleTrendCache = new Map<string, BottleTrendDataResult>();
const BOTTLE_TREND_CACHE_LIMIT = 48;

/** Fingerprint of an order slice (e.g. rep-filtered) for cache keys and UI scope resets. */
export function bottleTrendOrdersScopeKey(orders: Order[]): string {
  if (orders.length === 0) return "0";
  let volumeSum = 0;
  let revenueCents = 0;
  const accounts = new Set<string>();
  for (const order of orders) {
    volumeSum += order.cases > 0 ? order.cases : 1;
    revenueCents += Math.round((order.revenue || 0) * 100);
    if (accounts.size < 64) {
      accounts.add(normalizeName(order.accountName));
    }
  }
  const first = orders[0]!;
  const last = orders[orders.length - 1]!;
  const accountSample = [...accounts].sort().join("\0");
  return `${orders.length}:${volumeSum}:${revenueCents}:${accountSample}:${first.date}:${last.date}`;
}

function bottleTrendCacheKey(
  orders: Order[],
  selectedAccounts: string[],
  granularity: TrendGranularity,
  timeframe: TrendTimeframe,
  asOf: string | undefined,
  includeAccountBreakdown: boolean,
): string {
  const accountKey =
    selectedAccounts.length === 0
      ? "__all__"
      : selectedAccounts.slice().sort().join("\0");
  return `${bottleTrendOrdersScopeKey(orders)}:${granularity}:${timeframe}:${asOf ?? ""}:${includeAccountBreakdown ? 1 : 0}:${accountKey}`;
}

export function buildBottleTrendData({
  orders,
  selectedAccounts,
  granularity = "monthly",
  timeframe = "all",
  asOf,
  includeAccountBreakdown = true,
}: {
  orders: Order[];
  selectedAccounts: string[];
  granularity?: TrendGranularity;
  timeframe?: TrendTimeframe;
  asOf?: string;
  /** When false, skip per-account point columns (aggregate-only charts). */
  includeAccountBreakdown?: boolean;
}): BottleTrendDataResult {
  const cacheKey = bottleTrendCacheKey(
    orders,
    selectedAccounts,
    granularity,
    timeframe,
    asOf,
    includeAccountBreakdown,
  );
  const cached = bottleTrendCache.get(cacheKey);
  if (cached) return cached;

  const asOfDate = asOf ? parseISO(asOf) : new Date();

  // Snap to the start of the first week or month so a plotted bucket is complete.
  // The current period still ends at asOf.
  let cutoffDate: Date | null = null;
  if (timeframe === "90d") {
    cutoffDate = subDays(asOfDate, 90);
  } else if (timeframe === "6m") {
    cutoffDate = subMonths(asOfDate, 6);
  } else if (timeframe === "12m") {
    cutoffDate = subMonths(asOfDate, 12);
  }
  if (cutoffDate) {
    cutoffDate =
      granularity === "weekly"
        ? startOfWeek(cutoffDate, { weekStartsOn: 1 })
        : startOfMonth(cutoffDate);
  }

  const selectedSet = new Set(selectedAccounts.map((a) => normalizeName(a)));
  const isAllAccounts = selectedAccounts.length === 0;

  // Filter orders by timeframe and selection
  const relevantOrders = orders.filter((order) => {
    if (!order.date) return false;
    const orderDate = parseISO(order.date);
    if (isNaN(orderDate.getTime())) return false;
    if (cutoffDate && isBefore(orderDate, cutoffDate)) return false;
    if (asOf && isAfter(orderDate, asOfDate)) return false;

    if (!isAllAccounts && !selectedSet.has(normalizeName(order.accountName))) {
      return false;
    }
    return true;
  });

  // Group by time bucket
  const buckets = new Map<string, AccountTrendPoint>();

  for (const order of relevantOrders) {
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
    if (!point) {
      point = {
        key: bucketKey,
        label: bucketLabel,
        date: order.date,
        timestamp: bucketTimestamp,
        totalBottles: 0,
        totalCases: 0,
        totalRevenue: 0,
        orderCount: 0,
      };
      buckets.set(bucketKey, point);
    }

    point.totalBottles += bottles;
    point.totalCases += bottles;
    point.totalRevenue += revenue;
    point.orderCount += 1;

    if (includeAccountBreakdown) {
      const accKey = order.accountName;
      const currentAccBottles = (point[accKey] as number) || 0;
      point[accKey] = currentAccBottles + bottles;
    }
  }

  // Sort chronological
  const sortedPoints = Array.from(buckets.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  if (includeAccountBreakdown) {
    for (const point of sortedPoints) {
      for (const acc of selectedAccounts) {
        if (point[acc] === undefined) {
          point[acc] = 0;
        }
      }
    }
  }

  // Short pace: last 30 days vs the prior 30 days. Long pace: last 90 vs prior 90.
  const shortPaceWindow = rollingPaceWindow(asOfDate, 30);
  const quarterWindow = rollingPaceWindow(asOfDate, 90);

  // Valid orders up to asOf for account macro pace
  const accountMacroOrders = orders.filter((order) => {
    if (!order.date) return false;
    const orderDate = parseISO(order.date);
    if (isNaN(orderDate.getTime())) return false;
    if (asOf && isAfter(orderDate, asOfDate)) return false;
    if (!isAllAccounts && !selectedSet.has(normalizeName(order.accountName))) {
      return false;
    }
    return true;
  });

  // Account Summaries Map
  const accountMap = new Map<
    string,
    {
      accountName: string;
      totalBottles: number;
      totalCases: number;
      totalRevenue: number;
      orderCount: number;
      firstOrderDate: string;
      lastOrderDate: string;
      paceLastMonth: number;
      pacePriorMonth: number;
      paceLast3Months: number;
      pacePrior3Months: number;
      revenueLast3Months: number;
      revenuePrior3Months: number;
    }
  >();

  // Initialize accounts from relevant orders or selected
  for (const order of relevantOrders) {
    const acc = order.accountName;
    const bottles = order.cases > 0 ? order.cases : 1;
    const revenue = order.revenue || 0;

    let item = accountMap.get(acc);
    if (!item) {
      item = {
        accountName: acc,
        totalBottles: 0,
        totalCases: 0,
        totalRevenue: 0,
        orderCount: 0,
        firstOrderDate: order.date,
        lastOrderDate: order.date,
        paceLastMonth: 0,
        pacePriorMonth: 0,
        paceLast3Months: 0,
        pacePrior3Months: 0,
        revenueLast3Months: 0,
        revenuePrior3Months: 0,
      };
      accountMap.set(acc, item);
    }

    item.totalBottles += bottles;
    item.totalCases += bottles;
    item.totalRevenue += revenue;
    item.orderCount += 1;

    if (order.date < item.firstOrderDate) item.firstOrderDate = order.date;
    if (order.date > item.lastOrderDate) item.lastOrderDate = order.date;
  }

  // Last 90 days versus the prior 90 days, across history up to asOf
  for (const order of accountMacroOrders) {
    const acc = order.accountName;
    const item = accountMap.get(acc);
    if (!item) continue;

    const orderDate = parseISO(order.date);
    const bottles = order.cases > 0 ? order.cases : 1;
    const revenue = order.revenue || 0;

    if (orderDate >= shortPaceWindow.currentStart && orderDate <= shortPaceWindow.currentEnd) {
      item.paceLastMonth += bottles;
    } else if (
      orderDate >= shortPaceWindow.priorStart &&
      orderDate < shortPaceWindow.currentStart
    ) {
      item.pacePriorMonth += bottles;
    }

    if (orderDate >= quarterWindow.currentStart && orderDate <= quarterWindow.currentEnd) {
      item.paceLast3Months += bottles;
      item.revenueLast3Months += revenue;
    } else if (orderDate >= quarterWindow.priorStart && orderDate < quarterWindow.currentStart) {
      item.pacePrior3Months += bottles;
      item.revenuePrior3Months += revenue;
    }
  }

  const accountSummaries: AccountBottleSummary[] = Array.from(accountMap.values())
    .map((item) => {
      const months = Math.max(
        1,
        differenceInMonths(parseISO(item.lastOrderDate), parseISO(item.firstOrderDate)) + 1,
      );

      const monthlyPaceDeltaBtls = item.paceLastMonth - item.pacePriorMonth;
      const monthlyPaceDeltaPct = paceDeltaPct(item.paceLastMonth, item.pacePriorMonth);
      const quarterlyPaceDeltaBtls = item.paceLast3Months - item.pacePrior3Months;
      const quarterlyPaceDeltaPct = paceDeltaPct(item.paceLast3Months, item.pacePrior3Months);

      return {
        ...item,
        avgBottlesPerMonth: Math.round(item.totalBottles / months),
        monthlyPaceDeltaBtls,
        monthlyPaceDeltaPct,
        monthlyTrajectory: classifyPaceTrajectory({
          firstOrderDate: item.firstOrderDate,
          lastOrderDate: item.lastOrderDate,
          asOfDate,
          windowDays: 30,
          paceDeltaPct: monthlyPaceDeltaPct,
        }),
        quarterlyPaceDeltaBtls,
        quarterlyPaceDeltaPct,
        quarterlyTrajectory: classifyPaceTrajectory({
          firstOrderDate: item.firstOrderDate,
          lastOrderDate: item.lastOrderDate,
          asOfDate,
          windowDays: 90,
          paceDeltaPct: quarterlyPaceDeltaPct,
        }),
      };
    })
    .sort((a, b) => b.totalBottles - a.totalBottles);

  const totalBottles = sortedPoints.reduce((sum, p) => sum + p.totalBottles, 0);
  const totalRevenue = sortedPoints.reduce((sum, p) => sum + p.totalRevenue, 0);

  let peakPeriod: { label: string; bottles: number } | null = null;
  for (const p of sortedPoints) {
    if (!peakPeriod || p.totalBottles > peakPeriod.bottles) {
      peakPeriod = { label: p.label, bottles: p.totalBottles };
    }
  }

  const monthCount = Math.max(
    1,
    sortedPoints.length > 0 && granularity === "monthly"
      ? sortedPoints.length
      : Math.round(sortedPoints.length / 4.3),
  );

  const avgMonthlyBottles = Math.round(totalBottles / monthCount);

  const result: BottleTrendDataResult = {
    data: sortedPoints,
    accountSummaries,
    totalBottles,
    totalRevenue,
    peakPeriod,
    avgMonthlyBottles,
  };

  if (bottleTrendCache.size >= BOTTLE_TREND_CACHE_LIMIT) {
    const firstKey = bottleTrendCache.keys().next().value;
    if (firstKey) bottleTrendCache.delete(firstKey);
  }
  bottleTrendCache.set(cacheKey, result);
  return result;
}
