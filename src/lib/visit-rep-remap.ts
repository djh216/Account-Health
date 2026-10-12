import { normalizeName } from "./format";
import {
  isKnownPhiladelphiaAccountName,
  isPhiladelphiaGeographyLabel,
} from "./philadelphia-territory";
import {
  dropSupersededSnapshotLastVisits,
  isSnapshotLastVisitRecord,
} from "./visit-index";
import type { Account, PortfolioState, ReportKind, Visit } from "./types";

export const GUIDO_MARTELLI_REP_NORMALIZED = normalizeName("Guido Martelli");
export const GINA_TERRA_REP_NORMALIZED = normalizeName("Gina Terra");
export const LIZ_BRUNO_REP_NORMALIZED = normalizeName("Liz Bruno");
export const ANGELA_RICCETTI_REP = "Angela Riccetti";
export const JORDAN_FULLER_REP = "Jordan Fuller";

/** Reps reassigned to Jordan Fuller in Philadelphia territory (not suburb bands). */
const PHILADELPHIA_JORDAN_FULLER_SOURCE_REPS = new Set([
  GUIDO_MARTELLI_REP_NORMALIZED,
  GINA_TERRA_REP_NORMALIZED,
  LIZ_BRUNO_REP_NORMALIZED,
]);

const WESTERN_PHILLY_SUBURBS_TERRITORY_NORMALIZED = normalizeName(
  "Western Philly Suburbs",
);
const NORTHERN_PHILLY_SUBURBS_TERRITORY_NORMALIZED = normalizeName(
  "Northern Philly Suburbs",
);
const PHILADELPHIA_TERRITORY_NORMALIZED = normalizeName("Philadelphia");

export type TerritoryFields = {
  region?: string | null;
  county?: string | null;
  city?: string | null;
};

function territoryStrings(fields: TerritoryFields): string[] {
  const values: string[] = [];
  for (const value of [fields.region, fields.county, fields.city]) {
    if (value?.trim()) values.push(value.trim());
  }
  return values;
}

function isWesternPhillySuburbsNormalized(normalized: string): boolean {
  if (normalized.includes("northern") || normalized.startsWith("north ")) return false;
  if (normalized === WESTERN_PHILLY_SUBURBS_TERRITORY_NORMALIZED) return true;
  if (
    normalized.includes("western") &&
    normalized.includes("philly") &&
    normalized.includes("suburb")
  ) {
    return true;
  }
  if (
    normalized.includes("western") &&
    normalized.includes("philadelphia") &&
    normalized.includes("suburb")
  ) {
    return true;
  }
  if (normalized.includes("west") && normalized.includes("philly") && normalized.includes("suburb")) {
    return true;
  }
  return false;
}

function isNorthernPhillySuburbsNormalized(normalized: string): boolean {
  if (normalized.includes("western") || normalized.startsWith("west ")) return false;
  if (normalized === NORTHERN_PHILLY_SUBURBS_TERRITORY_NORMALIZED) return true;
  if (normalized === normalizeName("North Philly Suburbs")) return true;
  if (
    (normalized.includes("northern") || normalized.includes("north")) &&
    normalized.includes("philly") &&
    normalized.includes("suburb")
  ) {
    return true;
  }
  if (
    (normalized.includes("northern") || normalized.includes("north")) &&
    normalized.includes("philadelphia") &&
    normalized.includes("suburb")
  ) {
    return true;
  }
  if (
    (normalized.includes("northern") || normalized.startsWith("north ")) &&
    normalized.includes("philly") &&
    !normalized.includes("western")
  ) {
    return true;
  }
  return false;
}

/** True when region, county, or city is the Western Philly Suburbs territory (flexible spelling). */
export function isWesternPhillySuburbsTerritory(
  region?: string | null,
  county?: string | null,
  city?: string | null,
): boolean {
  return territoryStrings({ region, county, city }).some((value) =>
    isWesternPhillySuburbsNormalized(normalizeName(value)),
  );
}

/** True when region, county, or city is the Northern Philly Suburbs territory (flexible spelling). */
export function isNorthernPhillySuburbsTerritory(
  region?: string | null,
  county?: string | null,
  city?: string | null,
): boolean {
  return territoryStrings({ region, county, city }).some((value) =>
    isNorthernPhillySuburbsNormalized(normalizeName(value)),
  );
}

/**
 * Philadelphia territory (excludes Western / Northern Philly Suburbs).
 * Uses region/county/city, known account names, and common Philly neighborhood labels.
 */
export function isPhiladelphiaTerritory(
  region?: string | null,
  county?: string | null,
  city?: string | null,
  accountName?: string | null,
): boolean {
  if (accountName && isKnownPhiladelphiaAccountName(accountName)) return true;

  if (isWesternPhillySuburbsTerritory(region, county, city)) return false;
  if (isNorthernPhillySuburbsTerritory(region, county, city)) return false;

  return territoryStrings({ region, county, city }).some((value) => {
    const normalized = normalizeName(value);
    if (normalized.includes("suburb")) return false;
    if (normalized === PHILADELPHIA_TERRITORY_NORMALIZED) return true;
    if (normalized.includes("philadelphia")) return true;
    return isPhiladelphiaGeographyLabel(value);
  });
}

