import { formatDate, normalizeName } from "./format";
import type { AccountHealth } from "./types";

export type PdfAccountVisitSnapshot = {
  lastVisitDate: string | null;
  daysSinceVisit: number | null;
};

export type PdfAccountVisitLookup = Record<string, PdfAccountVisitSnapshot>;

export function buildPdfAccountVisitLookup(
  accounts: AccountHealth[],
): PdfAccountVisitLookup {
  const lookup: PdfAccountVisitLookup = {};
  for (const health of accounts) {
    const snapshot: PdfAccountVisitSnapshot = {
      lastVisitDate: health.lastVisitDate,
      daysSinceVisit: health.daysSinceVisit,
    };
    if (health.account.id) {
      lookup[health.account.id] = snapshot;
    }
    lookup[normalizeName(health.account.name)] = snapshot;
  }
  return lookup;
}

export function pdfVisitForAccount(
  lookup: PdfAccountVisitLookup | undefined,
  accountId: string | undefined,
  accountName: string,
): PdfAccountVisitSnapshot | null {
  if (!lookup) return null;
  if (accountId && lookup[accountId]) return lookup[accountId]!;
  const byName = lookup[normalizeName(accountName)];
  return byName ?? null;
}

/** Compact cell for PDF tables: date plus days ago on second line when known. */
export function formatPdfLastVisitCell(
  lastVisitDate: string | null | undefined,
  daysSinceVisit: number | null | undefined,
): string {
  if (!lastVisitDate) return "—";
  if (daysSinceVisit !== null && daysSinceVisit !== undefined) {
    return `${formatDate(lastVisitDate)}\n(${daysSinceVisit}d ago)`;
  }
  return formatDate(lastVisitDate);
}

export function formatPdfLastVisitFromLookup(
  lookup: PdfAccountVisitLookup | undefined,
  accountId: string | undefined,
  accountName: string,
): string {
  const visit = pdfVisitForAccount(lookup, accountId, accountName);
  if (!visit) return "—";
  return formatPdfLastVisitCell(visit.lastVisitDate, visit.daysSinceVisit);
}
