import { cn } from "@/lib/utils";
import { formatHealthScoreChange } from "@/lib/format";

export function HealthScoreWithChange({
  score,
  change,
  className,
}: {
  score: number;
  change?: number | null;
  className?: string;
}) {
  const suffix = formatHealthScoreChange(change);
  return (
    <span className={cn("tabular-nums", className)}>
      {score}
      {suffix ? (
        <span
          className={cn(
            "ml-1 text-xs font-normal",
            (change ?? 0) > 0 && "text-emerald-700 dark:text-emerald-400",
            (change ?? 0) < 0 && "text-rose-700 dark:text-rose-400",
            change === 0 && "text-muted-foreground",
          )}
          title="Change vs score 14 days ago (orders and activity)"
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
