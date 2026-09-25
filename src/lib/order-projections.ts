import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { normalizeName } from "./format";
import { AVG_DAYS_PER_MONTH } from "./order-frequency";
import type { AccountHealth, TerritoryValueTier } from "./types";
import type { AccountOrderTracking, OrderAnalyticsSnapshot } from "./order-analytics";

export type ChurnRiskTier = "high" | "moderate" | "low";
export type ProjectionHorizon = 30 | 60 | 90;
export type VolumeTrendTrajectory = "expanding" | "steady" | "decelerating" | "churning";

export type AccountProjectionAndChurn = {
  accountName: string;
  salesRep?: string;
  territoryTier?: TerritoryValueTier;
  // Historical Cadence & Volume
  typicalIntervalDays: number;
  historicalOrdersPerMonth: number;
  avgVolumePerOrder: number;
  avgRevenuePerOrder: number;
  daysSinceLastOrder: number;
  lastOrderDate: string;
  totalHistoricalVolume: number;
  // Next Expected Order
  expectedNextOrderDate: string | null;
  daysUntilExpectedOrder: number | null; // negative if overdue
  isOverdueForOrder: boolean;
  daysOverdue: number;
  // Volume Projections
  projectedVolume30: number;
  projectedVolume60: number;
  projectedVolume90: number;
  projectedRevenue30: number;
  projectedRevenue90: number;
  baselineVolume90: number; // what volume would be purely if historical frequency holds
  riskAdjustedVolume90: number; // discounted for churn risk
  projectedOrderCount30: number;
  projectedOrderCount90: number;
  trendTrajectory: VolumeTrendTrajectory;
  momentumMultiplier: number;
  // Churn Prediction
  churnScore: number; // 0 to 100
  churnTier: ChurnRiskTier;
  churnProbabilityPct: number;
  cadenceLapseScore: number;
  velocityDropScore: number;
  volumeDeclineScore: number;
  productAttritionScore: number;
  churnSignals: string[];
  monthlyVolumeAtRisk: number; // volume per month lost if account churns
  monthlyRevenueAtRisk: number;
  retentionRecommendation: string;
};

export type PortfolioProjectionSummary = {
  totalProjectedVolume30: number;
  totalProjectedVolume60: number;
  totalProjectedVolume90: number;
  totalProjectedRevenue30: number;
  totalProjectedRevenue90: number;
  totalBaselineVolume90: number;
  totalRiskAdjustedVolume90: number;
  totalMonthlyVolumeAtRisk: number;
  totalMonthlyRevenueAtRisk: number;
  highChurnCount: number;
  moderateChurnCount: number;
  lowChurnCount: number;
  accounts: AccountProjectionAndChurn[];
};

export type ProjectionSortKey =
  | "accountName"
  | "churnScore"
  | "projectedVolume30"
  | "projectedVolume90"
  | "monthlyVolumeAtRisk"
  | "daysSinceLastOrder"
  | "expectedNextOrderDate"
  | "trendTrajectory";

export type SortDirection = "asc" | "desc";

/**
 * Projects future purchase volume and predicts churn for a single account.
 */
