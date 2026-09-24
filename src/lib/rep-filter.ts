import { normalizeName } from "./format";
import type { PortfolioState } from "./types";

export const REP_FILTER_KEY = "cellar-pulse.rep-filter.v1";

const listeners = new Set<() => void>();

export function listSalesReps(state: PortfolioState): string[] {
  const names = new Set<string>();
  for (const account of state.accounts) {
    if (account.salesRep) names.add(account.salesRep);
  }
  for (const visit of state.visits) {
    if (visit.salesRep) names.add(visit.salesRep);
  }
  return [...names].sort();
}

export function filterPortfolioByRep(
  state: PortfolioState,
  repFilter: string,
): PortfolioState {
  if (repFilter === "all") return state;

  const accounts = state.accounts.filter((account) => account.salesRep === repFilter);
  const accountIds = new Set(accounts.map((account) => account.id));
  const accountNames = new Set(accounts.map((account) => normalizeName(account.name)));

  const orders = state.orders.filter(
    (order) =>
      accountIds.has(order.accountId) ||
      accountNames.has(normalizeName(order.accountName)),
  );

  const visits = state.visits.filter(
    (visit) =>
      visit.salesRep === repFilter ||
      accountIds.has(visit.accountId) ||
      accountNames.has(normalizeName(visit.accountName)),
  );

  return {
    ...state,
    accounts,
    orders,
    visits,
  };
}

export function subscribeRepFilter(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRepFilterSnapshot(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem(REP_FILTER_KEY) ?? "all";
}

export function setRepFilter(value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REP_FILTER_KEY, value);
  for (const listener of listeners) listener();
}

export function resetRepFilter(): void {
  setRepFilter("all");
}
