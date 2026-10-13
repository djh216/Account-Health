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
  /** Set when rep came from account/roster import — not replaced by visit activity. */
  salesRepFromRoster?: boolean;
};

export type Order = {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
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
  /** Time on site in minutes (e.g. Outfield Duration). */
  durationMinutes?: number;
};

export type UploadedReport = {
  id: string;
  fileName: string;
  kind: ReportKind;
  uploadedAt: string;
  rowCount: number;
};

export type HealthFactor = {
  key:
    | "recency"
    | "trend"
    | "coverage"
    | "consistency"
    | "frequency"
    | "relationship"
    | "volume"
    | "pace";
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
  /** Current score minus score as of 14 days ago (orders + activity through each as-of). */
  scoreChange14d?: number | null;
  /** Plain-language drivers for scoreChange14d (account detail). */
  scoreChange14dReasons?: string[];
  risk: RiskLevel;
  mode: ScoreMode;
  lastOrderDate: string | null;
  daysSinceOrder: number | null;
  lastVisitDate: string | null;
  daysSinceVisit: number | null;
  volume90: number;
  volumePrior90: number;
  volumeDeltaPct: number | null;
  orderCount90: number;
  orderCountPrior90: number;
  typicalIntervalDays: number | null;
  orderCadenceOverdue: boolean;
  orderCadenceDaysOverdue: number | null;
  expectedOrderDate: string | null;
  visitCount90: number;
  visitsWithoutOrder: number;
  typicalVisitIntervalDays?: number;
  /** Observed median days between visits in the last 90 days. */
  averageVisitGapDays90?: number | null;
  visitCadenceTargetMinDays?: number;
  visitCadenceTargetMaxDays?: number;
  visitCadenceOverdue?: boolean;
  visitCadenceDaysOverdue?: number | null;
  expectedVisitDate?: string | null;
  avgVisitDurationMinutes90?: number | null;
  lastVisitDurationMinutes?: number | null;
  /** Weekly order events in the trailing 14 days (not raw CSV line count). */
  recentOrders14d?: number;
  recentOrderLines14d?: number;
  recentVisits14d?: number;
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
    volume90: number;
    volumeAtRisk: number;
  };
};

export type ColumnMapping = {
  account?: string;
  lastOrderDate?: string;
  lastVisitDate?: string;
  date?: string;
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
  visitDuration?: string;
};

export type ParseResult = {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  kind: ReportKind;
  mapping: ColumnMapping;
  warnings: string[];
};

/** Per-account last visit from snapshot-style uploads (keys: account id and normalized name). */
export type UploadLastVisitEntry = {
  date: string;
  uploadedAt: string;
};

export type UploadLastVisitIndex = Record<string, UploadLastVisitEntry>;

export type PortfolioState = {
  accounts: Account[];
  orders: Order[];
  visits: Visit[];
  reports: UploadedReport[];
  uploadLastVisitIndex?: UploadLastVisitIndex;
  analysisAsOf?: string;
};
