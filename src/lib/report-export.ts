import type { AccountHealth, FocusHorizon } from "./types";
import type { AccountFrequencyAlert } from "./frequency-alerts";
import type { RestaurantOrderFrequency, RestaurantVolumeRow } from "./order-analytics";
import type { ProductSummary, ProductSlowingAlert } from "./product-trends";

export type FocusHealthPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  focusByHorizon: Record<FocusHorizon, AccountHealth[]>;
  allAccounts?: AccountHealth[];
};

export type FrequencyAlertsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  alerts: AccountFrequencyAlert[];
};

export type OrderAnalyticsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  restaurantFrequency: RestaurantOrderFrequency[];
  topRestaurants?: RestaurantVolumeRow[];
  totalOrders: number;
  totalBottles: number;
};

export type ProductTrendsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  products: ProductSummary[];
  slowingAlerts?: ProductSlowingAlert[];
  totalBottles: number;
};

export { downloadFocusHealthPdf } from "./generate-focus-health-pdf";
export { downloadFrequencyAlertsPdf } from "./generate-frequency-alerts-pdf";
export { downloadOrderAnalyticsPdf } from "./generate-order-analytics-pdf";
export { downloadProductTrendsPdf } from "./generate-product-trends-pdf";
export {
  downloadProductSlowdownPdf,
  downloadProductSlowdownCsv,
  type ProductSlowdownPdfInput,
} from "./generate-product-slowdown-pdf";
export {
  downloadImminentChurnPdf,
  generateImminentChurnPdfDocument,
  type ImminentChurnPdfInput,
} from "./generate-imminent-churn-pdf";

export function frequencyAlertsReportFilename(input: FrequencyAlertsPdfInput): string {
  const repSlug =
    input.repFilter === "all"
      ? "all-reps"
      : input.repFilter.replace(/[^\w.-]+/g, "-").slice(0, 40);
  const stamp = input.generatedAt.slice(0, 10);
  return `cellar-pulse-frequency-drop-alerts-${repSlug}-${stamp}.pdf`;
}
