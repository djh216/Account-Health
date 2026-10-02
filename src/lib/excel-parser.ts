import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  detectMapping,
  finalizeParse,
  findHeaderRowIndex,
  parseCsv,
} from "./parse";
import type { ParseResult } from "./types";

export function cellToString(val: unknown): string {
  if (val == null) return "";
  if (val instanceof Date) {
    if (!Number.isNaN(val.getTime())) {
      const y = val.getUTCFullYear();
      const m = String(val.getUTCMonth() + 1).padStart(2, "0");
      const d = String(val.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return "";
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? String(val) : "";
  }
  if (typeof val === "boolean") {
    return String(val);
  }
  if (typeof val === "object") {
    if (
      "richText" in val &&
      Array.isArray((val as { richText: Array<{ text?: string }> }).richText)
    ) {
      return (val as { richText: Array<{ text?: string }> }).richText
        .map((part) => part?.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in val) {
      return String((val as { text?: unknown }).text ?? "").trim();
    }
    if ("result" in val) {
      const res = (val as { result?: unknown }).result;
      return cellToString(res);
    }
    if ("error" in val) {
      return "";
    }
  }
  return String(val).trim();
}

export type SheetTable = {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  headerScore: number;
};

export function extractSheetTable(
  sheetName: string,
  rawGrid: unknown[][],
): SheetTable | null {
  const rawRows: string[][] = rawGrid
    .map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
    .filter((row) => row.some((c) => c.length > 0));

  if (rawRows.length < 2) return null;

  const headerRowIndex = findHeaderRowIndex(rawRows);
  const rawHeaders = rawRows[headerRowIndex] ?? [];
  const headers = rawHeaders.map((c, i) => (c ? c.trim() : `Column ${i + 1}`));

  // Deduplicate headers while keeping positions
  const seenHeaders = new Map<string, number>();
  const finalHeaders = headers.map((header) => {
    const count = seenHeaders.get(header) || 0;
    seenHeaders.set(header, count + 1);
    return count > 0 ? `${header} (${count + 1})` : header;
  });

  const rows: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const record: Record<string, string> = {};
    finalHeaders.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    if (Object.values(record).some((v) => v.trim().length > 0)) {
      rows.push(record);
    }
  }

  if (rows.length === 0) return null;

  // Score how well headers match CRM/sales domains
  const mapping = detectMapping(finalHeaders);
  let score = 0;
  if (mapping.account) score += 40;
  if (mapping.lastOrderDate) score += 25;
  if (mapping.lastVisitDate) score += 25;
  if (mapping.salesRep) score += 15;
  if (mapping.date) score += 10;

  return {
    sheetName,
    headers: finalHeaders,
    rows,
    headerScore: score,
  };
}

export function combineOrderAndVisitTables(
  fileName: string,
  sheetTables: SheetTable[],
): ParseResult | null {
  if (sheetTables.length < 2) return null;

  const orderSheet = sheetTables.find((t) => {
    const m = detectMapping(t.headers);
    return Boolean(m.lastOrderDate || /(order|sales|invoice)/i.test(t.sheetName));
  });
  const visitSheet = sheetTables.find((t) => {
    const m = detectMapping(t.headers);
    return Boolean(m.lastVisitDate || /(visit|call|contact|meeting)/i.test(t.sheetName));
  });

  if (orderSheet && visitSheet && orderSheet !== visitSheet) {
    const orderMap = detectMapping(orderSheet.headers);
    const visitMap = detectMapping(visitSheet.headers);

    if (orderMap.account && visitMap.account) {
      const orderDateCol = orderMap.lastOrderDate || orderMap.date;
      const visitDateCol = visitMap.lastVisitDate || visitMap.date;

      const targetOrderHeader = orderMap.lastOrderDate || "Last Order Date";
      const targetVisitHeader = visitMap.lastVisitDate || "Last Visit Date";

      const combinedHeaders: string[] = [orderMap.account];
      if (!combinedHeaders.includes(targetOrderHeader)) combinedHeaders.push(targetOrderHeader);
      if (!combinedHeaders.includes(targetVisitHeader)) combinedHeaders.push(targetVisitHeader);

      for (const h of orderSheet.headers) {
        if (h !== orderMap.account && h !== orderDateCol && !combinedHeaders.includes(h)) {
          combinedHeaders.push(h);
        }
      }
      for (const h of visitSheet.headers) {
        if (h !== visitMap.account && h !== visitDateCol && !combinedHeaders.includes(h)) {
          combinedHeaders.push(h);
        }
      }

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const combinedByAccount = new Map<string, Record<string, string>>();

      for (const r of orderSheet.rows) {
        const acct = r[orderMap.account]?.trim();
        if (!acct) continue;
        const record: Record<string, string> = {
          [orderMap.account]: acct,
        };
        if (orderDateCol && r[orderDateCol]) {
          record[targetOrderHeader] = r[orderDateCol];
        }
        for (const [k, v] of Object.entries(r)) {
          if (k !== orderDateCol && v && v.trim()) {
            record[k] = v;
          }
        }
        combinedByAccount.set(norm(acct), record);
      }

      for (const r of visitSheet.rows) {
        const acct = r[visitMap.account]?.trim();
        if (!acct) continue;
        const key = norm(acct);
        const existing = combinedByAccount.get(key) || { [orderMap.account]: acct };
        if (visitDateCol && r[visitDateCol]) {
          existing[targetVisitHeader] = r[visitDateCol];
        }
        for (const [k, v] of Object.entries(r)) {
          if (k !== visitDateCol && v && v.trim()) {
            existing[k] = v;
          }
        }
        combinedByAccount.set(key, existing);
      }

      const mergedRows = [...combinedByAccount.values()];
      if (mergedRows.length > 0) {
        return finalizeParse(fileName, combinedHeaders, mergedRows);
      }
    }
  }

  return null;
}

export function parseWithSheetJS(fileName: string, buffer: ArrayBuffer): ParseResult {
  const bytes = new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    dense: true,
  });

  const sheetTables: SheetTable[] = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as unknown[][];

    const table = extractSheetTable(sheetName, grid);
    if (table) {
      sheetTables.push(table);
    }
  }

  if (sheetTables.length === 0) {
    return {
      fileName,
      headers: [],
      rows: [],
      kind: "accounts",
      mapping: {},
      warnings: ["The workbook contains no data rows."],
    };
  }

  // Check if multiple sheets can be combined (e.g. one has Last Orders, another has Last Visits)
  const combined = combineOrderAndVisitTables(fileName, sheetTables);
  if (combined) {
    return combined;
  }

  // Pick the best sheet by highest header relevance score, breaking ties by row count
  sheetTables.sort((a, b) => b.headerScore - a.headerScore || b.rows.length - a.rows.length);
  const best = sheetTables[0];
  return finalizeParse(fileName, best.headers, best.rows);
}