export function projectSingleAccount(
  tracking: AccountOrderTracking,
  health?: AccountHealth | null,
  asOfOverride?: string,
): AccountProjectionAndChurn {
  const asOf = asOfOverride ?? tracking.analysisAsOf ?? new Date().toISOString().slice(0, 10);
  const asOfDate = parseISO(asOf);
  const lastOrderDate = tracking.frequency.lastOrderDate;
  const daysSince = tracking.frequency.daysSinceLastOrder;

  // Typical Cadence
  const typicalDays = Math.max(
    1,
    tracking.frequency.avgDaysBetweenOrders ?? health?.typicalIntervalDays ?? 28,
  );
  const historicalOrdersPerMonth = Number((AVG_DAYS_PER_MONTH / typicalDays).toFixed(1));

  // Order Volume & Basket Size
  const orderEvents = Math.max(1, tracking.frequency.orderEventCount);
  const totalVolume = tracking.frequency.totalVolume;
  const avgVolumePerOrder = Math.max(1, Math.round(totalVolume / orderEvents));

  const totalRevenue = tracking.orders.reduce((sum, o) => sum + (o.revenue || 0), 0);
  const avgRevenuePerOrder = Math.round(totalRevenue / orderEvents);

  // Expected next order date
  let expectedNextOrderDate: string | null = null;
  let daysUntilExpectedOrder: number | null = null;
  let isOverdueForOrder = false;
  let daysOverdue = 0;

  if (lastOrderDate) {
    const nextDate = addDays(parseISO(lastOrderDate), typicalDays);
    expectedNextOrderDate = nextDate.toISOString().slice(0, 10);
    daysUntilExpectedOrder = differenceInCalendarDays(nextDate, asOfDate);
    if (daysUntilExpectedOrder < 0) {
      isOverdueForOrder = true;
      daysOverdue = Math.abs(daysUntilExpectedOrder);
    }
  }

  // --- Churn Score Calculation ---
  // 1. Cadence Lapse Score (0 - 40 points)
  const cadenceMultiplier = daysSince / typicalDays;
  let cadenceLapseScore = 0;
  if (cadenceMultiplier >= 2.2) {
    cadenceLapseScore = 40;
  } else if (cadenceMultiplier >= 1.6) {
    cadenceLapseScore = 28;
  } else if (cadenceMultiplier >= 1.2) {
    cadenceLapseScore = 15;
  } else if (cadenceMultiplier >= 1.0) {
    cadenceLapseScore = 5;
  }

  // 2. Velocity Drop Score (0 - 25 points)
  const recentOrdersPerMonth = tracking.frequency.ordersPerMonth ?? 0;
  const velocityRatio =
    historicalOrdersPerMonth > 0
      ? recentOrdersPerMonth / historicalOrdersPerMonth
      : 1;
  let velocityDropScore = 0;
  if (recentOrdersPerMonth === 0 && daysSince >= 45) {
    velocityDropScore = 25;
  } else if (velocityRatio < 0.35) {
    velocityDropScore = 22;
  } else if (velocityRatio < 0.65) {
    velocityDropScore = 14;
  } else if (velocityRatio < 0.85) {
    velocityDropScore = 7;
  }

  // 3. Volume Decline Score (0 - 20 points)
  const deltaPct = tracking.volumeDeltaPct;
  let volumeDeclineScore = 0;
  if (deltaPct !== null) {
    if (deltaPct <= -50) {
      volumeDeclineScore = 20;
    } else if (deltaPct <= -30) {
      volumeDeclineScore = 14;
    } else if (deltaPct <= -15) {
      volumeDeclineScore = 8;
    }
  }

  // 4. Product Attrition Score (0 - 15 points)
  const droppedCount = tracking.droppedProducts.length;
  let productAttritionScore = 0;
  if (droppedCount >= 2) {
    productAttritionScore = 15;
  } else if (droppedCount === 1) {
    productAttritionScore = 8;
  }

  // Total Churn Score
  const churnScore = Math.min(
    100,
    Math.round(
      cadenceLapseScore +
        velocityDropScore +
        volumeDeclineScore +
        productAttritionScore,
    ),
  );

  // Churn Tier
  let churnTier: ChurnRiskTier;
  if (churnScore >= 60) {
    churnTier = "high";
  } else if (churnScore >= 35) {
    churnTier = "moderate";
  } else {
    churnTier = "low";
  }

  const churnProbabilityPct = Math.round(churnScore * 0.85);

  // Churn Signals compilation
  const churnSignals: string[] = [];
  if (isOverdueForOrder) {
    churnSignals.push(
      `Overdue: ${daysSince} days since last order (${daysOverdue} days past typical ${typicalDays}-day cycle, ${cadenceMultiplier.toFixed(1)}x interval)`,
    );
  }
  if (deltaPct !== null && deltaPct <= -20) {
    churnSignals.push(
      `Volume decline: ${deltaPct}% in recent 90 days vs prior period`,
    );
  }
  if (velocityRatio < 0.7 && historicalOrdersPerMonth > 0) {
    churnSignals.push(
      `Order velocity dropped: currently ${recentOrdersPerMonth}/mo vs historical ${historicalOrdersPerMonth}/mo`,
    );
  }
  if (droppedCount > 0) {
    churnSignals.push(
      `${droppedCount} product${droppedCount === 1 ? "" : "s"} dropped: ${tracking.droppedProducts.slice(0, 2).join(", ")}`,
    );
  }
  if (churnSignals.length === 0) {
    churnSignals.push("Purchasing on cadence with stable product mix");
  }

  // Monthly volume and revenue at risk
  const monthlyVolumeAtRisk =
    churnTier === "high"
      ? Math.round(historicalOrdersPerMonth * avgVolumePerOrder)
      : churnTier === "moderate"
        ? Math.round(historicalOrdersPerMonth * avgVolumePerOrder * 0.5)
        : 0;

  const monthlyRevenueAtRisk =
    churnTier === "high"
      ? Math.round(historicalOrdersPerMonth * avgRevenuePerOrder)
      : churnTier === "moderate"
        ? Math.round(historicalOrdersPerMonth * avgRevenuePerOrder * 0.5)
        : 0;

  // --- Trend Trajectory & Momentum Factor ---
  let trendTrajectory: VolumeTrendTrajectory;
  let momentumMultiplier = 1.0;

  if (churnTier === "high") {
    trendTrajectory = "churning";
    momentumMultiplier = 0.3; // severe discount
  } else if (deltaPct !== null && deltaPct <= -25) {
    trendTrajectory = "decelerating";
    momentumMultiplier = 0.7;
  } else if (deltaPct !== null && deltaPct >= 15) {
    trendTrajectory = "expanding";
    momentumMultiplier = 1.15;
  } else {
    trendTrajectory = "steady";
    momentumMultiplier = 1.0;
  }

  // --- Future Volume Projections ---
  // Number of projected orders in 30 / 60 / 90 days
  const baseOrders30 = 30 / typicalDays;
  const baseOrders60 = 60 / typicalDays;
  const baseOrders90 = 90 / typicalDays;

  const projectedOrderCount30 = Number(
    Math.max(0.2, baseOrders30 * momentumMultiplier).toFixed(1),
  );
  const projectedOrderCount90 = Number(
    Math.max(0.5, baseOrders90 * momentumMultiplier).toFixed(1),
  );

  const projectedVolume30 = Math.round(projectedOrderCount30 * avgVolumePerOrder);
  const projectedVolume60 = Math.round(
    Math.max(0.4, baseOrders60 * momentumMultiplier) * avgVolumePerOrder,
  );
  const projectedVolume90 = Math.round(projectedOrderCount90 * avgVolumePerOrder);

  const projectedRevenue30 = Math.round(projectedOrderCount30 * avgRevenuePerOrder);
  const projectedRevenue90 = Math.round(projectedOrderCount90 * avgRevenuePerOrder);

  const baselineVolume90 = Math.round(baseOrders90 * avgVolumePerOrder);
  const riskAdjustedVolume90 = Math.round(
    projectedVolume90 * (1 - churnProbabilityPct / 100),
  );

  // Retention Recommendation
  let retentionRecommendation: string;
  if (churnTier === "high") {
    if (droppedCount > 0) {
      retentionRecommendation =
        "Emergency sommelier/buyer outreach. Audit dropped wines against competitor placements and propose replacement pour.";
    } else {
      retentionRecommendation =
        "Immediate on-premise visit. Account has missed multiple ordering cycles and is at imminent risk of total churn.";
    }
  } else if (churnTier === "moderate") {
    retentionRecommendation =
      "Schedule rep check-in before end of week. Offer sample tasting of seasonal features or volume discount on core BTG.";
  } else {
    retentionRecommendation =
      "Maintain regular reorder cadence. Present new vintage allocations to expand basket size.";
  }

  return {
    accountName: tracking.accountName,
    salesRep: health?.account.salesRep,
    territoryTier: health?.territoryTier,
    typicalIntervalDays: typicalDays,
    historicalOrdersPerMonth,
    avgVolumePerOrder,
    avgRevenuePerOrder,
    daysSinceLastOrder: daysSince,
    lastOrderDate,
    totalHistoricalVolume: totalVolume,
    expectedNextOrderDate,
    daysUntilExpectedOrder,
    isOverdueForOrder,
    daysOverdue,
    projectedVolume30,
    projectedVolume60,
    projectedVolume90,
    projectedRevenue30,
    projectedRevenue90,
    baselineVolume90,
    riskAdjustedVolume90,
    projectedOrderCount30,
    projectedOrderCount90,
    trendTrajectory,
    momentumMultiplier,
    churnScore,
    churnTier,
    churnProbabilityPct,
    cadenceLapseScore,
    velocityDropScore,
    volumeDeclineScore,
    productAttritionScore,
    churnSignals,
    monthlyVolumeAtRisk,
    monthlyRevenueAtRisk,
    retentionRecommendation,
  };
}

