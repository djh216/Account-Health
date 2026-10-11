import Papa from "papaparse";
import { normalizeName } from "./format";

export const CUSTOMER_CSV_HEADERS = [
  "Name",
  "Phone Numbers",
  "Emails",
  "Delivery Instructions (Places)",
  "LID (Places)",
  "Territory (Places)",
] as const;

const HEADER_KEYS = {
  name: "name",
  phones: "phone numbers",
  emails: "emails",
  delivery: "delivery instructions (places)",
  lid: "lid (places)",
  territory: "territory (places)",
} as const;

export type CustomerPhone = {
  digits: string;
  display: string;
  label: string;
};

export type CustomerRecord = {
  id: string;
  name: string;
  phonesRaw: string;
  emailsRaw: string;
  deliveryInstructions: string;
  lid: string;
  territory: string;
  phones: CustomerPhone[];
  emails: string[];
};

export type CustomerDirectory = {
  customers: CustomerRecord[];
  sourceFileName: string | null;
  uploadedAt: string | null;
};

export type CustomerParseSuccess = {
  ok: true;
  directory: CustomerDirectory;
  warnings: string[];
  skipped: number;
  replacedDuplicateLids: number;
};

export type CustomerParseFailure = {
  ok: false;
  error: string;
};

export type CustomerParseResult = CustomerParseSuccess | CustomerParseFailure;

const PHONE_PATTERN =
  /(?<!\d)(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}(?!\d)/g;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function emptyCustomerDirectory(): CustomerDirectory {
  return {
    customers: [],
    sourceFileName: null,
    uploadedAt: null,
  };
}

export function customerCsvTemplate(): string {
  return `${CUSTOMER_CSV_HEADERS.join(",")}\n`;
}

export function phoneTelHref(digits: string): string {
  return `tel:+1${digits}`;
}

