"use client";

import { useState } from "react";
import { CalendarRange, ChevronDown, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useReportExport, type ReportPageType } from "@/hooks/use-report-export";
import { cn } from "@/lib/utils";

export type PrimaryPdfExport = "page" | "alerts" | "action-plan";

export function PrintReportButton({
  page,
  className,
  variant = "outline",
  size = "default",
  label = "Export PDF",
  title = "Download a print-ready PDF",
  onMessage,
  primaryExport = "page",
  showMenu = true,
}: {
  page?: ReportPageType;
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  label?: string;
  title?: string;
  onMessage?: (message: string) => void;
  primaryExport?: PrimaryPdfExport;
  showMenu?: boolean;
}) {
  const {
    busy,
    busyAction,
    canExport,
    activePage,
    exportCurrentPagePdf,
    exportFrequencyAlertsPdf,
    exportRepActionPlansPdf,
    hasRepActionPlanData,
  } = useReportExport();

  const [localToast, setLocalToast] = useState<string | null>(null);

  const effectivePage = page ?? activePage;

  const pageShortName =
    effectivePage === "orders"
      ? "Order analytics"
      : effectivePage === "products"
        ? "Product trends"
        : "Account health";

  function notify(msg: string) {
    if (onMessage) {
      onMessage(msg);
    } else {
      setLocalToast(msg);
      window.setTimeout(() => setLocalToast(null), 4500);
    }
  }

  async function handlePrimaryExport() {
    try {
      if (primaryExport === "alerts") {
        await exportFrequencyAlertsPdf();
        notify("Frequency alerts PDF downloaded.");
        return;
      }
      if (primaryExport === "action-plan") {
        await exportRepActionPlansPdf();
        notify("Rep action plan PDF downloaded.");
        return;
      }
      await exportCurrentPagePdf(effectivePage);
      notify(`${pageShortName} PDF downloaded.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate PDF.");
    }
  }

  async function handlePagePdf() {
    try {
      await exportCurrentPagePdf(effectivePage);
      notify(`${pageShortName} PDF downloaded.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate PDF.");
    }
  }

  async function handleActionPlanPdf() {
    try {
      await exportRepActionPlansPdf();
      notify("Rep action plan PDF downloaded.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate action plan.");
    }
  }

  async function handleAlertsPdf() {
    try {
      await exportFrequencyAlertsPdf();
      notify("Frequency alerts PDF downloaded.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate alerts PDF.");
    }
  }

  const heightClasses =
    size === "sm" ? "h-8" : size === "lg" ? "h-10" : size === "xs" ? "h-7" : "h-9";

  const primaryButton = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={showMenu ? "rounded-r-none border-r-0 focus-visible:z-10" : undefined}
      disabled={busy || !canExport}
      title={title}
      onClick={() => void handlePrimaryExport()}
    >
      {busy ? (
        <Loader2 data-icon="inline-start" className="size-4 animate-spin text-primary" />
      ) : (
        <Download data-icon="inline-start" className="size-4" />
      )}
      <span>{busy ? busyAction || "Generating…" : label}</span>
    </Button>
  );

  if (!showMenu) {
    return (
      <>
        {primaryButton}
        {localToast ? (
          <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
            {localToast}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className={cn("inline-flex items-center -space-x-px rounded-md shadow-xs", className)}>
        {primaryButton}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center justify-center rounded-l-none rounded-r-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
              heightClasses,
            )}
            disabled={busy || !canExport}
            title="More PDF exports"
          >
            <ChevronDown className="size-3.5 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              PDF reports
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void handlePagePdf()} className="gap-2">
              <FileText className="size-4 shrink-0 text-primary" />
              {pageShortName}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleActionPlanPdf()}
              disabled={!hasRepActionPlanData}
              className="gap-2"
            >
              <CalendarRange className="size-4 shrink-0 text-primary" />
              Rep action plan (weeks 1–3)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleAlertsPdf()} className="gap-2">
              <FileText className="size-4 shrink-0 text-amber-600" />
              Frequency drop alerts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {localToast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
          {localToast}
        </div>
      ) : null}
    </>
  );
}
