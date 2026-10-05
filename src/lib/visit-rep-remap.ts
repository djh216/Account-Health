import { normalizeName } from "./format";
import { dropSupersededSnapshotLastVisits } from "./visit-index";
import type { Account, PortfolioState, ReportKind, Visit } from "./types";

/** Rep name corrections on visit / activity imports (all activity types). */
const VISIT_REP_REMAP: Record<string, string> = {
  [normalizeName("Alex Cicchitti")]: "Jordan Fuller",
  [normalizeName("Gina Terra")]: "Guido Martelli",
};

export const DAVID_HALL_REP_NORMALIZED = normalizeName("David Hall");

export function isDavidHallRep(name: string | undefined | null): boolean {
  if (!name?.trim()) return false;
  return normalizeName(name) === DAVID_HALL_REP_NORMALIZED;
}
export function normalizeVisitSalesRep(name: string | undefined | null): string | undefined {
  if (!name?.trim()) return undefined;
  const trimmed = name.trim();
  return VISIT_REP_REMAP[normalizeName(trimmed)] ?? trimmed;
}

/** Outfield rules: omit David Hall; apply global rep remap (e.g. Gina Terra → Guido Martelli). */
export function applyVisitImportRules(visit: Visit): Visit | null {
  const repNorm = visit.salesRep ? normalizeName(visit.salesRep) : "";

  if (repNorm === DAVID_HALL_REP_NORMALIZED) {
    return null;
  }

  const salesRep = normalizeVisitSalesRep(visit.salesRep);
  if (salesRep === visit.salesRep) {
    return visit;
  }
  return { ...visit, salesRep };
}

export function isVisitStyleImport(kind: ReportKind): boolean {
  return kind === "visits" || kind === "snapshot";
}

export function remapVisitImportRecords(
  records: { accounts: Account[]; visits: Visit[] },
  kind: ReportKind,
): void {
  if (!isVisitStyleImport(kind)) return;
  records.visits = records.visits
    .map((visit) => applyVisitImportRules(visit))
    .filter((visit): visit is Visit => visit !== null);
  for (const account of records.accounts) {
    account.salesRep = normalizeVisitSalesRep(account.salesRep);
  }
}

/** Apply rep remaps to all stored visits and account reps (import + hydration). */
export function remapPortfolioSalesReps(state: PortfolioState): PortfolioState {
  let changed = false;
  const visits = state.visits.map((visit) => {
    const salesRep = normalizeVisitSalesRep(visit.salesRep);
    if (salesRep === visit.salesRep) return visit;
    changed = true;
    return { ...visit, salesRep };
  });
  const accounts = state.accounts.map((account) => {
    const salesRep = normalizeVisitSalesRep(account.salesRep);
    if (salesRep === account.salesRep) return account;
    changed = true;
    return { ...account, salesRep };
  });
  if (!changed) return state;
  return { ...state, visits, accounts };
}

/** Remove David Hall visits and clear David Hall as account rep on stored portfolio. */
export function stripDavidHallFromPortfolio(state: PortfolioState): PortfolioState {
  const visits = state.visits.filter((visit) => !isDavidHallRep(visit.salesRep));
  const accounts = state.accounts.map((account) =>
    isDavidHallRep(account.salesRep) ? { ...account, salesRep: undefined } : account,
  );
  const visitsChanged = visits.length !== state.visits.length;
  const accountsChanged = accounts.some(
    (account, index) => account.salesRep !== state.accounts[index]?.salesRep,
  );
  if (!visitsChanged && !accountsChanged) return state;
  return { ...state, visits, accounts };
}

export function remapStoredVisitsForImport(
  visits: Visit[],
  kind: ReportKind,
  incoming: Visit[] = [],
): Visit[] {
  if (!isVisitStyleImport(kind)) return visits;
  const cleaned =
    incoming.length > 0 ? dropSupersededSnapshotLastVisits(visits, incoming) : visits;
  return cleaned
    .map((visit) => applyVisitImportRules(visit))
    .filter((visit): visit is Visit => visit !== null);
}
