import type { AccountHealth, FocusHorizon } from "./types";
import type { AccountFrequencyAlert } from "./frequency-alerts";

import type { ProductSlowingAlert } from "./product-trends";

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

export type ProductSlowdownPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  alerts: ProductSlowingAlert[];
};

export { downloadFocusHealthPdf } from "./generate-focus-health-pdf";
export { downloadFrequencyAlertsPdf } from "./generate-frequency-alerts-pdf";
export {
  downloadProductSlowdownPdf,
  downloadProductSlowdownCsv,
} from "./generate-product-slowdown-pdf";

export function frequencyAlertsReportFilename(input: FrequencyAlertsPdfInput): string {
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  return `cellar-pulse-frequency-drop-alerts-${repSlug}-${stamp}.pdf`;
}

export function productSlowdownReportFilename(input: ProductSlowdownPdfInput): string {
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  return `cellar-pulse-product-slowdown-report-${repSlug}-${stamp}.pdf`;
}
