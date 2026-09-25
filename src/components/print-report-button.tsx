"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReportButton({
  className,
  variant = "outline",
  size = "default",
  label = "Print to PDF",
  title = "Print or Save to PDF",
}: {
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "xs";
  label?: string;
  title?: string;
}) {
  function handlePrint() {
    window.print();
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      title={title}
      onClick={handlePrint}
    >
      <Printer data-icon="inline-start" className="size-4" />
      <span>{label}</span>
    </Button>
  );
}
