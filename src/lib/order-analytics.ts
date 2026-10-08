import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { normalizeName } from "./format";
import {
  averageOrdersPerMonthLifetimeFromOrderDates,
  frequencyDeltaFromLatestOrderGap,
  typicalFrequencyDaysFromOrderDates,
} from "./order-frequency";
import {
  orderEventCountFromOrders,
  orderWeekKey,
  uniqueOrderWeekAnchorDates,
  uniqueOrderWeekAnchorDatesFromDays,
} from "./order-weeks";
import { daysPastTypicalFrequency, riskFromOrderCadence } from "./order-cadence";
import type { Order, RiskLevel } from "./types";

export type ProductVolumeRow = {
  product: string;
  volume: number;
  orderCount: number;
  sharePct: number;
};

export type RestaurantVolumeRow = {
  accountName: string;
  volume: number;
  orderCount: number;
  lastOrderDate: string;
};

export type MonthlyVolumeRow = {
  month: string;
  label: string;
  volume: number;
  orderCount: number;
};

export type RestaurantOrderFrequency = {
  accountName: string;
  orderEventCount: number;
  lineCount: number;
  firstOrderDate: string;
  lastOrderDate: string;
  daysSinceLastOrder: number;
  avgDaysBetweenOrders: number | null;
  ordersPerMonth: number | null;
  productsOrdered: string[];
  productCount: number;
  totalVolume: number;
};

export type ProductPurchaseTracking = {
  product: string;
  volume: number;
  lineCount: number;
  orderEventCount: number;
  restaurantCount: number;
  restaurants: string[];
  firstOrdered: string;
  lastOrdered: string;
  avgDaysBetweenPurchases: number | null;
  avgVolumePerLine: number;
};

export type RestaurantProductMix = {
  accountName: string;
  product: string;
  volume: number;
  lineCount: number;
  orderEventCount: number;
  firstOrdered: string;
  lastOrdered: string;
  shareOfRestaurantVolumePct: number;
};

export type ProductChangeStatus =
  | "new"
  | "dropped"
  | "increasing"
  | "decreasing"
  | "stable";

export type AccountProductChange = {
  product: string;
  status: ProductChangeStatus;
  recentVolume: number;
  priorVolume: number;
  historicalVolume: number;
  volumeDeltaPct: number | null;
  lastOrdered: string | null;
};

export type AccountProductCadence = {
  product: string;
  firstOrdered: string;
  lastOrdered: string;
  orderEventCount: number;
  avgDaysBetweenOrders: number | null;
  daysSinceLastOrder: number;
  daysPastTypical: number | null;
  risk: RiskLevel;
};

export type ProductCadenceSortKey =
  | "product"
  | "typicalCadence"
  | "lastOrder"
  | "daysSince"
  | "vsTypical"
  | "risk";

function productCadenceRiskRank(risk: RiskLevel): number {
  switch (risk) {
    case "critical":
      return 0;
    case "at_risk":
      return 1;
    case "dormant":
      return 2;
    case "healthy":
      return 3;
  }
}

export type AccountMonthlyVolume = {
  month: string;
  label: string;
  volume: number;
  orderEventCount: number;
  lineCount: number;
  products: string[];
};

export type AccountOrderTracking = {
  accountName: string;
  frequency: RestaurantOrderFrequency;
  monthlyVolume: AccountMonthlyVolume[];
  volumeRecent90: number;
  volumePrior90: number;
  volumeBeforeRecent90: number;
  volumeAllTime: number;
  volumeDeltaPct: number | null;
  frequencyDeltaDays: number | null;
  productChanges: AccountProductChange[];
  productCadence: AccountProductCadence[];
  newProducts: string[];
  droppedProducts: string[];
  products: RestaurantProductMix[];
  orders: Order[];
  analysisAsOf: string;
  periodDays: {
    recent: number;
    prior: number;
    before: number | null;
  };
  healthScore?: number | null;
  healthScoreChange14d?: number | null;
  /** All-time territory value rank (1 = highest volume). */
  territoryRank?: number | null;
};

export type AccountTrackingSortKey =
  | "accountName"
  | "volumeAllTime"
  | "volumeRecent90"
  | "volumePrior90"
  | "frequencyDeltaDays"
  | "volumeDeltaPct"
  | "lastOrderDate"
  | "orderFrequency"
  | "healthScore"
  | "territoryRank";

export type RestaurantFrequencySortKey =
  | "accountName"
  | "orderEventCount"
  | "orderFrequency"
  | "ordersPerMonth"
  | "lastOrderDate"
  | "productCount"
  | "totalVolume";

export type SortDirection = "asc" | "desc";

