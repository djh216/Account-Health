import Papa from "papaparse";
import { normalizeName, slugify } from "./format";
import type {
  Account,
  AccountType,
  ColumnMapping,
  Order,
  ParseResult,
  ReportKind,
  Visit,
} from "./types";

export const ACCOUNT_ALIASES = [
  "licensee",
  "licensee name",
  "licensed account",
  "account",
  "account name",
  "account_name",
  "accountname",
  "account #",
  "account no",
  "account number",
  "account id",
  "account code",
  "customer",
  "customer name",
  "customer_name",
  "customername",
  "customer #",
  "customer no",
  "customer number",
  "customer id",
  "customer code",
  "cust #",
  "cust id",
  "cust no",
  "cust name",
  "restaurant",
  "restaurant name",
  "restaurant_name",
  "client",
  "client name",
  "business name",
  "location",
  "location name",
  "site",
  "site name",
  "outlet",
  "outlet name",
  "sold to",
  "sold to name",
  "sold-to",
  "sold-to name",
  "soldto",
  "ship to",
  "ship to name",
  "ship-to",
  "ship-to name",
  "shipto",
  "acct",
  "acct name",
  "account contact name",
  "contact name",
  "account desc",
  "account description",
  "establishment",
  "buyer",
  "company",
  "company name",
  "premises",
  "premise name",
  "premise description",
  "dba",
  "dba name",
  "trade name",
  "store",
  "store name",
  "store #",
  "billing account",
  "bill to",
  "bill to name",
  "bill-to",
  "bill-to name",
];

export const LAST_ORDER_ALIASES = [
  "last order date",
  "last order dt",
  "last order dte",
  "last order",
  "last ordered",
  "last_order_date",
  "last_order_dt",
  "last_order",
  "date last ordered",
  "date last order",
  "date of last order",
  "last invoice date",
  "last invoice dt",
  "last invoice",
  "last invoiced",
  "last inv date",
  "last inv dt",
  "last inv",
  "date last invoiced",
  "date of last invoice",
  "last purchase date",
  "last purchase dt",
  "last purchase",
  "last purchased",
  "date last purchased",
  "last sale date",
  "last sale dt",
  "last sale",
  "last delivery date",
  "last delivery dt",
  "last delivery",
  "last delivered",
  "last deliv date",
  "last shipment date",
  "last shipment",
  "last shipped",
  "last transaction date",
  "last transaction",
  "last trans date",
  "latest order date",
  "latest order dt",
  "latest order",
  "latest invoice date",
  "latest invoice",
  "latest purchase date",
  "latest purchase",
  "most recent order date",
  "most recent order dt",
  "most recent order",
  "most recent invoice date",
  "most recent invoice",
  "most recent purchase date",
  "most recent purchase",
  "recent order date",
  "recent order",
  "prev order date",
  "previous order date",
  "order last date",
];

export const LAST_VISIT_ALIASES = [
  "last visit date",
  "last visit dt",
  "last visit dte",
  "last visit",
  "last visited",
  "last_visit_date",
  "last_visit_dt",
  "last_visit",
  "date last visited",
  "date last visit",
  "date of last visit",
  "last call date",
  "last call dt",
  "last call",
  "last called",
  "date last called",
  "date of last call",
  "last stop date",
  "last stop dt",
  "last stop",
  "last activity date",
  "last activity dt",
  "last activity",
  "last rep visit",
  "last rep call",
  "last contact date",
  "last contact dt",
  "last contact",
  "last contacted date",
  "last contacted",
  "last touch date",
  "last touch",
  "last interaction date",
  "last interaction",
  "latest visit date",
  "latest visit dt",
  "latest visit",
  "latest call date",
  "latest call",
  "latest activity date",
  "latest activity",
  "latest contact date",
  "latest contact",
  "most recent visit date",
  "most recent visit dt",
  "most recent visit",
  "most recent call date",
  "most recent call",
  "most recent activity date",
  "most recent activity",
  "most recent contact date",
  "most recent contact",
  "last meeting date",
  "last meeting dt",
  "last meeting",
  "last check in date",
  "last check in",
  "last checkin date",
  "last checkin",
  "visit last date",
  "call last date",
];