export function formatCustomerPhone(digits: string): string {
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return digits;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export function customerSearchText(customer: CustomerRecord): string {
  return [
    customer.name,
    customer.territory,
    customer.lid,
    customer.phonesRaw,
    customer.emailsRaw,
    customer.deliveryInstructions,
    ...customer.phones.flatMap((phone) => [phone.display, phone.digits, phone.label]),
    ...customer.emails,
  ]
    .join(" ")
    .toLowerCase();
}

export function customersMatchingAccountName(
  directory: CustomerDirectory,
  accountName: string,
): CustomerRecord[] {
  const key = normalizeName(accountName);
  if (!key) return [];
  return directory.customers.filter((customer) => normalizeName(customer.name) === key);
}

export function parseCustomerCsv(fileName: string, text: string): CustomerParseResult {
  const source = text.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });

  const headers = (parsed.meta.fields ?? []).map((header) => header.trim()).filter(Boolean);
  if (headers.length === 0) {
    return {
      ok: false,
      error: "This file has no header row. Export the Outfield account list as CSV and upload that file.",
    };
  }

  const headerByKey = new Map<string, string>();
  for (const header of headers) {
    headerByKey.set(headerKey(header), header);
  }

  const missing = CUSTOMER_CSV_HEADERS.filter((header) => !headerByKey.has(headerKey(header)));

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing ${missing.join(", ")}. Expected columns: ${CUSTOMER_CSV_HEADERS.join(", ")}.`,
    };
  }

  const nameHeader = headerByKey.get(HEADER_KEYS.name)!;
  const phonesHeader = headerByKey.get(HEADER_KEYS.phones)!;
  const emailsHeader = headerByKey.get(HEADER_KEYS.emails)!;
  const deliveryHeader = headerByKey.get(HEADER_KEYS.delivery)!;
  const lidHeader = headerByKey.get(HEADER_KEYS.lid)!;
  const territoryHeader = headerByKey.get(HEADER_KEYS.territory)!;

  const rows = (parsed.data ?? []).filter(
    (row) =>
      row &&
      typeof row === "object" &&
      Object.values(row).some((value) => cleanInline(value).length > 0),
  );

  const byId = new Map<string, CustomerRecord>();
  const order: string[] = [];
  const namelessCounts = new Map<string, number>();
  let skipped = 0;
  let replacedDuplicateLids = 0;

  for (const row of rows) {
    const name = cleanInline(row[nameHeader]);
    if (!name) {
      skipped += 1;
      continue;
    }

    const lid = cleanInline(row[lidHeader]);
    const phonesRaw = cleanInline(row[phonesHeader]);
    const emailsRaw = cleanInline(row[emailsHeader]);
    const deliveryInstructions = cleanMultiline(row[deliveryHeader]);
    const territory = cleanInline(row[territoryHeader]);
    const id = customerId(name, lid, namelessCounts);

    if (byId.has(id) && lid) replacedDuplicateLids += 1;
    if (!byId.has(id)) order.push(id);

    byId.set(id, {
      id,
      name,
      phonesRaw,
      emailsRaw,
      deliveryInstructions,
      lid,
      territory,
      phones: extractPhones(phonesRaw),
      emails: extractEmails(emailsRaw),
    });
  }

  if (byId.size === 0) {
    return {
      ok: false,
      error: "No accounts were found. Each row needs a Name.",
    };
  }

  const customers = order
    .map((id) => byId.get(id))
    .filter((customer): customer is CustomerRecord => Boolean(customer))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

  const warnings: string[] = [];
  if (skipped > 0) {
    warnings.push(
      `${skipped} row${skipped === 1 ? "" : "s"} skipped because Name was blank.`,
    );
  }
  if (replacedDuplicateLids > 0) {
    warnings.push(
      `${replacedDuplicateLids} duplicate LID${replacedDuplicateLids === 1 ? "" : "s"} updated to the later row.`,
    );
  }

  return {
    ok: true,
    directory: {
      customers,
      sourceFileName: fileName,
      uploadedAt: new Date().toISOString(),
    },
    warnings,
    skipped,
    replacedDuplicateLids,
  };
}

export function extractPhones(raw: string): CustomerPhone[] {
  const text = cleanInline(raw);
  if (!text) return [];

  const matches = [...text.matchAll(PHONE_PATTERN)];
  const phones: CustomerPhone[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const previousEnd =
      index === 0 ? 0 : (matches[index - 1].index ?? 0) + matches[index - 1][0].length;
    const nextStart =
      index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const before = cleanLabel(text.slice(previousEnd, start));
    const after = index + 1 < matches.length ? "" : cleanLabel(text.slice(end, nextStart));
    const digits = normalizePhoneDigits(match[0]);
    if (digits.length !== 10 || seen.has(digits)) continue;
    seen.add(digits);
    phones.push({
      digits,
      display: formatCustomerPhone(digits),
      label: before || after,
    });
  }

  return phones;
}

export function extractEmails(raw: string): string[] {
  const text = cleanInline(raw);
  if (!text || !text.includes("@")) return [];

  const found = new Set<string>();
  const collect = (source: string) => {
    for (const match of source.matchAll(EMAIL_PATTERN)) {
      const address = match[0].replace(/[.,;:]+$/g, "").toLowerCase();
      if (address.includes("@")) found.add(address);
    }
  };

  collect(text);
  let joined = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = joined.replace(/(@\S+)\s+([^\s@]+\.[a-z]{2,})/gi, "$1$2");
    if (next === joined) break;
    joined = next;
  }
  collect(joined);

  return [...found];
}

function customerId(name: string, lid: string, namelessCounts: Map<string, number>): string {
  if (lid) return `lid:${lid}`;
  const base = `name:${normalizeName(name) || "account"}`;
  const count = namelessCounts.get(base) ?? 0;
  namelessCounts.set(base, count + 1);
  return count === 0 ? base : `${base}:${count + 1}`;
}

function headerKey(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanInline(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return isPlaceholder(text) ? "" : text;
}

function cleanMultiline(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join("\n")
    .trim();
  return isPlaceholder(text) ? "" : text;
}

function isPlaceholder(value: string): boolean {
  return /^(undefined|null|n\/a)$/i.test(value);
}

function cleanLabel(value: string): string {
  const text = value
    .replace(/\b(phones?|emails?|cells?|mobiles?|approvals?)\b/gi, " ")
    .replace(/[:|/,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return dedupeLabel(text);
}

function dedupeLabel(label: string): string {
  const words = label.split(" ").filter(Boolean);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const first = words.slice(0, half).join(" ");
    const second = words.slice(half).join(" ");
    if (first.toLowerCase() === second.toLowerCase()) return first;
  }
  return words.join(" ");
}

function normalizePhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}
