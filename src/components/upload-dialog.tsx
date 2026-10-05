"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileSpreadsheet, Loader2, Upload, XIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortfolio } from "@/hooks/use-portfolio";
import { activityVisitCount, type ClearUploadScope } from "@/lib/clear-uploads";
import { parseFiles } from "@/lib/excel-parser";
import { formatNumber } from "@/lib/format";
import { detectKind } from "@/lib/parse";
import type { ColumnMapping, ParseResult, ReportKind } from "@/lib/types";

const ALL_FIELDS: Array<{ key: keyof ColumnMapping; label: string }> = [
  { key: "account", label: "Account name" },
  { key: "lastOrderDate", label: "Last order date" },
  { key: "lastVisitDate", label: "Last visit date" },
  { key: "date", label: "Date" },
  { key: "tier", label: "Tier" },
  { key: "licenseNumber", label: "License number" },
  { key: "type", label: "Account type" },
  { key: "city", label: "City" },
  { key: "county", label: "County" },
  { key: "region", label: "Region" },
  { key: "salesRep", label: "Lead team member / sales rep" },
  { key: "cases", label: "Volume (bottles)" },
  { key: "skuCount", label: "SKU count" },
  { key: "product", label: "Product" },
  { key: "outcome", label: "Visit outcome / notes" },
  { key: "visitDuration", label: "Duration (minutes on site)" },
];

function fieldsForKind(kind: ReportKind): Array<{ key: keyof ColumnMapping; label: string }> {
  if (kind === "snapshot") {
    return ALL_FIELDS.filter((field) =>
      [
        "account",
        "lastOrderDate",
        "lastVisitDate",
        "tier",
        "licenseNumber",
        "type",
        "city",
        "county",
        "region",
        "salesRep",
      ].includes(field.key),
    );
  }
  if (kind === "orders") {
    return ALL_FIELDS.filter((field) =>
      [
        "account",
        "date",
        "lastOrderDate",
        "cases",
        "skuCount",
        "product",
        "type",
        "city",
        "tier",
        "salesRep",
      ].includes(field.key),
    );
  }
  if (kind === "visits") {
    return ALL_FIELDS.filter((field) =>
      ["account", "date", "salesRep", "outcome", "visitDuration"].includes(field.key),
    ).map((field) =>
      field.key === "date"
        ? { ...field, label: "Visit date (Outfield: Created)" }
        : field,
    );
  }
  return ALL_FIELDS.filter((field) =>
    [
      "account",
      "tier",
      "licenseNumber",
      "type",
      "city",
      "county",
      "region",
      "salesRep",
    ].includes(field.key),
  );
}

