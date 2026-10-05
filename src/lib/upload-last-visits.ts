import { normalizeName } from "./format";
import type { PortfolioState, UploadLastVisitEntry, UploadLastVisitIndex } from "./types";

const SNAPSHOT_VISIT_UPLOADED_AT = "1970-01-01T00:00:00.000Z";

/** Hydrate index from activity log visits when upgrading stored portfolios. */
export function ensureUploadLastVisitIndex(state: PortfolioState): UploadLastVisitIndex {
  const existing = state.uploadLastVisitIndex;
  if (existing && Object.keys(existing).length > 0) return existing;

  const activityVisits = state.visits.filter((visit) => !visit.id.endsWith("-last-visit"));
  const source =
    activityVisits.length > 0
      ? activityVisits
      : state.visits.filter((visit) => visit.id.endsWith("-last-visit"));

  const byAccount = new Map<string, { accountId: string; accountName: string; date: string }>();
  for (const visit of source) {
    if (!visit.date) continue;
    const date = visit.date.slice(0, 10);
    const prev = byAccount.get(visit.accountId);
    if (!prev || date > prev.date) {
      byAccount.set(visit.accountId, {
        accountId: visit.accountId,
        accountName: visit.accountName,
        date,
      });
    }
  }

  const fromVisits = [...byAccount.values()];
  if (fromVisits.length === 0) return existing ?? {};
  return mergeUploadLastVisitIndex({}, fromVisits, SNAPSHOT_VISIT_UPLOADED_AT);
}

export function mergeUploadLastVisitIndex(
  current: UploadLastVisitIndex | undefined,
  entries: Array<{ accountId: string; accountName: string; date: string }>,
  uploadedAt: string,
): UploadLastVisitIndex {
  const next: UploadLastVisitIndex = { ...(current ?? {}) };
  for (const entry of entries) {
    const date = entry.date.slice(0, 10);
    for (const key of [entry.accountId, normalizeName(entry.accountName)]) {
      if (!key) continue;
      const prev = next[key];
      if (prev && uploadedAt < prev.uploadedAt) continue;
      if (prev && uploadedAt === prev.uploadedAt && date < prev.date) continue;
      next[key] = { date, uploadedAt };
    }
  }
  return next;
}

export function uploadLastVisitKeysForAccount(
  index: UploadLastVisitIndex | undefined,
  accountId: string | undefined,
  accountName: string,
): UploadLastVisitEntry | null {
  if (!index) return null;
  if (accountId && index[accountId]) return index[accountId]!;
  const byName = index[normalizeName(accountName)];
  return byName ?? null;
}
