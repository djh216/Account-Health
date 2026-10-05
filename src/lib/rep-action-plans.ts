import { filterPortfolioByRep } from "@/lib/rep-filter";
import { buildSnapshot, FOCUS_HORIZON_LIMITS } from "@/lib/score";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import {
  territoryTierActionWeight,
  visitCadenceUrgencyScore,
} from "@/lib/visit-cadence";
import type { AccountHealth, FocusHorizon, PortfolioState, RiskLevel } from "@/lib/types";

export type RepActionPlan = {
  repName: string;
  accountCount: number;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
};

const ACTION_PLAN_RISK_WEIGHT: Record<RiskLevel, number> = {
  critical: 4_000,
  at_risk: 3_000,
  dormant: 2_000,
  healthy: 1_000,
};

/** Higher = earlier on the 1 / 2 / 3 week plan (risk, visit cadence vs tier policy, value tier, score). */
export function actionPlanPriority(account: AccountHealth): number {
  return (
    ACTION_PLAN_RISK_WEIGHT[account.risk] +
    visitCadenceUrgencyScore(account) +
    territoryTierActionWeight(account.territoryTier) -
    account.score * 2
  );
}

export function compareAccountsForActionPlan(a: AccountHealth, b: AccountHealth): number {
  return actionPlanPriority(b) - actionPlanPriority(a);
}

export function focusAccountsByHorizonForActionPlan(
  accounts: AccountHealth[],
): Record<FocusHorizon, AccountHealth[]> {
  const sorted = [...accounts].sort(compareAccountsForActionPlan);
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

function planForPortfolioSlice(
  portfolioState: PortfolioState,
  repName: string,
): RepActionPlan {
  const asOf = portfolioState.analysisAsOf;
  const snapshot = buildSnapshot(
    portfolioState.accounts,
    portfolioState.orders,
    portfolioState.visits,
    asOf,
  );
  const enriched = enrichAccountsWithTerritoryValue(snapshot.accounts, portfolioState.orders);
  return {
    repName,
    accountCount: enriched.length,
    focusByHorizon: focusAccountsByHorizonForActionPlan(enriched),
  };
}

/** Actionable 1 / 2 / 3 week priorities for one rep or every rep on the book. */
export function buildRepActionPlans(
  visibleState: PortfolioState,
  reps: string[],
  repFilter: string,
): RepActionPlan[] {
  if (repFilter !== "all") {
    const slice = filterPortfolioByRep(visibleState, repFilter);
    const plan = planForPortfolioSlice(slice, repFilter);
    return plan.accountCount > 0 ? [plan] : [];
  }

  const plans: RepActionPlan[] = [];
  for (const rep of reps) {
    const slice = filterPortfolioByRep(visibleState, rep);
    const plan = planForPortfolioSlice(slice, rep);
    if (plan.accountCount > 0) {
      plans.push(plan);
    }
  }
  return plans.sort((a, b) => a.repName.localeCompare(b.repName));
}

export function totalFocusActions(plan: RepActionPlan): number {
  return (
    plan.focusByHorizon.this_week.length +
    plan.focusByHorizon.two_weeks.length +
    plan.focusByHorizon.three_weeks.length
  );
}
