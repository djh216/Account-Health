export const DASHBOARD_VIEWS = ["insights", "health", "orders", "trends"] as const;

export type DashboardViewId = (typeof DASHBOARD_VIEWS)[number];

export const DEFAULT_DASHBOARD_VIEW: DashboardViewId = "insights";

export type TrendsGrain = "account" | "product";

export function parseDashboardView(value: string | null | undefined): DashboardViewId {
  if (value && (DASHBOARD_VIEWS as readonly string[]).includes(value)) {
    return value as DashboardViewId;
  }
  return DEFAULT_DASHBOARD_VIEW;
}

export function dashboardViewLabel(view: DashboardViewId): string {
  switch (view) {
    case "insights":
      return "Weekly book";
    case "health":
      return "Account health";
    case "orders":
      return "Orders & tracking";
    case "trends":
      return "Sales trends";
  }
}

export function dashboardViewToReportPage(
  view: DashboardViewId,
  trendsGrain: TrendsGrain,
): "health" | "orders" | "products" | "insights" {
  if (view === "trends") {
    return trendsGrain === "account" ? "orders" : "products";
  }
  if (view === "orders") return "orders";
  if (view === "health") return "health";
  return "insights";
}
