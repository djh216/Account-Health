import { normalizeName } from "./format";
import type { Account, Visit } from "./types";

export type VisitIndex = {
  byAccountId: Map<string, Visit[]>;
  byNormalizedName: Map<string, Visit[]>;
};

function sortVisitsChronologically(visits: Visit[]): Visit[] {
  visits.sort((a, b) => a.date.localeCompare(b.date));
  return visits;
}

export function isSnapshotLastVisitRecord(visit: Visit): boolean {
  return visit.id.endsWith("-last-visit");
}

/** Activity log (e.g. Outfield import) wins over snapshot `*-last-visit` placeholders. */
export function visitsForLastVisitScoring(visits: Visit[]): Visit[] {
  const activity = visits.filter((visit) => !isSnapshotLastVisitRecord(visit));
  return activity.length > 0 ? activity : visits;
}

export function latestVisitByDate(visits: Visit[]): Visit | null {
  const pool = visitsForLastVisitScoring(visits);
  return pool.at(-1) ?? null;
}

export function buildVisitIndex(visits: Visit[]): VisitIndex {
  const byAccountId = new Map<string, Visit[]>();
  const byNormalizedName = new Map<string, Visit[]>();

  for (const visit of visits) {
    if (visit.accountId) {
      const list = byAccountId.get(visit.accountId) ?? [];
      list.push(visit);
      byAccountId.set(visit.accountId, list);
    }
    const nameKey = normalizeName(visit.accountName);
    const nameList = byNormalizedName.get(nameKey) ?? [];
    nameList.push(visit);
    byNormalizedName.set(nameKey, nameList);
  }

  for (const list of byAccountId.values()) sortVisitsChronologically(list);
  for (const list of byNormalizedName.values()) sortVisitsChronologically(list);

  return { byAccountId, byNormalizedName };
}

function mergeVisitLists(byId: Visit[] | undefined, byName: Visit[] | undefined): Visit[] {
  if (byId && byName) {
    if (byId.length === 0) return byName;
    if (byName.length === 0) return byId;
    const merged: Visit[] = [];
    const seen = new Set<Visit>();
    for (const visit of byId) {
      if (!seen.has(visit)) {
        seen.add(visit);
        merged.push(visit);
      }
    }
    for (const visit of byName) {
      if (!seen.has(visit)) {
        seen.add(visit);
        merged.push(visit);
      }
    }
    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
  }
  return byId ?? byName ?? [];
}

/** Matches by account id or normalized account name (same as order index). */
export function visitsForAccount(index: VisitIndex, account: Account): Visit[] {
  const normalized = normalizeName(account.name);
  const byId = account.id ? index.byAccountId.get(account.id) : undefined;
  const byName = index.byNormalizedName.get(normalized);
  return mergeVisitLists(byId, byName);
}

/** Drop snapshot last-visit rows when activity import covers that account. */
export function dropSupersededSnapshotLastVisits(
  current: Visit[],
  incoming: Visit[],
): Visit[] {
  const touchedIds = new Set(incoming.map((visit) => visit.accountId));
  const touchedNames = new Set(incoming.map((visit) => normalizeName(visit.accountName)));

  return current.filter((visit) => {
    if (!isSnapshotLastVisitRecord(visit)) return true;
    if (touchedIds.has(visit.accountId)) return false;
    if (touchedNames.has(normalizeName(visit.accountName))) return false;
    return true;
  });
}
