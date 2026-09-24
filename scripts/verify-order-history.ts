import { buildOrderAnalytics, hasSpecifiedProduct } from "../src/lib/order-analytics";
import type { Order } from "../src/lib/types";

const asOf = "2026-09-07";
const orders: Order[] = [
  {
    id: "a-2023",
    accountId: "bistro",
    accountName: "Old Harbor",
    date: "2023-01-15",
    revenue: 0,
    cases: 40,
    product: "Legacy Red",
  },
  {
    id: "a-2025",
    accountId: "bistro",
    accountName: "Old Harbor",
    date: "2025-05-01",
    revenue: 0,
    cases: 12,
    product: "Legacy Red",
  },
  {
    id: "b-recent",
    accountId: "bistro",
    accountName: "Old Harbor",
    date: "2026-08-01",
    revenue: 0,
    cases: 8,
    product: "New White",
  },
];

const analytics = buildOrderAnalytics(orders, asOf);
const tracking = analytics.byAccount[0];
const failures: string[] = [];

if (!tracking) failures.push("Missing account tracking row");
if (tracking && tracking.volumeAllTime !== 60) {
  failures.push(`Expected all-time volume 60, got ${tracking.volumeAllTime}`);
}
if (tracking && tracking.volumeBeforeRecent90 !== 52) {
  failures.push(
    `Expected 52 volume before recent 90d, got ${tracking.volumeBeforeRecent90}`,
  );
}
if (tracking && !tracking.droppedProducts.includes("Legacy Red")) {
  failures.push("Expected Legacy Red to be dropped based on full history");
}
if (tracking && !tracking.newProducts.includes("New White")) {
  failures.push("Expected New White to be flagged as new");
}
if (analytics.orders.length !== 3) {
  failures.push(`Expected 3 stored orders, got ${analytics.orders.length}`);
}

const withUnspecified: Order[] = [
  ...orders,
  {
    id: "blank-product",
    accountId: "bistro",
    accountName: "Old Harbor",
    date: "2026-08-02",
    revenue: 0,
    cases: 99,
    product: "   ",
  },
  {
    id: "missing-product",
    accountId: "bistro",
    accountName: "Old Harbor",
    date: "2026-08-03",
    revenue: 0,
    cases: 50,
  },
];
const filtered = buildOrderAnalytics(withUnspecified, asOf);
if (filtered.orders.length !== 3) {
  failures.push(
    `Expected unspecified product lines to be excluded, got ${filtered.orders.length} orders`,
  );
}
if (filtered.byProduct.some((row) => row.product === "Unspecified product")) {
  failures.push("Unspecified product should not appear in product analytics");
}
if (withUnspecified.filter(hasSpecifiedProduct).length !== 3) {
  failures.push("hasSpecifiedProduct helper should keep only named products");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("OK — full order history tracked with older-than-recent-window volume included");
