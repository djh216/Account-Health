"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportExport } from "@/hooks/use-report-export";

export function ExportReportButton({
  className,
  variant = "outline",
  size = "default",
  label = "Export Alerts PDF",
  onMessage,
}: {
  page?: "health" | "orders";
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  label?: string;
  onMessage?: (message: string) => void;
}) {
  const { busy, canExport, exportReport } = useReportExport();

  async function handleExport() {
    try {
      await exportReport();
      onMessage?.("Frequency drop alerts report downloaded.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Could not generate the alerts report.";
      onMessage?.(text);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={busy || !canExport}
      onClick={() => void handleExport()}
    >
      <Download data-icon="inline-start" />
      {busy ? "Generating PDF…" : label}
    </Button>
  );
}