export function sortProductCadenceRows(
  rows: AccountProductCadence[],
  column: ProductCadenceSortKey,
  direction: SortDirection,
): AccountProductCadence[] {
  const dir = direction === "asc" ? 1 : -1;

  const compareNumbers = (a: number, b: number) => (a - b) * dir;
  const compareNullableNumbers = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return compareNumbers(a, b);
  };
  const compareStrings = (a: string, b: string) => a.localeCompare(b) * dir;

  return [...rows].sort((a, b) => {
    switch (column) {
      case "product":
        return compareStrings(a.product, b.product);
      case "typicalCadence":
        return (
          compareNullableNumbers(a.avgDaysBetweenOrders, b.avgDaysBetweenOrders) ||
          compareNumbers(a.orderEventCount, b.orderEventCount)
        );
      case "lastOrder":
        return compareStrings(a.lastOrdered, b.lastOrdered);
      case "daysSince":
        return compareNumbers(a.daysSinceLastOrder, b.daysSinceLastOrder);
      case "vsTypical":
        return compareNullableNumbers(a.daysPastTypical, b.daysPastTypical);
      case "risk":
        return (
          compareNumbers(productCadenceRiskRank(a.risk), productCadenceRiskRank(b.risk)) ||
          compareNullableNumbers(b.daysPastTypical, a.daysPastTypical)
        );
    }
  });
}

export function sortRestaurantFrequencyRows(
  rows: RestaurantOrderFrequency[],
  column: RestaurantFrequencySortKey,
  direction: SortDirection,
): RestaurantOrderFrequency[] {
  const dir = direction === "asc" ? 1 : -1;

  const compareNumbers = (a: number, b: number) => (a - b) * dir;
  const compareNullableNumbers = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return compareNumbers(a, b);
  };
  const compareStrings = (a: string, b: string) => a.localeCompare(b) * dir;

  return [...rows].sort((a, b) => {
    switch (column) {
      case "accountName":
        return compareStrings(a.accountName, b.accountName);
      case "orderEventCount":
        return compareNumbers(a.orderEventCount, b.orderEventCount);
      case "orderFrequency":
        return compareNullableNumbers(a.avgDaysBetweenOrders, b.avgDaysBetweenOrders);
      case "ordersPerMonth":
        return compareNullableNumbers(a.ordersPerMonth, b.ordersPerMonth);
      case "lastOrderDate":
        return compareStrings(a.lastOrderDate, b.lastOrderDate);
      case "productCount":
        return compareNumbers(a.productCount, b.productCount);
      case "totalVolume":
        return compareNumbers(a.totalVolume, b.totalVolume);
    }
  });
}

export function sortAccountTrackingRows(
  rows: AccountOrderTracking[],
  column: AccountTrackingSortKey,
  direction: SortDirection,
): AccountOrderTracking[] {
  const dir = direction === "asc" ? 1 : -1;

  const compareNumbers = (a: number, b: number) => (a - b) * dir;
  const compareNullableNumbers = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return compareNumbers(a, b);
  };
  const compareStrings = (a: string, b: string) => a.localeCompare(b) * dir;

  return [...rows].sort((a, b) => {
    switch (column) {
      case "accountName":
        return compareStrings(a.accountName, b.accountName);
      case "volumeAllTime":
        return compareNumbers(a.volumeAllTime, b.volumeAllTime);
      case "volumeRecent90":
        return compareNumbers(a.volumeRecent90, b.volumeRecent90);
      case "volumePrior90":
        return compareNumbers(a.volumePrior90, b.volumePrior90);
      case "frequencyDeltaDays":
        return compareNullableNumbers(a.frequencyDeltaDays, b.frequencyDeltaDays);
      case "volumeDeltaPct":
        return compareNullableNumbers(a.volumeDeltaPct, b.volumeDeltaPct);
      case "lastOrderDate":
        return compareStrings(a.frequency.lastOrderDate, b.frequency.lastOrderDate);
      case "orderFrequency":
        return compareNullableNumbers(
          a.frequency.avgDaysBetweenOrders,
          b.frequency.avgDaysBetweenOrders,
        );
      case "healthScore":
        return compareNullableNumbers(a.healthScore ?? null, b.healthScore ?? null);
      case "territoryRank": {
        const rankA = a.territoryRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.territoryRank ?? Number.MAX_SAFE_INTEGER;
        return compareNumbers(rankA, rankB);
      }
    }
  });
}

export type OrderAnalyticsSnapshot = {
  asOf: string;
  dateRange: { start: string | null; end: string | null };
  totals: {
    orderLines: number;
    totalVolume: number;
    restaurantCount: number;
    productCount: number;
    orderEvents: number;
  };
  byProduct: ProductVolumeRow[];
  byRestaurant: RestaurantVolumeRow[];
  byMonth: MonthlyVolumeRow[];
  byFrequency: RestaurantOrderFrequency[];
  productCatalog: ProductPurchaseTracking[];
  byRestaurantProduct: RestaurantProductMix[];
  byAccount: AccountOrderTracking[];
  orders: Order[];
};

function lineVolume(order: Order): number {
  return order.cases > 0 ? order.cases : 1;
}

export function hasSpecifiedProduct(order: Order): boolean {
  return Boolean(order.product?.trim());
}

function productLabel(order: Order): string {
  return order.product!.trim();
}

function analyticsOrders(orders: Order[]): Order[] {
  return orders.filter(hasSpecifiedProduct);
}

function uniqueOrderDates(orders: Order[]): string[] {
  return [...new Set(orders.map((order) => order.date.slice(0, 10)))].sort();
}

export type LastOrderGap = {
  priorOrderDate: string;
  daysBetween: number;
};

