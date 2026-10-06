import ExcelJS from "exceljs";
import { formatDate, formatNumber } from "./format";
import { buildExportXlsxFilename } from "./pdf-filename";
import type { ProductSlowdownPdfInput } from "./generate-product-slowdown-pdf";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF781C30" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};
const TITLE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 14,
  color: { argb: "FF1E293B" },
};
const META_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  color: { argb: "FF64748B" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

const SEVERITY_FILLS: Record<string, ExcelJS.Fill> = {
  critical: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFE4E6" },
  },
  warning: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFEDD5" },
  },
  watch: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8FAFC" },
  },
};

function repLabel(repFilter: string): string {
  return repFilter === "all" ? "All Sales Reps" : repFilter;
}

function applyRowBorder(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = THIN_BORDER;
  });
}

export async function buildProductSlowdownWorkbook(
  input: ProductSlowdownPdfInput,
): Promise<ExcelJS.Workbook> {
  if (input.alerts.length === 0) {
    throw new Error("No product slowdown alerts to export.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Cellar Pulse";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Product Slowdown", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const stamp = input.generatedAt.slice(0, 10);
  const headers = [
    "Severity",
    "Product Name",
    "Active Accounts",
    "Last Order Date",
    "Recent Month (btls)",
    "Prior Month (btls)",
    "Volume Drop (btls)",
    "Drop %",
    "Top Accounts to Target",
    "Diagnosis",
    "Action Recommendation",
  ];

  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "Cellar Pulse · Monthly Product Sales Slowdown Report";
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle", wrapText: true };

  sheet.mergeCells(2, 1, 2, headers.length);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = `Rep: ${repLabel(input.repFilter)}  ·  As of: ${formatDate(input.asOf)}  ·  Generated: ${formatDate(stamp)}`;
  metaCell.font = META_FONT;
  metaCell.alignment = { wrapText: true };

  const headerRow = sheet.getRow(4);
  headers.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 22;

  input.alerts.forEach((alert, alertIndex) => {
    const row = sheet.getRow(5 + alertIndex);
    const values: (string | number)[] = [
      alert.severity.toUpperCase(),
      alert.productName,
      alert.accountCount,
      alert.lastOrderDate ? formatDate(alert.lastOrderDate) : "",
      alert.recentVolume28d,
      alert.priorVolume28d,
      alert.volumeDropBtls,
      alert.dropPercentage / 100,
      alert.topAtRiskAccounts.join("; "),
      alert.message,
      alert.recommendation,
    ];

    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.alignment = {
        vertical: "top",
        horizontal: colIndex >= 4 && colIndex <= 7 ? "right" : "left",
        wrapText: colIndex === 1 || colIndex >= 8,
      };
      const fill = SEVERITY_FILLS[alert.severity];
      if (fill) cell.fill = fill;
      if (colIndex === 7) cell.numFmt = "0.0%";
      if (colIndex >= 4 && colIndex <= 6) cell.numFmt = "#,##0";
    });

    applyRowBorder(row);
  });

  sheet.columns = [
    { width: 12 },
    { width: 36 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 10 },
    { width: 32 },
    { width: 40 },
    { width: 44 },
  ];

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + input.alerts.length, column: headers.length },
  };

  return workbook;
}

export async function downloadProductSlowdownExcel(input: ProductSlowdownPdfInput): Promise<void> {
  const workbook = await buildProductSlowdownWorkbook(input);
  const stamp = input.generatedAt.slice(0, 10);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildExportXlsxFilename(input.repFilter, "product-slowdown-report", stamp);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
