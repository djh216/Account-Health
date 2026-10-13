"use client";

import { PrintReportButton } from "@/components/print-report-button";

/** Weekly rep pack (includes former alerts export). */
export function ExportReportButton({
  className,
  variant = "outline",
  size = "default",
  label = "Export weekly pack",
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
