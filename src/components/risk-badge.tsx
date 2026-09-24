import { Badge } from "@/components/ui/badge";
import { riskLabel } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<RiskLevel, string> = {
  critical: "border-transparent bg-rose-800 text-rose-50",
  at_risk: "border-transparent bg-amber-700 text-amber-50",
  dormant: "border-transparent bg-stone-600 text-stone-50",
  healthy: "border-transparent bg-emerald-800 text-emerald-50",
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge className={cn(styles[risk])}>{riskLabel(risk)}</Badge>;
}
