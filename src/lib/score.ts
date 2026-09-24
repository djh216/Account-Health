import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { clamp, normalizeName, todayIso } from "./format";
import {
  typicalFrequencyDaysFromOrderDates,
} from "./order-frequency";
import { orderCadenceStatus, riskFromOrderCadence, daysPastTypicalFrequency, RISK_AT_RISK_MIN_DAYS, RISK_HEALTHY_GRACE_DAYS } from "./order-cadence";
import type {
  Account,
  AccountHealth,
  FocusAction,
  FocusHorizon,
  HealthFactor,
  Order,
  PortfolioSnapshot,
  RiskLevel,
  ScoreMode,
  TerritoryValueTier,
  Visit,
} from "./types";

const ORDER_CYCLE_DAYS = 28;
const VISIT_CYCLE_DAYS = 28;
export const OVERDUE_VISIT_DAYS = VISIT_CYCLE_DAYS;

function toDate(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

function typicalInterval(dates: string[], asOf: string): number | null {
  return typicalFrequencyDaysFromOrderDates(dates, asOf);
}

function accountOrdersFor(account: Account, orders: Order[]): Order[] {
  const normalized = normalizeName(account.name);
  return orders
    .filter(
      (order) =>
        order.accountId === account.id ||
        normalizeName(order.accountName) === normalized,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function recencyScore(
  daysSinceOrder: number | null,
  interval: number | null,
): { score: number; detail: string } {
  const typical = interval ?? ORDER_CYCLE_DAYS;
  const daysPast = daysPastTypicalFrequency(daysSinceOrder, interval);

  if (daysPast === null) {
    return { score: 10, detail: "No last order date on file — treated as critical." };
  }
  if (daysPast <= RISK_HEALTHY_GRACE_DAYS) {
    return {
      score: 92,
      detail:
        daysPast <= 0
          ? `Last ordered ${daysSinceOrder} days ago — on or ahead of the typical ${typical}-day cadence.`
          : `Last ordered ${daysSinceOrder} days ago — within ${RISK_HEALTHY_GRACE_DAYS} days of the typical ${typical}-day cadence.`,
    };
  }
  if (daysPast <= 14) {
    return {
      score: 55,
      detail: `Last ordered ${daysSinceOrder} days ago — ${daysPast} days past the typical ${typical}-day cadence (at risk).`,
    };
  }
  return {
    score: 15,
    detail: `Last ordered ${daysSinceOrder} days ago — ${daysPast} days past the typical ${typical}-day cadence (critical).`,
  };
}

function trendScore(
  recent: number,
  prior: number,
): { score: number; detail: string; delta: number | null } {
  if (prior <= 0 && recent <= 0) {
    return { score: 20, detail: "No recent or prior-period revenue.", delta: null };
  }
  if (prior <= 0) {
    return {
      score: 78,
      detail: "New or returning volume with no comparable prior period.",
      delta: null,
    };
  }
  const delta = ((recent - prior) / prior) * 100;
  if (delta >= 15) {
    return {
      score: 95,
      detail: `Last 90 days are up ${Math.round(delta)}% versus the prior 90.`,
      delta,
    };
  }
  if (delta >= 0) {
    return {
      score: 80,
      detail: `Last 90 days are roughly flat to slightly up (${Math.round(delta)}%).`,
      delta,
    };
  }
  if (delta >= -18) {
    return {
      score: 62,
      detail: `Last 90 days are down ${Math.abs(Math.round(delta))}% versus the prior 90.`,
      delta,
    };
  }
  if (delta >= -40) {
    return {
      score: 38,
      detail: `Revenue slipped ${Math.abs(Math.round(delta))}% in the last 90 days.`,
      delta,
    };
  }
  return {
    score: 14,
    detail: `Revenue collapsed ${Math.abs(Math.round(delta))}% versus the prior 90 days.`,
    delta,
  };
}

function coverageScore(
  daysSinceVisit: number | null,
  visitCount90: number,
  visitsWithoutOrder: number,
  snapshotMode: boolean,
): { score: number; detail: string } {
  if (daysSinceVisit === null) {
    return {
      score: 18,
      detail: "No last visit date. We cannot tell if a rep has been in.",
    };
  }
  const recency =
    daysSinceVisit <= VISIT_CYCLE_DAYS
      ? 94
      : daysSinceVisit <= 40
        ? 70
        : daysSinceVisit <= 56
          ? 46
          : daysSinceVisit <= 84
            ? 24
            : 8;
  const missRate = visitCount90 === 0 ? 0 : visitsWithoutOrder / visitCount90;
  const conversionPenalty =
    snapshotMode ? 0 : missRate >= 0.67 ? 22 : missRate >= 0.4 ? 12 : 0;
  const score = clamp(recency - conversionPenalty);
  const visitNote = `Last sales-rep visit ${daysSinceVisit} days ago.`;
  const missNote =
    !snapshotMode && visitsWithoutOrder > 0
      ? ` ${visitsWithoutOrder} visit${visitsWithoutOrder === 1 ? "" : "s"} in the last 90 days did not convert to an order.`
      : "";
  return { score, detail: `${visitNote}${missNote}` };
}

function consistencyScore(
  orderCount90: number,
  orderCountPrior90: number,
  interval: number | null,
): { score: number; detail: string } {
  const expected = interval ? Math.max(1, Math.round(90 / interval)) : 3;
  const ratio = orderCount90 / expected;
  if (orderCount90 === 0) {
    return { score: 10, detail: "Zero orders in the last 90 days." };
  }
  if (ratio >= 0.85) {
    return {
      score: 90,
      detail: `${orderCount90} orders in 90 days, near the expected ${expected}.`,
    };
  }
  if (ratio >= 0.55) {
    return {
      score: 64,
      detail: `${orderCount90} orders in 90 days versus an expected ${expected}.`,
    };
  }
  const drop =
    orderCountPrior90 > 0
      ? `, down from ${orderCountPrior90} in the prior period`
      : "";
  return {
    score: 30,
    detail: `Only ${orderCount90} order${orderCount90 === 1 ? "" : "s"} in 90 days${drop}. Expected about ${expected}.`,
  };
}

function relationshipScore(
  daysSinceOrder: number | null,
  daysSinceVisit: number | null,
): { score: number; detail: string } {
  if (daysSinceOrder === null && daysSinceVisit === null) {
    return { score: 12, detail: "No last order or last visit on file." };
  }
  if (daysSinceOrder === null) {
    return {
      score: 28,
      detail: "A visit is recorded, but this account has no last order date.",
    };
  }
  if (daysSinceVisit === null) {
    return {
      score: 32,
      detail: "There is a last order, but no sales-rep visit is recorded.",
    };
  }
  if (daysSinceOrder <= 21 && daysSinceVisit <= VISIT_CYCLE_DAYS) {
    return {
      score: 94,
      detail: "Last order and last visit are both current.",
    };
  }
  if (daysSinceVisit + 14 <= daysSinceOrder && daysSinceOrder >= 35) {
    return {
      score: 36,
      detail: `The rep was in ${daysSinceVisit} days ago, but the last order is still ${daysSinceOrder} days old.`,
    };
  }
  if (daysSinceOrder + 21 <= daysSinceVisit && daysSinceVisit >= 35) {
    return {
      score: 48,
      detail: `They ordered ${daysSinceOrder} days ago, but the last recorded stop is ${daysSinceVisit} days old.`,
    };
  }
  if (daysSinceOrder >= 90 && daysSinceVisit >= 60) {
    return {
      score: 10,
      detail: "Both the last order and the last visit are stale.",
    };
  }
  return {
    score: 64,
    detail: "Order and visit dates are starting to drift.",
  };
}

function buildFocus(input: {
  name: string;
  risk: RiskLevel;
  mode: ScoreMode;
  daysSinceOrder: number | null;
  interval: number | null;
  delta: number | null;
  daysSinceVisit: number | null;
  visitsWithoutOrder: number;
  revenue90: number;
  revenuePrior90: number;
}): FocusAction | null {
  const {
    name,
    risk,
    mode,
    daysSinceOrder,
    interval,
    delta,
    daysSinceVisit,
    visitsWithoutOrder,
    revenue90,
    revenuePrior90,
  } = input;

  if (risk === "healthy") return null;

  const daysPast = daysPastTypicalFrequency(daysSinceOrder, interval);
  const orderStale = daysPast !== null && daysPast >= RISK_AT_RISK_MIN_DAYS;
  const visitStale = daysSinceVisit !== null && daysSinceVisit >= 40;
  const visitedWithoutWrite =
    daysSinceOrder !== null &&
    daysSinceVisit !== null &&
    daysSinceVisit + 14 <= daysSinceOrder &&
    daysSinceOrder >= 35;

  if (orderStale && visitStale) {
    return {
      title: `Recover ${name}`,
      reason: `Last order ${daysSinceOrder} days ago and last visit ${daysSinceVisit} days ago.`,
      action: "Put a stop on the calendar this week and walk out with a replenishment order.",
    };
  }

  if (visitedWithoutWrite) {
    return {
      title: `Close the last call at ${name}`,
      reason: `The rep was in ${daysSinceVisit} days ago, but the last order is still ${daysSinceOrder} days old.`,
      action: "Follow up on that visit with a written offer before the week is out.",
    };
  }

  if (orderStale && daysSinceVisit !== null && daysSinceVisit <= 21) {
    return {
      title: `Write ${name} this week`,
      reason: `Someone was just in, but the last order is ${daysSinceOrder} days old.`,
      action: "Turn the last stop into an order — do not wait for the next swing.",
    };
  }

  if (!orderStale && visitStale) {
    return {
      title: `Get in front of ${name}`,
      reason: `They ordered ${daysSinceOrder} days ago, but the last recorded visit is ${daysSinceVisit} days old.`,
      action: "Book a sales visit before the next buying window closes.",
    };
  }

  if (daysSinceOrder !== null && interval && daysSinceOrder >= interval * 2) {
    return {
      title: `Recover ${name}`,
      reason: `Last order ${daysSinceOrder} days ago; this house usually buys every ${interval} days.`,
      action: "Call this week and put a replenishment order on the books.",
    };
  }

  if (mode === "history" && delta !== null && delta <= -35) {
    const lost = Math.max(0, revenuePrior90 - revenue90);
    return {
      title: `Protect volume at ${name}`,
      reason: `Ninety-day sales are down ${Math.abs(Math.round(delta))}%${lost ? ` (about $${Math.round(lost).toLocaleString()} off the book)` : ""}.`,
      action: "Schedule a list review and ask what replaced your wines.",
    };
  }

  if (visitsWithoutOrder >= 2) {
    return {
      title: `Close open visits at ${name}`,
      reason: `${visitsWithoutOrder} recent visits never turned into an order.`,
      action: "Follow up on the last tasting or sample with a written offer.",
    };
  }

  if (risk === "critical" || risk === "at_risk") {
    return {
      title: `Work ${name} this week`,
      reason: "Last order and last visit both point to slipping attention.",
      action: "Assign the rep a specific next step and a date.",
    };
  }

  return {
    title: `Keep a close eye on ${name}`,
    reason: "Early signs of drift — keep a close eye on this account.",
    action: "Confirm the next order date and keep the call cycle tight.",
  };
}

function defaultFocusForHorizon(
  name: string,
  horizon: FocusHorizon,
): FocusAction {
  if (horizon === "this_week") {
    return {
      title: `Work ${name} this week`,
      reason: "One of the ten lowest health scores on this book — prioritize now.",
      action: "Schedule a stop or call and leave with a next step on the calendar.",
    };
  }
  if (horizon === "two_weeks") {
    return {
      title: `Plan ${name} for two weeks out`,
      reason: "Next tier of low health scores — schedule before urgency builds.",
      action: "Block time in two weeks for a list check and reorder conversation.",
    };
  }
  return {
    title: `Touch ${name} in three weeks`,
    reason: "Still among the weakest scores — keep on the three-week call plan.",
    action: "Add to the three-week call plan and confirm the next order window.",
  };
}

export const FOCUS_HORIZON_LIMITS: Record<FocusHorizon, number> = {
  this_week: 10,
  two_weeks: 10,
  three_weeks: 10,
};

function sortAccountsByHealthScore(a: AccountHealth, b: AccountHealth): number {
  return (
    a.score - b.score ||
    (b.daysSinceOrder ?? 0) - (a.daysSinceOrder ?? 0) ||
    a.account.name.localeCompare(b.account.name)
  );
}

const FOCUS_TIER_ORDER: Record<TerritoryValueTier, number> = {
  anchor: 0,
  core: 1,
  base: 2,
};

const FOCUS_RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  at_risk: 1,
  dormant: 2,
  healthy: 3,
};

function focusTierOrder(tier: TerritoryValueTier | undefined): number {
  if (!tier) return FOCUS_TIER_ORDER.base;
  return FOCUS_TIER_ORDER[tier];
}

/** Risk first, then value tier, then weakest health score. */
export function compareAccountsForFocus(
  a: AccountHealth,
  b: AccountHealth,
): number {
  const riskDiff = FOCUS_RISK_ORDER[a.risk] - FOCUS_RISK_ORDER[b.risk];
  if (riskDiff !== 0) return riskDiff;

  const tierDiff = focusTierOrder(a.territoryTier) - focusTierOrder(b.territoryTier);
  if (tierDiff !== 0) return tierDiff;

  return sortAccountsByHealthScore(a, b);
}

export function assignFocusHorizonByRank(rankIndex: number): FocusHorizon | null {
  if (rankIndex < FOCUS_HORIZON_LIMITS.this_week) return "this_week";
  if (rankIndex < FOCUS_HORIZON_LIMITS.this_week + FOCUS_HORIZON_LIMITS.two_weeks) {
    return "two_weeks";
  }
  if (
    rankIndex <
    FOCUS_HORIZON_LIMITS.this_week +
      FOCUS_HORIZON_LIMITS.two_weeks +
      FOCUS_HORIZON_LIMITS.three_weeks
  ) {
    return "three_weeks";
  }
  return null;
}

export function isOverdueVisit(daysSinceVisit: number | null): boolean {
  return daysSinceVisit !== null && daysSinceVisit > OVERDUE_VISIT_DAYS;
}

export function listOverdueVisitAccounts(accounts: AccountHealth[]): AccountHealth[] {
  return accounts
    .filter((item) => isOverdueVisit(item.daysSinceVisit))
    .sort(
      (a, b) =>
        (b.daysSinceVisit ?? 0) - (a.daysSinceVisit ?? 0) ||
        a.account.name.localeCompare(b.account.name),
    );
}

export function isOverdueOrder(item: AccountHealth): boolean {
  const daysPast = daysPastTypicalFrequency(
    item.daysSinceOrder,
    item.typicalIntervalDays,
  );
  return daysPast !== null && daysPast >= RISK_AT_RISK_MIN_DAYS;
}

export function listOverdueOrderAccounts(accounts: AccountHealth[]): AccountHealth[] {
  return accounts
    .filter(isOverdueOrder)
    .sort(
      (a, b) =>
        (daysPastTypicalFrequency(b.daysSinceOrder, b.typicalIntervalDays) ?? 0) -
          (daysPastTypicalFrequency(a.daysSinceOrder, a.typicalIntervalDays) ?? 0) ||
        a.account.name.localeCompare(b.account.name),
    );
}

export function listNeedAttentionAccounts(accounts: AccountHealth[]): AccountHealth[] {
  return accounts
    .filter((item) => item.risk === "critical" || item.risk === "at_risk")
    .sort(sortAccountsByHealthScore);
}

export function listRevenueAtRiskAccounts(accounts: AccountHealth[]): AccountHealth[] {
  return accounts
    .filter((item) => item.risk === "critical" || item.risk === "at_risk")
    .sort(
      (a, b) =>
        Math.max(b.revenuePrior90, b.revenue90) -
          Math.max(a.revenuePrior90, a.revenue90) ||
        sortAccountsByHealthScore(a, b),
    );
}

export function listAccountsByRecentRevenue(accounts: AccountHealth[]): AccountHealth[] {
  return [...accounts].sort(
    (a, b) =>
      b.revenue90 - a.revenue90 ||
      sortAccountsByHealthScore(a, b),
  );
}

export function listAllScoredAccounts(accounts: AccountHealth[]): AccountHealth[] {
  return [...accounts].sort(sortAccountsByHealthScore);
}

export function focusAccountsByHorizon(
  accounts: AccountHealth[],
): Record<FocusHorizon, AccountHealth[]> {
  const sorted = [...accounts].sort(compareAccountsForFocus);
  const { this_week: thisWeekLimit, two_weeks: twoWeeksLimit, three_weeks: threeWeeksLimit } =
    FOCUS_HORIZON_LIMITS;

  return {
    this_week: sorted.slice(0, thisWeekLimit),
    two_weeks: sorted.slice(thisWeekLimit, thisWeekLimit + twoWeeksLimit),
    three_weeks: sorted.slice(
      thisWeekLimit + twoWeeksLimit,
      thisWeekLimit + twoWeeksLimit + threeWeeksLimit,
    ),
  };
}

export function scoreAccount(
  account: Account,
  orders: Order[],
  visits: Visit[],
  asOf: string,
): AccountHealth {
  const asOfDate = toDate(asOf);
  const windowStart = subDays(asOfDate, 90);
  const priorStart = subDays(asOfDate, 180);

  const accountOrders = accountOrdersFor(account, orders);
  const accountVisits = visits
    .filter((visit) => visit.accountId === account.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const lastOrder = accountOrders.at(-1) ?? null;
  const lastVisit = accountVisits.at(-1) ?? null;
  const daysSinceOrder = lastOrder
    ? differenceInCalendarDays(asOfDate, toDate(lastOrder.date))
    : null;
  const daysSinceVisit = lastVisit
    ? differenceInCalendarDays(asOfDate, toDate(lastVisit.date))
    : null;

  const recentOrders = accountOrders.filter(
    (order) => toDate(order.date) >= windowStart && toDate(order.date) <= asOfDate,
  );
  const priorOrders = accountOrders.filter((order) => {
    const date = toDate(order.date);
    return date >= priorStart && date < windowStart;
  });
  const recentVisits = accountVisits.filter(
    (visit) => toDate(visit.date) >= windowStart && toDate(visit.date) <= asOfDate,
  );

  const revenue90 = recentOrders.reduce((sum, order) => sum + order.revenue, 0);
  const revenuePrior90 = priorOrders.reduce((sum, order) => sum + order.revenue, 0);
  const cases90 = recentOrders.reduce((sum, order) => sum + order.cases, 0);
  const interval = typicalInterval(accountOrders.map((order) => order.date), asOf);
  const snapshotMode =
    accountOrders.length <= 1 || !accountOrders.some((order) => order.revenue > 0);

  const visitsWithoutOrder = recentVisits.filter((visit) => {
    const visitDate = toDate(visit.date);
    return !accountOrders.some((order) => {
      const orderDate = toDate(order.date);
      const gap = differenceInCalendarDays(orderDate, visitDate);
      return gap >= 0 && gap <= 14;
    });
  }).length;

  const recency = recencyScore(daysSinceOrder, interval);
  const coverage = coverageScore(
    daysSinceVisit,
    recentVisits.length,
    visitsWithoutOrder,
    snapshotMode,
  );
  const trend = trendScore(revenue90, revenuePrior90);
  const consistency = consistencyScore(recentOrders.length, priorOrders.length, interval);
  const relationship = relationshipScore(daysSinceOrder, daysSinceVisit);

  const factors: HealthFactor[] = snapshotMode
    ? [
        {
          key: "recency",
          label: "Last order",
          score: recency.score,
          weight: 0.5,
          detail: recency.detail,
        },
        {
          key: "coverage",
          label: "Last visit",
          score: coverage.score,
          weight: 0.35,
          detail: coverage.detail,
        },
        {
          key: "relationship",
          label: "Order vs visit",
          score: relationship.score,
          weight: 0.15,
          detail: relationship.detail,
        },
      ]
    : [
        {
          key: "recency",
          label: "Order recency",
          score: recency.score,
          weight: 0.35,
          detail: recency.detail,
        },
        {
          key: "trend",
          label: "Volume trend",
          score: trend.score,
          weight: 0.25,
          detail: trend.detail,
        },
        {
          key: "coverage",
          label: "Visit coverage",
          score: coverage.score,
          weight: 0.2,
          detail: coverage.detail,
        },
        {
          key: "consistency",
          label: "Order cadence",
          score: consistency.score,
          weight: 0.2,
          detail: consistency.detail,
        },
      ];

  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0),
  );
  const mode: ScoreMode = snapshotMode ? "snapshot" : "history";
  const cadenceInterval = interval ?? ORDER_CYCLE_DAYS;
  const risk = riskFromOrderCadence({
    daysSinceOrder,
    intervalDays: cadenceInterval,
  });
  const cadence = orderCadenceStatus({
    daysSinceOrder,
    lastOrderDate: lastOrder?.date ?? null,
    intervalDays: cadenceInterval,
  });
  const focus = buildFocus({
    name: account.name,
    risk,
    mode,
    daysSinceOrder,
    interval: cadenceInterval,
    delta: trend.delta,
    daysSinceVisit,
    visitsWithoutOrder,
    revenue90,
    revenuePrior90,
  });

  return {
    account,
    score,
    risk,
    mode,
    lastOrderDate: lastOrder?.date ?? null,
    daysSinceOrder,
    lastVisitDate: lastVisit?.date ?? null,
    daysSinceVisit,
    revenue90,
    revenuePrior90,
    revenueDeltaPct: trend.delta,
    orderCount90: recentOrders.length,
    orderCountPrior90: priorOrders.length,
    typicalIntervalDays: interval,
    orderCadenceOverdue: cadence.orderCadenceOverdue,
    orderCadenceDaysOverdue: cadence.orderCadenceDaysOverdue,
    expectedOrderDate: cadence.expectedOrderDate,
    visitCount90: recentVisits.length,
    visitsWithoutOrder,
    cases90,
    factors,
    focus,
    focusHorizon: null,
  };
}

function applyFocusHorizonsByScoreRank(accounts: AccountHealth[]): AccountHealth[] {
  return accounts.map((account, index) => {
    const focusHorizon = assignFocusHorizonByRank(index);
    if (!focusHorizon) {
      return { ...account, focusHorizon: null };
    }

    return {
      ...account,
      focusHorizon,
      focus:
        account.focus ??
        defaultFocusForHorizon(account.account.name, focusHorizon),
    };
  });
}

export function buildSnapshot(
  accounts: Account[],
  orders: Order[],
  visits: Visit[],
  asOfOverride?: string,
): PortfolioSnapshot {
  const asOf = asOfOverride ?? todayIso();
  const scored = accounts
    .map((account) => scoreAccount(account, orders, visits, asOf))
    .sort((a, b) => a.score - b.score || (a.daysSinceOrder ?? 999) - (b.daysSinceOrder ?? 999));

  const snapshotCount = scored.filter((item) => item.mode === "snapshot").length;
  const mode: ScoreMode =
    scored.length > 0 && snapshotCount >= scored.length / 2 ? "snapshot" : "history";

  const rankedAccounts = applyFocusHorizonsByScoreRank(scored);

  return {
    asOf,
    mode,
    accounts: rankedAccounts,
    totals: {
      accountCount: rankedAccounts.length,
      critical: rankedAccounts.filter((item) => item.risk === "critical").length,
      atRisk: rankedAccounts.filter((item) => item.risk === "at_risk").length,
      dormant: rankedAccounts.filter((item) => item.risk === "dormant").length,
      healthy: rankedAccounts.filter((item) => item.risk === "healthy").length,
      overdueOrders: listOverdueOrderAccounts(rankedAccounts).length,
      overdueVisits: listOverdueVisitAccounts(rankedAccounts).length,
      revenue90: rankedAccounts.reduce((sum, item) => sum + item.revenue90, 0),
      revenueAtRisk: rankedAccounts
        .filter((item) => item.risk === "critical" || item.risk === "at_risk")
        .reduce((sum, item) => sum + Math.max(item.revenuePrior90, item.revenue90), 0),
    },
  };
}