/** Calendar days between each account's latest order date and the order date before it. */
export function lastOrderGapsByAccount(orders: Order[]): Map<string, LastOrderGap> {
  const datesByKey = new Map<string, { dates: Set<string>; keys: Set<string> }>();

  for (const order of orders) {
    const day = order.date.slice(0, 10);
    const primary = order.accountId || normalizeName(order.accountName);
    let bucket = datesByKey.get(primary);
    if (!bucket) {
      bucket = {
        dates: new Set(),
        keys: new Set([primary, normalizeName(order.accountName)]),
      };
      datesByKey.set(primary, bucket);
    }
    bucket.dates.add(day);
    if (order.accountId) bucket.keys.add(order.accountId);
    bucket.keys.add(normalizeName(order.accountName));
  }

  const gaps = new Map<string, LastOrderGap>();
  for (const bucket of datesByKey.values()) {
    const sorted = uniqueOrderWeekAnchorDatesFromDays([...bucket.dates]);
    const last = sorted.at(-1);
    const prior = sorted.at(-2);
    if (!last || !prior) continue;
    const gap: LastOrderGap = {
      priorOrderDate: prior,
      daysBetween: differenceInCalendarDays(parseISO(last), parseISO(prior)),
    };
    for (const key of bucket.keys) gaps.set(key, gap);
  }
  return gaps;
}

function ordersPerMonth(orderDates: string[], asOf: string): number | null {
  return averageOrdersPerMonthLifetimeFromOrderDates(orderDates, asOf);
}

function typicalFrequencyForOrders(orderDates: string[], asOf: string): number | null {
  return typicalFrequencyDaysFromOrderDates(orderDates, asOf);
}

function volumeDeltaPct(recent: number, prior: number): number | null {
  if (prior <= 0 && recent <= 0) return null;
  if (prior <= 0) return null;
  return Math.round(((recent - prior) / prior) * 100);
}

const PERIOD_WINDOW_DAYS = 45;
export const ANALYTICS_PERIOD_DAYS = PERIOD_WINDOW_DAYS;
export const NEW_ACCOUNT_WINDOW_DAYS = PERIOD_WINDOW_DAYS;

export type NewAccountSummary = {
  accountName: string;
  accountId: string;
  firstOrderDate: string;
  lastOrderDate: string;
  orderEventCount: number;
  recentVolume: number;
  totalVolume: number;
};

function ordersForAccountName(orders: Order[], accountName: string): Order[] {
  const normalized = normalizeName(accountName);
  return orders.filter((order) => normalizeName(order.accountName) === normalized);
}

export function isNewAccountWithRecentOrder(
  orders: Order[],
  accountName: string,
  asOf: string,
  windowDays = NEW_ACCOUNT_WINDOW_DAYS,
): boolean {
  const accountOrders = ordersForAccountName(orders, accountName);
  if (accountOrders.length === 0) return false;

  const asOfDate = parseISO(asOf.slice(0, 10));
  const windowStart = subDays(asOfDate, windowDays);

  const hasRecentOrder = accountOrders.some((order) => {
    const date = parseISO(order.date.slice(0, 10));
    return date >= windowStart && date <= asOfDate;
  });
  if (!hasRecentOrder) return false;

  return !accountOrders.some((order) => parseISO(order.date.slice(0, 10)) < windowStart);
}

export function listNewAccountsWithRecentOrders(
  orders: Order[],
  asOf: string,
  windowDays = NEW_ACCOUNT_WINDOW_DAYS,
): NewAccountSummary[] {
  const asOfDate = parseISO(asOf.slice(0, 10));
  const windowStart = subDays(asOfDate, windowDays);
  const accountNames = [...new Set(orders.map((order) => order.accountName))];
  const rows: NewAccountSummary[] = [];

  for (const accountName of accountNames) {
    if (!isNewAccountWithRecentOrder(orders, accountName, asOf, windowDays)) continue;

    const accountOrders = ordersForAccountName(orders, accountName);
    const calendarDates = uniqueOrderDates(accountOrders);
    const recentOrders = accountOrders.filter((order) => {
      const date = parseISO(order.date.slice(0, 10));
      return date >= windowStart && date <= asOfDate;
    });

    rows.push({
      accountName,
      accountId: accountOrders[0]?.accountId ?? "",
      firstOrderDate: calendarDates[0] ?? accountOrders.at(-1)!.date,
      lastOrderDate: calendarDates.at(-1) ?? accountOrders[0]!.date,
      orderEventCount: orderEventCountFromOrders(accountOrders),
      recentVolume: recentOrders.reduce((sum, order) => sum + lineVolume(order), 0),
      totalVolume: accountOrders.reduce((sum, order) => sum + lineVolume(order), 0),
    });
  }

  return rows.sort(
    (a, b) =>
      b.lastOrderDate.localeCompare(a.lastOrderDate) ||
      a.accountName.localeCompare(b.accountName),
  );
}

type AccountOrderActivity = {
  summary: NewAccountSummary;
  hasRecent: boolean;
  hasPriorWindow: boolean;
  hasOlder: boolean;
};

