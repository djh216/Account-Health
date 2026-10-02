import { filterPortfolioByRep } from "@/lib/rep-filter";
import { buildSnapshot, focusAccountsByHorizon } from "@/lib/score";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import type { AccountHealth, FocusHorizon, PortfolioState } from "@/lib/types";

export type RepActionPlan = {
  repName: string;
  accountCount: number;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
};

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
    focusByHorizon: focusAccountsByHorizon(enriched),
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
