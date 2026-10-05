import { normalizeName } from "./format";
import { dropSupersededSnapshotLastVisits } from "./visit-index";
import type { Account, ReportKind, Visit } from "./types";

/** Rep name corrections on visit / activity imports (all activity types). */
const VISIT_REP_REMAP: Record<string, string> = {
  [normalizeName("Alex Cicchitti")]: "Jordan Fuller",
};

const DAVID_HALL = normalizeName("David Hall");
const GINA_TERRA = normalizeName("Gina Terra");

export function isCheckInOutcome(outcome: string | undefined | null): boolean {
  const value = (outcome ?? "").trim().toLowerCase();
  return value === "check in" || value.startsWith("check in ");
}

export function normalizeVisitSalesRep(name: string | undefined | null): string | undefined {
  if (!name?.trim()) return undefined;
  const trimmed = name.trim();
  return VISIT_REP_REMAP[normalizeName(trimmed)] ?? trimmed;
}

/** Outfield rules: drop David Hall check-ins; Gina Terra check-ins → Guido Martelli; then global rep remap. */
export function applyVisitImportRules(visit: Visit): Visit | null {
  const repNorm = visit.salesRep ? normalizeName(visit.salesRep) : "";
  const checkIn = isCheckInOutcome(visit.outcome);

  if (checkIn && repNorm === DAVID_HALL) {
    return null;
  }

  let salesRep = visit.salesRep;
  if (checkIn && repNorm === GINA_TERRA) {
    salesRep = "Guido Martelli";
  }
  salesRep = normalizeVisitSalesRep(salesRep);

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
