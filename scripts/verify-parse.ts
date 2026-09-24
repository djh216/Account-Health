import { parseCsv, rowsToRecords } from "../src/lib/parse";
import { buildOrderAnalytics } from "../src/lib/order-analytics";

const sampleCsv = `Restaurant Name,Date,Product Purchased,Volume
Napa Valley Bistro,2026-08-26,Pinot Noir,18
Napa Valley Bistro,2026-08-10,Chardonnay,19
Harbor House,2026-08-30,Burgundy,42
Harbor House,2026-08-30,Champagne,12
Downtown Wine Bar,2026-05-12,House Red,6
`;

const parsed = parseCsv("customer-orders.csv", sampleCsv);
const failures: string[] = [];

if (parsed.kind !== "orders") {
  failures.push(`Expected orders kind, got ${parsed.kind}`);
}
if (!parsed.mapping.account) failures.push("Account/restaurant column not mapped");
if (!parsed.mapping.date) failures.push("Date column not mapped");
if (!parsed.mapping.product) failures.push("Product column not mapped");
if (!parsed.mapping.cases) failures.push("Volume column not mapped");

const records = rowsToRecords(parsed);
if (records.orders.length !== 5) {
  failures.push(`Expected 5 orders, got ${records.orders.length}`);
}

const missingProduct = records.orders.filter((order) => !order.product);
if (missingProduct.length > 0) {
  failures.push(`${missingProduct.length} orders missing product`);
}

const missingVolume = records.orders.filter((order) => order.cases <= 0);
if (missingVolume.length > 0) {
  failures.push(`${missingVolume.length} orders missing volume`);
}

const analytics = buildOrderAnalytics(records.orders);
if (analytics.productCatalog.length < 4) {
  failures.push(`Expected at least 4 products in catalog, got ${analytics.productCatalog.length}`);
}
if (analytics.totals.totalVolume !== 97) {
  failures.push(`Expected total volume 97, got ${analytics.totals.totalVolume}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `OK — ${records.orders.length} orders, ${analytics.productCatalog.length} products, ${analytics.totals.totalVolume} total volume`,
);

// Lead team member on order history
const leadTeamCsv = `Restaurant Name,Date,Product Purchased,Volume,Lead Team Member
Napa Valley Bistro,2026-08-26,Pinot Noir,18,Dana Ricci
Harbor House,2026-08-30,Burgundy,42,Dana Ricci
Downtown Wine Bar,2026-05-12,House Red,6,Meghan Park
`;

const leadParsed = parseCsv("team-orders.csv", leadTeamCsv);
const leadFailures: string[] = [];

if (leadParsed.mapping.salesRep !== "Lead Team Member") {
  leadFailures.push(
    `Expected Lead Team Member column mapped, got ${leadParsed.mapping.salesRep ?? "none"}`,
  );
}

const leadRecords = rowsToRecords(leadParsed);
const napa = leadRecords.accounts.find((account) => account.name === "Napa Valley Bistro");
const downtown = leadRecords.accounts.find((account) => account.name === "Downtown Wine Bar");

if (!napa?.salesRep || napa.salesRep !== "Dana Ricci") {
  leadFailures.push(`Expected Dana Ricci on Napa Valley Bistro, got ${napa?.salesRep ?? "none"}`);
}
if (!downtown?.salesRep || downtown.salesRep !== "Meghan Park") {
  leadFailures.push(
    `Expected Meghan Park on Downtown Wine Bar, got ${downtown?.salesRep ?? "none"}`,
  );
}

if (leadFailures.length > 0) {
  console.error(leadFailures.join("\n"));
  process.exit(1);
}

console.log("OK — lead team member column maps to account sales rep");
