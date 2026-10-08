import { normalizeName } from "./format";
import {
  dropSupersededSnapshotLastVisits,
  isSnapshotLastVisitRecord,
} from "./visit-index";
import type { Account, PortfolioState, ReportKind, Visit } from "./types";

type RepAtDate = { date: string; rep: string };

function repFromMostRecentVisit(
  byId: RepAtDate | undefined,
  byName: RepAtDate | undefined,
): string | undefined {
  if (!byId && !byName) return undefined;
  if (!byId) return byName!.rep;
  if (!byName) return byId.rep;
  return byId.date >= byName.date ? byId.rep : byName.rep;
}

/** Latest activity visit rep per account id or normalized account name. */
export function latestActivityRepByAccountKeys(
  visits: Visit[],
): { byAccountId: Map<string, RepAtDate>; byAccountName: Map<string, RepAtDate> } {
  const byAccountId = new Map<string, RepAtDate>();
  const byAccountName = new Map<string, RepAtDate>();

  for (const visit of visits) {
    if (isSnapshotLastVisitRecord(visit)) continue;
    const rep = normalizeVisitSalesRep(visit.salesRep);
    if (!rep) continue;
    const day = visit.date.slice(0, 10);
    if (!day) continue;

    const upsert = (map: Map<string, RepAtDate>, key: string) => {
      const prev = map.get(key);
      if (!prev || day > prev.date) {
        map.set(key, { date: day, rep });
      }
    };

    if (visit.accountId) upsert(byAccountId, visit.accountId);
    upsert(byAccountName, normalizeName(visit.accountName));
  }

  return { byAccountId, byAccountName };
}

/**
 * When an account has no assigned rep, set it from the rep on the most recent
 * activity visit (Outfield / visit upload), not snapshot last-visit placeholders.
 */
export function assignAccountRepsFromRecentVisits(state: PortfolioState): PortfolioState {
  if (state.accounts.length === 0 || state.visits.length === 0) return state;

  const { byAccountId, byAccountName } = latestActivityRepByAccountKeys(state.visits);
  if (byAccountId.size === 0 && byAccountName.size === 0) return state;

  let changed = false;
  const accounts = state.accounts.map((account) => {
    if (account.salesRepFromRoster && account.salesRep?.trim()) return account;

    const byId = account.id ? byAccountId.get(account.id) : undefined;
    const byName = byAccountName.get(normalizeName(account.name));
    const rep = repFromMostRecentVisit(byId, byName);
    if (!rep) return account;
    if (account.salesRep === rep) return account;

    changed = true;
    return { ...account, salesRep: rep, salesRepFromRoster: false };
  });

  if (!changed) return state;
  return { ...state, accounts };
}

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
    isDavidHallRep(account.salesRep)
      ? { ...account, salesRep: undefined, salesRepFromRoster: false }
      : account,
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
