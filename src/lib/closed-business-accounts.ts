import { normalizeName } from "./format";

export const CLOSED_BUSINESS_CHANGE_EVENT = "cellar-pulse-closed-business-change";

const STORAGE_KEY = "cellar-pulse.closed-business-accounts";

export type ClosedBusinessAccount = {
  id: string;
  accountName: string;
  markedAt: string;
};

export function closedBusinessAccountId(accountName: string): string {
  return normalizeName(accountName);
}

function isClosedBusinessAccount(value: unknown): value is ClosedBusinessAccount {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.accountName === "string" &&
    typeof record.markedAt === "string"
  );
}

export function readClosedBusinessAccounts(): ClosedBusinessAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isClosedBusinessAccount);
  } catch {
    return [];
  }
}

function writeClosedBusinessAccounts(accounts: ClosedBusinessAccount[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new Event(CLOSED_BUSINESS_CHANGE_EVENT));
  } catch {
    // ignore storage write errors
  }
}

export function markAccountClosedBusiness(account: {
  id: string;
  accountName: string;
}): void {
  const existing = readClosedBusinessAccounts().filter((item) => item.id !== account.id);
  writeClosedBusinessAccounts([
    ...existing,
    {
      id: account.id,
      accountName: account.accountName,
      markedAt: new Date().toISOString(),
    },
  ]);
}

export function restoreClosedBusinessAccount(id: string): void {
  writeClosedBusinessAccounts(readClosedBusinessAccounts().filter((item) => item.id !== id));
}

export function excludeClosedBusinessAccounts<T extends { id: string }>(
  items: T[],
  closedIds: Set<string>,
): T[] {
  if (closedIds.size === 0) return items;
  return items.filter((item) => !closedIds.has(item.id));
}

export function isAccountClosedBusiness(
  accountName: string,
  closedIds: Set<string>,
): boolean {
  if (closedIds.size === 0) return false;
  return closedIds.has(closedBusinessAccountId(accountName));
}
