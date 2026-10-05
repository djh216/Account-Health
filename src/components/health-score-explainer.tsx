"use client";

import { HealthScoreWithChange } from "@/components/health-score-with-change";
import { HealthScoreChangeReasons } from "@/components/health-score-change-reasons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function HealthScoreExplainer({
  score,
  change,
  reasons,
  className,
  scrollToReasonsId,
}: {
  score: number;
  change?: number | null;
  reasons?: string[];
  className?: string;
  /** In account detail: scroll to the full reasons panel instead of a menu. */
  scrollToReasonsId?: string;
}) {
  const canExplain =
    Boolean(scrollToReasonsId) ||
    (reasons && reasons.length > 0) ||
    change !== null ||
    change !== undefined;

  const scoreNode = (
    <HealthScoreWithChange score={score} change={change} className={className} />
  );

  if (!canExplain) {
    return scoreNode;
  }

  if (scrollToReasonsId) {
    return (
      <button
        type="button"
        className={cn(
          "rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={() => {
          document.getElementById(scrollToReasonsId)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }}
        title="Show why the score changed in the last 14 days"
      >
        {scoreNode}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        title="Why did the score change in the last 14 days?"
      >
        {scoreNode}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-w-sm p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Last 14 days — score change
        </p>
        <HealthScoreChangeReasons change={change} reasons={reasons} compact />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
