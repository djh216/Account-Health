"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Grape, Sparkles, Upload } from "lucide-react";
import { ClearDataButton } from "@/components/clear-data-button";
import { NotificationSidebar, NotificationSidebarTrigger } from "@/components/notification-sidebar";
import { PrintReportButton } from "@/components/print-report-button";
import { RepFilterSelect } from "@/components/rep-filter-select";
import { UploadDialog } from "@/components/upload-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import {
  dashboardViewLabel,
  dashboardViewToReportPage,
  type DashboardViewId,
  type TrendsGrain,
} from "@/lib/dashboard-view";
import { generateSampleWinePortfolio } from "@/lib/sample-data";
import { buildPdfAccountVisitLookup } from "@/lib/report-export";
import { setPortfolio } from "@/lib/portfolio-store";
import { reportKindLabel } from "@/lib/format";
import type { ReportPageType } from "@/hooks/use-report-export";

type DashboardShellContextValue = {
  flash: (message: string) => void;
  openUpload: () => void;
  activeView: DashboardViewId;
  reportPage: ReportPageType;
};

const DashboardShellContext = createContext<DashboardShellContextValue | null>(null);

export function useDashboardShell(): DashboardShellContextValue | null {
  return useContext(DashboardShellContext);
}

export function DashboardShell({
  activeView,
  onViewChange,
  trendsGrain,
  children,
}: {
  activeView: DashboardViewId;
  onViewChange: (view: DashboardViewId) => void;
  trendsGrain: TrendsGrain;
  children: ReactNode;
}) {
  const {
    fullState,
    repFilter,
    repFilterPending,
    setRepFilter,
    reps,
    importParseResult,
    enrichedAccounts,
    frequencyAlerts,
    productAlerts,
  } = useFilteredPortfolio();

  const accountVisitLookup = useMemo(
    () => buildPdfAccountVisitLookup(enrichedAccounts),
    [enrichedAccounts],
  );

  const [uploadOpen, setUploadOpen] = useState(false);
  const [notificationSidebarOpen, setNotificationSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const totalAlertsCount = frequencyAlerts.length + productAlerts.length;
  const totalCriticalAlertsCount =
    frequencyAlerts.filter((a) => a.severity === "critical").length +
    productAlerts.filter((a) => a.severity === "critical").length;

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const openUpload = useCallback(() => setUploadOpen(true), []);

  const reportPage = dashboardViewToReportPage(activeView, trendsGrain);

  const shellValue = useMemo<DashboardShellContextValue>(
    () => ({ flash, openUpload, activeView, reportPage }),
    [flash, openUpload, activeView, reportPage],
  );

  function handleLoadSample() {
    setPortfolio(generateSampleWinePortfolio());
    flash("Sample wine distribution book loaded (10 accounts with order history and visits).");
  }

  return (
    <DashboardShellContext.Provider value={shellValue}>
      <div className="min-h-screen">
        <header className="border-b border-primary/15 bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]">
          <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-primary">
                  <Grape className="size-5" />
                  <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                    Wine distribution · Cellar Pulse
                  </p>
                </div>
                <h1 className="font-heading mt-1 text-3xl tracking-tight sm:text-4xl">
                  {dashboardViewLabel(activeView)}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  One workspace for weekly planning, account health, order tracking, and
                  account- or SKU-level sales trends. Use the rep filter to focus a single book;
                  export a weekly PDF pack from the header.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {fullState.accounts.length === 0 ? (
                  <Button variant="outline" onClick={handleLoadSample}>
                    <Sparkles data-icon="inline-start" />
                    Load sample book
                  </Button>
                ) : null}
                <NotificationSidebarTrigger
                  alertsCount={totalAlertsCount}
                  criticalCount={totalCriticalAlertsCount}
                  onClick={() => setNotificationSidebarOpen(true)}
                />
                <PrintReportButton
                  page={reportPage}
                  primaryExport="weekly-pack"
                  label="Export weekly pack"
                  onMessage={flash}
                />
                <ClearDataButton onCleared={flash} />
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload data-icon="inline-start" />
                  Upload reports
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs
                value={activeView}
                onValueChange={(next) => onViewChange(next as DashboardViewId)}
                className="w-full lg:w-auto"
              >
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 p-1 lg:w-auto">
                  <TabsTrigger value="insights" className="text-xs sm:text-sm">
                    Weekly book
                  </TabsTrigger>
                  <TabsTrigger value="health" className="text-xs sm:text-sm">
                    Account health
                  </TabsTrigger>
                  <TabsTrigger value="orders" className="text-xs sm:text-sm">
                    Orders & tracking
                  </TabsTrigger>
                  <TabsTrigger value="trends" className="text-xs sm:text-sm">
                    Sales trends
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <RepFilterSelect
                reps={reps}
                value={repFilter}
                pending={repFilterPending}
                onValueChange={setRepFilter}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {toast ? (
            <div className="rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm">
              {toast}
            </div>
          ) : null}

          {repFilter !== "all" ? (
            <div className="rounded-lg border border-primary/20 bg-primary/6 px-4 py-3 text-sm">
              Showing <span className="font-medium">{repFilter}</span>&apos;s book only.
            </div>
          ) : null}

          {children}
        </main>

        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onImport={(result) => {
            const imported = importParseResult(result);
            const count =
              result.kind === "orders"
                ? imported.orders.length
                : result.kind === "visits"
                  ? imported.visits.length
                  : imported.accounts.length;
            flash(
              `Imported ${count} ${reportKindLabel(result.kind)} rows from ${result.fileName}. Scores updated.`,
            );
          }}
          onUploadCleared={flash}
        />
        <NotificationSidebar
          open={notificationSidebarOpen}
          onOpenChange={setNotificationSidebarOpen}
          alerts={frequencyAlerts}
          productAlerts={productAlerts}
          accountVisitLookup={accountVisitLookup}
        />
      </div>
    </DashboardShellContext.Provider>
  );
}
