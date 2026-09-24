"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Grape,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { AccountDetail } from "@/components/account-detail";
import {
  AccountProductOrdersDialog,
  type AccountProductSelection,
} from "@/components/account-product-orders-dialog";
import { AccountListDialog } from "@/components/account-list-dialog";
import { TerritoryValueBadge } from "@/components/territory-value-badge";
import { ClearDataButton } from "@/components/clear-data-button";
import { ExportReportButton } from "@/components/export-report-button";
import { RiskBadge } from "@/components/risk-badge";
import { RepFilterSelect } from "@/components/rep-filter-select";
import { SiteNav } from "@/components/site-nav";
import { UploadDialog } from "@/components/upload-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import {
  accountTypeLabel,
  formatDate,
  formatDays,
  formatMoney,
  formatNumber,
  formatPct,
  normalizeName,
  reportKindLabel,
} from "@/lib/format";
import {
  buildOrderAnalytics,
  getRestaurantTracking,
  listNewAccountsWithRecentOrders,
  NEW_ACCOUNT_WINDOW_DAYS,
} from "@/lib/order-analytics";
import { RISK_AT_RISK_MIN_DAYS } from "@/lib/order-cadence";
import {
  focusAccountsByHorizon,
  listAccountsByRecentRevenue,
  listAllScoredAccounts,
  listNeedAttentionAccounts,
  listOverdueOrderAccounts,
  listOverdueVisitAccounts,
  listRevenueAtRiskAccounts,
  OVERDUE_VISIT_DAYS,
} from "@/lib/score";
import {
  accountsByTerritoryTier,
  enrichAccountsWithTerritoryValue,
  territoryTierDescription,
  territoryTierTitle,
} from "@/lib/territory-value";
import { FOCUS_SECTIONS } from "@/lib/focus-sections";
import { setPortfolio } from "@/lib/portfolio-store";
import { generateSampleWinePortfolio } from "@/lib/sample-data";
import type { AccountHealth, RiskLevel, TerritoryValueTier } from "@/lib/types";

type AccountListDialogState = {
  title: string;
  description: string;
  accounts: AccountHealth[];
  showHistory?: boolean;
  emptyMessage?: string;
};

const RISK_FILTERS: Array<{ value: "all" | RiskLevel; label: string }> = [
  { value: "all", label: "All risk" },
  { value: "critical", label: "Critical" },
  { value: "at_risk", label: "At risk" },
  { value: "dormant", label: "Dormant" },
  { value: "healthy", label: "Healthy" },
];

const TERRITORY_TIER_SECTIONS: Array<{
  tier: TerritoryValueTier;
  title: string;
  description: string;
}> = [
  {
    tier: "anchor",
    title: territoryTierTitle("anchor"),
    description: territoryTierDescription("anchor"),
  },
  {
    tier: "core",
    title: territoryTierTitle("core"),
    description: territoryTierDescription("core"),
  },
  {
    tier: "base",
    title: territoryTierTitle("base"),
    description: territoryTierDescription("base"),
  },
];

