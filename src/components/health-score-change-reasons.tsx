import { cn } from "@/lib/utils";

export function HealthScoreChangeReasons({
  change,
  reasons,
  className,
  compact,
}: {
  change?: number | null;
  reasons?: string[];
  className?: string;
  compact?: boolean;
}) {
  const list = reasons ?? [];
  const hasChange = change !== null && change !== undefined;

  return (
    <div className={cn("space-y-2", className)}>
      {hasChange ? (
        <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          Net change vs 14 days ago:{" "}
          <span
            className={cn(
              "font-medium",
              change > 0 && "text-emerald-700 dark:text-emerald-400",
              change < 0 && "text-rose-700 dark:text-rose-400",
            )}
          >
            {change > 0 ? `+${change}` : change} points
          </span>
        </p>
      ) : null}
      {list.length > 0 ? (
        <ul
          className={cn(
            "list-disc space-y-1.5 pl-4 text-muted-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {list.map((reason) => (
            <li key={reason} className="leading-snug text-foreground/90">
              {reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          No major factor shifts vs 14 days ago.
        </p>
      )}
    </div>
  );
}