export function UploadDialog({
  open,
  onOpenChange,
  onImport,
  onUploadCleared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (result: ParseResult) => void;
  onUploadCleared?: (message: string) => void;
}) {
  const { state, clearUpload } = usePortfolio();
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [confirmClearScope, setConfirmClearScope] = useState<ClearUploadScope | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orderRowCount = state.orders.length;
  const activityRowCount = activityVisitCount(state);
  const latestOrderReport = state.reports.find((report) => report.kind === "orders");
  const latestActivityReport = state.reports.find((report) => report.kind === "visits");

  const requiredMissing = useMemo(() => {
    if (!parsed) return [];
    const missing: string[] = [];
    if (!parsed.mapping.account) missing.push("Account name");
    if (parsed.kind === "snapshot") {
      if (!parsed.mapping.lastOrderDate && !parsed.mapping.lastVisitDate) {
        missing.push("Last order date or Last visit date");
      }
    } else if (parsed.kind === "orders") {
      if (!parsed.mapping.date && !parsed.mapping.lastOrderDate) {
        missing.push("Date or Last order date");
      }
    } else if (parsed.kind === "visits") {
      if (!parsed.mapping.date) {
        missing.push("Visit date (Created column)");
      }
    }
    return missing;
  }, [parsed]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fileList = Array.from(files);

      // 1. First attempt direct client-side parsing:
      // Works in-memory with SheetJS & PapaParse without network limits, avoiding proxy 413s and HTML error responses.
      try {
        const result = await parseFiles(fileList);
        setParsed(result);
        return;
      } catch {
        // Fall back to server route
      }

      // 2. Fallback to API route with defensive response handling (handles HTML 413, 500, or proxy pages gracefully)
      const form = new FormData();
      fileList.forEach((file) => {
        form.append("file", file);
      });

      const response = await fetch("/api/parse-report", {
        method: "POST",
        body: form,
      });

      const responseText = await response.text();
      let payload: { error?: string } | null = null;
      try {
        payload = JSON.parse(responseText);
      } catch {
        if (!response.ok) {
          throw new Error(
            response.status === 413
              ? "The file is too large to upload over the network. Please upload standard Excel (.xlsx) or CSV files."
              : `Server error (${response.status}): Could not process this spreadsheet.`,
          );
        }
        throw new Error("Could not parse file data: unrecognized response from server.");
      }

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? "Could not read that file.");
      }
      setParsed(payload as ParseResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
      setParsed(null);
    } finally {
      setBusy(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  function updateMapping<K extends keyof ColumnMapping>(key: K, value: string) {
    setParsed((current) => {
      if (!current) return current;
      const mapping = {
        ...current.mapping,
        [key]: value === "__none" ? undefined : value,
      };
      const kind = detectKind(current.fileName, mapping, current.rows);
      const nextMapping =
        kind === "visits" && mapping.date
          ? {
              ...mapping,
              lastVisitDate:
                mapping.lastVisitDate === mapping.date ? undefined : mapping.lastVisitDate,
            }
          : mapping;
      return {
        ...current,
        mapping: nextMapping,
        kind,
        warnings: [],
      };
    });
  }

  function closeDialog() {
    setParsed(null);
    setError(null);
    onOpenChange(false);
  }

  function confirm() {
    if (!parsed || requiredMissing.length > 0) return;
    onImport(parsed);
    setParsed(null);
    onOpenChange(false);
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setParsed(null);
        setError(null);
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close upload dialog"
        className="absolute inset-0 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
        onClick={closeDialog}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
        className="relative z-10 grid max-h-[90vh] w-full max-w-4xl gap-4 overflow-y-auto rounded-xl bg-popover p-5 text-sm text-popover-foreground ring-1 ring-foreground/10"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 id="upload-dialog-title" className="font-heading text-base font-medium">
              Upload reports
            </h2>
            <p className="text-sm text-muted-foreground">
              Import CSV or Excel exports for order history, visit patterns, or
              account master data. Columns are mapped automatically — adjust if
              needed before importing.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={closeDialog}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {orderRowCount > 0 || activityRowCount > 0 ? (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-medium">Stored uploads</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Clear one dataset to replace it with a fresh export without wiping
                accounts or the other upload type.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <StoredUploadCard
                title="Order history"
                rowLabel="order lines"
                rowCount={orderRowCount}
                fileName={latestOrderReport?.fileName}
                disabled={orderRowCount === 0}
                onClear={() => setConfirmClearScope("orders")}
              />
              <StoredUploadCard
                title="Activity log"
                rowLabel="visit rows"
                rowCount={activityRowCount}
                fileName={latestActivityReport?.fileName}
                disabled={activityRowCount === 0}
                onClear={() => setConfirmClearScope("activity")}
              />
            </div>
          </div>
        ) : null}

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
            isDragging
              ? "border-primary bg-primary/10 scale-[1.01]"
              : "border-primary/30 bg-primary/4 hover:border-primary/60 hover:bg-primary/6"
          }`}
        >
          {busy ? (
            <Loader2 className="size-8 animate-spin text-primary" />
          ) : (
            <FileSpreadsheet className="size-8 text-primary" />
          )}
          <div className="font-medium text-base">
            {busy ? "Reading & parsing file…" : "Drop CSV or Excel files here, or browse"}
          </div>
          <p className="max-w-md text-xs text-muted-foreground">
            Supported: Excel spreadsheets (.xlsx, .xls) and CSVs. You can upload combined
            last order & visit sheets, or select both last order and last visit exports together.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <Upload data-icon="inline-start" />
            Select file(s) from computer
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.txt,.xlsx,.xls,.xlsm"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Could not parse that file</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {parsed ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="font-medium">{parsed.fileName}</div>
                <p className="text-sm text-muted-foreground">
                  {parsed.rows.length} rows · {parsed.headers.length} columns
                </p>
              </div>
              <div className="ml-auto w-56">
                <Label htmlFor="kind">Report type</Label>
                <Select
                  value={parsed.kind}
                  onValueChange={(value) =>
                    setParsed((current) => {
                      if (!current) return current;
                      const kind = (value as ReportKind) ?? current.kind;
                      return { ...current, kind };
                    })
                  }
                >
                  <SelectTrigger id="kind" className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="snapshot">Last order & visit snapshot</SelectItem>
                    <SelectItem value="orders">Order history</SelectItem>
                    <SelectItem value="visits">Visit / call log</SelectItem>
                    <SelectItem value="accounts">Account master</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {requiredMissing.length > 0 ? (
              <Alert>
                <AlertCircle />
                <AlertTitle>Map required columns</AlertTitle>
                <AlertDescription>
                  Still need: {requiredMissing.join(", ")}.
                </AlertDescription>
              </Alert>
            ) : null}

            {parsed.warnings.length > 0 ? (
              <Alert>
                <AlertCircle />
                <AlertTitle>Check column mapping</AlertTitle>
                <AlertDescription>{parsed.warnings.join(" ")}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {fieldsForKind(parsed.kind).map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`map-${field.key}`}>{field.label}</Label>
                  <Select
                    value={parsed.mapping[field.key] ?? "__none"}
                    onValueChange={(value) => updateMapping(field.key, value ?? "__none")}
                  >
                    <SelectTrigger id={`map-${field.key}`} className="mt-1 w-full">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not mapped</SelectItem>
                      {parsed.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    {parsed.headers.slice(0, 6).map((header) => (
                      <th key={header} className="px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 4).map((row, index) => (
                    <tr key={index} className="border-t">
                      {parsed.headers.slice(0, 6).map((header) => (
                        <td key={header} className="px-3 py-2 whitespace-nowrap">
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={!parsed || requiredMissing.length > 0}
          >
            <Upload data-icon="inline-start" />
            Import and rescore
          </Button>
        </div>
      </div>

      {confirmClearScope ? (
        <ClearUploadConfirmDialog
          scope={confirmClearScope}
          onCancel={() => setConfirmClearScope(null)}
          onConfirm={() => {
            const scope = confirmClearScope;
            clearUpload(scope);
            setConfirmClearScope(null);
            onUploadCleared?.(
              scope === "orders"
                ? "Order history cleared. Upload an updated order file when ready."
                : "Activity log cleared. Upload an updated Outfield or visit export when ready.",
            );
          }}
        />
      ) : null}
    </div>
  );
}

function StoredUploadCard({
  title,
  rowLabel,
  rowCount,
  fileName,
  disabled,
  onClear,
}: {
  title: string;
  rowLabel: string;
  rowCount: number;
  fileName?: string;
  disabled?: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {rowCount > 0
            ? `${formatNumber(rowCount)} ${rowLabel}${fileName ? ` · last file ${fileName}` : ""}`
            : `No ${rowLabel} stored`}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClear();
        }}
      >
        Clear {title.toLowerCase()}
      </Button>
    </div>
  );
}

function ClearUploadConfirmDialog({
  scope,
  onCancel,
  onConfirm,
}: {
  scope: ClearUploadScope;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isOrders = scope === "orders";
  const title = isOrders ? "Clear order history?" : "Clear activity log?";
  const description = isOrders
    ? "This removes all uploaded order lines and order import history from this browser. Accounts, visit activity, and rep filters are kept. You can import a full replacement order file next."
    : "This removes visit and Outfield activity rows and activity import history. Snapshot last-visit dates from account sheets are kept, along with orders and accounts. You can import a fresh activity export next.";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-black/20 supports-backdrop-filter:backdrop-blur-xs"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md space-y-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10"
      >
        <div className="space-y-2">
          <h2 className="font-heading text-base font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
