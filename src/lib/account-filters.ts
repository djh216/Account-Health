import { normalizeName } from "./format";
import type { Account, Order, PortfolioState, Visit } from "./types";

function isHomeBaseLabel(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = normalizeName(value);
  return normalized === "home base" || normalized.includes("home base");
}

export function isHomeBaseAccount(account: Account): boolean {
  return (
    isHomeBaseLabel(account.name) ||
    isHomeBaseLabel(account.tier) ||
    isHomeBaseLabel(account.region)
  );
}

export function isHomeBaseAccountName(name: string): boolean {
  return isHomeBaseLabel(name);
}

function isHomeBaseOrder(order: Order, homeBaseIds: Set<string>): boolean {
  return homeBaseIds.has(order.accountId) || isHomeBaseAccountName(order.accountName);
}

function isHomeBaseVisit(visit: Visit, homeBaseIds: Set<string>): boolean {
  return (
    homeBaseIds.has(visit.accountId) || isHomeBaseAccountName(visit.accountName)
  );
}

/** Remove home base accounts and their related orders/visits from a portfolio view. */
export function excludeHomeBaseFromPortfolio(state: PortfolioState): PortfolioState {
  const homeBaseIds = new Set(
    state.accounts.filter(isHomeBaseAccount).map((account) => account.id),
  );

  return {
    ...state,
    accounts: state.accounts.filter((account) => !isHomeBaseAccount(account)),
    orders: state.orders.filter((order) => !isHomeBaseOrder(order, homeBaseIds)),
    visits: state.visits.filter((visit) => !isHomeBaseVisit(visit, homeBaseIds)),
  };
}
