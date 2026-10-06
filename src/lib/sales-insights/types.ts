import type { AccountHealth, RiskLevel } from "@/lib/types";
import type { TerritoryValueTier } from "@/lib/types";

export type DueToReorderRow = {
  accountId: string;
  accountName: string;
  salesRep?: string;
  territoryTier?: TerritoryValueTier;
  expectedOrderDate: string;
  daysUntilExpected: number;
  typicalIntervalDays: number;
  daysSinceOrder: number;
  score: number;
  risk: RiskLevel;
};

export type VisitCoverageAccountRow = {
  accountId: string;
  accountName: string;
  salesRep?: string;
  territoryTier?: TerritoryValueTier;
  daysSinceVisit: number | null;
  visitCadenceOverdue: boolean;
  targetMaxDays?: number;
  lastVisitDate: string | null;
};

export type VisitCoverageRepSummary = {
  repName: string;
  accountCount: number;
  visitsLast30Days: number;
  visitOverdueCount: number;
  noVisit60DaysCount: number;
  avgDaysSinceVisit: number | null;
};

export type VisitConversionRepRow = {
  repName: string;
  visitCount90: number;
  convertedVisits90: number;
  strikeRatePct: number;
  ordersFollowingVisits90: number;
};

export type SkuBreadthRow = {
  accountId: string;
  accountName: string;
  salesRep?: string;
  skuCountRecent90: number;
  skuCountPrior90: number;
  skuDelta: number;
  volume90: number;
  territoryTier?: TerritoryValueTier;
};

export type WinBackSkuRow = {
  accountName: string;
  product: string;
  salesRep?: string;
  priorVolume90: number;
  lastOrderedDate: string | null;
  daysSinceLastOrder: number | null;
};

export type MomentumRow = {
  account: AccountHealth;
  scoreChange14d: number;
};

export type VolumeDimensionRow = {
  label: string;
  accountCount: number;
  bottles90: number;
  atRiskVolume90: number;
  criticalCount: number;
};

export type WeeklyBriefingSummary = {
  asOf: string;
  repFilter: string;
  totalAccounts: number;
  avgScore: number;
  criticalCount: number;
  atRiskCount: number;
  volumeAtRisk90: number;
  dueToReorderCount: number;
  visitOverdueCount: number;
  strikeRateAllRepsPct: number | null;
  newAccountsCount: number;
  retainedCount: number;
  returningCount: number;
  highChurnCount: number;
  frequencyAlertCount: number;
  productAlertCount: number;
  topDueAccounts: DueToReorderRow[];
  topImproving: MomentumRow[];
  topDeclining: MomentumRow[];
};

export type SalesInsightsBundle = {
  asOf: string;
  repFilter: string;
  dueToReorder: DueToReorderRow[];
  visitCoverageAccounts: VisitCoverageAccountRow[];
  visitCoverageByRep: VisitCoverageRepSummary[];
  visitConversionByRep: VisitConversionRepRow[];
  skuBreadth: SkuBreadthRow[];
  winBackSkus: WinBackSkuRow[];
  improving: MomentumRow[];
  declining: MomentumRow[];
  volumeByTier: VolumeDimensionRow[];
  volumeByRegion: VolumeDimensionRow[];
  volumeByRep: VolumeDimensionRow[];
  weeklyBriefing: WeeklyBriefingSummary;
};