export const DATE_ALIASES = [
  "order date",
  "order_date",
  "invoice date",
  "invoice_date",
  "transaction date",
  "trans date",
  "ship date",
  "delivery date",
  "visit date",
  "visit_date",
  "call date",
  "activity date",
  "activity_date",
  "created date",
  "created at",
  "created", // Outfield activity export: date of this stop
  "date",
];

export const CASES_ALIASES = [
  "cases",
  "units",
  "quantity",
  "qty",
  "bottles",
  "9l cases",
  "9l",
  "volume",
  "product volume",
  "vol",
  "volume ordered",
  "qty ordered",
  "quantity ordered",
  "cases ordered",
  "units ordered",
  "units sold",
  "case qty",
  "case quantity",
  "order qty",
  "order quantity",
];

export const SKU_ALIASES = ["sku count", "skus", "lines", "wine count", "line count"];

export const TYPE_ALIASES = [
  "license type",
  "lic type",
  "type",
  "channel",
  "class",
  "account type",
  "premise",
  "segment",
];

export const LICENSE_ALIASES = [
  "license number",
  "license #",
  "license no",
  "lic no",
  "lid",
  "license",
  "lic #",
];

export const CITY_ALIASES = ["city", "market"];
export const COUNTY_ALIASES = ["county"];
export const REGION_ALIASES = ["region", "territory", "area", "division"];

export const REP_ALIASES = [
  "name of team member",
  "lead team member",
  "lead team member name",
  "lead team",
  "team member",
  "rep",
  "salesperson",
  "sales rep",
  "sales_rep",
  "sales representative",
  "owner",
  "ae",
  "sales person",
];

export const TIER_ALIASES = ["tier", "account tier", "customer tier", "level", "segment tier"];

export const PRODUCT_ALIASES = [
  "product",
  "product name",
  "product purchased",
  "product ordered",
  "products ordered",
  "products purchased",
  "item",
  "item name",
  "item description",
  "wine",
  "wine name",
  "sku",
  "sku name",
  "product info",
  "product description",
  "description",
  "label",
  "brand",
];

export const OUTCOME_ALIASES = [
  "outcome",
  "notes",
  "result",
  "purpose",
  "activity",
  "visit type",
  "rep notes",
];

export const VISIT_DURATION_ALIASES = [
  "duration minutes",
  "duration (minutes)",
  "duration mins",
  "duration",
  "minutes",
  "time spent",
  "time on site",
  "visit duration",
  "meeting duration",
  "call duration",
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeader(value: string | undefined | null): string {
  if (value == null) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s$/%#]/g, "")
    .replace(/\s+/g, " ");
}

function isRepLikeHeader(headerKey: string): boolean {
  return (
    /(rep|person|representative|agent|team|lead|consultant|owner|sales rep)/.test(headerKey) ||
    REP_ALIASES.some((repAlias) => headerKey === repAlias || headerKey.includes(repAlias))
  );
}

/** Outfield / CRM exports: "Type (Check In, Meeting, …)" — visit outcome, not account license type. */
function isCrmActivityTypeHeader(headerKey: string): boolean {
  return (
    /^type\b/.test(headerKey) &&
    /(check in|meeting|phone call|phone|email|text message|note|task)/.test(headerKey)
  );
}

function findCrmActivityTypeColumn(headers: (string | undefined | null)[]): string | undefined {
  for (const header of headers) {
    if (!header?.trim()) continue;
    if (isCrmActivityTypeHeader(normalizeHeader(header))) return header;
  }
  return undefined;
}

function headersExcludingCrmActivityType(
  headers: (string | undefined | null)[],
): string[] {
  return headers
    .filter((h): h is string => Boolean(h && String(h).trim().length > 0))
    .filter((h) => !isCrmActivityTypeHeader(normalizeHeader(h)));
}

/** Outfield "Ordered? (Places)" and similar — not order dates or volume. */
export function isDisregardedUploadHeader(headerKey: string): boolean {
  return /^ordered\b/.test(headerKey) && /(places|place)/.test(headerKey);
}

/** Outfield activity: `Ordered?` / `Ordered? (Places)` — yes means the account stays on the book. */
export function findActivityOrderedColumn(headers: string[]): string | undefined {
  for (const header of headers) {
    if (!header?.trim()) continue;
    const key = normalizeHeader(header);
    if (isDisregardedUploadHeader(key)) return header;
    if (key === "ordered" || key === "ordered?" || /^ordered\s*\?/.test(key)) {
      return header;
    }
  }
  return undefined;
}

export function isAffirmativeOrderedYes(value: string | undefined | null): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "yes" || normalized === "y";
}

