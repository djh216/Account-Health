"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  TrendingDown,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useReportExport,
  type ReportPageType,
} from "@/components/report-export-provider";
import { cn } from "@/lib/utils";

export type PrimaryPdfExport = "page" | "alerts" | "action-plan";

export function PrintReportButton({
  page,
  className,
  variant = "outline",
  size = "default",
  label = "Export PDF",
  title = "Generate a print-ready PDF preview",
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
    exportFocusHealthPdf,
    exportOrderAnalyticsPdf,
    exportProductTrendsPdf,
    exportRepActionPlansPdf,
    exportFrequencyAlertsPdf,
    exportProductSlowdownPdf,
    exportImminentChurnPdf,
    hasHealthData,
    hasRepActionPlanData,
    hasOrderData,
    hasProductData,
    hasAlertsData,
    hasProductSlowdownData,
    hasImminentChurnData,
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

  async function runExport(exportFn: () => Promise<void>, reportLabel: string) {
    try {
      await exportFn();
      notify(`${reportLabel} PDF ready — print or save from the preview.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate PDF.");
    }
  }

  async function handlePrimaryExport() {
    try {
      if (primaryExport === "alerts") {
        await exportFrequencyAlertsPdf();
        notify("Frequency alerts PDF ready — print or save from the preview.");
        return;
      }
      if (primaryExport === "action-plan") {
        await exportRepActionPlansPdf();
        notify("Action plan PDF ready — print or save from the preview.");
        return;
      }
      await exportCurrentPagePdf(effectivePage);
      notify(`${pageShortName} PDF ready — print or save from the preview.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate PDF.");
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
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              PDF reports
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => void runExport(exportFocusHealthPdf, "Account health")}
              disabled={!hasHealthData}
              className="gap-2"
            >
              <FileText className="size-4 shrink-0 text-primary" />
              Account health &amp; focus
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runExport(exportOrderAnalyticsPdf, "Order analytics")}
              disabled={!hasOrderData}
              className="gap-2"
            >
              <BarChart3 className="size-4 shrink-0 text-primary" />
              Order analytics
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runExport(exportProductTrendsPdf, "Product sales trends")}
              disabled={!hasProductData}
              className="gap-2"
            >
              <Wine className="size-4 shrink-0 text-primary" />
              Product sales trends
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void runExport(exportRepActionPlansPdf, "Rep action plan")}
              disabled={!hasRepActionPlanData}
              className="gap-2"
            >
              <CalendarRange className="size-4 shrink-0 text-primary" />
              Rep action plan (weeks 1–3)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runExport(exportFrequencyAlertsPdf, "Frequency drop alerts")}
              disabled={!hasAlertsData}
              className="gap-2"
            >
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              Frequency drop alerts
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runExport(exportProductSlowdownPdf, "Product slowdown")}
              disabled={!hasProductSlowdownData}
              className="gap-2"
            >
              <TrendingDown className="size-4 shrink-0 text-amber-600" />
              Product slowdown report
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void runExport(exportImminentChurnPdf, "Imminent churn intervention")
              }
              disabled={!hasImminentChurnData}
              className="gap-2"
            >
              <AlertTriangle className="size-4 shrink-0 text-rose-600" />
              Imminent churn intervention
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
