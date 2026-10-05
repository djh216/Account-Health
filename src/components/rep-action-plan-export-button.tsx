"use client";

import { CalendarRange, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportExport } from "@/components/report-export-provider";

export function RepActionPlanExportButton({
  onMessage,
  size = "sm",
  variant = "default",
  className,
}: {
  onMessage?: (message: string) => void;
  size?: "default" | "sm" | "lg" | "xs";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  const {
    busy,
    canExport,
    exportRepActionPlansPdf,
    hasRepActionPlanData,
    repFilter,
  } = useReportExport();

  async function handleExport() {
    try {
      await exportRepActionPlansPdf();
      onMessage?.(
        repFilter === "all"
          ? "Rep action plan PDF ready — print or save from the preview."
          : `${repFilter}'s action plan PDF ready — print or save from the preview.`,
      );
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Could not generate the rep action plan PDF.";
      onMessage?.(text);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={busy || !canExport || !hasRepActionPlanData}
      onClick={() => void handleExport()}
    >
      {busy ? (
        <Loader2 data-icon="inline-start" className="size-4 animate-spin" />
      ) : (
        <CalendarRange data-icon="inline-start" className="size-4" />
      )}
      {busy ? "Generating PDF…" : "Download 1 / 2 / 3 Week Action Plan"}
    </Button>
  );
}
