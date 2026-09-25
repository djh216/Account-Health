import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { normalizeName } from "./format";
import {
  typicalFrequencyDaysFromOrderDates,
  AVG_DAYS_PER_MONTH,
} from "./order-frequency";
import { daysPastTypicalFrequency } from "./order-cadence";
import type { AccountHealth, Order, TerritoryValueTier } from "./types";

export type FrequencyAlertSeverity = "critical" | "warning" | "watch";

export type FrequencyAlertReason =
  | "cycle_overdue" // Current days since order significantly exceeds typical cycle
  | "velocity_drop" // Recent order count/rate dropped sharply vs typical expected rate
  | "cadence_lengthened" // Average days between orders has widened significantly
  | "dormant_active"; // Previously regular customer has completely stopped ordering

export type AccountFrequencyAlert = {
  id: string; // account ID or normalized name
  accountName: string;
  salesRep?: string;
  territoryTier?: TerritoryValueTier;
  severity: FrequencyAlertSeverity;
  reason: FrequencyAlertReason;
  // Frequency metrics
  typicalIntervalDays: number;
  typicalOrdersPerMonth: number;
  currentDaysSinceOrder: number;
  daysPastTypical: number;
  recentOrdersPerMonth: number;
  expectedOrders90: number;
  actualOrders90: number;
  dropPercentage: number; // e.g. 65 means 65% drop in order frequency
  cadenceMultiplier: number; // e.g. 2.4 means taking 2.4x the usual time
  lastOrderDate: string;
  // Volume & value metrics
  revenueRecent90: number;
  revenuePrior90: number;
  revenueAtRisk: number;
  // Context & action
  message: string;
  actionRecommendation: string;
};

const ACKNOWLEDGED_STORAGE_KEY = "cellar-pulse.frequency-alerts.acknowledged.v1";

/**
 * Calculates accounts whose order frequency has dropped significantly below their typical rate.
 */