function findHeader(
  headers: (string | undefined | null)[],
  aliases: string[],
  options?: { excludeColumns?: (string | undefined)[] },
): string | undefined {
  const excludeSet = new Set(
    (options?.excludeColumns || []).filter(Boolean).map((c) => String(c)),
  );

  const cleanHeaders = headers
    .filter((h): h is string => Boolean(h && String(h).trim().length > 0))
    .filter((h) => !excludeSet.has(h));

  const filteredNormalized = cleanHeaders
    .map((header) => ({
      original: header,
      key: normalizeHeader(header),
    }))
    .filter((item) => !isDisregardedUploadHeader(item.key));

  // 1. Exact match (highest priority)
  for (const alias of aliases) {
    const match = filteredNormalized.find((item) => item.key === alias);
    if (match) return match.original;
  }

  // 2. Word boundary / phrase match (more specific wins)
  const ranked = aliases
    .map((alias) => ({ alias, length: alias.length }))
    .sort((a, b) => b.length - a.length);

  for (const { alias } of ranked) {
    const wordPattern = new RegExp(`(^|\\s)${escapeRegex(alias)}(\\s|$)`);
    const match = filteredNormalized.find((item) => wordPattern.test(item.key));
    if (match) return match.original;
  }

  // 3. Fallback partial includes only for longer/specific phrases (>= 5 chars)
  for (const { alias } of ranked) {
    if (alias.length < 5) continue;
    const match = filteredNormalized.find((item) => item.key.includes(alias));
    if (match) return match.original;
  }

  return undefined;
}

