import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { finalizeParse, parseCsv } from "@/lib/parse";
import type { ParseResult } from "@/lib/types";

export const runtime = "nodejs";

async function parseWorkbook(fileName: string, buffer: ArrayBuffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.from(buffer);
  await workbook.xlsx.load(nodeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      fileName,
      headers: [],
      rows: [],
      kind: "accounts",
      mapping: {},
      warnings: ["The workbook has no worksheets."],
    };
  }

  const rawRows: string[][] = [];
  sheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = values.map((value) => {
      if (value == null) return "";
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (typeof value === "object" && "text" in value) return String(value.text);
      if (typeof value === "object" && "result" in value) return String(value.result ?? "");
      return String(value);
    });
    if (cells.some((cell) => cell.trim().length > 0)) {
      rawRows.push(cells);
    }
  });

  if (rawRows.length === 0) {
    return {
      fileName,
      headers: [],
      rows: [],
      kind: "accounts",
      mapping: {},
      warnings: ["The worksheet is empty."],
    };
  }

  // Find header row: first row with at least 2 non-empty columns, or row 0
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const count = rawRows[i].filter((c) => c.trim().length > 0).length;
    if (count >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  const rawHeaders = rawRows[headerRowIndex] ?? [];
  const headers = rawHeaders.map((cell, index) => cell.trim() || `Column ${index + 1}`);

  const rows: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    if (Object.values(record).some((value) => value.trim())) {
      rows.push(record);
    }
  }

  return finalizeParse(fileName, headers, rows);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const fileName = file.name;
    const lower = fileName.toLowerCase();

    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const text = new TextDecoder().decode(buffer);
      return NextResponse.json(parseCsv(fileName, text));
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      return NextResponse.json(await parseWorkbook(fileName, buffer));
    }
    return NextResponse.json(
      { error: "Use a CSV or Excel (.xlsx) export." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
