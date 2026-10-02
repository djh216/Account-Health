import type { Visit } from "./types";

export type VisitIndex = Map<string, Visit[]>;

export function buildVisitIndex(visits: Visit[]): VisitIndex {
  const byAccountId = new Map<string, Visit[]>();
  for (const visit of visits) {
    const list = byAccountId.get(visit.accountId) ?? [];
    list.push(visit);
    byAccountId.set(visit.accountId, list);
  }
  for (const list of byAccountId.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byAccountId;
}

export function visitsForAccount(index: VisitIndex, accountId: string): Visit[] {
  return index.get(accountId) ?? [];
}
