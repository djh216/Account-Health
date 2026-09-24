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

const ACCOUNT_ALIASES = [
  "licensee",
  "licensee name",
  "licensed account",
  "account",
  "account name",
  "account_name",
  "accountname",
  "customer",
  "customer name",
  "customer_name",
  "restaurant",
  "restaurant name",
  "restaurant_name",
  "location",
  "location name",
  "site",
  "site name",
  "outlet",
  "outlet name",
  "sold to",
  "sold-to",
  "soldto",
  "ship to",
  "ship-to",
  "acct",
];
const LAST_ORDER_ALIASES = [
  "last order date",
  "last order",
  "last_order_date",
  "date last ordered",
  "last invoice date",
  "last invoice",
  "last purchase date",
  "last purchase",
  "last sale date",
  "last sale",
  "date of last order",
];
const LAST_VISIT_ALIASES = [
  "last visit date",
  "last visit",
  "last_visit_date",
  "date last visited",
  "last call date",
  "last call",
  "last stop date",
  "last stop",
  "last activity date",
  "date of last visit",
  "last rep visit",
];
const DATE_ALIASES = [
  "date",
  "order date",
  "order_date",
  "invoice date",
  "invoice_date",
  "visit date",
  "visit_date",
  "activity date",
  "activity_date",
  "call date",
];
const REVENUE_ALIASES = [
  "revenue",
  "order value",
  "order amount",
  "amount",
  "total",
  "sales",
  "dollars",
  "net sales",
  "invoice total",
  "last order amount",
  "last order $",
];
const CASES_ALIASES = [
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
const SKU_ALIASES = ["sku count", "skus", "lines", "wine count", "line count"];
const TYPE_ALIASES = [
  "license type",
  "lic type",
  "type",
  "channel",
  "class",
  "account type",
  "premise",
  "segment",
];
const LICENSE_ALIASES = [
  "license number",
  "license #",
  "license no",
  "lic no",
  "lid",
  "license",
  "lic #",
];
const CITY_ALIASES = ["city", "market"];
const COUNTY_ALIASES = ["county"];
const REGION_ALIASES = ["region", "territory", "area", "division"];
const REP_ALIASES = [
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
const TIER_ALIASES = ["tier", "account tier", "customer tier", "level", "segment tier"];
const PRODUCT_ALIASES = [
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
const OUTCOME_ALIASES = ["outcome", "notes", "result", "purpose", "activity", "visit type"];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function findHeader(headers: string[], aliases: string[]): string | undefined {
  const normalized = headers.map((header) => ({
    original: header,
    key: normalizeHeader(header),
  }));
  // Prefer exact matches, then longest partial alias (more specific wins).
  for (const alias of aliases) {
    const match = normalized.find((item) => item.key === alias);
    if (match) return match.original;
  }
  const ranked = aliases
    .map((alias) => ({ alias, length: alias.length }))
    .sort((a, b) => b.length - a.length);
  for (const { alias } of ranked) {
    const match = normalized.find((item) => item.key.includes(alias));
    if (match) return match.original;
  }
  return undefined;
}

function countMappedValues(
  rows: Record<string, string>[],
  column: string | undefined,
  predicate: (value: string) => boolean,
): number {
  if (!column) return 0;
  const sample = rows.slice(0, 50);
  return sample.filter((row) => predicate(String(row[column] ?? ""))).length;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,]/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  // Excel serial number: e.g. 45540 (days since Dec 30, 1899)
  if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) {
    const serial = Number.parseFloat(trimmed);
    if (serial >= 20000 && serial <= 80000) {
      const utcDays = Math.floor(serial - 25569);
      const date = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  }

  // Common slash/dash date: DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, p1, p2, p3] = slashMatch;
    let year = Number.parseInt(p3, 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const n1 = Number.parseInt(p1, 10);
    const n2 = Number.parseInt(p2, 10);
    // If first number > 12, it's definitely DD/MM/YYYY
    if (n1 > 12 && n2 <= 12) {
      const monthStr = String(n2).padStart(2, "0");
      const dayStr = String(n1).padStart(2, "0");
      return `${year}-${monthStr}-${dayStr}`;
    }
    // Otherwise standard MM/DD/YYYY
    if (n1 <= 12 && n2 <= 31) {
      const monthStr = String(n1).padStart(2, "0");
      const dayStr = String(n2).padStart(2, "0");
      return `${year}-${monthStr}-${dayStr}`;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isSnapshotShape(
  mapping: ColumnMapping,
  rows: Record<string, string>[],
): boolean {
  if (!mapping.lastOrderDate || !mapping.lastVisitDate) return false;
  if (mapping.product) return false;
  const volumeHits = countMappedValues(rows, mapping.cases, (value) => parseNumber(value) > 0);
  const revenueHits = countMappedValues(rows, mapping.revenue, (value) => parseNumber(value) > 0);
  if (volumeHits > 0 || revenueHits > 0) return false;

  const lastOrderHits = countMappedValues(rows, mapping.lastOrderDate, (value) =>
    Boolean(parseDate(value)),
  );
  const lastVisitHits = countMappedValues(rows, mapping.lastVisitDate, (value) =>
    Boolean(parseDate(value)),
  );
  return lastOrderHits > 0 && lastVisitHits > 0;
}

function salesRepFromFileName(fileName: string): string | undefined {
  const match = fileName.match(/^([a-z][a-z\s.'-]{0,30}?)\s+last order/i);
  if (!match) return undefined;
  const rep = match[1]
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return rep || undefined;
}

export function detectKind(
  fileName: string,
  mapping: ColumnMapping,
  rows: Record<string, string>[],
): ReportKind {
  const lower = fileName.toLowerCase();
  if (
    (/(snapshot|last order date|last order.*last visit)/.test(lower) ||
      isSnapshotShape(mapping, rows)) &&
    mapping.lastOrderDate &&
    mapping.lastVisitDate
  ) {
    return "snapshot";
  }

  const dateHits = countMappedValues(rows, mapping.date, (value) => Boolean(parseDate(value)));
  const revenueHits = countMappedValues(rows, mapping.revenue, (value) => parseNumber(value) > 0);
  const volumeHits = countMappedValues(rows, mapping.cases, (value) => parseNumber(value) > 0);
  const productHits = countMappedValues(
    rows,
    mapping.product,
    (value) => value.trim().length > 0,
  );

  const hasOrderShape =
    Boolean(mapping.date) &&
    dateHits > 0 &&
    (Boolean(mapping.product) ||
      Boolean(mapping.cases) ||
      Boolean(mapping.revenue) ||
      volumeHits > 0 ||
      productHits > 0 ||
      /(order|invoice|sales|shipment)/.test(lower));

  if (hasOrderShape) return "orders";

  if (/(visit|call|activity|stop)/.test(lower)) return "visits";
  if (/(order|invoice|sales|shipment)/.test(lower)) return "orders";
  if (/(account|customer|roster|outlet)/.test(lower)) return "accounts";

  if (mapping.revenue && revenueHits >= Math.max(3, Math.min(rows.length, 25) * 0.3)) {
    return "orders";
  }
  if (mapping.outcome && mapping.date && !mapping.product && !mapping.cases) return "visits";
  if (mapping.type || mapping.city || mapping.county) return "accounts";
  if (mapping.date && dateHits > 0) return "orders";
  return "accounts";
}

export function detectMapping(headers: string[]): ColumnMapping {
  return {
    account: findHeader(headers, ACCOUNT_ALIASES),
    lastOrderDate: findHeader(headers, LAST_ORDER_ALIASES),
    lastVisitDate: findHeader(headers, LAST_VISIT_ALIASES),
    date: findHeader(headers, DATE_ALIASES),
    revenue: findHeader(headers, REVENUE_ALIASES),
    cases: findHeader(headers, CASES_ALIASES),
    skuCount: findHeader(headers, SKU_ALIASES),
    type: findHeader(headers, TYPE_ALIASES),
    licenseNumber: findHeader(headers, LICENSE_ALIASES),
    city: findHeader(headers, CITY_ALIASES),
    county: findHeader(headers, COUNTY_ALIASES),
    region: findHeader(headers, REGION_ALIASES),
    tier: findHeader(headers, TIER_ALIASES),
    salesRep: findHeader(headers, REP_ALIASES),
    outcome: findHeader(headers, OUTCOME_ALIASES),
    product: findHeader(headers, PRODUCT_ALIASES),
  };
}

export function finalizeParse(
  fileName: string,
  headers: string[],
  rows: Record<string, string>[],
): ParseResult {
  const mapping = detectMapping(headers);
  const kind = detectKind(fileName, mapping, rows);
  const warnings: string[] = [];
  if (!mapping.account) {
    warnings.push("Could not find an account name column. Map it before importing.");
  }
  if (kind === "snapshot") {
    if (!mapping.lastOrderDate && !mapping.lastVisitDate) {
      warnings.push("Map last order date and last visit date for snapshot imports.");
    }
  } else if (kind !== "accounts" && !mapping.date) {
    warnings.push("Could not find a date column. Map it before importing.");
  }
  if (kind === "orders") {
    if (!mapping.product) {
      warnings.push("Product column not mapped — map it to track individual products.");
    }
    if (!mapping.cases) {
      warnings.push("Volume column not mapped — map cases, quantity, or volume.");
    }
  }
  return { fileName, headers, rows, kind, mapping, warnings };
}

export function parseCsv(fileName: string, text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const rows = parsed.data.filter((row) =>
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

export function rowsToRecords(
  result: ParseResult,
): { accounts: Account[]; orders: Order[]; visits: Visit[] } {
  const accounts = new Map<string, Account>();
  const orders: Order[] = [];
  const visits: Visit[] = [];
  const { mapping, kind, rows, fileName } = result;
  const repFromFile = salesRepFromFileName(fileName);

  rows.forEach((row, index) => {
    const account = upsertAccount(accounts, row, mapping, index);
    if (!account) return;

    if (repFromFile && !account.salesRep) {
      account.salesRep = repFromFile;
    }

    if (kind === "snapshot") {
      const lastOrder = parseDate(row[mapping.lastOrderDate ?? ""]);
      if (lastOrder) {
        orders.push({
          id: `${account.id}-last-order`,
          accountId: account.id,
          accountName: account.name,
          date: lastOrder,
          revenue: parseNumber(row[mapping.revenue ?? ""]),
          cases: parseNumber(row[mapping.cases ?? ""]),
          product: row[mapping.product ?? ""]?.trim() || undefined,
        });
      }
      const lastVisit = parseDate(row[mapping.lastVisitDate ?? ""]);
      if (lastVisit) {
        visits.push({
          id: `${account.id}-last-visit`,
          accountId: account.id,
          accountName: account.name,
          date: lastVisit,
          salesRep: account.salesRep ?? repFromFile,
          outcome: "Last recorded visit",
        });
      }
      return;
    }

    if (kind === "orders") {
      const date = parseDate(row[mapping.date ?? ""] || row[mapping.lastOrderDate ?? ""]);
      if (!date) return;
      const product = row[mapping.product ?? ""]?.trim() || undefined;
      const cases = parseNumber(row[mapping.cases ?? ""]);
      orders.push({
        id: `${account.id}-${date}-${index}-${slugify(product ?? "line")}`,
        accountId: account.id,
        accountName: account.name,
        date,
        revenue: parseNumber(row[mapping.revenue ?? ""]),
        cases,
        skuCount: mapping.skuCount ? parseNumber(row[mapping.skuCount]) : undefined,
        product,
      });
    }

    if (kind === "visits") {
      const date = parseDate(row[mapping.date ?? ""] || row[mapping.lastVisitDate ?? ""]);
      if (!date) return;
      visits.push({
        id: `${account.id}-${date}-${index}`,
        accountId: account.id,
        accountName: account.name,
        date,
        salesRep: row[mapping.salesRep ?? ""]?.trim() || undefined,
        outcome: row[mapping.outcome ?? ""]?.trim() || undefined,
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
        `${order.accountId}|${order.date}|${order.product ?? ""}|${order.revenue}|${order.cases}`,
    ),
  );
  for (const order of incoming) {
    if (order.id.endsWith("-last-order")) {
      byId.set(order.id, order);
      continue;
    }
    const key = `${order.accountId}|${order.date}|${order.product ?? ""}|${order.revenue}|${order.cases}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byId.set(order.id, order);
  }
  return [...byId.values()];
}

export function mergeVisits(current: Visit[], incoming: Visit[]): Visit[] {
  const byId = new Map(current.map((visit) => [visit.id, visit]));
  const seen = new Set(
    current.map((visit) => `${visit.accountId}|${visit.date}|${visit.outcome ?? ""}`),
  );
  for (const visit of incoming) {
    if (visit.id.endsWith("-last-visit")) {
      byId.set(visit.id, visit);
      continue;
    }
    const key = `${visit.accountId}|${visit.date}|${visit.outcome ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byId.set(visit.id, visit);
  }
  return [...byId.values()];
}
