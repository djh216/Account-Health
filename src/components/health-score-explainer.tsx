"use client";

import { useState } from "react";
import { HealthScoreChangeReasons } from "@/components/health-score-change-reasons";
import { HealthScoreFactorBar } from "@/components/health-score-factor-bar";
import { HealthScoreWithChange } from "@/components/health-score-with-change";
import { RiskBadge } from "@/components/risk-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AccountHealth, HealthFactor } from "@/lib/types";

export function HealthScoreExplainer({
  account,
  score: scoreProp,
  change: changeProp,
  reasons: reasonsProp,
  factors: factorsProp,
  accountName,
  className,
}: {
  account?: AccountHealth | null;
  score?: number;
  change?: number | null;
  reasons?: string[];
  factors?: HealthFactor[];
  accountName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const score = account?.score ?? scoreProp ?? 0;
  const change = account?.scoreChange14d ?? changeProp;
  const reasons = account?.scoreChange14dReasons ?? reasonsProp;
  const factors = account?.factors ?? factorsProp ?? [];
  const title = account?.account.name ?? accountName ?? "Account health";
  const risk = account?.risk;

  const scoreNode = (
    <HealthScoreWithChange score={score} change={change} className={className} />
  );

  return (
    <>
      <button
        type="button"
        className={cn(
          "cursor-pointer rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title="View health score breakdown and recent changes"
      >
        {scoreNode}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[min(90vh,40rem)] max-w-lg overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              {risk ? <RiskBadge risk={risk} /> : null}
              <span className="text-sm text-muted-foreground">
                Score{" "}
                <HealthScoreWithChange score={score} change={change} className="font-semibold text-foreground" />
              </span>
            </div>
            <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
            <DialogDescription>
              How the score is built and what moved in the last 14 days (orders and rep
              activity).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <section className="rounded-lg border border-border/80 bg-muted/20 p-3">
              <h3 className="text-sm font-semibold">Last 14 days — score change</h3>
              <div className="mt-2">
                <HealthScoreChangeReasons change={change} reasons={reasons} />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Why this score</h3>
              {factors.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {factors.map((factor) => (
                    <HealthScoreFactorBar
                      key={factor.key}
                      label={factor.label}
                      score={factor.score}
                      detail={factor.detail}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Factor breakdown is not available for this row. Open the full account
                  detail for the complete score model.
                </p>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
