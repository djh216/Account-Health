import {
  findActivityOrderedColumn,
  isAffirmativeOrderedYes,
} from "./parse";
import { normalizeName, slugify } from "./format";
import { isVisitStyleImport } from "./visit-rep-remap";
import type { Account, ColumnMapping, Order, ParseResult, PortfolioState, Visit } from "./types";

type ImportRecords = {
  accounts: Account[];
  orders: Order[];
  visits: Visit[];
};

function accountKeysFromRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
  index: number,
): { id: string; nameKey: string } | null {
  const name = (row[mapping.account ?? ""] ?? "").trim();
  if (!name) return null;
  const id = slugify(normalizeName(name)) || `licensee-${index}`;
  return { id, nameKey: normalizeName(name) };
}

function isPurgedAccount(id: string, name: string, purgeKeys: Set<string>): boolean {
  return purgeKeys.has(id) || purgeKeys.has(normalizeName(name));
}

/** Accounts in this activity file with no `Ordered?` = yes row are dropped from the portfolio. */
export function purgeKeysForActivityWithoutOrderedYes(
  result: ParseResult,
): Set<string> | null {
  if (!isVisitStyleImport(result.kind)) return null;
  const orderedColumn = findActivityOrderedColumn(result.headers);
  if (!orderedColumn) return null;

  const byAccountId = new Map<string, { id: string; nameKey: string; hasYes: boolean }>();

  result.rows.forEach((row, index) => {
    const keys = accountKeysFromRow(row, result.mapping, index);
    if (!keys) return;
    const entry = byAccountId.get(keys.id) ?? {
      id: keys.id,
      nameKey: keys.nameKey,
      hasYes: false,
    };
    if (isAffirmativeOrderedYes(row[orderedColumn])) {
      entry.hasYes = true;
    }
    byAccountId.set(keys.id, entry);
  });

  const purgeKeys = new Set<string>();
  for (const entry of byAccountId.values()) {
    if (!entry.hasYes) {
      purgeKeys.add(entry.id);
      purgeKeys.add(entry.nameKey);
    }
  }
  return purgeKeys;
}

export function filterImportRecordsByOrderedYes(
  records: ImportRecords,
  purgeKeys: Set<string>,
): ImportRecords {
  if (purgeKeys.size === 0) return records;
  return {
    accounts: records.accounts.filter(
      (account) => !isPurgedAccount(account.id, account.name, purgeKeys),
    ),
    orders: records.orders.filter(
      (order) => !isPurgedAccount(order.accountId, order.accountName, purgeKeys),
    ),
    visits: records.visits.filter(
      (visit) => !isPurgedAccount(visit.accountId, visit.accountName, purgeKeys),
    ),
  };
}

export function purgePortfolioByActivityOrderedKeys(
  state: PortfolioState,
  purgeKeys: Set<string>,
): PortfolioState {
  if (purgeKeys.size === 0) return state;
  return {
    ...state,
    accounts: state.accounts.filter(
      (account) => !isPurgedAccount(account.id, account.name, purgeKeys),
    ),
    orders: state.orders.filter(
      (order) => !isPurgedAccount(order.accountId, order.accountName, purgeKeys),
    ),
    visits: state.visits.filter(
      (visit) => !isPurgedAccount(visit.accountId, visit.accountName, purgeKeys),
    ),
  };
}

export function applyActivityOrderedYesFilter(
  result: ParseResult,
  records: ImportRecords,
): { records: ImportRecords; purgeKeys: Set<string> | null } {
  const purgeKeys = purgeKeysForActivityWithoutOrderedYes(result);
  if (!purgeKeys) return { records, purgeKeys: null };
  return {
    records: filterImportRecordsByOrderedYes(records, purgeKeys),
    purgeKeys,
  };
}