function accountTerritoryFields(account: Account): TerritoryFields {
  return {
    region: account.region,
    county: account.county,
    city: account.city,
  };
}

function buildAccountTerritoryLookups(accounts: Account[]): {
  regionByAccountId: Map<string, TerritoryFields>;
  regionByAccountName: Map<string, TerritoryFields>;
  accountById: Map<string, Account>;
  accountByName: Map<string, Account>;
} {
  const regionByAccountId = new Map<string, TerritoryFields>();
  const regionByAccountName = new Map<string, TerritoryFields>();
  const accountById = new Map<string, Account>();
  const accountByName = new Map<string, Account>();
  for (const account of accounts) {
    const territory = accountTerritoryFields(account);
    if (account.id) {
      regionByAccountId.set(account.id, territory);
      accountById.set(account.id, account);
    }
    regionByAccountName.set(normalizeName(account.name), territory);
    accountByName.set(normalizeName(account.name), account);
  }
  return { regionByAccountId, regionByAccountName, accountById, accountByName };
}

function resolveAccountTerritory(
  accountId: string,
  accountName: string,
  lookups: ReturnType<typeof buildAccountTerritoryLookups>,
): TerritoryFields {
  return (
    lookups.regionByAccountId.get(accountId) ??
    lookups.regionByAccountName.get(normalizeName(accountName)) ??
    {}
  );
}

function resolveAccountForVisit(
  visit: Visit,
  lookups: ReturnType<typeof buildAccountTerritoryLookups>,
): Account | undefined {
  if (visit.accountId) {
    const byId = lookups.accountById.get(visit.accountId);
    if (byId) return byId;
  }
  return lookups.accountByName.get(normalizeName(visit.accountName));
}

/** Guido Martelli → Angela Riccetti for Western Philly Suburbs accounts and activity. */
export function reassignWesternPhillyGuidoRep(
  salesRep: string | undefined | null,
  region?: string | null,
  county?: string | null,
  city?: string | null,
): string | undefined {
  if (!salesRep?.trim()) return undefined;
  const trimmed = salesRep.trim();
  if (normalizeName(trimmed) !== GUIDO_MARTELLI_REP_NORMALIZED) return trimmed;
  if (!isWesternPhillySuburbsTerritory(region, county, city)) return trimmed;
  return ANGELA_RICCETTI_REP;
}

/** Guido Martelli → Jordan Fuller for Northern Philly Suburbs accounts and activity. */
export function reassignNorthernPhillyGuidoRep(
  salesRep: string | undefined | null,
  region?: string | null,
  county?: string | null,
  city?: string | null,
): string | undefined {
  if (!salesRep?.trim()) return undefined;
  const trimmed = salesRep.trim();
  if (normalizeName(trimmed) !== GUIDO_MARTELLI_REP_NORMALIZED) return trimmed;
  if (!isNorthernPhillySuburbsTerritory(region, county, city)) return trimmed;
  return JORDAN_FULLER_REP;
}

export function isPhiladelphiaJordanFullerSourceRep(name: string | undefined | null): boolean {
  if (!name?.trim()) return false;
  return PHILADELPHIA_JORDAN_FULLER_SOURCE_REPS.has(normalizeName(name));
}

/**
 * Guido Martelli, Gina Terra, or Liz Bruno → Jordan Fuller for Philadelphia territory
 * accounts and activity.
 */
export function reassignPhiladelphiaLegacyTeamRep(
  salesRep: string | undefined | null,
  region?: string | null,
  county?: string | null,
  city?: string | null,
  accountName?: string | null,
): string | undefined {
  if (!salesRep?.trim()) return undefined;
  const trimmed = salesRep.trim();
  if (!isPhiladelphiaJordanFullerSourceRep(trimmed)) return trimmed;
  if (!isPhiladelphiaTerritory(region, county, city, accountName)) return trimmed;
  return JORDAN_FULLER_REP;
}

/** @deprecated Use reassignPhiladelphiaLegacyTeamRep — Guido-only alias for tests/callers. */
export function reassignPhiladelphiaGuidoRep(
  salesRep: string | undefined | null,
  region?: string | null,
  county?: string | null,
  city?: string | null,
  accountName?: string | null,
): string | undefined {
  return reassignPhiladelphiaLegacyTeamRep(salesRep, region, county, city, accountName);
}