export async function parseWithExcelJS(fileName: string, buffer: ArrayBuffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  const bytes = new Uint8Array(buffer);
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheetTables: SheetTable[] = [];
  for (const sheet of workbook.worksheets) {
    const rawGrid: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const maxCol = Math.max(row.cellCount, 30);
      const rowCells: unknown[] = [];
      for (let col = 1; col <= maxCol; col++) {
        rowCells.push(row.getCell(col).value);
      }
      rawGrid.push(rowCells);
    });

    const table = extractSheetTable(sheet.name, rawGrid);
    if (table) {
      sheetTables.push(table);
    }
  }

  if (sheetTables.length === 0) {
    return {
      fileName,
      headers: [],
      rows: [],
      kind: "accounts",
      mapping: {},
      warnings: ["The workbook contains no readable data."],
    };
  }

  const combined = combineOrderAndVisitTables(fileName, sheetTables);
  if (combined) {
    return combined;
  }

  sheetTables.sort((a, b) => b.headerScore - a.headerScore || b.rows.length - a.rows.length);
  const best = sheetTables[0];
  return finalizeParse(fileName, best.headers, best.rows);
}

export async function parseWorkbook(fileName: string, buffer: ArrayBuffer): Promise<ParseResult> {
  try {
    return parseWithSheetJS(fileName, buffer);
  } catch (sheetJsErr) {
    try {
      return await parseWithExcelJS(fileName, buffer);
    } catch {
      throw sheetJsErr;
    }
  }
}

