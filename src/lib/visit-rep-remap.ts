import { normalizeName } from "./format";
import {
  dropSupersededSnapshotLastVisits,
  isSnapshotLastVisitRecord,
} from "./visit-index";
import type { Account, PortfolioState, ReportKind, Visit } from "./types";

export const GUIDO_MARTELLI_REP_NORMALIZED = normalizeName("Guido Martelli");
export const ANGELA_RICCETTI_REP = "Angela Riccetti";

const WESTERN_PHILLY_SUBURBS_TERRITORY_NORMALIZED = normalizeName(
  "Western Philly Suburbs",
);

/** True when region or county is the Western Philly Suburbs territory (flexible spelling). */
export function isWesternPhillySuburbsTerritory(
  region?: string | null,
  county?: string | null,
): boolean {
  for (const value of [region, county]) {
    if (!value?.trim()) continue;
    const normalized = normalizeName(value);
    if (normalized === WESTERN_PHILLY_SUBURBS_TERRITORY_NORMALIZED) return true;
    if (
      normalized.includes("western") &&
      normalized.includes("philly") &&
      normalized.includes("suburb")
    ) {
      return true;
    }
  }
  return false;
}

function buildAccountTerritoryLookups(accounts: Account[]): {
  regionByAccountId: Map<string, { region?: string; county?: string }>;
  regionByAccountName: Map<string, { region?: string; county?: string }>;
} {
  const regionByAccountId = new Map<string, { region?: string; county?: string }>();
  const regionByAccountName = new Map<string, { region?: string; county?: string }>();
  for (const account of accounts) {
    const territory = { region: account.region, county: account.county };
    if (account.id) regionByAccountId.set(account.id, territory);
    regionByAccountName.set(normalizeName(account.name), territory);
  }
  return { regionByAccountId, regionByAccountName };
}

function resolveAccountTerritory(
  accountId: string,
  accountName: string,
  lookups: ReturnType<typeof buildAccountTerritoryLookups>,
): { region?: string; county?: string } {
  return (
    lookups.regionByAccountId.get(accountId) ??
    lookups.regionByAccountName.get(normalizeName(accountName)) ??
    {}
  );
}

/** Guido Martelli → Angela Riccetti for Western Philly Suburbs accounts and activity. */
export function reassignWesternPhillyGuidoRep(
  salesRep: string | undefined | null,
  region?: string | null,
  county?: string | null,
): string | undefined {
  if (!salesRep?.trim()) return undefined;
  const trimmed = salesRep.trim();
  if (normalizeName(trimmed) !== GUIDO_MARTELLI_REP_NORMALIZED) return trimmed;
  if (!isWesternPhillySuburbsTerritory(region, county)) return trimmed;
  return ANGELA_RICCETTI_REP;
}

function applyWesternPhillyGuidoRepToSalesRep(
  salesRep: string | undefined,
  region?: string,
  county?: string,
): string | undefined {
  const normalized = normalizeVisitSalesRep(salesRep);
  return reassignWesternPhillyGuidoRep(normalized, region, county);
}

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
  const lookups = buildAccountTerritoryLookups(records.accounts);
  for (const account of records.accounts) {
    account.salesRep = applyWesternPhillyGuidoRepToSalesRep(
      account.salesRep,
      account.region,
      account.county,
    );
  }
  records.visits = records.visits.map((visit) => {
    const territory = resolveAccountTerritory(visit.accountId, visit.accountName, lookups);
    const salesRep = applyWesternPhillyGuidoRepToSalesRep(
      visit.salesRep,
      territory.region,
      territory.county,
    );
    if (salesRep === visit.salesRep) return visit;
    return { ...visit, salesRep };
  });
}

/** Apply rep remaps to all stored visits and account reps (import + hydration). */
export function remapPortfolioSalesReps(state: PortfolioState): PortfolioState {
  let changed = false;
  const lookups = buildAccountTerritoryLookups(state.accounts);

  const visits = state.visits.map((visit) => {
    const territory = resolveAccountTerritory(visit.accountId, visit.accountName, lookups);
    const salesRep = applyWesternPhillyGuidoRepToSalesRep(
      visit.salesRep,
      territory.region,
      territory.county,
    );
    if (salesRep === visit.salesRep) return visit;
    changed = true;
    return { ...visit, salesRep };
  });
  const accounts = state.accounts.map((account) => {
    const salesRep = applyWesternPhillyGuidoRepToSalesRep(
      account.salesRep,
      account.region,
      account.county,
    );
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