function accountOrderActivity(
  orders: Order[],
  asOf: string,
  windowDays = NEW_ACCOUNT_WINDOW_DAYS,
): AccountOrderActivity[] {
  const asOfDate = parseISO(asOf.slice(0, 10));
  const windowStart = subDays(asOfDate, windowDays);
  const priorStart = subDays(windowStart, windowDays);
  const byAccount = new Map<string, { name: string; orders: Order[] }>();

  for (const order of orders) {
    const key = normalizeName(order.accountName);
    const existing = byAccount.get(key);
    if (existing) existing.orders.push(order);
    else byAccount.set(key, { name: order.accountName, orders: [order] });
  }

  const rows: AccountOrderActivity[] = [];
  for (const { name, orders: accountOrders } of byAccount.values()) {
    let hasRecent = false;
    let hasPriorWindow = false;
    let hasOlder = false;
    for (const order of accountOrders) {
      const date = parseISO(order.date.slice(0, 10));
      if (date > asOfDate) continue;
      if (date >= windowStart) hasRecent = true;
      else if (date >= priorStart) hasPriorWindow = true;
      else hasOlder = true;
    }

    const calendarDates = uniqueOrderDates(accountOrders);
    const recentOrders = accountOrders.filter((order) => {
      const date = parseISO(order.date.slice(0, 10));
      return date >= windowStart && date <= asOfDate;
    });

    rows.push({
      hasRecent,
      hasPriorWindow,
      hasOlder,
      summary: {
        accountName: name,
        accountId: accountOrders[0]?.accountId ?? "",
        firstOrderDate: calendarDates[0] ?? accountOrders[0]!.date,
        lastOrderDate: calendarDates.at(-1) ?? accountOrders[0]!.date,
        orderEventCount: orderEventCountFromOrders(accountOrders),
        recentVolume: recentOrders.reduce((sum, order) => sum + lineVolume(order), 0),
        totalVolume: accountOrders.reduce((sum, order) => sum + lineVolume(order), 0),
      },
    });
  }

  return rows;
}

function sortAccountSummaries(rows: NewAccountSummary[]): NewAccountSummary[] {
  return rows.sort(
    (a, b) =>
      b.lastOrderDate.localeCompare(a.lastOrderDate) ||
      a.accountName.localeCompare(b.accountName),
  );
}

/** Ordered in the last window and also had at least one order before it. */
export function listRetainedAccounts(
  orders: Order[],
  asOf: string,
  windowDays = NEW_ACCOUNT_WINDOW_DAYS,
): NewAccountSummary[] {
  return sortAccountSummaries(
    accountOrderActivity(orders, asOf, windowDays)
      .filter((account) => account.hasRecent && (account.hasPriorWindow || account.hasOlder))
      .map((account) => account.summary),
  );
}

/**
 * Ordered in the last window, skipped the prior window, and had ordered before that.
 * New accounts are left in the new-account count.
 */
export function listReturningCustomers(
  orders: Order[],
  asOf: string,
  windowDays = NEW_ACCOUNT_WINDOW_DAYS,
): NewAccountSummary[] {
  return sortAccountSummaries(
    accountOrderActivity(orders, asOf, windowDays)
      .filter((account) => account.hasRecent && !account.hasPriorWindow && account.hasOlder)
      .map((account) => account.summary),
  );
}

function historicalPeriodDaysBeforeRecent(
  orders: Order[],
  asOfDate: Date,
  periodWindowDays: number,
): number | null {
  const recentStart = subDays(asOfDate, periodWindowDays);
  const historicalOrders = orders.filter(
    (order) => parseISO(order.date) < recentStart,
  );
  if (historicalOrders.length === 0) return null;
  const firstDate = historicalOrders.reduce(
    (min, order) => (order.date < min ? order.date : min),
    historicalOrders[0]!.date,
  );
  return differenceInCalendarDays(recentStart, parseISO(firstDate.slice(0, 10)));
}

function classifyProductChange(
  recentVolume: number,
  priorVolume: number,
  historicalVolume: number,
): ProductChangeStatus {
  if (historicalVolume <= 0 && recentVolume > 0) return "new";
  if (recentVolume <= 0 && historicalVolume > 0) return "dropped";
  const delta = volumeDeltaPct(recentVolume, priorVolume);
  if (delta === null) return "stable";
  if (delta >= 15) return "increasing";
  if (delta <= -15) return "decreasing";
  return "stable";
}

export const PRODUCT_CHANGE_PERIOD_OPTIONS = [30, 60, 90] as const;
export type ProductChangePeriodDays = (typeof PRODUCT_CHANGE_PERIOD_OPTIONS)[number];

export type AccountProductChangeAnalysis = {
  productChanges: AccountProductChange[];
  newProducts: string[];
  droppedProducts: string[];
  periodDays: {
    recent: number;
    prior: number;
    before: number | null;
  };
};

function sortProductChanges(
  productChanges: AccountProductChange[],
): AccountProductChange[] {
  return [...productChanges].sort((a, b) => {
    const rank = (status: ProductChangeStatus) => {
      switch (status) {
        case "dropped":
          return 0;
        case "decreasing":
          return 1;
        case "new":
          return 2;
        case "increasing":
          return 3;
        case "stable":
          return 4;
      }
    };
    const byRank = rank(a.status) - rank(b.status);
    if (byRank !== 0) return byRank;
    if (a.status === "stable" && b.status === "stable") {
      return a.product.localeCompare(b.product);
    }
    return b.recentVolume - a.recentVolume;
  });
}