export function mergeOrderAndVisitResults(parsedResults: ParseResult[]): ParseResult | null {
  if (parsedResults.length < 2) return null;

  const orderResult = parsedResults.find(
    (r) => r.mapping.lastOrderDate || /(order|sales|invoice)/i.test(r.fileName),
  );
  const visitResult = parsedResults.find(
    (r) => r.mapping.lastVisitDate || /(visit|call|contact|meeting)/i.test(r.fileName),
  );

  if (orderResult && visitResult && orderResult !== visitResult) {
    const orderAcct = orderResult.mapping.account;
    const visitAcct = visitResult.mapping.account;

    if (orderAcct && visitAcct) {
      const orderDateCol = orderResult.mapping.lastOrderDate || orderResult.mapping.date;
      const visitDateCol = visitResult.mapping.lastVisitDate || visitResult.mapping.date;

      const targetOrderHeader = orderResult.mapping.lastOrderDate || "Last Order Date";
      const targetVisitHeader = visitResult.mapping.lastVisitDate || "Last Visit Date";

      const combinedHeaders: string[] = [orderAcct];
      if (!combinedHeaders.includes(targetOrderHeader)) combinedHeaders.push(targetOrderHeader);
      if (!combinedHeaders.includes(targetVisitHeader)) combinedHeaders.push(targetVisitHeader);

      for (const h of orderResult.headers) {
        if (h !== orderAcct && h !== orderDateCol && !combinedHeaders.includes(h)) {
          combinedHeaders.push(h);
        }
      }
      for (const h of visitResult.headers) {
        if (h !== visitAcct && h !== visitDateCol && !combinedHeaders.includes(h)) {
          combinedHeaders.push(h);
        }
      }

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const combinedByAccount = new Map<string, Record<string, string>>();

      for (const r of orderResult.rows) {
        const acct = r[orderAcct]?.trim();
        if (!acct) continue;
        const record: Record<string, string> = {
          [orderAcct]: acct,
        };
        if (orderDateCol && r[orderDateCol]) {
          record[targetOrderHeader] = r[orderDateCol];
        }
        for (const [k, v] of Object.entries(r)) {
          if (k !== orderDateCol && v && v.trim()) {
            record[k] = v;
          }
        }
        combinedByAccount.set(norm(acct), record);
      }

      for (const r of visitResult.rows) {
        const acct = r[visitAcct]?.trim();
        if (!acct) continue;
        const key = norm(acct);
        const existing = combinedByAccount.get(key) || { [orderAcct]: acct };
        if (visitDateCol && r[visitDateCol]) {
          existing[targetVisitHeader] = r[visitDateCol];
        }
        for (const [k, v] of Object.entries(r)) {
          if (k !== visitDateCol && v && v.trim()) {
            existing[k] = v;
          }
        }
        combinedByAccount.set(key, existing);
      }

      const mergedRows = [...combinedByAccount.values()];
      const combinedName = `${orderResult.fileName} + ${visitResult.fileName}`;
      return finalizeParse(combinedName, combinedHeaders, mergedRows);
    }
  }

  return null;
}

export async function parseFile(file: File): Promise<ParseResult> {
  const fileName = file.name;
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = await file.text();
    return parseCsv(fileName, text);
  }

  const buffer = await file.arrayBuffer();
  return parseWorkbook(fileName, buffer);
}

export async function parseFiles(files: File[]): Promise<ParseResult> {
  if (files.length === 0) {
    throw new Error("No files selected.");
  }

  if (files.length === 1) {
    return parseFile(files[0]);
  }

  const parsedResults: ParseResult[] = [];
  for (const file of files) {
    parsedResults.push(await parseFile(file));
  }

  const merged = mergeOrderAndVisitResults(parsedResults);
  if (merged) {
    return merged;
  }

  // Otherwise return the first/richest result
  parsedResults.sort((a, b) => b.rows.length - a.rows.length);
  return parsedResults[0];
}
