import type { AccountHealth, FocusHorizon } from "./types";
import type { AccountFrequencyAlert } from "./frequency-alerts";

export type FocusHealthPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
};

export type FrequencyAlertsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  alerts: AccountFrequencyAlert[];
};

export { downloadFocusHealthPdf } from "./generate-focus-health-pdf";
export { downloadFrequencyAlertsPdf } from "./generate-frequency-alerts-pdf";

export function frequencyAlertsReportFilename(input: FrequencyAlertsPdfInput): string {
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  return `cellar-pulse-frequency-drop-alerts-${repSlug}-${stamp}.pdf`;
}
