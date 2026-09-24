"use client";

import { RiskBadge } from "@/components/risk-badge";
import { TerritoryValueBadge } from "@/components/territory-value-badge";
import { OrderCadenceAlert } from "@/components/order-cadence-alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  accountTypeLabel,
  formatDate,
  formatDays,
  formatMoney,
  formatNumber,
  formatOrderFrequency,
  formatPct,
} from "@/lib/format";
import type { AccountHealth, FocusHorizon } from "@/lib/types";
import type { AccountOrderTracking } from "@/lib/order-analytics";
import { AccountTrackingSummary } from "@/components/order-tracking-sheet";

function focusHorizonLabel(horizon: FocusHorizon): string {
  if (horizon === "this_week") return "This week";
  if (horizon === "two_weeks") return "2 weeks out";
  return "3 weeks out";
}

function FactorBar({
  label,
  score,
  detail,
}: {
  label: string;
  score: number;
  detail: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, score)}%` }}
        />
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AccountDetail({
  account,
  orderTracking,
  onOpenChange,
  onSelectProduct,
}: {
  account: AccountHealth | null;
  orderTracking?: AccountOrderTracking | null;
  onOpenChange: (open: boolean) => void;
  onSelectProduct?: (product: string) => void;
}) {
  const snapshot = account?.mode === "snapshot";

  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-1.5rem)] w-[min(96rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {account ? (
          <>
            <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge risk={account.risk} />
                {account.territoryTier ? (
                  <TerritoryValueBadge tier={account.territoryTier} />
                ) : null}
                <span className="text-sm text-muted-foreground">
                  Score {account.score}
                  {account.territoryRank
                    ? ` · Territory rank #${account.territoryRank}`
                    : ""}
                </span>
              </div>
              <DialogTitle className="font-heading text-2xl">
                {account.account.name}
              </DialogTitle>
              <DialogDescription>
                {accountTypeLabel(account.account.type)}
                {account.account.tier ? ` · ${account.account.tier}` : ""}
                {account.account.city ? ` · ${account.account.city}` : ""}
                {account.account.region ? ` · ${account.account.region}` : ""}
                {account.account.salesRep
                  ? ` · Rep ${account.account.salesRep}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 xl:grid-cols-2 xl:overflow-hidden">
              <div className="space-y-4 xl:overflow-y-auto xl:pr-1">
                {account.orderCadenceOverdue ? (
                  <OrderCadenceAlert
                    cadence={{
                      daysSinceOrder: account.daysSinceOrder,
                      typicalIntervalDays: account.typicalIntervalDays,
                      orderCadenceOverdue: account.orderCadenceOverdue,
                      orderCadenceDaysOverdue: account.orderCadenceDaysOverdue,
                      expectedOrderDate: account.expectedOrderDate,
                    }}
                  />
                ) : null}

                {account.focus ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/6 p-4">
                    <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                      Recommended focus
                      {account.focusHorizon
                        ? ` · ${focusHorizonLabel(account.focusHorizon)}`
                        : ""}
                    </p>
                    <p className="mt-1 font-heading text-lg">{account.focus.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {account.focus.reason}
                    </p>
                    <p className="mt-2 text-sm font-medium">{account.focus.action}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-950">
                    This account is current on orders and visits. Keep the regular
                    call cycle and spend the week on weaker accounts.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat
                    label="Last order"
                    value={formatDays(account.daysSinceOrder)}
                    hint={formatDate(account.lastOrderDate)}
                  />
                  <Stat
                    label="Last visit"
                    value={formatDays(account.daysSinceVisit)}
                    hint={formatDate(account.lastVisitDate)}
                  />
                  {snapshot ? (
                    <>
                      <Stat
                        label="Typical order frequency"
                        value={formatOrderFrequency(account.typicalIntervalDays)}
                        hint={
                          account.expectedOrderDate
                            ? `Expected by ${formatDate(account.expectedOrderDate)}`
                            : undefined
                        }
                      />
                      <Stat
                        label="Region"
                        value={account.account.region ?? "—"}
                      />
                      {account.territoryValue !== undefined ? (
                        <Stat
                          label="Territory value"
                          value={formatNumber(account.territoryValue)}
                          hint={`${Math.round(account.territorySharePct ?? 0)}% of rep book`}
                        />
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Stat label="90-day sales" value={formatMoney(account.revenue90)} />
                      {account.territoryValue !== undefined ? (
                        <Stat
                          label="Territory value"
                          value={formatNumber(account.territoryValue)}
                          hint={`${Math.round(account.territorySharePct ?? 0)}% of rep book`}
                        />
                      ) : null}
                      <Stat
                        label="Typical order frequency"
                        value={formatOrderFrequency(account.typicalIntervalDays)}
                        hint={
                          account.expectedOrderDate
                            ? `Expected by ${formatDate(account.expectedOrderDate)}`
                            : undefined
                        }
                      />
                      <Stat
                        label="vs prior 90"
                        value={formatPct(account.revenueDeltaPct)}
                      />
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="font-heading text-lg">Why this score</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {account.factors.map((factor) => (
                      <FactorBar
                        key={factor.key}
                        label={factor.label}
                        score={factor.score}
                        detail={factor.detail}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {orderTracking ? (
                <div className="space-y-4 xl:overflow-y-auto xl:pl-1">
                  <h3 className="font-heading text-lg">Order tracking</h3>
                  <AccountTrackingSummary tracking={orderTracking} />
                  {orderTracking.products.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Product mix</p>
                      <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        {orderTracking.products.slice(0, 8).map((row) => {
                          const change = orderTracking.productChanges.find(
                            (item) => item.product === row.product,
                          );
                          return (
                            <li
                              key={row.product}
                              className="group flex cursor-pointer items-baseline justify-between gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5"
                              onClick={() => onSelectProduct?.(row.product)}
                              title={`Click to view individual orders for ${row.product}`}
                            >
                              <span className="min-w-0 truncate font-medium text-foreground group-hover:text-primary">
                                {row.product}
                                {change && change.status !== "stable" ? (
                                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                                    ({change.status})
                                  </span>
                                ) : null}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground font-medium">
                                {formatNumber(row.volume)} · {row.orderEventCount}x
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed p-8 text-sm text-muted-foreground xl:min-h-[12rem]">
                  No order history uploaded for this account yet.
                </div>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
