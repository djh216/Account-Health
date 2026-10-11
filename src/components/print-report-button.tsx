"use client";

import { useState } from "react";
import { BarChart3, ChevronDown, Download, FileText, Loader2, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useReportExport,
  type ReportPageType,
} from "@/components/report-export-provider";
import { cn } from "@/lib/utils";

export type PrimaryPdfExport = "page" | "alerts" | "action-plan" | "weekly-pack";

export function PrintReportButton({
  page,
  className,
  variant = "outline",
  size = "default",
  label = "Export PDF",
  title = "Generate a print-ready PDF preview",
  onMessage,
  primaryExport = "weekly-pack",
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
    exportSalesInsightsPackPdf,
    hasSalesInsightsPackData,
    hasHealthData,
    hasRepActionPlanData,
    hasAlertsData,
    hasOrderData,
    hasProductData,
    hasWeeklyBriefingData,
  } = useReportExport();

  const [localToast, setLocalToast] = useState<string | null>(null);

  const effectivePage = page ?? activePage;

  const pageShortName =
    effectivePage === "orders"
      ? "Order analytics"
      : effectivePage === "products"
        ? "Product trends"
        : effectivePage === "insights"
          ? "Weekly book briefing"
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
      if (
        primaryExport === "alerts" ||
        primaryExport === "action-plan" ||
        primaryExport === "weekly-pack"
      ) {
        if (hasSalesInsightsPackData || hasRepActionPlanData || hasAlertsData) {
          await exportSalesInsightsPackPdf();
          notify(
            "Weekly rep pack PDF ready — includes briefing KPIs, focus accounts, alerts, and insight tables.",
          );
          return;
        }
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
            <DropdownMenuLabel className="text-xs font-normal leading-snug text-muted-foreground">
              Specialized exports (weekly rep pack already includes alerts, churn, focus, and
              insight tables)
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => void runExport(exportOrderAnalyticsPdf, "Order analytics")}
              disabled={!hasOrderData}
              className="gap-2"
            >
              <BarChart3 className="size-4 shrink-0 text-primary" />
              Order analytics (frequency &amp; volume)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runExport(exportProductTrendsPdf, "Product sales trends")}
              disabled={!hasProductData}
              className="gap-2"
            >
              <Wine className="size-4 shrink-0 text-primary" />
              Product catalog &amp; slowing wines
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runExport(exportFocusHealthPdf, "Account focus detail")}
              disabled={!hasHealthData}
              className="gap-2"
            >
              <FileText className="size-4 shrink-0 text-primary" />
              Account focus detail (extended columns)
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