/** Recent vs prior vs historical product mix for one account and window size. */
export function buildAccountProductChanges(
  accountOrders: Order[],
  asOf: string,
  periodWindowDays: number,
): AccountProductChangeAnalysis {
  const asOfDate = parseISO(asOf);
  const recentStart = subDays(asOfDate, periodWindowDays);
  const priorStart = subDays(asOfDate, periodWindowDays * 2);

  const recentByProduct = new Map<string, number>();
  const priorByProduct = new Map<string, number>();
  const historicalByProduct = new Map<string, number>();

  for (const order of accountOrders) {
    const date = parseISO(order.date);
    const product = productLabel(order);
    const volume = lineVolume(order);
    if (date >= recentStart && date <= asOfDate) {
      recentByProduct.set(product, (recentByProduct.get(product) ?? 0) + volume);
    } else if (date >= priorStart && date < recentStart) {
      priorByProduct.set(product, (priorByProduct.get(product) ?? 0) + volume);
    } else if (date < recentStart) {
      historicalByProduct.set(
        product,
        (historicalByProduct.get(product) ?? 0) + volume,
      );
    }
  }

  const allProducts = [
    ...new Set(accountOrders.map((order) => productLabel(order))),
  ].sort();

  const productChanges = sortProductChanges(
    allProducts.map((product) => {
      const recentVolume = recentByProduct.get(product) ?? 0;
      const priorVolume = priorByProduct.get(product) ?? 0;
      const historicalVolume = historicalByProduct.get(product) ?? 0;
      const productOrders = accountOrders.filter(
        (order) => productLabel(order) === product,
      );
      return {
        product,
        status: classifyProductChange(recentVolume, priorVolume, historicalVolume),
        recentVolume,
        priorVolume,
        historicalVolume,
        volumeDeltaPct: volumeDeltaPct(recentVolume, priorVolume),
        lastOrdered: productOrders[0]?.date ?? null,
      };
    }),
  );

  return {
    productChanges,
    newProducts: productChanges
      .filter((row) => row.status === "new")
      .map((row) => row.product),
    droppedProducts: productChanges
      .filter((row) => row.status === "dropped")
      .map((row) => row.product),
    periodDays: {
      recent: periodWindowDays,
      prior: periodWindowDays,
      before: historicalPeriodDaysBeforeRecent(
        accountOrders,
        asOfDate,
        periodWindowDays,
      ),
    },
  };
}

function buildMonthlyVolumeForAccount(accountOrders: Order[]): AccountMonthlyVolume[] {
  const monthMap = new Map<string, AccountMonthlyVolume>();
  for (const order of accountOrders) {
    const month = order.date.slice(0, 7);
    const label = format(parseISO(`${month}-01`), "MMM yyyy");
    const volume = lineVolume(order);
    const product = productLabel(order);
    const existing = monthMap.get(month) ?? {
      month,
      label,
      volume: 0,
      orderEventCount: 0,
      lineCount: 0,
      products: [],
    };
    existing.volume += volume;
    existing.lineCount += 1;
    if (!existing.products.includes(product)) existing.products.push(product);
    monthMap.set(month, existing);
  }

  for (const row of monthMap.values()) {
    const monthOrders = accountOrders.filter((order) => order.date.startsWith(row.month));
    row.orderEventCount = uniqueOrderWeekAnchorDates(monthOrders).length;
    row.products.sort();
  }

  return [...monthMap.values()].sort((a, b) => b.month.localeCompare(a.month));
}

type AccountTrackingContext = {
  frequency?: RestaurantOrderFrequency;
  products?: RestaurantProductMix[];
};

function buildFrequencyForAccount(
  accountOrders: Order[],
  accountName: string,
  asOf: string,
): RestaurantOrderFrequency {
  const asOfDate = parseISO(asOf);
  const calendarDates = uniqueOrderDates(accountOrders);
  const weekAnchors = uniqueOrderWeekAnchorDates(accountOrders);
  const firstOrderDate = calendarDates[0] ?? accountOrders.at(-1)!.date;
  const lastOrderDate = calendarDates.at(-1) ?? accountOrders[0]!.date;
  const productsOrdered = [
    ...new Set(accountOrders.map((order) => productLabel(order))),
  ].sort();
  return {
    accountName,
    orderEventCount: weekAnchors.length,
    lineCount: accountOrders.length,
    firstOrderDate,
    lastOrderDate,
    daysSinceLastOrder: differenceInCalendarDays(asOfDate, parseISO(lastOrderDate)),
    avgDaysBetweenOrders:
      weekAnchors.length <= 1
        ? null
        : typicalFrequencyForOrders(
            accountOrders.map((order) => order.date),
            asOf,
          ),
    ordersPerMonth: ordersPerMonth(
      accountOrders.map((order) => order.date),
      asOf,
    ),
    productsOrdered,
    productCount: productsOrdered.length,
    totalVolume: accountOrders.reduce((sum, order) => sum + lineVolume(order), 0),
  };
}

