"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";
import type { NewAccountSummary } from "@/lib/order-analytics";

export function NewAccountsPanel({
  accounts,
  windowDays,
  onSelect,
  renderTrailing,
}: {
  accounts: NewAccountSummary[];
  windowDays: number;
  onSelect?: (account: NewAccountSummary) => void;
  renderTrailing?: (account: NewAccountSummary) => ReactNode;
}) {
  return (
    <Card className="border-primary/20 bg-[color-mix(in_oklch,var(--card),var(--primary)_4%)]">
      <CardHeader className="border-b">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <CardTitle className="font-heading text-xl">
              New accounts
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({accounts.length})
              </span>
            </CardTitle>
            <CardDescription>
              First order in the last {windowDays} days with no order history before
              that window.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No new accounts with orders in the last {windowDays} days.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {accounts.map((account) => {
              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-medium">{account.accountName}</div>
                    {renderTrailing ? renderTrailing(account) : null}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>
                      First order{" "}
                      <span className="text-foreground">
                        {formatDate(account.firstOrderDate)}
                      </span>
                    </p>
                    <p>
                      Last order{" "}
                      <span className="text-foreground">
                        {formatDate(account.lastOrderDate)}
                      </span>
                    </p>
                    <p>
                      {formatNumber(account.recentVolume)} vol · {account.orderEventCount}{" "}
                      order{account.orderEventCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </>
              );

              if (!onSelect) {
                return (
                  <div
                    key={account.accountName}
                    className="min-w-[15rem] shrink-0 rounded-xl border bg-background px-4 py-3"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <button
                  key={account.accountName}
                  type="button"
                  onClick={() => onSelect(account)}
                  className="min-w-[15rem] shrink-0 rounded-xl border bg-background px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/4"
                >
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