function applyTerritoryGuidoRepToSalesRep(
  salesRep: string | undefined,
  territory: TerritoryFields,
  accountName?: string | null,
): string | undefined {
  const { region, county, city } = territory;
  if (salesRep?.trim()) {
    const phillyDirect = reassignPhiladelphiaLegacyTeamRep(
      salesRep,
      region,
      county,
      city,
      accountName,
    );
    if (phillyDirect === JORDAN_FULLER_REP) return JORDAN_FULLER_REP;
  }
  const normalized = normalizeVisitSalesRep(salesRep);
  const western = reassignWesternPhillyGuidoRep(normalized, region, county, city);
  const northern = reassignNorthernPhillyGuidoRep(western, region, county, city);
  return reassignPhiladelphiaLegacyTeamRep(northern, region, county, city, accountName);
}

function reconcileGuidoVisitRep(
  visit: Visit,
  account: Account | undefined,
  territory: TerritoryFields,
): string | undefined {
  const accountName = account?.name ?? visit.accountName;
  let salesRep = applyTerritoryGuidoRepToSalesRep(visit.salesRep, territory, accountName);
  if (
    isPhiladelphiaJordanFullerSourceRep(salesRep) &&
    account?.salesRep &&
    !isPhiladelphiaJordanFullerSourceRep(account.salesRep)
  ) {
    return account.salesRep;
  }
  if (isPhiladelphiaJordanFullerSourceRep(salesRep)) {
    salesRep = applyTerritoryGuidoRepToSalesRep(
      visit.salesRep,
      account ? accountTerritoryFields(account) : territory,
      accountName,
    );
  }
  return salesRep;
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
    if (!rep || isPhiladelphiaJordanFullerSourceRep(rep)) continue;
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
    if (account.salesRepFromRoster && account.salesRep?.trim()) {
      const remapped = applyTerritoryGuidoRepToSalesRep(
        account.salesRep,
        accountTerritoryFields(account),
        account.name,
      );
      if (remapped && remapped !== account.salesRep && !isGuidoMartelliRep(remapped)) {
        changed = true;
        return { ...account, salesRep: remapped, salesRepFromRoster: false };
      }
      return account;
    }

    const byId = account.id ? byAccountId.get(account.id) : undefined;
    const byName = byAccountName.get(normalizeName(account.name));
    const rep = repFromMostRecentVisit(byId, byName);
    if (!rep || isPhiladelphiaJordanFullerSourceRep(rep)) return account;
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

export function isGuidoMartelliRep(name: string | undefined | null): boolean {
  if (!name?.trim()) return false;
  return normalizeName(name) === GUIDO_MARTELLI_REP_NORMALIZED;
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
  existingAccounts: Account[] = [],
): void {
  if (!isVisitStyleImport(kind)) return;
  records.visits = records.visits
    .map((visit) => applyVisitImportRules(visit))
    .filter((visit): visit is Visit => visit !== null);
  const lookups = buildAccountTerritoryLookups([...existingAccounts, ...records.accounts]);
  for (const account of records.accounts) {
    const salesRep = applyTerritoryGuidoRepToSalesRep(
      account.salesRep,
      accountTerritoryFields(account),
      account.name,
    );
    if (salesRep !== account.salesRep) {
      account.salesRep = salesRep;
      account.salesRepFromRoster = false;
    }
  }
  records.visits = records.visits.map((visit) => {
    const account = resolveAccountForVisit(visit, lookups);
    const territory = account
      ? accountTerritoryFields(account)
      : resolveAccountTerritory(visit.accountId, visit.accountName, lookups);
    const salesRep = reconcileGuidoVisitRep(visit, account, territory);
    if (salesRep === visit.salesRep) return visit;
    return { ...visit, salesRep };
  });
}

/** Apply rep remaps to all stored visits and account reps (import + hydration). */
export function remapPortfolioSalesReps(state: PortfolioState): PortfolioState {
  let changed = false;
  const lookups = buildAccountTerritoryLookups(state.accounts);

  const accounts = state.accounts.map((account) => {
    const salesRep = applyTerritoryGuidoRepToSalesRep(
      account.salesRep,
      accountTerritoryFields(account),
      account.name,
    );
    if (salesRep === account.salesRep) return account;
    changed = true;
    return { ...account, salesRep, salesRepFromRoster: false };
  });

  const refreshedLookups = buildAccountTerritoryLookups(accounts);

  const visits = state.visits.map((visit) => {
    const account = resolveAccountForVisit(visit, refreshedLookups);
    const territory = account
      ? accountTerritoryFields(account)
      : resolveAccountTerritory(visit.accountId, visit.accountName, refreshedLookups);
    const salesRep = reconcileGuidoVisitRep(visit, account, territory);
    if (salesRep === visit.salesRep) return visit;
    changed = true;
    return { ...visit, salesRep };
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

/** Remove Guido Martelli visits and clear Guido as account rep (no rep dashboard). */
export function stripGuidoMartelliFromPortfolio(state: PortfolioState): PortfolioState {
  const visits = state.visits.filter((visit) => !isGuidoMartelliRep(visit.salesRep));
  const accounts = state.accounts.map((account) =>
    isGuidoMartelliRep(account.salesRep)
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