/**
 * Builds future purchase volume projections and churn prediction models for all accounts.
 */
export function buildProjectionsAndChurn(
  analytics: OrderAnalyticsSnapshot,
  healthAccounts?: AccountHealth[],
  asOfOverride?: string,
): PortfolioProjectionSummary {
  const asOf = asOfOverride ?? analytics.asOf ?? new Date().toISOString().slice(0, 10);

  // Map health accounts by normalized name for rep & territory value tier
  const healthMap = new Map<string, AccountHealth>();
  if (healthAccounts) {
    for (const h of healthAccounts) {
      healthMap.set(normalizeName(h.account.name), h);
    }
  }

  const accountResults: AccountProjectionAndChurn[] = analytics.byAccount.map((tracking) => {
    const health = healthMap.get(normalizeName(tracking.accountName));
    return projectSingleAccount(tracking, health, asOf);
  });

  // Portfolio Totals
  const totalProjectedVolume30 = accountResults.reduce((s, a) => s + a.projectedVolume30, 0);
  const totalProjectedVolume60 = accountResults.reduce((s, a) => s + a.projectedVolume60, 0);
  const totalProjectedVolume90 = accountResults.reduce((s, a) => s + a.projectedVolume90, 0);
  const totalProjectedRevenue30 = accountResults.reduce((s, a) => s + a.projectedRevenue30, 0);
  const totalProjectedRevenue90 = accountResults.reduce((s, a) => s + a.projectedRevenue90, 0);
  const totalBaselineVolume90 = accountResults.reduce((s, a) => s + a.baselineVolume90, 0);
  const totalRiskAdjustedVolume90 = accountResults.reduce(
    (s, a) => s + a.riskAdjustedVolume90,
    0,
  );
  const totalMonthlyVolumeAtRisk = accountResults.reduce(
    (s, a) => s + a.monthlyVolumeAtRisk,
    0,
  );
  const totalMonthlyRevenueAtRisk = accountResults.reduce(
    (s, a) => s + a.monthlyRevenueAtRisk,
    0,
  );

  const highChurnCount = accountResults.filter((a) => a.churnTier === "high").length;
  const moderateChurnCount = accountResults.filter((a) => a.churnTier === "moderate").length;
  const lowChurnCount = accountResults.filter((a) => a.churnTier === "low").length;

  return {
    totalProjectedVolume30,
    totalProjectedVolume60,
    totalProjectedVolume90,
    totalProjectedRevenue30,
    totalProjectedRevenue90,
    totalBaselineVolume90,
    totalRiskAdjustedVolume90,
    totalMonthlyVolumeAtRisk,
    totalMonthlyRevenueAtRisk,
    highChurnCount,
    moderateChurnCount,
    lowChurnCount,
    accounts: accountResults,
  };
}

