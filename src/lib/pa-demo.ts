import type { Account, PortfolioState } from "./types";

/** Accounts shipped with the old Pennsylvania licensee snapshot demo */
export const PA_DEMO_ACCOUNT_NAMES = new Set([
  "The Walnut Room",
  "Allegheny Chop House",
  "Lancaster Table",
  "The Cocoa Inn",
  "South Street Oyster House",
  "Iron City Tavern",
  "Lehigh Valley Club",
  "Reading Market Grill",
  "State College Inn",
  "Scranton Chop & Barrel",
  "West Chester Taproom",
  "Erie Harbor House",
  "York Street Bistro",
  "Manayunk Social",
  "Harrisburg Station Cafe",
  "Bucks County Club",
  "Easton Table & Tap",
  "The Monongahela Room",
]);

const PA_DEMO_SALES_REPS = new Set(["Dana Ricci", "Meghan Park", "Ben Calder"]);

const PA_DEMO_LICENSE = /^[RHEC]-\d{4,6}$/i;

export function isPaDemoAccount(account: Account): boolean {
  if (PA_DEMO_ACCOUNT_NAMES.has(account.name)) return true;
  if (
    account.licenseNumber &&
    PA_DEMO_LICENSE.test(account.licenseNumber.trim()) &&
    account.salesRep &&
    PA_DEMO_SALES_REPS.has(account.salesRep)
  ) {
    return true;
  }
  return false;
}

export function portfolioContainsPaDemo(state: PortfolioState): boolean {
  const demoAccounts = state.accounts.filter(isPaDemoAccount).length;
  if (demoAccounts >= 2) return true;
  if (demoAccounts > 0 && demoAccounts === state.accounts.length) return true;
  return false;
}

export function stripPaDemoPortfolio(state: PortfolioState): PortfolioState {
  const demoIds = new Set(
    state.accounts.filter(isPaDemoAccount).map((account) => account.id),
  );
  if (demoIds.size === 0) return state;

  return {
    ...state,
    accounts: state.accounts.filter((account) => !demoIds.has(account.id)),
    orders: state.orders.filter((order) => !demoIds.has(order.accountId)),
    visits: state.visits.filter((visit) => !demoIds.has(visit.accountId)),
    reports: state.reports.filter(
      (report) =>
        !/licensee-snapshot|pa sample|sample book|licensee roster/i.test(report.fileName),
    ),
  };
}
