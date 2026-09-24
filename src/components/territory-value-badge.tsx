import { Badge } from "@/components/ui/badge";
import { territoryTierLabel } from "@/lib/territory-value";
import type { TerritoryValueTier } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<TerritoryValueTier, string> = {
  anchor: "border-transparent bg-primary text-primary-foreground",
  core: "border-transparent bg-amber-700 text-amber-50",
  base: "border-transparent bg-stone-500 text-stone-50",
};

export function TerritoryValueBadge({ tier }: { tier: TerritoryValueTier }) {
  return (
    <Badge className={cn(styles[tier])}>{territoryTierLabel(tier)}</Badge>
  );
}