export function findHeaderRowIndex(rawRows: string[][]): number {
  if (rawRows.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = -999;
  const maxScan = Math.min(rawRows.length, 35);

  for (let i = 0; i < maxScan; i++) {
    const row = rawRows[i];
    if (!row) continue;
    const nonBlank = row.filter((c) => String(c ?? "").trim().length > 0);
    if (nonBlank.length < 2) continue;

    let score = 0;
    for (const rawCell of nonBlank) {
      const cell = String(rawCell).trim().toLowerCase();
      // Account / customer indicator (+25)
      if (
        /(account|customer|licensee|restaurant|client|location|outlet|sold to|ship to|buyer|store)/.test(
          cell,
        )
      ) {
        score += 25;
      }
      // Last order indicators (+20)
      if (
        /(last order|last invoice|last purchase|last sale|last delivery|last shipment|most recent order|latest order|last ordered)/.test(
          cell,
        )
      ) {
        score += 20;
      }
      // Last visit indicators (+20)
      if (
        /(last visit|last call|last stop|last contact|last touch|last activity|most recent visit|latest visit|last visited)/.test(
          cell,
        )
      ) {
        score += 20;
      }
      // Sales rep indicators (+15)
      if (/(sales rep|rep|salesperson|lead team|team member|sales representative)/.test(cell)) {
        score += 15;
      }
      // General date indicators (+10)
      if (
        /(order date|invoice date|visit date|call date|activity date|transaction date|^date$)/.test(
          cell,
        )
      ) {
        score += 10;
      }
      // Volume / product indicators (+10)
      if (/(cases|bottles|volume|product|item|sku)/.test(cell)) {
        score += 10;
      }
      // Account metadata indicators (+5)
      if (/(license number|license #|account type|tier|channel|city|county|region)/.test(cell)) {
        score += 5;
      }
      // Penalize cells that look like actual transaction data (dates or numbers)
      if (
        /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(cell) ||
        /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cell)
      ) {
        score -= 15;
      }
      if (/^\$?\d+(\.\d+)?$/.test(cell)) {
        score -= 5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // Fallback: if no aliases matched with positive score, pick first row with >= 2 non-empty cells
  if (bestScore <= 0) {
    for (let i = 0; i < maxScan; i++) {
      const count = (rawRows[i] ?? []).filter((c) => String(c ?? "").trim().length > 0).length;
      if (count >= 2) return i;
    }
  }

  return bestIndex;
}

export function countMappedValues(
  rows: Record<string, string>[],
  column: string | undefined,
  predicate: (value: string) => boolean,
): number {
  if (!column) return 0;
  const sample = rows.slice(0, 50);
  return sample.filter((row) => predicate(String(row[column] ?? ""))).length;
}

export function parseNumber(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const str = String(value).trim();
  if (!str) return 0;
  const isParenNegative = /^\(.*\)$/.test(str);
  const cleaned = str.replace(/[$,()]/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return isParenNegative ? -Math.abs(parsed) : parsed;
}

export function parseDurationMinutes(value: string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  const parsed = parseNumber(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function visitDurationFromRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
): number | undefined {
  const col = mapping.visitDuration;
  if (!col) return undefined;
  return parseDurationMinutes(row[col]);
}

export function parseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD (with optional timestamp)
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 2. Excel numeric serial date (e.g. 45427 or 45427.5)
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const serial = Number.parseFloat(trimmed);
    if (serial >= 20000 && serial <= 80000) {
      const utcDays = Math.floor(serial - 25569);
      const date = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }
  }

  // 3. US or International slash/dash date: MM/DD/YYYY, M/D/YY, DD/MM/YYYY, etc.
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+.*)?$/);
  if (slashMatch) {
    const [, p1, p2, p3] = slashMatch;
    let year = Number.parseInt(p3, 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const n1 = Number.parseInt(p1, 10);
    const n2 = Number.parseInt(p2, 10);
    if (n1 > 12 && n2 <= 12) {
      const monthStr = String(n2).padStart(2, "0");
      const dayStr = String(n1).padStart(2, "0");
      return `${year}-${monthStr}-${dayStr}`;
    }
    if (n1 <= 12 && n2 <= 31) {
      const monthStr = String(n1).padStart(2, "0");
      const dayStr = String(n2).padStart(2, "0");
      return `${year}-${monthStr}-${dayStr}`;
    }
  }

  // 4. Native JS date fallback
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function salesRepFromFileName(fileName: string): string | undefined {
  if (!fileName) return undefined;
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const match = base.match(
    /^([a-z][a-z\s.'_-]{0,40}?)(?:[-_–—\s]+(?:last\s+(?:order|visit|call|activity)|order\s+history|visit\s+log|orders|visits))/i,
  );
  if (match) {
    const rep = match[1]
      .replace(/[_-]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    if (
      rep &&
      !/^(monthly|quarterly|annual|weekly|daily|territory|report|portfolio|account|customer|company)$/i.test(
        rep,
      )
    ) {
      return rep;
    }
  }
  return undefined;
}

export function isSnapshotShape(
  mapping: ColumnMapping,
  rows: Record<string, string>[],
): boolean {
  if (!mapping.lastOrderDate && !mapping.lastVisitDate) return false;
  if (mapping.product) return false;
  const lastOrderHits = countMappedValues(rows, mapping.lastOrderDate, (v) => Boolean(parseDate(v)));
  const lastVisitHits = countMappedValues(rows, mapping.lastVisitDate, (v) => Boolean(parseDate(v)));
  return lastOrderHits > 0 || lastVisitHits > 0;
}

export function isActivityLogShape(
  mapping: ColumnMapping,
  rows: Record<string, string>[],
  fileNameLower: string,
): boolean {
  if (!mapping.account || !mapping.date) return false;
  if (mapping.lastOrderDate && !mapping.lastVisitDate && !mapping.visitDuration) {
    return false;
  }
  const productHits = countMappedValues(rows, mapping.product, (v) => v.trim().length > 0);
  const volumeHits = countMappedValues(rows, mapping.cases, (v) => parseNumber(v) > 0);
  if (productHits > 0 || volumeHits > 0) return false;

  if (mapping.visitDuration) return true;
  if (/(activity|visit|call|stop|meeting|interaction|outfield)/i.test(fileNameLower)) {
    return true;
  }
  if (mapping.outcome) {
    const col = mapping.outcome;
    const activityHits = rows
      .slice(0, 80)
      .filter((row) =>
        /check in|meeting|phone call|text message|email|note|task/i.test(row[col] ?? ""),
      ).length;
    if (activityHits >= 3) return true;
  }
  if (
    mapping.outcome &&
    !mapping.product &&
    !mapping.cases &&
    countMappedValues(rows, mapping.date, (v) => Boolean(parseDate(v))) > 0
  ) {
    return true;
  }
  return false;
}

export function detectKind(
  fileName: string,
  mapping: ColumnMapping,
  rows: Record<string, string>[],
): ReportKind {
  const lower = fileName.toLowerCase();

  // 1. Both last order date and last visit date mapped -> snapshot!
  if (mapping.lastOrderDate && mapping.lastVisitDate) {
    return "snapshot";
  }

  // 2. Count mapped values in sample rows
  const dateHits = countMappedValues(rows, mapping.date, (v) => Boolean(parseDate(v)));
  const lastOrderHits = countMappedValues(rows, mapping.lastOrderDate, (v) => Boolean(parseDate(v)));
  const lastVisitHits = countMappedValues(rows, mapping.lastVisitDate, (v) => Boolean(parseDate(v)));
  const volumeHits = countMappedValues(rows, mapping.cases, (v) => parseNumber(v) > 0);
  const productHits = countMappedValues(rows, mapping.product, (v) => v.trim().length > 0);

  // Both dates have real hits -> snapshot
  if (lastOrderHits > 0 && lastVisitHits > 0) {
    return "snapshot";
  }

  // Explicit snapshot filename pattern
  if (
    /(snapshot|last order date|last order.*last visit|last visit.*last order)/i.test(lower) &&
    (mapping.lastOrderDate || mapping.lastVisitDate)
  ) {
    return "snapshot";
  }

  // Visit log / visit history (Outfield activity: Created + duration/type, no SKU volume)
  if (isActivityLogShape(mapping, rows, lower)) {
    return "visits";
  }

  // Order history
  if (
    /(order|invoice|sales|shipment|purchase)/i.test(lower) ||
    (mapping.date && (productHits > 0 || volumeHits > 0)) ||
    (mapping.lastOrderDate && !mapping.lastVisitDate) ||
    (mapping.product && (productHits > 0 || volumeHits > 0))
  ) {
    return "orders";
  }

  if (mapping.date && dateHits > 0) {
    return "orders";
  }

  if (mapping.type || mapping.city || mapping.county || mapping.tier || mapping.licenseNumber) {
    return "accounts";
  }

  return "accounts";
}

export function detectMapping(headers: string[]): ColumnMapping {
  const account = findHeader(headers, ACCOUNT_ALIASES);
  const lastOrderDate = findHeader(headers, LAST_ORDER_ALIASES);
  const lastVisitDate = findHeader(headers, LAST_VISIT_ALIASES);
  const date = findHeader(headers, DATE_ALIASES, {
    excludeColumns: [lastOrderDate, lastVisitDate],
  });
  const accountTypeHeaders = headersExcludingCrmActivityType(headers);
  const outcome =
    findHeader(headers, OUTCOME_ALIASES) ?? findCrmActivityTypeColumn(headers);

  return {
    account,
    lastOrderDate,
    lastVisitDate,
    date,
    cases: findHeader(headers, CASES_ALIASES),
    skuCount: findHeader(headers, SKU_ALIASES),
    type: findHeader(accountTypeHeaders, TYPE_ALIASES),
    licenseNumber: findHeader(headers, LICENSE_ALIASES),
    city: findHeader(headers, CITY_ALIASES),
    county: findHeader(headers, COUNTY_ALIASES),
    region: findHeader(headers, REGION_ALIASES),
    tier: findHeader(headers, TIER_ALIASES),
    salesRep: findHeader(headers, REP_ALIASES),
    outcome,
    product: findHeader(headers, PRODUCT_ALIASES),
    visitDuration: findHeader(headers, VISIT_DURATION_ALIASES),
  };
}

/** Outfield / CRM activity logs: `Created` is the date of that stop (not “last visit” summary). */
function visitStopDateColumn(headers: string[]): string | undefined {
  for (const header of headers) {
    if (!header?.trim()) continue;
    const key = normalizeHeader(header);
    if (key === "created" || key === "created date" || key === "created at") {
      return header;
    }
  }
  return undefined;
}

function applyVisitLogDateMapping(
  kind: ReportKind,
  headers: string[],
  mapping: ColumnMapping,
): ColumnMapping {
  if (kind !== "visits") return mapping;
  const stopDate = visitStopDateColumn(headers) ?? mapping.date;
  if (!stopDate) return mapping;
  return {
    ...mapping,
    date: stopDate,
    lastVisitDate: mapping.lastVisitDate === stopDate ? undefined : mapping.lastVisitDate,
  };
}

export function finalizeParse(
  fileName: string,
  headers: string[],
  rows: Record<string, string>[],
): ParseResult {
  const baseMapping = detectMapping(headers);
  let kind = detectKind(fileName, baseMapping, rows);
  if (isActivityLogShape(baseMapping, rows, fileName.toLowerCase())) {
    kind = "visits";
  }
  const mapping = applyVisitLogDateMapping(kind, headers, baseMapping);
  const warnings: string[] = [];

  if (!mapping.account) {
    warnings.push("Could not find an account name column. Map it before importing.");
  }
  if (kind === "snapshot") {
    if (!mapping.lastOrderDate && !mapping.lastVisitDate) {
      warnings.push("Map last order date or last visit date for snapshot imports.");
    }
  } else if (kind === "orders") {
    if (!mapping.date && !mapping.lastOrderDate) {
      warnings.push("Map date or last order date for order history.");
    }
  } else if (kind === "visits") {
    if (!mapping.date) {
      warnings.push(
        "Map visit date — one date per row (Outfield activity exports: use the Created column).",
      );
    }
  }

  return {
    fileName,
    headers,
    rows,
    kind,
    mapping,
    warnings,
  };
}

export function parseCsv(fileName: string, text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const rows = (parsed.data ?? []).filter(
    (row) =>
      row &&
      typeof row === "object" &&
      Object.values(row).some((value) => String(value ?? "").trim().length > 0),
  );
  return finalizeParse(fileName, headers, rows);
}

export function parseAccountType(value: string | undefined): AccountType {
  const key = (value ?? "").trim().toLowerCase();
  if (key === "r" || /(restaurant|on.?prem|dining|bistro|trattoria)/.test(key)) {
    return "restaurant";
  }
  if (key === "h" || /(hotel|inn|lodg)/.test(key)) return "hotel";
  if (key === "c" || /club/.test(key)) return "club";
  if (
    key === "e" ||
    /(bar|tavern|cantina|wine bar|eating place|taproom)/.test(key)
  ) {
    return "bar";
  }
  return "other";
}

function upsertAccount(
  accounts: Map<string, Account>,
  row: Record<string, string>,
  mapping: ColumnMapping,
  index: number,
): Account | null {
  const name = (row[mapping.account ?? ""] ?? "").trim();
  if (!name) return null;
  const id = slugify(normalizeName(name)) || `licensee-${index}`;
  const existing = accounts.get(id);
  const next: Account = {
    id,
    name: existing?.name ?? name,
    type:
      existing?.type && existing.type !== "other"
        ? existing.type
        : parseAccountType(row[mapping.type ?? ""]),
    licenseNumber:
      existing?.licenseNumber || row[mapping.licenseNumber ?? ""]?.trim() || undefined,
    city: existing?.city || row[mapping.city ?? ""]?.trim() || undefined,
    county: existing?.county || row[mapping.county ?? ""]?.trim() || undefined,
    region: existing?.region || row[mapping.region ?? ""]?.trim() || undefined,
    tier: existing?.tier || row[mapping.tier ?? ""]?.trim() || undefined,
    salesRep: existing?.salesRep || row[mapping.salesRep ?? ""]?.trim() || undefined,
  };
  accounts.set(id, next);
  return next;
}

function pushSnapshotLastVisitFromRow(
  account: Account,
  row: Record<string, string>,
  mapping: ColumnMapping,
  visits: Visit[],
  repFromFile?: string,
): void {
  const lastVisit = parseDate(
    row[mapping.lastVisitDate ?? ""] ||
      (mapping.date && !mapping.lastOrderDate ? row[mapping.date] : ""),
  );
  if (!lastVisit) return;
  visits.push({
    id: `${account.id}-last-visit`,
    accountId: account.id,
    accountName: account.name,
    date: lastVisit,
    salesRep: account.salesRep ?? repFromFile,
    outcome: row[mapping.outcome ?? ""]?.trim() || "Last recorded visit",
    durationMinutes: visitDurationFromRow(row, mapping),
  });
}

/** True when this upload carries per-account last visit dates (snapshot / combined export), not a dense visit log. */
export function shouldIndexUploadLastVisits(result: ParseResult): boolean {
  if (result.kind === "snapshot") return true;
  if (!result.mapping.lastVisitDate) return false;
  if (isSnapshotShape(result.mapping, result.rows)) return true;
  if (result.kind === "orders" || result.kind === "accounts") {
    return (
      countMappedValues(result.rows, result.mapping.lastVisitDate, (v) => Boolean(parseDate(v))) > 0
    );
  }
  return false;
}

export function extractUploadLastVisitsFromParseResult(
  result: ParseResult,
): Array<{ accountId: string; accountName: string; date: string }> {
  if (!shouldIndexUploadLastVisits(result)) return [];

  const accounts = new Map<string, Account>();
  const byAccountId = new Map<string, { accountId: string; accountName: string; date: string }>();
  const { mapping, rows } = result;

  rows.forEach((row, index) => {
    const account = upsertAccount(accounts, row, mapping, index);
    if (!account) return;

    const parsed = parseDate(
      row[mapping.lastVisitDate ?? ""] ||
        (result.kind === "visits" && mapping.date && !mapping.lastVisitDate
          ? row[mapping.date]
          : "") ||
        (mapping.date && !mapping.lastOrderDate ? row[mapping.date] : ""),
    );
    if (!parsed) return;

    const date = parsed.slice(0, 10);
    const existing = byAccountId.get(account.id);
    if (!existing || date > existing.date) {
      byAccountId.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        date,
      });
    }
  });

  return [...byAccountId.values()];
}

export function rowsToRecords(
  result: ParseResult,
): { accounts: Account[]; orders: Order[]; visits: Visit[] } {
  const accounts = new Map<string, Account>();
  const orders: Order[] = [];
  const visits: Visit[] = [];
  const { mapping, kind, rows, fileName } = result;
  const fileLower = fileName.toLowerCase();
  const effectiveKind =
    kind === "orders" && isActivityLogShape(mapping, rows, fileLower) ? "visits" : kind;
  const repFromFile = salesRepFromFileName(fileName);

  rows.forEach((row, index) => {
    const account = upsertAccount(accounts, row, mapping, index);
    if (!account) return;

    if (repFromFile && !account.salesRep) {
      account.salesRep = repFromFile;
    }

    if (effectiveKind === "snapshot") {
      const lastOrder = parseDate(
        row[mapping.lastOrderDate ?? ""] ||
          (mapping.date && !mapping.lastVisitDate ? row[mapping.date] : ""),
      );
      if (lastOrder) {
        orders.push({
          id: `${account.id}-last-order`,
          accountId: account.id,
          accountName: account.name,
          date: lastOrder,
          cases: parseNumber(row[mapping.cases ?? ""]),
          product: row[mapping.product ?? ""]?.trim() || undefined,
        });
      }
      pushSnapshotLastVisitFromRow(account, row, mapping, visits, repFromFile);
      return;
    }

    if (effectiveKind === "orders") {
      const date = parseDate(row[mapping.date ?? ""] || row[mapping.lastOrderDate ?? ""]);
      if (date) {
        const product = row[mapping.product ?? ""]?.trim() || undefined;
        const cases = parseNumber(row[mapping.cases ?? ""]);
        const isSnapshotOrder = !product && cases === 0;
        orders.push({
          id: isSnapshotOrder
            ? `${account.id}-last-order`
            : `${account.id}-${date}-${index}-${slugify(product ?? "line")}`,
          accountId: account.id,
          accountName: account.name,
          date,
          cases,
          skuCount: mapping.skuCount ? parseNumber(row[mapping.skuCount]) : undefined,
          product,
        });
      }
      pushSnapshotLastVisitFromRow(account, row, mapping, visits, repFromFile);
    }

    if (effectiveKind === "visits") {
      const date = parseDate(row[mapping.date ?? ""] || row[mapping.lastVisitDate ?? ""]);
      if (!date) return;
      const outcome = row[mapping.outcome ?? ""]?.trim() || undefined;
      const isSnapshotVisit = !outcome && Boolean(mapping.lastVisitDate);
      visits.push({
        id: isSnapshotVisit ? `${account.id}-last-visit` : `${account.id}-${date}-${index}`,
        accountId: account.id,
        accountName: account.name,
        date,
        salesRep: row[mapping.salesRep ?? ""]?.trim() || account.salesRep || repFromFile,
        outcome: outcome || "Recorded visit",
        durationMinutes: visitDurationFromRow(row, mapping),
      });
    }
  });

  return { accounts: [...accounts.values()], orders, visits };
}

export function mergeAccounts(current: Account[], incoming: Account[]): Account[] {
  const map = new Map(current.map((account) => [account.id, account]));
  for (const account of incoming) {
    const existing = map.get(account.id);
    if (!existing) {
      map.set(account.id, account);
      continue;
    }
    map.set(account.id, {
      ...existing,
      type: existing.type === "other" ? account.type : existing.type,
      licenseNumber: existing.licenseNumber || account.licenseNumber,
      city: existing.city || account.city,
      county: existing.county || account.county,
      region: existing.region || account.region,
      tier: existing.tier || account.tier,
      salesRep: account.salesRep || existing.salesRep,
    });
  }
  return [...map.values()];
}

export function mergeOrders(current: Order[], incoming: Order[]): Order[] {
  const byId = new Map(current.map((order) => [order.id, order]));
  const seen = new Set(
    current.map(
      (order) =>
        `${order.accountId}|${order.date}|${order.product ?? ""}|${order.cases}`,
    ),
  );
  for (const order of incoming) {
    if (order.id.endsWith("-last-order")) {
      byId.set(order.id, order);
      continue;
    }
    const key = `${order.accountId}|${order.date}|${order.product ?? ""}|${order.cases}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byId.set(order.id, order);
  }
  return [...byId.values()];
}

function visitDedupeKey(visit: Visit): string {
  return `${visit.accountId}|${visit.date}|${visit.outcome ?? ""}`;
}

export function mergeVisits(current: Visit[], incoming: Visit[]): Visit[] {
  const byId = new Map(current.map((visit) => [visit.id, visit]));
  const byDedupeKey = new Map(
    [...byId.values()].map((visit) => [visitDedupeKey(visit), visit.id]),
  );

  for (const visit of incoming) {
    if (visit.id.endsWith("-last-visit")) {
      byId.set(visit.id, visit);
      continue;
    }
    const key = visitDedupeKey(visit);
    const existingId = byDedupeKey.get(key);
    if (existingId) {
      const existing = byId.get(existingId);
      if (existing && (visit.durationMinutes ?? 0) > 0) {
        byId.set(existingId, {
          ...existing,
          durationMinutes: visit.durationMinutes ?? existing.durationMinutes,
          salesRep: visit.salesRep ?? existing.salesRep,
        });
      }
      continue;
    }
    byDedupeKey.set(key, visit.id);
    byId.set(visit.id, visit);
  }
  return [...byId.values()];
}
