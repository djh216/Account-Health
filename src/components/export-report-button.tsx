"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportExport } from "@/hooks/use-report-export";

export function ExportReportButton({
  onMessage,
}: {
  page: "health" | "orders";
  onMessage?: (message: string) => void;
}) {
  const { busy, canExport, exportReport } = useReportExport();

  async function handleExport() {
    try {
      await exportReport();
      onMessage?.("Focus & health PDF downloaded.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Could not generate the report.";
      onMessage?.(text);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy || !canExport}
      onClick={() => void handleExport()}
    >
      <Download data-icon="inline-start" />
      {busy ? "Generating PDF…" : "Export PDF"}
    </Button>
  );
}
