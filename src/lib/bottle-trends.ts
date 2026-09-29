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
  paceLast3Months: number;
  pacePrior3Months: number;
  revenueLast3Months: number;
  revenuePrior3Months: number;
  quarterlyPaceDeltaPct: number | null;
  quarterlyPaceDeltaBtls: number;
  quarterlyTrajectory: ProductTrajectory;
};

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
export function buildBottleTrendData({
  orders,
  selectedAccounts,
  granularity = "monthly",
  timeframe = "all",
  asOf,
}: {
  orders: Order[];
  selectedAccounts: string[];
  granularity?: TrendGranularity;
  timeframe?: TrendTimeframe;
  asOf?: string;
}): {
  data: AccountTrendPoint[];
  accountSummaries: AccountBottleSummary[];
  totalBottles: number;
  totalRevenue: number;
  peakPeriod: { label: string; bottles: number } | null;
  avgMonthlyBottles: number;
} {
  const asOfDate = asOf ? parseISO(asOf) : new Date();

  // Determine timeframe cutoff
  let cutoffDate: Date | null = null;
  if (timeframe === "90d") {
    cutoffDate = subDays(asOfDate, 90);
  } else if (timeframe === "6m") {
    cutoffDate = subMonths(asOfDate, 6);
  } else if (timeframe === "12m") {
    cutoffDate = subMonths(asOfDate, 12);
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

    // Attribute to specific account
    const accKey = order.accountName;
    const currentAccBottles = (point[accKey] as number) || 0;
    point[accKey] = currentAccBottles + bottles;
  }

  // Sort chronological
  const sortedPoints = Array.from(buckets.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  // Fill in zero for missing accounts in each bucket so recharts lines stay smooth
  for (const point of sortedPoints) {
    for (const acc of selectedAccounts) {
      if (point[acc] === undefined) {
        point[acc] = 0;
      }
    }
  }

  // Windows for trajectory: last 3 months (90 days) vs prior 3 months (90 to 180 days ago)
  const THREE_MONTH_DAYS = 90;
  const recent3MonthsStart = subDays(asOfDate, THREE_MONTH_DAYS);
  const prior3MonthsStart = subDays(asOfDate, THREE_MONTH_DAYS * 2);

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

  // Calculate 3-month pace and prior 3-month pace across full history up to asOf
  for (const order of accountMacroOrders) {
    const acc = order.accountName;
    const item = accountMap.get(acc);
    if (!item) continue;

    const orderDate = parseISO(order.date);
    const bottles = order.cases > 0 ? order.cases : 1;
    const revenue = order.revenue || 0;

    if (orderDate >= recent3MonthsStart && orderDate <= asOfDate) {
      item.paceLast3Months += bottles;
      item.revenueLast3Months += revenue;
    } else if (orderDate >= prior3MonthsStart && orderDate < recent3MonthsStart) {
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

      const quarterlyPaceDeltaBtls = item.paceLast3Months - item.pacePrior3Months;
      let quarterlyPaceDeltaPct: number | null = null;
      if (item.pacePrior3Months > 0) {
        quarterlyPaceDeltaPct = Math.round(
          ((item.paceLast3Months - item.pacePrior3Months) / item.pacePrior3Months) * 100,
        );
      } else if (item.paceLast3Months > 0 && item.pacePrior3Months === 0) {
        quarterlyPaceDeltaPct = 100;
      }

      const firstDateObj = item.firstOrderDate ? parseISO(item.firstOrderDate) : null;
      const lastDateObj = item.lastOrderDate ? parseISO(item.lastOrderDate) : null;
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

      return {
        ...item,
        avgBottlesPerMonth: Math.round(item.totalBottles / months),
        quarterlyPaceDeltaBtls,
        quarterlyPaceDeltaPct,
        quarterlyTrajectory,
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

  return {
    data: sortedPoints,
    accountSummaries,
    totalBottles,
    totalRevenue,
    peakPeriod,
    avgMonthlyBottles,
  };
}