function buildProductCadenceForAccount(
  accountOrders: Order[],
  asOf: string,
): AccountProductCadence[] {
  const asOfDate = parseISO(asOf);
  const products = [...new Set(accountOrders.map((order) => productLabel(order)))];

  return products
    .map((product) => {
      const productOrders = accountOrders.filter(
        (order) => productLabel(order) === product,
      );
      const calendarDates = uniqueOrderDates(productOrders);
      const weekAnchors = uniqueOrderWeekAnchorDates(productOrders);
      const firstOrdered = calendarDates[0] ?? productOrders.at(-1)!.date;
      const lastOrdered = calendarDates.at(-1) ?? productOrders[0]!.date;
      const daysSinceLastOrder = differenceInCalendarDays(
        asOfDate,
        parseISO(lastOrdered.slice(0, 10)),
      );
      const avgDaysBetweenOrders =
        weekAnchors.length <= 1
          ? null
          : typicalFrequencyForOrders(
              productOrders.map((order) => order.date),
              asOf,
            );

      return {
        product,
        firstOrdered,
        lastOrdered,
        orderEventCount: weekAnchors.length,
        avgDaysBetweenOrders,
        daysSinceLastOrder,
        daysPastTypical: daysPastTypicalFrequency(
          daysSinceLastOrder,
          avgDaysBetweenOrders,
        ),
        risk: riskFromOrderCadence({
          daysSinceOrder: daysSinceLastOrder,
          intervalDays: avgDaysBetweenOrders,
        }),
      };
    })
    .sort((a, b) => {
      const byRisk = productCadenceRiskRank(a.risk) - productCadenceRiskRank(b.risk);
      if (byRisk !== 0) return byRisk;
      const aPast = a.daysPastTypical ?? Number.NEGATIVE_INFINITY;
      const bPast = b.daysPastTypical ?? Number.NEGATIVE_INFINITY;
      if (bPast !== aPast) return bPast - aPast;
      return a.product.localeCompare(b.product);
    });
}

function buildProductsForAccount(
  accountOrders: Order[],
  accountName: string,
): RestaurantProductMix[] {
  const mixMap = new Map<string, RestaurantProductMix>();
  for (const order of accountOrders) {
    const product = productLabel(order);
    const key = `${accountName}::${product}`;
    const volume = lineVolume(order);
    const existing = mixMap.get(key) ?? {
      accountName,
      product,
      volume: 0,
      lineCount: 0,
      orderEventCount: 0,
      firstOrdered: order.date,
      lastOrdered: order.date,
      shareOfRestaurantVolumePct: 0,
    };
    existing.volume += volume;
    existing.lineCount += 1;
    if (order.date < existing.firstOrdered) existing.firstOrdered = order.date;
    if (order.date > existing.lastOrdered) existing.lastOrdered = order.date;
    mixMap.set(key, existing);
  }

  const totalVolume = accountOrders.reduce((sum, order) => sum + lineVolume(order), 0);
  for (const row of mixMap.values()) {
    row.shareOfRestaurantVolumePct =
      totalVolume > 0 ? (row.volume / totalVolume) * 100 : 0;
    const productOrders = accountOrders.filter(
      (order) => productLabel(order) === row.product,
    );
    row.orderEventCount = uniqueOrderWeekAnchorDates(productOrders).length;
  }

  return [...mixMap.values()].sort(
    (a, b) => b.volume - a.volume || b.lineCount - a.lineCount,
  );
}

export function buildAccountOrderTracking(
  orders: Order[],
  accountName: string,
  asOfOverride?: string,
  context?: AccountTrackingContext,
): AccountOrderTracking | null {
  const asOf = asOfOverride ?? new Date().toISOString().slice(0, 10);
  const asOfDate = parseISO(asOf);
  let accountOrders = analyticsOrders(orders);
  if (accountOrders.some((order) => order.accountName !== accountName)) {
    accountOrders = accountOrders.filter((order) => order.accountName === accountName);
  }
  accountOrders.sort((a, b) => b.date.localeCompare(a.date));

  if (accountOrders.length === 0) return null;

  const frequency =
    context?.frequency ?? buildFrequencyForAccount(accountOrders, accountName, asOf);
  const products = context?.products ?? buildProductsForAccount(accountOrders, accountName);

  const recentStart = subDays(asOfDate, PERIOD_WINDOW_DAYS);
  const priorStart = subDays(asOfDate, PERIOD_WINDOW_DAYS * 2);
  const recentOrders = accountOrders.filter((order) => {
    const date = parseISO(order.date);
    return date >= recentStart && date <= asOfDate;
  });
  const priorOrders = accountOrders.filter((order) => {
    const date = parseISO(order.date);
    return date >= priorStart && date < recentStart;
  });
  const historicalOrders = accountOrders.filter((order) => {
    const date = parseISO(order.date);
    return date < recentStart;
  });

  const volumeRecent90 = recentOrders.reduce((sum, order) => sum + lineVolume(order), 0);
  const volumePrior90 = priorOrders.reduce((sum, order) => sum + lineVolume(order), 0);
  const volumeBeforeRecent90 = historicalOrders.reduce(
    (sum, order) => sum + lineVolume(order),
    0,
  );
  const volumeAllTime = frequency.totalVolume;

  const {
    productChanges,
    newProducts,
    droppedProducts,
    periodDays,
  } = buildAccountProductChanges(accountOrders, asOf, PERIOD_WINDOW_DAYS);

  return {
    accountName,
    frequency,
    monthlyVolume: buildMonthlyVolumeForAccount(accountOrders),
    volumeRecent90,
    volumePrior90,
    volumeBeforeRecent90,
    volumeAllTime,
    volumeDeltaPct: volumeDeltaPct(volumeRecent90, volumePrior90),
    frequencyDeltaDays: frequencyDeltaFromLatestOrderGap(accountOrders, asOf),
    productChanges,
    productCadence: buildProductCadenceForAccount(accountOrders, asOf),
    newProducts,
    droppedProducts,
    products,
    orders: accountOrders,
    analysisAsOf: asOf,
    periodDays,
  };
}

