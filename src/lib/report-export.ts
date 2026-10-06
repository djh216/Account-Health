import type { AccountHealth, FocusHorizon } from "./types";
import type { AccountFrequencyAlert } from "./frequency-alerts";
import type { RestaurantOrderFrequency, RestaurantVolumeRow } from "./order-analytics";
import type { ProductSummary, ProductSlowingAlert } from "./product-trends";
import { buildExportPdfFilename } from "./pdf-filename";
import type { PdfAccountVisitLookup } from "./pdf-account-visit";
export {
  buildPdfAccountVisitLookup,
  type PdfAccountVisitLookup,
} from "./pdf-account-visit";

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
  accountVisitLookup?: PdfAccountVisitLookup;
};

export type OrderAnalyticsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  restaurantFrequency: RestaurantOrderFrequency[];
  topRestaurants?: RestaurantVolumeRow[];
  totalOrders: number;
  totalBottles: number;
  accountVisitLookup?: PdfAccountVisitLookup;
};

export type ProductTrendsPdfInput = {
  repFilter: string;
  asOf: string;
  generatedAt: string;
  products: ProductSummary[];
  slowingAlerts?: ProductSlowingAlert[];
  totalBottles: number;
  accountVisitLookup?: PdfAccountVisitLookup;
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
export { downloadProductSlowdownExcel } from "./generate-product-slowdown-excel";
export {
  downloadImminentChurnPdf,
  generateImminentChurnPdfDocument,
  type ImminentChurnPdfInput,
} from "./generate-imminent-churn-pdf";
export {
  downloadRepActionPlansPdf,
  generateRepActionPlansPdfDocument,
  type RepActionPlansPdfInput,
} from "./generate-rep-action-plan-pdf";
export type { RepActionPlan } from "./rep-action-plans";
export { buildRepActionPlans } from "./rep-action-plans";

export function frequencyAlertsReportFilename(input: FrequencyAlertsPdfInput): string {
  const stamp = input.generatedAt.slice(0, 10);
  return buildExportPdfFilename(input.repFilter, "frequency-drop-alerts", stamp);
}
