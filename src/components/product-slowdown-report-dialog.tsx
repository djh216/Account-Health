"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Grape,
  Printer,
  TrendingDown,
  Wine,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatNumber, todayIso } from "@/lib/format";
import {
  downloadProductSlowdownCsv,
  downloadProductSlowdownPdf,
  type ProductSlowdownPdfInput,
} from "@/lib/report-export";
import type { ProductSlowingAlert } from "@/lib/product-trends";

export function ProductSlowdownReportDialog({
  alerts,
  repFilter = "all",
  asOf,
  onMessage,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  alerts: ProductSlowingAlert[];
  repFilter?: string;
  asOf?: string;
  onMessage?: (message: string) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "watch">("all");

  const reportDate = asOf || todayIso();

  const filteredAlerts = useMemo(() => {
    if (severityFilter === "all") return alerts;
    return alerts.filter((a) => a.severity === severityFilter);
  }, [alerts, severityFilter]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const watchCount = alerts.filter((a) => a.severity === "watch").length;
  const totalVolumeDrop = alerts.reduce((sum, a) => sum + a.volumeDropBtls, 0);

  const pdfInput: ProductSlowdownPdfInput = useMemo(
    () => ({
      repFilter,
      asOf: reportDate,
      generatedAt: todayIso(),
      alerts,
    }),
    [repFilter, reportDate, alerts],
  );

  function handleDownloadPdf() {
    try {
      downloadProductSlowdownPdf(pdfInput);
      onMessage?.("28-Day Product Slowdown PDF downloaded.");
    } catch {
      onMessage?.("Could not download PDF report.");
    }
  }

  function handleDownloadCsv() {
    try {
      downloadProductSlowdownCsv(pdfInput);
      onMessage?.("28-Day Product Slowdown CSV exported.");
    } catch {
      onMessage?.("Could not export CSV.");
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <FileText className="size-4" />
            <span>Slowdown Report</span>
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0 sm:max-w-5xl">
        {/* Top Action & Export Bar */}
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-6 py-4 backdrop-blur no-print">
          <div>
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <TrendingDown className="size-5 text-rose-600" />
              <span>28-Day Product Sales Slowdown Report</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Intelligent detection of wine SKUs experiencing volume deceleration over the last 28 days
            </DialogDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5"
            >
              <Printer className="size-4" />
              <span>Print / PDF</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadCsv}
              className="gap-1.5"
            >
              <FileSpreadsheet className="size-4" />
              <span>Export CSV</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownloadPdf}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="size-4" />
              <span>Download PDF</span>
            </Button>
          </div>
        </div>

        {/* Printable Report Document Body */}
        <div className="space-y-6 p-6 sm:p-8">
          {/* Branded Executive Header */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-primary">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Grape className="size-5" />
                  <span className="text-xs font-bold tracking-widest uppercase">
                    Cellar Pulse Analytics
                  </span>
                </div>
                <h2 className="font-heading mt-1 text-2xl font-bold tracking-tight text-foreground">
                  Intelligent Slowdown Detection Executive Report
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trajectory benchmark: Last 28 Days (Days 0–28) vs Prior 28 Days (Days 29–56)
                </p>
              </div>

              <div className="rounded-lg border bg-background/80 px-4 py-2 text-xs text-muted-foreground shadow-xs">
                <div>
                  <span className="font-medium text-foreground">Rep Filter:</span>{" "}
                  {repFilter === "all" ? "All Sales Representatives" : repFilter}
                </div>
                <div>
                  <span className="font-medium text-foreground">As of Date:</span>{" "}
                  {formatDate(reportDate)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Generated:</span>{" "}
                  {todayIso()}
                </div>
              </div>
            </div>
          </div>

          {/* Executive KPI Summary Scorecard */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-rose-200 bg-rose-50/50 dark:border-rose-950 dark:bg-rose-950/20">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                  Critical Inactive / -50%
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-700 dark:text-rose-300">
                    {criticalCount}
                  </span>
                  <span className="text-xs text-rose-600">SKUs</span>
                </div>
                <p className="mt-1 text-[11px] text-rose-600/80">
                  Zero reorders or volume down &gt;50%
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-950 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Warning Deceleration
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                    {warningCount}
                  </span>
                  <span className="text-xs text-amber-600">SKUs</span>
                </div>
                <p className="mt-1 text-[11px] text-amber-600/80">
                  28-day volume down 25%–49%
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/30">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  Watchlist Cooling
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                    {watchCount}
                  </span>
                  <span className="text-xs text-slate-600">SKUs</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600/80">
                  Mild 15%–24% slowdown
                </p>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  28-Day Bottle Deficit
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-foreground">
                    -{formatNumber(totalVolumeDrop)}
                  </span>
                  <span className="text-xs text-muted-foreground">btls</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Total volume gap across {alerts.length} slowing SKUs
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Severity filter tabs (interactive, hidden on print) */}
          <div className="flex items-center justify-between gap-2 no-print">
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={severityFilter === "all" ? "default" : "outline"}
                size="xs"
                onClick={() => setSeverityFilter("all")}
              >
                All Slowing SKUs ({alerts.length})
              </Button>
              <Button
                type="button"
                variant={severityFilter === "critical" ? "default" : "outline"}
                size="xs"
                onClick={() => setSeverityFilter("critical")}
                className={
                  severityFilter === "critical"
                    ? "bg-rose-700 hover:bg-rose-800"
                    : "text-rose-700 hover:bg-rose-50"
                }
              >
                Critical ({criticalCount})
              </Button>
              <Button
                type="button"
                variant={severityFilter === "warning" ? "default" : "outline"}
                size="xs"
                onClick={() => setSeverityFilter("warning")}
                className={
                  severityFilter === "warning"
                    ? "bg-amber-700 hover:bg-amber-800"
                    : "text-amber-700 hover:bg-amber-50"
                }
              >
                Warning ({warningCount})
              </Button>
              <Button
                type="button"
                variant={severityFilter === "watch" ? "default" : "outline"}
                size="xs"
                onClick={() => setSeverityFilter("watch")}
              >
                Watch ({watchCount})
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Showing {filteredAlerts.length} of {alerts.length} flagged products
            </p>
          </div>

          {/* Slowdown Alerts Table */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="min-w-[180px]">Wine Product SKU</TableHead>
                  <TableHead className="text-right">Recent 28d</TableHead>
                  <TableHead className="text-right">Prior 28d</TableHead>
                  <TableHead className="text-right">28d Drop</TableHead>
                  <TableHead className="min-w-[160px]">Top Buyer Accounts to Target</TableHead>
                  <TableHead className="min-w-[220px]">Diagnosis & Action Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No slowing wine products detected in this category.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlerts.map((alert) => (
                    <TableRow key={alert.id} className="align-top">
                      <TableCell>
                        {alert.severity === "critical" && (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300">
                            CRITICAL
                          </Badge>
                        )}
                        {alert.severity === "warning" && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">
                            WARNING
                          </Badge>
                        )}
                        {alert.severity === "watch" && (
                          <Badge variant="outline" className="text-slate-600">
                            WATCH
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Wine className="mt-0.5 size-4 shrink-0 text-primary/70" />
                          <div>
                            <p className="font-semibold text-foreground">{alert.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {alert.accountCount} active account placement(s)
                              {alert.lastOrderDate ? ` · Last: ${formatDate(alert.lastOrderDate)}` : ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-medium tabular-nums">
                        {formatNumber(alert.recentVolume28d)} btls
                      </TableCell>

                      <TableCell className="text-right font-medium tabular-nums text-muted-foreground">
                        {formatNumber(alert.priorVolume28d)} btls
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        <span className="font-bold text-rose-600">
                          -{formatNumber(alert.volumeDropBtls)} btls
                        </span>
                        <div className="text-xs text-rose-500">(-{alert.dropPercentage}%)</div>
                      </TableCell>

                      <TableCell>
                        {alert.topAtRiskAccounts.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {alert.topAtRiskAccounts.map((acc) => (
                              <li key={acc} className="font-medium text-foreground">
                                • {acc}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{alert.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          👉 <span className="font-semibold text-primary">Action:</span>{" "}
                          {alert.recommendation}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Actionable Sales Rep Call Checklist & Playbook */}
          <div className="rounded-xl border bg-muted/30 p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight uppercase text-foreground">
              <AlertTriangle className="size-4 text-amber-600" />
              <span>Recommended Sales Rep Outreach Protocol</span>
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-4 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="font-bold text-foreground">1. Check Depletions & Menus</p>
                <p className="mt-1">
                  Call the buyer or sommelier to check on floor inventory. Confirm if the wine is still active on the by-the-glass (BTG) or bottle list.
                </p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="font-bold text-foreground">2. Schedule Staff Re-Tasting</p>
                <p className="mt-1">
                  For wines cooling by 25–49%, arrange an informal 15-minute lineup tasting with floor service staff to reinvigorate selling enthusiasm.
                </p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="font-bold text-foreground">3. Present Case Incentive</p>
                <p className="mt-1">
                  Offer case-stack pricing or vintage transition allocations before the restaurant rotates to an alternative distributor brand.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ProductSlowdownReportButton({
  alerts,
  repFilter = "all",
  asOf,
  onMessage,
  variant = "outline",
  size = "default",
  className,
}: {
  alerts: ProductSlowingAlert[];
  repFilter?: string;
  asOf?: string;
  onMessage?: (message: string) => void;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  className?: string;
}) {
  return (
    <ProductSlowdownReportDialog
      alerts={alerts}
      repFilter={repFilter}
      asOf={asOf}
      onMessage={onMessage}
      trigger={
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          title="Open printable & exportable 28-day product slowdown report"
        >
          <FileText data-icon="inline-start" className="size-4 text-rose-600" />
          <span>Slowdown Report ({alerts.length})</span>
        </Button>
      }
    />
  );
}
