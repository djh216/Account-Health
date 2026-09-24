import ExcelJS from "exceljs";
import { finalizeParse, rowsToRecords } from "../src/lib/parse";

async function parseAngelaWorkbook() {
  const fs = await import("node:fs");
  const buffer = fs.readFileSync(
    "/home/ubuntu/.cursor/projects/workspace/uploads/Angela_Last_Order_Date_d789.xlsx",
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const sheet = workbook.worksheets[0]!;
  const rows: Record<string, string>[] = [];
  let headers: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = values.map((value) => {
      if (value == null) return "";
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return String(value);
    });
    if (rowNumber === 1) {
      headers = cells.map((cell, index) => cell.trim() || `Column ${index + 1}`);
      return;
    }
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    if (Object.values(record).some((value) => value.trim())) rows.push(record);
  });

  return finalizeParse("Angela Last Order Date.xlsx", headers, rows);
}

async function main() {
  const parsed = await parseAngelaWorkbook();
  const failures: string[] = [];

  if (parsed.kind !== "snapshot") {
    failures.push(`Expected snapshot kind, got ${parsed.kind}`);
  }
  if (!parsed.mapping.lastVisitDate) {
    failures.push("Last visit date column not mapped");
  }

  const records = rowsToRecords(parsed);
  if (records.orders.length !== 61) {
    failures.push(`Expected 61 last-order records, got ${records.orders.length}`);
  }
  if (records.visits.length !== 61) {
    failures.push(`Expected 61 last-visit records, got ${records.visits.length}`);
  }
  if (records.accounts[0]?.salesRep !== "Angela") {
    failures.push(`Expected rep Angela, got ${records.accounts[0]?.salesRep ?? "none"}`);
  }
  if (!records.visits[0]?.date) {
    failures.push("Visit missing date");
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(
    `OK — Angela snapshot: ${records.visits.length} visits, ${records.orders.length} last orders, rep ${records.accounts[0]?.salesRep}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
