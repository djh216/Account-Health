export const ACCOUNT_TYPES = [
  "restaurant",
  "hotel",
  "bar",
  "club",
  "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const RISK_LEVELS = ["critical", "at_risk", "dormant", "healthy"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REPORT_KINDS = ["snapshot", "orders", "visits", "accounts"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ScoreMode = "snapshot" | "history";

export type AccountTier = "Platinum" | "Gold" | "Silver" | "Bronze" | string;

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  tier?: AccountTier;
  licenseNumber?: string;
  city?: string;
  county?: string;
  region?: string;
  salesRep?: string;
};

export type Order = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  revenue: number;
  cases: number;
  skuCount?: number;
  product?: string;
};

export type Visit = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  salesRep?: string;
  outcome?: string;
};

export type UploadedReport = {
  id: string;
  fileName: string;
  kind: ReportKind;
  uploadedAt: string;
  rowCount: number;
};

export type HealthFactor = {
  key: "recency" | "trend" | "coverage" | "consistency" | "relationship";
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type FocusAction = {
  title: string;
  reason: string;
  action: string;
};

export const FOCUS_HORIZONS = ["this_week", "two_weeks", "three_weeks"] as const;
export type FocusHorizon = (typeof FOCUS_HORIZONS)[number];

/** Territory value tier for a rep's book (ABC-style volume ranking). */
export const TERRITORY_VALUE_TIERS = ["anchor", "core", "base"] as const;
export type TerritoryValueTier = (typeof TERRITORY_VALUE_TIERS)[number];

export type AccountHealth = {
  account: Account;
  score: number;
  risk: RiskLevel;
  mode: ScoreMode;
  lastOrderDate: string | null;
  daysSinceOrder: number | null;
  lastVisitDate: string | null;
  daysSinceVisit: number | null;
  revenue90: number;
  revenuePrior90: number;
  revenueDeltaPct: number | null;
  orderCount90: number;
  orderCountPrior90: number;
  typicalIntervalDays: number | null;
  orderCadenceOverdue: boolean;
  orderCadenceDaysOverdue: number | null;
  expectedOrderDate: string | null;
  visitCount90: number;
  visitsWithoutOrder: number;
  cases90: number;
  factors: HealthFactor[];
  focus: FocusAction | null;
  focusHorizon: FocusHorizon | null;
  territoryValue?: number;
  territorySharePct?: number;
  territoryTier?: TerritoryValueTier;
  territoryRank?: number;
};

export type PortfolioSnapshot = {
  asOf: string;
  mode: ScoreMode;
  accounts: AccountHealth[];
  totals: {
    accountCount: number;
    critical: number;
    atRisk: number;
    dormant: number;
    healthy: number;
    overdueOrders: number;
    overdueVisits: number;
    revenue90: number;
    revenueAtRisk: number;
  };
};

export type ColumnMapping = {
  account?: string;
  lastOrderDate?: string;
  lastVisitDate?: string;
  date?: string;
  revenue?: string;
  cases?: string;
  skuCount?: string;
  type?: string;
  licenseNumber?: string;
  city?: string;
  county?: string;
  region?: string;
  tier?: string;
  salesRep?: string;
  outcome?: string;
  product?: string;
};

export type ParseResult = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  kind: ReportKind;
  mapping: ColumnMapping;
  warnings: string[];
};

export type PortfolioState = {
  accounts: Account[];
  orders: Order[];
  visits: Visit[];
  reports: UploadedReport[];
  analysisAsOf?: string;
};
