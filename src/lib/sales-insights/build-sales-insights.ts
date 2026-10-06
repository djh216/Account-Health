import { addDays, differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { normalizeName } from "@/lib/format";
import { buildVisitIndex, visitsForAccount, type VisitIndex } from "@/lib/visit-index";
import { buildOrderIndex, ordersForAccount, type OrderIndex } from "@/lib/order-index";
import { RISK_AT_RISK_MIN_DAYS, daysPastTypicalFrequency } from "@/lib/order-cadence";
import { territoryTierLabel } from "@/lib/territory-value";
import type { AccountFrequencyAlert } from "@/lib/frequency-alerts";
import type { ProductSlowingAlert } from "@/lib/product-trends";
import type { AccountHealth, Order, PortfolioState, Visit } from "@/lib/types";
import type {
  DueToReorderRow,
  MomentumRow,
  SalesInsightsBundle,
  SkuBreadthRow,
  VisitConversionRepRow,
  VisitCoverageAccountRow,
  VisitCoverageRepSummary,
  VolumeDimensionRow,
  WeeklyBriefingSummary,
  WinBackSkuRow,
} from "./types";

const DUE_WINDOW_DAYS = 14;
const VISIT_CONVERSION_DAYS = 7;
const WIN_BACK_GAP_DAYS = 60;

export type BuildSalesInsightsInput = {
  repFilter: string;
  asOf: string;
  /** Rep-filtered portfolio (orders, visits, accounts for the active rep scope). */
  portfolioState: PortfolioState;
  enrichedAccounts: AccountHealth[];
  frequencyAlerts: AccountFrequencyAlert[];
  productAlerts: ProductSlowingAlert[];
  newAccountsCount: number;
  retainedCount: number;
  returningCount: number;
  highChurnCount: number;
};

function toDay(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

function uniqueProductsInWindow(orders: Order[], start: string, end: string): Set<string> {
  const set = new Set<string>();
  for (const order of orders) {
    if (order.date >= start && order.date <= end && order.product?.trim()) {
      set.add(order.product.trim());
    }
  }
  return set;
}

function volumeInWindow(orders: Order[], start: string, end: string): number {
  let total = 0;
  for (const order of orders) {
    if (order.date >= start && order.date <= end) {
      total += order.cases;
    }
  }
  return total;
}

function buildDueToReorder(accounts: AccountHealth[], asOf: string): DueToReorderRow[] {
  const asOfDate = toDay(asOf);
  const rows: DueToReorderRow[] = [];

  for (const item of accounts) {
    if (!item.expectedOrderDate || item.daysSinceOrder === null) continue;
    const interval = item.typicalIntervalDays ?? 28;
    const daysPast = daysPastTypicalFrequency(item.daysSinceOrder, interval);
    if (daysPast !== null && daysPast >= RISK_AT_RISK_MIN_DAYS) continue;

    const expected = toDay(item.expectedOrderDate);
    const daysUntil = differenceInCalendarDays(expected, asOfDate);
    if (daysUntil < 0 || daysUntil > DUE_WINDOW_DAYS) continue;

    rows.push({
      accountId: item.account.id,
      accountName: item.account.name,
      salesRep: item.account.salesRep,
      territoryTier: item.territoryTier,
      expectedOrderDate: item.expectedOrderDate,
      daysUntilExpected: daysUntil,
      typicalIntervalDays: interval,
      daysSinceOrder: item.daysSinceOrder,
      score: item.score,
      risk: item.risk,
    });
  }

  return rows.sort((a, b) => a.daysUntilExpected - b.daysUntilExpected);
}

function buildVisitCoverage(
  accounts: AccountHealth[],
  asOf: string,
): {
  accountRows: VisitCoverageAccountRow[];
  repSummaries: VisitCoverageRepSummary[];
} {
  const asOfDate = toDay(asOf);
  const accountRows: VisitCoverageAccountRow[] = [];

  for (const item of accounts) {
    const overdue = Boolean(item.visitCadenceOverdue);
    const noVisit60 =
      item.daysSinceVisit === null || item.daysSinceVisit > 60;
    if (!overdue && !noVisit60) continue;

    accountRows.push({
      accountId: item.account.id,
      accountName: item.account.name,
      salesRep: item.account.salesRep,
      territoryTier: item.territoryTier,
      daysSinceVisit: item.daysSinceVisit,
      visitCadenceOverdue: overdue,
      targetMaxDays: item.visitCadenceTargetMaxDays,
      lastVisitDate: item.lastVisitDate,
    });
  }

  accountRows.sort((a, b) => (b.daysSinceVisit ?? 999) - (a.daysSinceVisit ?? 999));

  const repMap = new Map<string, VisitCoverageRepSummary>();
  for (const item of accounts) {
    const rep = item.account.salesRep?.trim() || "Unassigned";
    const entry = repMap.get(rep) ?? {
      repName: rep,
      accountCount: 0,
      visitsLast30Days: 0,
      visitOverdueCount: 0,
      noVisit60DaysCount: 0,
      avgDaysSinceVisit: null,
    };
    entry.accountCount += 1;
    if (item.visitCadenceOverdue) entry.visitOverdueCount += 1;
    if (item.daysSinceVisit === null || item.daysSinceVisit > 60) {
      entry.noVisit60DaysCount += 1;
    }
    repMap.set(rep, entry);
  }

  return { accountRows, repSummaries: [...repMap.values()] };
}

function enrichVisitCoverageReps(
  accounts: AccountHealth[],
  visits: Visit[],
  asOf: string,
  summaries: VisitCoverageRepSummary[],
  repFilter: string,
): VisitCoverageRepSummary[] {
  const asOfDate = toDay(asOf);
  const start30 = subDays(asOfDate, 30).toISOString().slice(0, 10);

  const visitsByRep = new Map<string, number>();
  for (const visit of visits) {
    if (visit.date < start30 || visit.date > asOf) continue;
    const rep = visit.salesRep?.trim() || "Unassigned";
    if (repFilter !== "all" && rep !== repFilter) continue;
    visitsByRep.set(rep, (visitsByRep.get(rep) ?? 0) + 1);
  }

  const daysSinceByRep = new Map<string, number[]>();
  for (const item of accounts) {
    const rep = item.account.salesRep?.trim() || "Unassigned";
    if (item.daysSinceVisit !== null) {
      const list = daysSinceByRep.get(rep) ?? [];
      list.push(item.daysSinceVisit);
      daysSinceByRep.set(rep, list);
    }
  }

  const enriched = summaries.map((row) => {
    const daysList = daysSinceByRep.get(row.repName) ?? [];
    const avg =
      daysList.length > 0
        ? Math.round(daysList.reduce((s, d) => s + d, 0) / daysList.length)
        : null;
    return {
      ...row,
      visitsLast30Days: visitsByRep.get(row.repName) ?? 0,
      avgDaysSinceVisit: avg,
    };
  });

  if (repFilter === "all") return enriched;
  return enriched.filter((row) => row.repName === repFilter);
}

function visitConvertedWithinDays(
  visitDate: string,
  orders: Order[],
  windowDays: number,
): boolean {
  const visitDayStr = visitDate.slice(0, 10);
  const visitDay = toDay(visitDayStr);
  const windowEndStr = addDays(visitDay, windowDays).toISOString().slice(0, 10);

  for (const order of orders) {
    if (order.date < visitDayStr) continue;
    if (order.date > windowEndStr) break;
    return true;
  }
  return false;
}

function buildVisitConversion(
  visitIndex: VisitIndex,
  orderIndex: OrderIndex,
  accounts: AccountHealth[],
  asOf: string,
  repFilter: string,
): VisitConversionRepRow[] {
  const asOfDate = toDay(asOf);
  const start90 = subDays(asOfDate, 90).toISOString().slice(0, 10);

  const byRep = new Map<
    string,
    { visits: number; converted: number; orders: number }
  >();

  const ordersByAccount = new Map<string, Order[]>();
  for (const item of accounts) {
    const visits = visitsForAccount(visitIndex, item.account).filter(
      (v) => v.date >= start90 && v.date <= asOf,
    );
    if (visits.length === 0) continue;
    const accountKey = item.account.id || normalizeName(item.account.name);
    let orders = ordersByAccount.get(accountKey);
    if (!orders) {
      orders = ordersForAccount(orderIndex, item.account);
      ordersByAccount.set(accountKey, orders);
    }
    for (const visit of visits) {
      const rep = visit.salesRep?.trim() || item.account.salesRep?.trim() || "Unassigned";
      if (repFilter !== "all" && rep !== repFilter) continue;
      const entry = byRep.get(rep) ?? { visits: 0, converted: 0, orders: 0 };
      entry.visits += 1;
      if (visitConvertedWithinDays(visit.date, orders, VISIT_CONVERSION_DAYS)) {
        entry.converted += 1;
        entry.orders += 1;
      }
      byRep.set(rep, entry);
    }
  }

  let rows = [...byRep.entries()].map(([repName, stats]) => ({
    repName,
    visitCount90: stats.visits,
    convertedVisits90: stats.converted,
    strikeRatePct:
      stats.visits > 0 ? Math.round((stats.converted / stats.visits) * 100) : 0,
    ordersFollowingVisits90: stats.orders,
  }));

  if (repFilter !== "all") {
    rows = rows.filter((row) => row.repName === repFilter);
    if (rows.length === 0 && byRep.size === 0) {
      rows = [
        {
          repName: repFilter,
          visitCount90: 0,
          convertedVisits90: 0,
          strikeRatePct: 0,
          ordersFollowingVisits90: 0,
        },
      ];
    }
  }

  return rows.sort((a, b) => b.strikeRatePct - a.strikeRatePct);
}

function buildSkuBreadth(
  accounts: AccountHealth[],
  orderIndex: OrderIndex,
  asOf: string,
): SkuBreadthRow[] {
  const asOfDate = toDay(asOf);
  const recentStart = subDays(asOfDate, 90).toISOString().slice(0, 10);
  const priorStart = subDays(asOfDate, 180).toISOString().slice(0, 10);
  const priorEnd = subDays(asOfDate, 91).toISOString().slice(0, 10);

  const rows: SkuBreadthRow[] = [];
  for (const item of accounts) {
    const accountOrders = ordersForAccount(orderIndex, item.account);
    const recent = uniqueProductsInWindow(accountOrders, recentStart, asOf);
    const prior = uniqueProductsInWindow(accountOrders, priorStart, priorEnd);
    const delta = recent.size - prior.size;
    if (recent.size === 0 && prior.size === 0) continue;

    rows.push({
      accountId: item.account.id,
      accountName: item.account.name,
      salesRep: item.account.salesRep,
      skuCountRecent90: recent.size,
      skuCountPrior90: prior.size,
      skuDelta: delta,
      volume90: item.volume90,
      territoryTier: item.territoryTier,
    });
  }

  return rows.sort((a, b) => a.skuDelta - b.skuDelta);
}

function buildWinBackSkus(
  accounts: AccountHealth[],
  orders: Order[],
  asOf: string,
): WinBackSkuRow[] {
  const asOfDate = toDay(asOf);
  const recentStart = subDays(asOfDate, 90).toISOString().slice(0, 10);
  const priorStart = subDays(asOfDate, 180).toISOString().slice(0, 10);
  const priorEnd = subDays(asOfDate, 91).toISOString().slice(0, 10);
  const scopedAccountNames = new Set(
    accounts.map((a) => normalizeName(a.account.name)),
  );
  const repByNormName = new Map<string, string | undefined>();
  for (const item of accounts) {
    repByNormName.set(normalizeName(item.account.name), item.account.salesRep);
  }

  const byKey = new Map<
    string,
    { accountName: string; product: string; salesRep?: string; priorVol: number; lastDate: string | null }
  >();
  const recentVolByKey = new Map<string, number>();

  for (const order of orders) {
    if (!order.product?.trim()) continue;
    const normName = normalizeName(order.accountName);
    if (!scopedAccountNames.has(normName)) continue;
    const product = order.product.trim();
    const key = `${normName}::${product}`;

    if (order.date >= recentStart && order.date <= asOf) {
      recentVolByKey.set(key, (recentVolByKey.get(key) ?? 0) + order.cases);
    }

    const entry = byKey.get(key) ?? {
      accountName: order.accountName,
      product,
      salesRep: repByNormName.get(normName),
      priorVol: 0,
      lastDate: null,
    };
    if (order.date >= priorStart && order.date <= priorEnd) {
      entry.priorVol += order.cases;
    }
    if (!entry.lastDate || order.date > entry.lastDate) {
      entry.lastDate = order.date;
    }
    byKey.set(key, entry);
  }

  const rows: WinBackSkuRow[] = [];
  for (const [key, entry] of byKey) {
    if (entry.priorVol <= 0) continue;
    if ((recentVolByKey.get(key) ?? 0) > 0) continue;

    const daysSince = entry.lastDate
      ? differenceInCalendarDays(asOfDate, toDay(entry.lastDate))
      : null;
    if (daysSince !== null && daysSince < WIN_BACK_GAP_DAYS) continue;

    rows.push({
      accountName: entry.accountName,
      product: entry.product,
      salesRep: entry.salesRep,
      priorVolume90: entry.priorVol,
      lastOrderedDate: entry.lastDate,
      daysSinceLastOrder: daysSince,
    });
  }

  return rows
    .sort((a, b) => b.priorVolume90 - a.priorVolume90)
    .slice(0, 200);
}

function buildMomentum(accounts: AccountHealth[]): {
  improving: MomentumRow[];
  declining: MomentumRow[];
} {
  const withChange = accounts.filter(
    (a): a is AccountHealth & { scoreChange14d: number } =>
      a.scoreChange14d !== null && a.scoreChange14d !== undefined,
  );

  const improving = withChange
    .filter((a) => a.scoreChange14d > 0)
    .sort((a, b) => b.scoreChange14d - a.scoreChange14d)
    .slice(0, 25)
    .map((account) => ({ account, scoreChange14d: account.scoreChange14d! }));

  const declining = withChange
    .filter((a) => a.scoreChange14d < 0)
    .sort((a, b) => a.scoreChange14d - b.scoreChange14d)
    .slice(0, 25)
    .map((account) => ({ account, scoreChange14d: account.scoreChange14d! }));

  return { improving, declining };
}

function aggregateVolumeDimension(
  accounts: AccountHealth[],
  labelFor: (item: AccountHealth) => string,
): VolumeDimensionRow[] {
  const map = new Map<string, VolumeDimensionRow>();
  for (const item of accounts) {
    const label = labelFor(item) || "Unknown";
    const row = map.get(label) ?? {
      label,
      accountCount: 0,
      bottles90: 0,
      atRiskVolume90: 0,
      criticalCount: 0,
    };
    row.accountCount += 1;
    row.bottles90 += item.volume90;
    if (item.risk === "critical" || item.risk === "at_risk") {
      row.atRiskVolume90 += item.volume90;
    }
    if (item.risk === "critical") row.criticalCount += 1;
    map.set(label, row);
  }
  return [...map.values()].sort((a, b) => b.bottles90 - a.bottles90);
}

function buildWeeklyBriefing(params: {
  asOf: string;
  repFilter: string;
  accounts: AccountHealth[];
  dueToReorder: DueToReorderRow[];
  visitCoverageAccounts: VisitCoverageAccountRow[];
  visitConversionByRep: VisitConversionRepRow[];
  improving: MomentumRow[];
  declining: MomentumRow[];
  newAccountsCount: number;
  retainedCount: number;
  returningCount: number;
  highChurnCount: number;
  frequencyAlertCount: number;
  productAlertCount: number;
}): WeeklyBriefingSummary {
  const {
    accounts,
    dueToReorder,
    visitCoverageAccounts,
    visitConversionByRep,
    improving,
    declining,
  } = params;

  const totalVisits = visitConversionByRep.reduce((s, r) => s + r.visitCount90, 0);
  const totalConverted = visitConversionByRep.reduce((s, r) => s + r.convertedVisits90, 0);

  const volumeAtRisk = accounts
    .filter((a) => a.risk === "critical" || a.risk === "at_risk")
    .reduce((s, a) => s + a.volume90, 0);

  return {
    asOf: params.asOf,
    repFilter: params.repFilter,
    totalAccounts: accounts.length,
    avgScore:
      accounts.length > 0
        ? Math.round(accounts.reduce((s, a) => s + a.score, 0) / accounts.length)
        : 0,
    criticalCount: accounts.filter((a) => a.risk === "critical").length,
    atRiskCount: accounts.filter((a) => a.risk === "at_risk").length,
    volumeAtRisk90: volumeAtRisk,
    dueToReorderCount: dueToReorder.length,
    visitOverdueCount: visitCoverageAccounts.filter((a) => a.visitCadenceOverdue).length,
    strikeRateAllRepsPct:
      totalVisits > 0 ? Math.round((totalConverted / totalVisits) * 100) : null,
    newAccountsCount: params.newAccountsCount,
    retainedCount: params.retainedCount,
    returningCount: params.returningCount,
    highChurnCount: params.highChurnCount,
    frequencyAlertCount: params.frequencyAlertCount,
    productAlertCount: params.productAlertCount,
    topDueAccounts: dueToReorder.slice(0, 10),
    topImproving: improving.slice(0, 5),
    topDeclining: declining.slice(0, 5),
  };
}

export function buildSalesInsights(input: BuildSalesInsightsInput): SalesInsightsBundle {
  const {
    repFilter,
    asOf,
    portfolioState,
    enrichedAccounts,
    frequencyAlerts,
    productAlerts,
    newAccountsCount,
    retainedCount,
    returningCount,
    highChurnCount,
  } = input;

  const orderIndex = buildOrderIndex(portfolioState.orders);
  const visitIndex = buildVisitIndex(portfolioState.visits);

  const dueToReorder = buildDueToReorder(enrichedAccounts, asOf);
  const { accountRows: visitCoverageAccounts, repSummaries } = buildVisitCoverage(
    enrichedAccounts,
    asOf,
  );
  const visitCoverageByRep = enrichVisitCoverageReps(
    enrichedAccounts,
    portfolioState.visits,
    asOf,
    repSummaries,
    repFilter,
  );
  const visitConversionByRep = buildVisitConversion(
    visitIndex,
    orderIndex,
    enrichedAccounts,
    asOf,
    repFilter,
  );
  const skuBreadth = buildSkuBreadth(enrichedAccounts, orderIndex, asOf);
  const winBackSkus = buildWinBackSkus(enrichedAccounts, portfolioState.orders, asOf);
  const { improving, declining } = buildMomentum(enrichedAccounts);
  const volumeByTier = aggregateVolumeDimension(
    enrichedAccounts,
    (a) => (a.territoryTier ? territoryTierLabel(a.territoryTier) : "Unranked"),
  );
  const volumeByRegion = aggregateVolumeDimension(
    enrichedAccounts,
    (a) => a.account.region?.trim() || a.account.county?.trim() || "Unknown region",
  );
  const volumeByRep = aggregateVolumeDimension(
    enrichedAccounts,
    (a) => a.account.salesRep?.trim() || "Unassigned",
  );
  const weeklyBriefing = buildWeeklyBriefing({
    asOf,
    repFilter,
    accounts: enrichedAccounts,
    dueToReorder,
    visitCoverageAccounts,
    visitConversionByRep,
    improving,
    declining,
    newAccountsCount,
    retainedCount,
    returningCount,
    highChurnCount,
    frequencyAlertCount: frequencyAlerts.length,
    productAlertCount: productAlerts.length,
  });

  return {
    asOf,
    repFilter,
    dueToReorder,
    visitCoverageAccounts,
    visitCoverageByRep,
    visitConversionByRep,
    skuBreadth,
    winBackSkus,
    improving,
    declining,
    volumeByTier,
    volumeByRegion,
    volumeByRep,
    weeklyBriefing,
  };
}