export function Dashboard() {
  const { state, fullState, snapshot, repFilter, setRepFilter, reps, importParseResult } =
    useFilteredPortfolio();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAccountProduct, setSelectedAccountProduct] =
    useState<AccountProductSelection | null>(null);
  const [accountListDialog, setAccountListDialog] = useState<AccountListDialogState | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const enrichedAccounts = useMemo(
    () => enrichAccountsWithTerritoryValue(snapshot.accounts, state.orders),
    [snapshot.accounts, state.orders],
  );

  const territoryByTier = useMemo(
    () => accountsByTerritoryTier(enrichedAccounts),
    [enrichedAccounts],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return enrichedAccounts.filter((item) => {
      if (!needle) return true;
      return [
        item.account.name,
        item.account.licenseNumber,
        item.account.city,
        item.account.county,
        item.account.region,
        item.account.salesRep,
        item.account.tier,
        accountTypeLabel(item.account.type),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [enrichedAccounts, query]);

  const accountsByRisk = useMemo(() => {
    const buckets = {
      critical: filtered.filter((item) => item.risk === "critical"),
      at_risk: filtered.filter((item) => item.risk === "at_risk"),
      healthy: filtered.filter((item) => item.risk === "healthy"),
    };
    const sortAccounts = (items: AccountHealth[]) =>
      [...items].sort(
        (a, b) =>
          a.score - b.score ||
          (b.daysSinceOrder ?? 0) - (a.daysSinceOrder ?? 0) ||
          a.account.name.localeCompare(b.account.name),
      );
    return {
      critical: sortAccounts(buckets.critical),
      at_risk: sortAccounts(buckets.at_risk),
      healthy: sortAccounts(buckets.healthy),
    };
  }, [filtered]);

  const visibleRiskSections = useMemo(() => {
    const sections: Array<{
      risk: "critical" | "at_risk" | "healthy";
      title: string;
      description: string;
      accounts: AccountHealth[];
    }> = [
      {
        risk: "critical",
        title: "Critical",
        description: "15+ days past typical cadence, or missing last order date.",
        accounts: accountsByRisk.critical,
      },
      {
        risk: "at_risk",
        title: "At risk",
        description: "Last order 8–14 days past typical cadence.",
        accounts: accountsByRisk.at_risk,
      },
      {
        risk: "healthy",
        title: "Healthy",
        description: "Last order within 7 days of typical cadence.",
        accounts: accountsByRisk.healthy,
      },
    ];
    if (riskFilter === "all") return sections;
    return sections.filter((section) => section.risk === riskFilter);
  }, [accountsByRisk, riskFilter]);

  const focusByHorizon = useMemo(
    () => focusAccountsByHorizon(enrichedAccounts),
    [enrichedAccounts],
  );

  const newAccounts = useMemo(
    () =>
      listNewAccountsWithRecentOrders(
        state.orders,
        state.analysisAsOf ?? snapshot.asOf,
      ),
    [state.orders, state.analysisAsOf, snapshot.asOf],
  );

  const healthByAccountName = useMemo(
    () =>
      new Map(
        enrichedAccounts.map((item) => [normalizeName(item.account.name), item]),
      ),
    [enrichedAccounts],
  );

  const newAccountHealthRows = useMemo(
    () =>
      newAccounts
        .map((account) => healthByAccountName.get(normalizeName(account.accountName)))
        .filter((item): item is AccountHealth => item !== undefined),
    [newAccounts, healthByAccountName],
  );

  const allScoredAccounts = useMemo(
    () => listAllScoredAccounts(enrichedAccounts),
    [enrichedAccounts],
  );
  const needAttentionAccounts = useMemo(
    () => listNeedAttentionAccounts(enrichedAccounts),
    [enrichedAccounts],
  );
  const overdueOrderAccounts = useMemo(
    () => listOverdueOrderAccounts(enrichedAccounts),
    [enrichedAccounts],
  );
  const overdueVisitAccounts = useMemo(
    () => listOverdueVisitAccounts(enrichedAccounts),
    [enrichedAccounts],
  );
  const revenueAtRiskAccounts = useMemo(
    () => listRevenueAtRiskAccounts(enrichedAccounts),
    [enrichedAccounts],
  );
  const recentRevenueAccounts = useMemo(
    () => listAccountsByRecentRevenue(enrichedAccounts),
    [enrichedAccounts],
  );

  function openAccountList(config: AccountListDialogState) {
    setAccountListDialog(config);
  }

  const selected =
    enrichedAccounts.find((item) => item.account.id === selectedId) ?? null;

  const orderAnalytics = useMemo(
    () => buildOrderAnalytics(state.orders, state.analysisAsOf),
    [state.orders, state.analysisAsOf],
  );

  const selectedOrderTracking = selected
    ? getRestaurantTracking(orderAnalytics, selected.account.name)
    : null;

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }

  function handleLoadSample() {
    const sample = generateSampleWinePortfolio();
    setPortfolio(sample);
    flash("Sample wine distribution book loaded (10 accounts with order history and visits).");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-primary/15 bg-[color-mix(in_oklch,var(--card),var(--primary)_6%)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Grape className="size-5" />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">
                  Wine distribution · account health
                </p>
              </div>
              <h1 className="font-heading mt-1 text-3xl tracking-tight sm:text-4xl">
                Cellar Pulse
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Upload order history, visit snapshots (last order & last visit dates),
                and account master data. We score each account’s health, classify risk,
                and surface priority accounts for this week, two weeks out, and three weeks out
                (risk, then value tier, then health score).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {fullState.accounts.length === 0 ? (
                <Button variant="outline" onClick={handleLoadSample}>
                  <Sparkles data-icon="inline-start" />
                  Load sample book
                </Button>
              ) : null}
              <ExportReportButton page="health" onMessage={flash} />
              <ClearDataButton onCleared={flash} />
              <Button onClick={() => setUploadOpen(true)}>
                <Upload data-icon="inline-start" />
                Upload reports
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SiteNav />
            <RepFilterSelect
              reps={reps}
              value={repFilter}
              onValueChange={setRepFilter}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
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

        {fullState.accounts.length === 0 ? (
          <EmptyState
            onUpload={() => setUploadOpen(true)}
            onLoadSample={handleLoadSample}
          />
        ) : snapshot.accounts.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardHeader className="items-center text-center">
              <CardTitle className="font-heading text-2xl">No accounts for this rep</CardTitle>
              <CardDescription className="max-w-lg">
                {repFilter} has no assigned accounts in your uploaded data. Switch to
                another sales rep or choose All sales reps.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <section
              className={`grid gap-3 sm:grid-cols-2 ${state.orders.length > 0 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}
            >
              <Kpi
                label="Accounts scored"
                value={String(snapshot.totals.accountCount)}
                hint={`As of ${formatDate(snapshot.asOf)} · Click to view`}
                onClick={() =>
                  openAccountList({
                    title: "Accounts scored",
                    description: `All ${snapshot.totals.accountCount} accounts on this book as of ${formatDate(snapshot.asOf)}.`,
                    accounts: allScoredAccounts,
                    showHistory: snapshot.mode === "history",
                  })
                }
              />
              {state.orders.length > 0 ? (
                <Kpi
                  label="New accounts"
                  value={String(newAccounts.length)}
                  hint={`First order in last ${NEW_ACCOUNT_WINDOW_DAYS} days · Click to view`}
                  onClick={() =>
                    openAccountList({
                      title: "New accounts",
                      description: `First order in the last ${NEW_ACCOUNT_WINDOW_DAYS} days with no order history before that window.`,
                      accounts: newAccountHealthRows,
                      emptyMessage: `No new accounts with orders in the last ${NEW_ACCOUNT_WINDOW_DAYS} days.`,
                    })
                  }
                />
              ) : null}
              <Kpi
                label="Need attention"
                value={String(snapshot.totals.critical + snapshot.totals.atRisk)}
                hint={`${snapshot.totals.critical} critical · ${snapshot.totals.atRisk} at risk · Click to view`}
                tone="danger"
                onClick={() =>
                  openAccountList({
                    title: "Need attention",
                    description: "Critical and at-risk accounts on this book.",
                    accounts: needAttentionAccounts,
                    showHistory: snapshot.mode === "history",
                  })
                }
              />
              {snapshot.mode === "snapshot" ? (
                <>
                  <Kpi
                    label="Overdue orders"
                    value={String(snapshot.totals.overdueOrders)}
                    hint={`${RISK_AT_RISK_MIN_DAYS}+ days past typical cadence · Click to view`}
                    onClick={() =>
                      openAccountList({
                        title: "Overdue orders",
                        description: `Accounts whose last order is ${RISK_AT_RISK_MIN_DAYS} or more days past their typical reorder cadence.`,
                        accounts: overdueOrderAccounts,
                      })
                    }
                  />
                  <Kpi
                    label="Overdue visits"
                    value={String(snapshot.totals.overdueVisits)}
                    hint={`Last visit more than ${OVERDUE_VISIT_DAYS} days ago · Click to view`}
                    onClick={() =>
                      openAccountList({
                        title: "Overdue visits",
                        description: `Accounts whose last sales-rep visit was more than ${OVERDUE_VISIT_DAYS} days ago.`,
                        accounts: overdueVisitAccounts,
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <Kpi
                    label="Revenue on a weak house"
                    value={formatMoney(snapshot.totals.revenueAtRisk)}
                    hint="Critical and at-risk account volume · Click to view"
                    onClick={() =>
                      openAccountList({
                        title: "Revenue on a weak house",
                        description:
                          "Critical and at-risk accounts ranked by the higher of current or prior 90-day volume.",
                        accounts: revenueAtRiskAccounts,
                        showHistory: true,
                      })
                    }
                  />
                  <Kpi
                    label="Last 90 days"
                    value={formatMoney(snapshot.totals.revenue90)}
                    hint={`${snapshot.totals.healthy} healthy · ${snapshot.totals.critical + snapshot.totals.atRisk} need attention · Click to view`}
                    onClick={() =>
                      openAccountList({
                        title: "Last 90 days",
                        description: "Accounts ranked by revenue in the last 90 days.",
                        accounts: recentRevenueAccounts,
                        showHistory: true,
                      })
                    }
                  />
                </>
              )}
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="font-heading text-xl">Territory value</h2>
                <p className="text-sm text-muted-foreground">
                  Accounts ranked by all-time volume on this rep&apos;s book, grouped
                  into three value tiers.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {TERRITORY_TIER_SECTIONS.map((section) => (
                  <TerritoryTierCard
                    key={section.tier}
                    title={section.title}
                    description={section.description}
                    tier={section.tier}
                    accounts={territoryByTier[section.tier]}
                    onSelect={setSelectedId}
                    onOpenList={() =>
                      openAccountList({
                        title: section.title,
                        description: section.description,
                        accounts: territoryByTier[section.tier],
                        showHistory: snapshot.mode === "history",
                      })
                    }
                  />
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              {FOCUS_SECTIONS.map((section) => (
                <FocusHorizonCard
                  key={section.horizon}
                  title={section.title}
                  description={section.description}
                  accounts={focusByHorizon[section.horizon]}
                  onSelect={setSelectedId}
                  onOpenList={() =>
                    openAccountList({
                      title: section.title,
                      description: section.description,
                      accounts: focusByHorizon[section.horizon],
                      showHistory: snapshot.mode === "history",
                    })
                  }
                />
              ))}
            </section>

            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <CardTitle className="font-heading text-xl">
                      Accounts
                    </CardTitle>
                    <CardDescription>
                      Accounts grouped by risk tier. Click any account for the full
                      diagnosis. Filters stay on this device with your uploaded data.
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search account, city, tier, rep"
                        className="pl-8 sm:w-56"
                      />
                    </div>
                    <Select
                      value={riskFilter}
                      onValueChange={(value) =>
                        setRiskFilter((value as "all" | RiskLevel) ?? "all")
                      }
                    >
                      <SelectTrigger className="w-full sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_FILTERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {visibleRiskSections.every((section) => section.accounts.length === 0) ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No accounts match those filters.
                  </p>
                ) : (
                  <div
                    className={`grid gap-4 ${
                      visibleRiskSections.length === 1
                        ? "grid-cols-1"
                        : "lg:grid-cols-3"
                    }`}
                  >
                    {visibleRiskSections.map((section) => (
                      <RiskAccountsBox
                        key={section.risk}
                        risk={section.risk}
                        title={section.title}
                        description={section.description}
                        accounts={section.accounts}
                        showHistory={snapshot.mode === "history"}
                        onSelect={setSelectedId}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
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
      />
      <AccountDetail
        account={selected}
        orderTracking={selectedOrderTracking}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onSelectProduct={(product) => {
          if (selected) {
            setSelectedAccountProduct({
              accountName: selected.account.name,
              product,
            });
          }
        }}
      />

      <AccountProductOrdersDialog
        selection={selectedAccountProduct}
        orders={state.orders}
        asOf={state.analysisAsOf}
        onOpenChange={(open) => {
          if (!open) setSelectedAccountProduct(null);
        }}
      />

      <AccountListDialog
        open={accountListDialog !== null}
        onOpenChange={(open) => {
          if (!open) setAccountListDialog(null);
        }}
        title={accountListDialog?.title ?? ""}
        description={accountListDialog?.description ?? ""}
        accounts={accountListDialog?.accounts ?? []}
        showHistory={accountListDialog?.showHistory}
        emptyMessage={accountListDialog?.emptyMessage}
        onSelectAccount={setSelectedId}
      />
    </div>
  );
}

function RiskAccountsBox({
  risk,
  title,
  description,
  accounts,
  showHistory,
  onSelect,
}: {
  risk: "critical" | "at_risk" | "healthy";
  title: string;
  description: string;
  accounts: AccountHealth[];
  showHistory: boolean;
  onSelect: (id: string) => void;
}) {
  const styles = {
    critical: "border-rose-200 bg-rose-50/50",
    at_risk: "border-amber-200 bg-amber-50/50",
    healthy: "border-emerald-200 bg-emerald-50/50",
  } as const;

  return (
    <div className={`flex min-h-[16rem] flex-col rounded-xl border ${styles[risk]}`}>
      <div className="border-b border-inherit px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-heading text-lg">{title}</h3>
          <RiskBadge risk={risk} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-sm font-medium tabular-nums">
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="max-h-[28rem] flex-1 space-y-2 overflow-y-auto p-3">
        {accounts.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No accounts in this tier.
          </p>
        ) : (
          accounts.map((item) => (
            <button
              key={item.account.id}
              type="button"
              onClick={() => onSelect(item.account.id)}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.account.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {accountTypeLabel(item.account.type)}
                    {item.account.city ? ` · ${item.account.city}` : ""}
                    {item.account.salesRep ? ` · ${item.account.salesRep}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {item.territoryTier ? (
                    <TerritoryValueBadge tier={item.territoryTier} />
                  ) : null}
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {item.score}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Order {formatDays(item.daysSinceOrder)}</span>
                <span>Visit {formatDays(item.daysSinceVisit)}</span>
                {item.territorySharePct !== undefined ? (
                  <span>{Math.round(item.territorySharePct)}% of territory</span>
                ) : null}
                {showHistory ? (
                  <span className={trendClass(item)}>
                    Trend {formatPct(item.revenueDeltaPct)}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TerritoryTierCard({
  title,
  description,
  tier,
  accounts,
  onSelect,
  onOpenList,
}: {
  title: string;
  description: string;
  tier: TerritoryValueTier;
  accounts: AccountHealth[];
  onSelect: (id: string) => void;
  onOpenList: () => void;
}) {
  const styles = {
    anchor: "border-primary/25 bg-[color-mix(in_oklch,var(--card),var(--primary)_8%)]",
    core: "border-amber-200 bg-amber-50/50",
    base: "border-stone-200 bg-stone-50/60",
  } as const;

  return (
    <Card className={`flex flex-col ${styles[tier]}`}>
      <CardHeader className="border-b">
        <button
          type="button"
          onClick={onOpenList}
          className="w-full text-left transition hover:opacity-80"
        >
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-heading text-xl">{title}</CardTitle>
            <TerritoryValueBadge tier={tier} />
          </div>
          <CardDescription>
            {description} · Click header to open full list
          </CardDescription>
          <p className="mt-2 text-sm font-medium tabular-nums">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </button>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto pt-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts in this tier.</p>
        ) : (
          accounts.map((item) => (
            <button
              key={item.account.id}
              type="button"
              onClick={() => onSelect(item.account.id)}
              className="w-full rounded-xl border bg-background px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.account.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Rank #{item.territoryRank} ·{" "}
                    {formatNumber(item.territoryValue ?? 0)} vol ·{" "}
                    {Math.round(item.territorySharePct ?? 0)}% of book
                  </div>
                </div>
                <RiskBadge risk={item.risk} />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FocusHorizonCard({
  title,
  description,
  accounts,
  onSelect,
  onOpenList,
}: {
  title: string;
  description: string;
  accounts: AccountHealth[];
  onSelect: (id: string) => void;
  onOpenList: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b">
        <button
          type="button"
          onClick={onOpenList}
          className="w-full text-left transition hover:opacity-80"
        >
          <CardTitle className="font-heading text-xl">{title}</CardTitle>
          <CardDescription>
            {description} · Click header to open full list
          </CardDescription>
        </button>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-3 overflow-y-auto pt-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts in this window right now.
          </p>
        ) : (
          accounts.map((item) => (
            <button
              key={item.account.id}
              type="button"
              onClick={() => onSelect(item.account.id)}
              className="w-full rounded-xl border bg-background px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-medium">{item.account.name}</div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {item.territoryTier ? (
                    <TerritoryValueBadge tier={item.territoryTier} />
                  ) : null}
                  <RiskBadge risk={item.risk} />
                </div>
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p>
                  Last order:{" "}
                  <span className="text-foreground">
                    {item.daysSinceOrder !== null
                      ? `${formatDays(item.daysSinceOrder)} · ${formatDate(item.lastOrderDate)}`
                      : "No order date"}
                  </span>
                </p>
                <p>
                  Last visit:{" "}
                  <span className="text-foreground">
                    {item.daysSinceVisit !== null
                      ? `${formatDays(item.daysSinceVisit)} · ${formatDate(item.lastVisitDate)}`
                      : "No visit date"}
                  </span>
                </p>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function trendClass(item: AccountHealth): string {
  if (item.revenueDeltaPct === null) return "text-muted-foreground";
  if (item.revenueDeltaPct <= -20) return "text-rose-800";
  if (item.revenueDeltaPct >= 10) return "text-emerald-800";
  return "";
}

function Kpi({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "danger";
  onClick?: () => void;
}) {
  const body = (
    <>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {tone === "danger" ? <AlertTriangle className="size-3.5" /> : null}
          {label}
        </CardDescription>
        <CardTitle className="font-heading text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </>
  );

  if (!onClick) {
    return <Card>{body}</Card>;
  }

  return (
    <Card className="transition hover:border-primary/40 hover:bg-primary/4">
      <button type="button" onClick={onClick} className="w-full text-left">
        {body}
      </button>
    </Card>
  );
}

function EmptyState({
  onUpload,
  onLoadSample,
}: {
  onUpload: () => void;
  onLoadSample: () => void;
}) {
  return (
    <Card className="border-dashed py-12">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-heading text-2xl">No accounts loaded</CardTitle>
        <CardDescription className="max-w-lg">
          Upload order history, visit patterns, and optional account master data
          to score account health and see focus recommendations, or load a sample
          wine distribution book to explore immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onUpload}>
          <Upload data-icon="inline-start" />
          Upload reports
        </Button>
        <Button variant="outline" onClick={onLoadSample}>
          <Sparkles data-icon="inline-start" />
          Load sample wine portfolio
        </Button>
      </CardContent>
    </Card>
  );
}