/**
 * Sorts accounts by projection or churn key.
 */
export function sortProjectionRows(
  rows: AccountProjectionAndChurn[],
  column: ProjectionSortKey,
  direction: SortDirection,
): AccountProjectionAndChurn[] {
  const dir = direction === "asc" ? 1 : -1;

  const compareNumbers = (a: number, b: number) => (a - b) * dir;
  const compareStrings = (a: string, b: string) => a.localeCompare(b) * dir;

  return [...rows].sort((a, b) => {
    switch (column) {
      case "accountName":
        return compareStrings(a.accountName, b.accountName);
      case "churnScore":
        return compareNumbers(a.churnScore, b.churnScore);
      case "projectedVolume30":
        return compareNumbers(a.projectedVolume30, b.projectedVolume30);
      case "projectedVolume90":
        return compareNumbers(a.projectedVolume90, b.projectedVolume90);
      case "monthlyVolumeAtRisk":
        return compareNumbers(a.monthlyVolumeAtRisk, b.monthlyVolumeAtRisk);
      case "daysSinceLastOrder":
        return compareNumbers(a.daysSinceLastOrder, b.daysSinceLastOrder);
      case "expectedNextOrderDate":
        return compareStrings(
          a.expectedNextOrderDate ?? "9999-99-99",
          b.expectedNextOrderDate ?? "9999-99-99",
        );
      case "trendTrajectory": {
        const rank = (t: VolumeTrendTrajectory) => {
          switch (t) {
            case "churning":
              return 0;
            case "decelerating":
              return 1;
            case "steady":
              return 2;
            case "expanding":
              return 3;
          }
        };
        return compareNumbers(rank(a.trendTrajectory), rank(b.trendTrajectory));
      }
    }
  });
}