function sortAccountTracking(rows: AccountOrderTracking[]): AccountOrderTracking[] {
  return [...rows].sort((a, b) => a.accountName.localeCompare(b.accountName));
}

export function buildOrderAnalytics(
  orders: Order[],
  asOfOverride?: string,
): OrderAnalyticsSnapshot {
  const asOf = asOfOverride ?? new Date().toISOString().slice(0, 10);
  const asOfDate = parseISO(asOf);
  const sorted = [...analyticsOrders(orders)].sort((a, b) => b.date.localeCompare(a.date));

  const dates = sorted.map((order) => order.date).filter(Boolean);
  const dateRange = {
    start: dates.at(-1) ?? null,
    end: dates.at(0) ?? null,
  };

  const totalVolume = sorted.reduce((sum, order) => sum + lineVolume(order), 0);

  const productMap = new Map<string, ProductVolumeRow>();
  for (const order of sorted) {
    const product = productLabel(order);
    const volume = lineVolume(order);
    const existing = productMap.get(product) ?? {
      product,
      volume: 0,
      orderCount: 0,
      sharePct: 0,
    };
    existing.volume += volume;
    existing.orderCount += 1;
    productMap.set(product, existing);
  }

  const byProduct = [...productMap.values()]
    .map((row) => ({
      ...row,
      sharePct: totalVolume > 0 ? (row.volume / totalVolume) * 100 : 0,
    }))
    .sort((a, b) => b.volume - a.volume || b.orderCount - a.orderCount);

  const restaurantMap = new Map<string, RestaurantVolumeRow>();
  for (const order of sorted) {
    const accountName = order.accountName;
    const volume = lineVolume(order);
    const existing = restaurantMap.get(accountName) ?? {
      accountName,
      volume: 0,
      orderCount: 0,
      lastOrderDate: order.date,
    };
    existing.volume += volume;
    existing.orderCount += 1;
    if (order.date > existing.lastOrderDate) {
      existing.lastOrderDate = order.date;
    }
    restaurantMap.set(accountName, existing);
  }

  const byRestaurant = [...restaurantMap.values()].sort(
    (a, b) => b.volume - a.volume || b.orderCount - a.orderCount,
  );

  const monthMap = new Map<string, MonthlyVolumeRow>();
  for (const order of sorted) {
    const month = order.date.slice(0, 7);
    const label = format(parseISO(`${month}-01`), "MMM yyyy");
    const volume = lineVolume(order);
    const existing = monthMap.get(month) ?? {
      month,
      label,
      volume: 0,
      orderCount: 0,
    };
    existing.volume += volume;
    existing.orderCount += 1;
    monthMap.set(month, existing);
  }

  const byMonth = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const ordersByRestaurant = new Map<string, Order[]>();
  for (const order of sorted) {
    const bucket = ordersByRestaurant.get(order.accountName) ?? [];
    bucket.push(order);
    ordersByRestaurant.set(order.accountName, bucket);
  }

  const byFrequency: RestaurantOrderFrequency[] = [...ordersByRestaurant.entries()]
    .map(([accountName, accountOrders]) => {
      const calendarDates = uniqueOrderDates(accountOrders);
      const weekAnchors = uniqueOrderWeekAnchorDates(accountOrders);
      const firstOrderDate = calendarDates[0] ?? accountOrders.at(-1)!.date;
      const lastOrderDate = calendarDates.at(-1) ?? accountOrders[0]!.date;
      const productsOrdered = [
        ...new Set(accountOrders.map((order) => productLabel(order))),
      ].sort();
      return {
        accountName,
        orderEventCount: weekAnchors.length,
        lineCount: accountOrders.length,
        firstOrderDate,
        lastOrderDate,
        daysSinceLastOrder: differenceInCalendarDays(asOfDate, parseISO(lastOrderDate)),
        avgDaysBetweenOrders:
          weekAnchors.length <= 1
            ? null
            : typicalFrequencyForOrders(
                accountOrders.map((order) => order.date),
                asOf,
              ),
        ordersPerMonth: ordersPerMonth(
          accountOrders.map((order) => order.date),
          asOf,
        ),
        productsOrdered,
        productCount: productsOrdered.length,
        totalVolume: accountOrders.reduce((sum, order) => sum + lineVolume(order), 0),
      };
    })
    .sort((a, b) => {
      const freqA = a.avgDaysBetweenOrders;
      const freqB = b.avgDaysBetweenOrders;
      if (freqA === null && freqB === null) {
        return a.accountName.localeCompare(b.accountName);
      }
      if (freqA === null) return 1;
      if (freqB === null) return -1;
      return freqA - freqB || a.accountName.localeCompare(b.accountName);
    });

  const ordersByProduct = new Map<string, Order[]>();
  for (const order of sorted) {
    const product = productLabel(order);
    const bucket = ordersByProduct.get(product) ?? [];
    bucket.push(order);
    ordersByProduct.set(product, bucket);
  }

  const productCatalog: ProductPurchaseTracking[] = [...ordersByProduct.entries()]
    .map(([product, productOrders]) => {
      const calendarDates = uniqueOrderDates(productOrders);
      const weekAnchors = uniqueOrderWeekAnchorDates(productOrders);
      const restaurants = [
        ...new Set(productOrders.map((order) => order.accountName)),
      ].sort();
      const volume = productOrders.reduce((sum, order) => sum + lineVolume(order), 0);
      return {
        product,
        volume,
        lineCount: productOrders.length,
        orderEventCount: weekAnchors.length,
        restaurantCount: restaurants.length,
        restaurants,
        firstOrdered: calendarDates[0] ?? productOrders.at(-1)!.date,
        lastOrdered: calendarDates.at(-1) ?? productOrders[0]!.date,
        avgDaysBetweenPurchases:
          weekAnchors.length <= 1
            ? null
            : typicalFrequencyForOrders(
                productOrders.map((order) => order.date),
                asOf,
              ),
        avgVolumePerLine: productOrders.length > 0 ? volume / productOrders.length : 0,
      };
    })
    .sort((a, b) => b.volume - a.volume || b.lineCount - a.lineCount);

  const mixMap = new Map<string, RestaurantProductMix>();
  const ordersByAccountProduct = new Map<string, Order[]>();
  for (const order of sorted) {
    const product = productLabel(order);
    const key = `${order.accountName}::${product}`;
    const volume = lineVolume(order);
    const existing = mixMap.get(key) ?? {
      accountName: order.accountName,
      product,
      volume: 0,
      lineCount: 0,
      orderEventCount: 0,
      firstOrdered: order.date,
      lastOrdered: order.date,
      shareOfRestaurantVolumePct: 0,
    };
    existing.volume += volume;
    existing.lineCount += 1;
    if (order.date < existing.firstOrdered) existing.firstOrdered = order.date;
    if (order.date > existing.lastOrdered) existing.lastOrdered = order.date;
    mixMap.set(key, existing);

    const productBucket = ordersByAccountProduct.get(key) ?? [];
    productBucket.push(order);
    ordersByAccountProduct.set(key, productBucket);
  }

  const volumeByRestaurant = new Map(
    byFrequency.map((row) => [row.accountName, row.totalVolume] as const),
  );

  for (const row of mixMap.values()) {
    const restaurantVolume = volumeByRestaurant.get(row.accountName) ?? 0;
    row.shareOfRestaurantVolumePct =
      restaurantVolume > 0 ? (row.volume / restaurantVolume) * 100 : 0;
    const productOrders = ordersByAccountProduct.get(
      `${row.accountName}::${row.product}`,
    );
    row.orderEventCount = uniqueOrderWeekAnchorDates(productOrders ?? []).length;
  }

  const byRestaurantProduct = [...mixMap.values()].sort(
    (a, b) =>
      a.accountName.localeCompare(b.accountName) ||
      b.volume - a.volume ||
      b.lineCount - a.lineCount,
  );

  const restaurants = new Set(sorted.map((order) => order.accountName));
  const products = new Set(sorted.map((order) => productLabel(order)));
  const orderEvents = new Set(
    sorted.map((order) => `${order.accountName}::${orderWeekKey(order.date)}`),
  ).size;

  const productsByRestaurant = new Map<string, RestaurantProductMix[]>();
  for (const row of byRestaurantProduct) {
    const list = productsByRestaurant.get(row.accountName) ?? [];
    list.push(row);
    productsByRestaurant.set(row.accountName, list);
  }

  const byAccount = sortAccountTracking(
    byFrequency
      .map((row) =>
        buildAccountOrderTracking(
          ordersByRestaurant.get(row.accountName) ?? [],
          row.accountName,
          asOf,
          {
            frequency: row,
            products: productsByRestaurant.get(row.accountName) ?? [],
          },
        ),
      )
      .filter((row): row is AccountOrderTracking => row !== null),
  );

  return {
    asOf,
    dateRange,
    totals: {
      orderLines: sorted.length,
      totalVolume,
      restaurantCount: restaurants.size,
      productCount: products.size,
      orderEvents,
    },
    byProduct,
    byRestaurant,
    byMonth,
    byFrequency,
    productCatalog,
    byRestaurantProduct,
    byAccount,
    orders: sorted,
  };
}

export function buildAllAccountTracking(
  orders: Order[],
  asOfOverride?: string,
): AccountOrderTracking[] {
  return buildOrderAnalytics(orders, asOfOverride).byAccount;
}

export function getRestaurantTracking(
  analytics: OrderAnalyticsSnapshot,
  accountName: string,
): AccountOrderTracking | null {
  return analytics.byAccount.find((row) => row.accountName === accountName) ?? null;
}

export function getProductTracking(
  analytics: OrderAnalyticsSnapshot,
  product: string,
): {
  catalog: ProductPurchaseTracking | null;
  orders: Order[];
} {
  return {
    catalog: analytics.productCatalog.find((row) => row.product === product) ?? null,
    orders: analytics.orders.filter((order) => productLabel(order) === product),
  };
}
