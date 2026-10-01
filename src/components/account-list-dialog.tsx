"use client";

import { RiskBadge } from "@/components/risk-badge";
import { TerritoryValueBadge } from "@/components/territory-value-badge";
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
  formatIntervalDays,
  formatMoney,
  formatNumber,
  formatPct,
  normalizeName,
} from "@/lib/format";
import type { LastOrderGap } from "@/lib/order-analytics";
import type { AccountHealth } from "@/lib/types";

function trendClass(item: AccountHealth): string {
  if (item.revenueDeltaPct === null) return "text-muted-foreground";
  if (item.revenueDeltaPct <= -20) return "text-rose-800";
  if (item.revenueDeltaPct >= 10) return "text-emerald-800";
  return "";
}

export function AccountListDialog({
  open,
  onOpenChange,
  title,
  description,
  accounts,
  showHistory = false,
  emptyMessage = "No accounts in this group right now.",
  onSelectAccount,
  orderGaps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  accounts: AccountHealth[];
  showHistory?: boolean;
  emptyMessage?: string;
  onSelectAccount: (accountId: string) => void;
  orderGaps?: Map<string, LastOrderGap>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,calc(100vh-2rem))] w-[min(90rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:max-w-none">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogTitle className="font-heading text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <ul className="space-y-2.5">
              {accounts.map((item) => {
                const orderGap =
                  orderGaps?.get(item.account.id) ??
                  orderGaps?.get(normalizeName(item.account.name));
                return (
                <li key={item.account.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAccount(item.account.id);
                      onOpenChange(false);
                    }}
                    className="w-full rounded-xl border bg-background px-5 py-3.5 text-left transition hover:border-primary/40 hover:bg-primary/4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-base text-foreground">{item.account.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{accountTypeLabel(item.account.type)}</span>
                          {item.account.city ? <span>· {item.account.city}</span> : null}
                          {item.account.salesRep ? <span>· Rep: {item.account.salesRep}</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {item.territoryTier ? (
                          <TerritoryValueBadge tier={item.territoryTier} />
                        ) : null}
                        <RiskBadge risk={item.risk} />
                        <span className="text-sm tabular-nums text-muted-foreground font-medium">
                          Score {item.score}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        Last order:{" "}
                        <span className="text-foreground">
                          {item.daysSinceOrder !== null
                            ? `${formatDays(item.daysSinceOrder)} · ${formatDate(item.lastOrderDate)}`
                            : "No order date"}
                        </span>
                      </span>
                      {orderGap ? (
                        <span>
                          Prior order:{" "}
                          <span className="text-foreground">
                            {formatDate(orderGap.priorOrderDate)} ·{" "}
                            {formatIntervalDays(orderGap.daysBetween)} between orders
                          </span>
                        </span>
                      ) : null}
                      <span>
                        Last visit:{" "}
                        <span className="text-foreground">
                          {item.daysSinceVisit !== null
                            ? `${formatDays(item.daysSinceVisit)} · ${formatDate(item.lastVisitDate)}`
                            : "No visit date"}
                        </span>
                      </span>
                      {item.territorySharePct !== undefined ? (
                        <span>
                          Territory share{" "}
                          <span className="text-foreground">
                            {Math.round(item.territorySharePct)}% ·{" "}
                            {formatNumber(item.territoryValue ?? 0)} vol
                          </span>
                        </span>
                      ) : null}
                      {showHistory ? (
                        <>
                          <span>
                            90d revenue{" "}
                            <span className="text-foreground">
                              {formatMoney(item.revenue90)}
                            </span>
                          </span>
                          <span className={trendClass(item)}>
                            Trend {formatPct(item.revenueDeltaPct)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
