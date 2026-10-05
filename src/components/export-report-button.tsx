"use client";

import { PrintReportButton } from "@/components/print-report-button";

/** Alerts PDF only — prefer PrintReportButton on dashboards. */
export function ExportReportButton({
  className,
  variant = "outline",
  size = "default",
  label = "Export alerts",
  onMessage,
}: {
  page?: "health" | "orders" | "products";
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  label?: string;
  onMessage?: (message: string) => void;
}) {
  return (
    <PrintReportButton
      page="health"
      primaryExport="alerts"
      className={className}
      variant={variant}
      size={size}
      label={label}
      onMessage={onMessage}
      showMenu={false}
    />
  );
}