export function detectOrderFrequencyDrops(
  accounts: AccountHealth[],
  orders: Order[],
  asOfOverride?: string,
): AccountFrequencyAlert[] {
  const asOf = asOfOverride ?? new Date().toISOString().slice(0, 10);
  const asOfDate = parseISO(asOf);
  const recentStart90 = subDays(asOfDate, 90);

  // Group orders by normalized account name
  const ordersByAccount = new Map<string, Order[]>();
  for (const order of orders) {
    const key = normalizeName(order.accountName);
    const list = ordersByAccount.get(key) ?? [];
    list.push(order);
    ordersByAccount.set(key, list);
  }

  const alerts: AccountFrequencyAlert[] = [];

  for (const health of accounts) {
    const { account } = health;
    const accountOrders = ordersByAccount.get(normalizeName(account.name)) ?? [];

    // Determine typical interval in days
    let typicalDays = health.typicalIntervalDays;
    if (!typicalDays || typicalDays <= 0) {
      if (accountOrders.length > 0) {
        const orderDates = [
          ...new Set(accountOrders.map((o) => o.date.slice(0, 10))),
        ].sort();
        typicalDays = typicalFrequencyDaysFromOrderDates(orderDates, asOf);
      }
    }

    // Default fallback to standard 28-day monthly cycle if no interval is calculated
    const intervalDays = Math.max(1, typicalDays ?? 28);
    const typicalOrdersPerMonth = Number((AVG_DAYS_PER_MONTH / intervalDays).toFixed(1));
    const expectedOrders90 = Math.max(1, Math.round(90 / intervalDays));

    // Days since last order
    let daysSince = health.daysSinceOrder;
    let lastOrderDate = health.lastOrderDate;

    if (daysSince === null && accountOrders.length > 0) {
      const sorted = [...accountOrders].sort((a, b) => b.date.localeCompare(a.date));
      lastOrderDate = sorted[0].date.slice(0, 10);
      daysSince = Math.max(
        0,
        differenceInCalendarDays(asOfDate, parseISO(lastOrderDate)),
      );
    }

    // If there is never any order date, we cannot measure frequency drop
    if (daysSince === null || !lastOrderDate) {
      continue;
    }

    const daysPast = daysPastTypicalFrequency(daysSince, intervalDays) ?? 0;
    const cadenceMultiplier = Number((daysSince / intervalDays).toFixed(2));

    // Count actual unique order events in recent 90 days
    const recentOrders = accountOrders.filter((order) => {
      const date = parseISO(order.date.slice(0, 10));
      return date >= recentStart90 && date <= asOfDate;
    });
    const uniqueRecentDates = new Set(recentOrders.map((o) => o.date.slice(0, 10)));
    const actualOrders90 =
      health.mode === "history"
        ? health.orderCount90
        : uniqueRecentDates.size > 0
          ? uniqueRecentDates.size
          : daysSince <= 90
            ? 1
            : 0;

    const recentOrdersPerMonth = Number(
      ((actualOrders90 / 90) * AVG_DAYS_PER_MONTH).toFixed(1),
    );

    // Calculate frequency rate drop percentage
    // Based on how actual recent order frequency compares to expected typical frequency
    let dropPercentage = 0;
    if (typicalOrdersPerMonth > 0) {
      const rateRatio = recentOrdersPerMonth / typicalOrdersPerMonth;
      dropPercentage = Math.round(Math.max(0, Math.min(100, (1 - rateRatio) * 100)));
    }

    // Also consider elapsed time past typical cycle:
    // If daysSince exceeds typical cycle, elapsed delay represents an instantaneous drop
    if (daysPast > 0) {
      const cycleDrop = Math.min(
        100,
        Math.round(((daysSince - intervalDays) / daysSince) * 100),
      );
      if (cycleDrop > dropPercentage) {
        dropPercentage = cycleDrop;
      }
    }

    // Determine if this qualifies as a significant drop below typical rate:
    // Condition 1: Cadence overdue by at least 8 days past typical cycle (>= RISK_AT_RISK_MIN_DAYS)
    // Condition 2: Actual order frequency in recent 90 days dropped by >= 35% below expected typical
    // Condition 3: Elapsed days is >= 1.4x typical interval with at least 5 days overdue
    const isCadenceOverdue = daysPast >= 8;
    const isVelocityDropped = dropPercentage >= 35 && actualOrders90 < expectedOrders90;
    const isSignificantMultiplier = cadenceMultiplier >= 1.4 && daysPast >= 5;

    if (!isCadenceOverdue && !isVelocityDropped && !isSignificantMultiplier) {
      continue;
    }

    // Assign Severity
    let severity: FrequencyAlertSeverity;
    if (daysPast >= 15 || dropPercentage >= 55 || cadenceMultiplier >= 2.0) {
      severity = "critical";
    } else if (daysPast >= 8 || dropPercentage >= 35 || cadenceMultiplier >= 1.4) {
      severity = "warning";
    } else {
      severity = "watch";
    }

    // Determine Primary Reason
    let reason: FrequencyAlertReason;
    if (daysSince >= 60 && actualOrders90 === 0) {
      reason = "dormant_active";
    } else if (daysPast >= 14 && cadenceMultiplier >= 1.75) {
      reason = "cycle_overdue";
    } else if (isVelocityDropped && actualOrders90 > 0) {
      reason = "velocity_drop";
    } else {
      reason = "cadence_lengthened";
    }

    // Construct human-readable message
    let message: string;
    if (reason === "dormant_active") {
      message = `Zero orders in past ${daysSince} days. Account typically orders every ${intervalDays} days (~${typicalOrdersPerMonth}/mo).`;
    } else if (reason === "cycle_overdue") {
      message = `Last ordered ${daysSince} days ago — ${daysPast} days past typical ${intervalDays}-day reorder schedule (${dropPercentage}% drop in pace).`;
    } else if (reason === "velocity_drop") {
      message = `Order pace fell to ${recentOrdersPerMonth}/mo (expected ${typicalOrdersPerMonth}/mo based on historical cadence, down ${dropPercentage}%).`;
    } else {
      message = `Reorder cycle lengthened: currently ${daysSince} days elapsed vs typical ${intervalDays}-day cadence (+${daysPast} days overdue).`;
    }

    // Action recommendation based on territory tier & reason
    let actionRecommendation: string;
    if (health.territoryTier === "anchor") {
      actionRecommendation =
        "Immediate sommelier/F&B Director check-in. High-volume anchor account experiencing rare purchasing freeze.";
    } else if (health.territoryTier === "core") {
      actionRecommendation =
        "Schedule rep visit or sample delivery. Audit current BTG placements and menu rotation status.";
    } else if (severity === "critical") {
      actionRecommendation =
        "Urgent outreach recommended to verify management changes or distributor competitor displacement.";
    } else {
      actionRecommendation =
        "Check inventory levels and send updated catalog or seasonal allocation sheet.";
    }

    const revenueAtRisk =
      health.revenuePrior90 > 0
        ? Math.max(0, health.revenuePrior90 - health.revenue90)
        : health.revenue90 > 0
          ? Math.round(health.revenue90 * (dropPercentage / 100))
          : 0;

    alerts.push({
      id: account.id || normalizeName(account.name),
      accountName: account.name,
      salesRep: account.salesRep,
      territoryTier: health.territoryTier,
      severity,
      reason,
      typicalIntervalDays: intervalDays,
      typicalOrdersPerMonth,
      currentDaysSinceOrder: daysSince,
      daysPastTypical: daysPast,
      recentOrdersPerMonth,
      expectedOrders90,
      actualOrders90,
      dropPercentage,
      cadenceMultiplier,
      lastOrderDate,
      revenueRecent90: health.revenue90,
      revenuePrior90: health.revenuePrior90,
      revenueAtRisk,
      message,
      actionRecommendation,
    });
  }

  // Sort alerts: critical first, then highest drop percentage, then days past typical
  return alerts.sort((a, b) => {
    const severityRank = (s: FrequencyAlertSeverity) =>
      s === "critical" ? 0 : s === "warning" ? 1 : 2;
    const rankDiff = severityRank(a.severity) - severityRank(b.severity);
    if (rankDiff !== 0) return rankDiff;
    if (b.dropPercentage !== a.dropPercentage) {
      return b.dropPercentage - a.dropPercentage;
    }
    return b.daysPastTypical - a.daysPastTypical;
  });
}

// Local storage management for acknowledged/snoozed alert IDs
export function getAcknowledgedAlertIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ACKNOWLEDGED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveAcknowledgedAlertIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ACKNOWLEDGED_STORAGE_KEY,
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // ignore storage write errors
  }
}
