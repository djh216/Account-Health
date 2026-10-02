"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  Download,
  FileText,
  Info,
  Loader2,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReportExport, type ReportPageType } from "@/hooks/use-report-export";
import { cn } from "@/lib/utils";

export function PrintReportButton({
  page,
  className,
  variant = "outline",
  size = "default",
  label = "Print to PDF",
  title = "Print or Save to PDF",
  onMessage,
}: {
  page?: ReportPageType;
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  label?: string;
  title?: string;
  onMessage?: (message: string) => void;
}) {
  const {
    busy,
    busyAction,
    canExport,
    activePage,
    repFilter,
    exportCurrentPagePdf,
    exportFrequencyAlertsPdf,
    exportRepActionPlansPdf,
    hasRepActionPlanData,
    triggerSafePrint,
  } = useReportExport();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);

  const effectivePage = page ?? activePage;

  const pageTitle =
    effectivePage === "orders"
      ? "Order Analytics"
      : effectivePage === "products"
        ? "Product Sales Trends"
        : "Account Health & Horizons";

  function notify(msg: string) {
    if (onMessage) {
      onMessage(msg);
    } else {
      setLocalToast(msg);
      window.setTimeout(() => setLocalToast(null), 4500);
    }
  }

  // 1. Direct PDF generation & download for active page
  async function handleDownloadActivePdf() {
    try {
      await exportCurrentPagePdf(effectivePage);
      notify(`✓ ${pageTitle} PDF report downloaded!`);
      setDialogOpen(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not generate PDF report.";
      notify(text);
    }
  }

  // 2. Frequency alerts PDF download
  async function handleDownloadRepActionPlanPdf() {
    try {
      await exportRepActionPlansPdf();
      notify("✓ Rep 1 / 2 / 3 week action plan PDF downloaded!");
      setDialogOpen(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not generate action plan.";
      notify(text);
    }
  }

  async function handleDownloadAlertsPdf() {
    try {
      await exportFrequencyAlertsPdf();
      notify("✓ Frequency drop alerts PDF downloaded!");
      setDialogOpen(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not generate alerts report.";
      notify(text);
    }
  }

  // 3. System browser print (with safe iframe fallback)
  async function handleSystemPrint() {
    try {
      const result = await triggerSafePrint(effectivePage);
      notify(result.message);
      setDialogOpen(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Print action failed.";
      notify(text);
    }
  }

  const heightClasses =
    size === "sm" ? "h-8" : size === "lg" ? "h-10" : size === "xs" ? "h-7" : "h-9";

  return (
    <>
      <div className={cn("inline-flex items-center -space-x-px rounded-md shadow-xs", className)}>
        {/* Primary Action Button: 1-click Download & Print-ready PDF */}
        <Button
          type="button"
          variant={variant}
          size={size}
          className="rounded-r-none border-r-0 focus-visible:z-10"
          disabled={busy || !canExport}
          title={title}
          onClick={() => void handleDownloadActivePdf()}
        >
          {busy ? (
            <Loader2 data-icon="inline-start" className="size-4 animate-spin text-primary" />
          ) : (
            <Printer data-icon="inline-start" className="size-4" />
          )}
          <span>{busy ? (busyAction || "Generating PDF…") : label}</span>
        </Button>

        {/* Dropdown Menu Trigger for alternative print/export choices */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center justify-center rounded-l-none rounded-r-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
              heightClasses,
            )}
            disabled={busy || !canExport}
            title="Print & PDF export options"
          >
            <ChevronDown className="size-3.5 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-2">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Download PDF Report (Ready to Print)
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => void handleDownloadActivePdf()}
                className="cursor-pointer gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
              >
                <FileText className="size-4 text-primary shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Download {pageTitle} PDF
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Exact print-formatted vector PDF with headers & tables
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => void handleDownloadRepActionPlanPdf()}
                disabled={!hasRepActionPlanData}
                className="cursor-pointer gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
              >
                <CalendarRange className="size-4 text-primary shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Download Rep Action Plan PDF
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Printable 1-, 2-, and 3-week priorities per rep with next steps
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => void handleDownloadAlertsPdf()}
                className="cursor-pointer gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
              >
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Download Drop-off Alerts PDF
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Complete cadence audit & volume-at-risk analysis
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1.5" />

            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                System Browser Print
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => void handleSystemPrint()}
                className="cursor-pointer gap-2.5 rounded-md px-2.5 py-2 hover:bg-accent"
              >
                <Printer className="size-4 text-foreground shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Open Browser Print Dialog
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Ctrl+P / Cmd+P (direct PDF fallback in iframes)
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1.5" />

            <DropdownMenuItem
              onClick={() => setDialogOpen(true)}
              className="cursor-pointer gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Info className="size-3.5 shrink-0" />
              <span>Print guide & export options…</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Local Toast Banner (if parent doesn't handle onMessage) */}
      {localToast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-primary/20 bg-background px-4 py-2.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {localToast}
        </div>
      ) : null}

      {/* Print & PDF Export Guide Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Printer className="size-5 text-primary" />
              Print & Save to PDF
            </DialogTitle>
            <DialogDescription>
              Cellar Pulse reports are formatted for standard 8.5 × 11 / A4 paper.
              Filter: <strong>{repFilter === "all" ? "All Sales Reps" : repFilter}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Option 1: Formatted PDF Report */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                      Recommended
                    </span>
                    <h4 className="text-sm font-semibold">{pageTitle} Report (PDF)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Direct vector PDF with crisp tables, executive KPI metrics, and landscape layout.
                    Guaranteed to work in all browsers and embedded preview frames.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void handleDownloadActivePdf()}
                  disabled={busy || !canExport}
                >
                  <Download data-icon="inline-start" className="size-4" />
                  Download PDF Report
                </Button>
              </div>
            </div>

            {/* Option 2: Alerts PDF */}
            <div className="rounded-lg border border-border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">Frequency Drop Alerts Audit (PDF)</h4>
                  <p className="text-xs text-muted-foreground">
                    Actionable audit of overdue restaurants, cadence multiples, bottles at risk,
                    and recommended sales rep follow-ups.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleDownloadAlertsPdf()}
                  disabled={busy || !canExport}
                >
                  <AlertTriangle data-icon="inline-start" className="size-4 text-amber-600" />
                  Download Alerts PDF
                </Button>
              </div>
            </div>

            {/* Option 3: System Print */}
            <div className="rounded-lg border border-border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">System Browser Print</h4>
                  <p className="text-xs text-muted-foreground">
                    Opens your browser&apos;s native print modal to print the full webpage or save as PDF.
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 italic">
                    Note: Inside embedded preview frames, browsers block system print dialogs.
                    When blocked, the PDF will be downloaded directly instead.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSystemPrint()}
                  disabled={busy || !canExport}
                >
                  <Printer data-icon="inline-start" className="size-4" />
                  Open Browser Print
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
