import type { AccountHealth, FocusHorizon } from "./types";

export type FocusHealthPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
};

export { downloadFocusHealthPdf } from "./generate-focus-health-pdf";

export function focusHealthReportFilename(input: FocusHealthPdfInput): string {
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  return `cellar-pulse-focus-health-${repSlug}-${stamp}.pdf`;
}
