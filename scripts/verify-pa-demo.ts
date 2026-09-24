import {
  portfolioContainsPaDemo,
  stripPaDemoPortfolio,
} from "../src/lib/pa-demo";
import type { PortfolioState } from "../src/lib/types";

const paBook: PortfolioState = {
  analysisAsOf: "2026-09-07",
  reports: [
    {
      id: "1-licensee-snapshot.csv",
      fileName: "licensee-snapshot.csv",
      kind: "snapshot",
      uploadedAt: "2026-09-01",
      rowCount: 18,
    },
  ],
  accounts: [
    {
      id: "the-walnut-room",
      name: "The Walnut Room",
      type: "restaurant",
      licenseNumber: "R-48721",
      city: "Philadelphia",
      county: "Philadelphia",
      region: "East",
      salesRep: "Dana Ricci",
    },
    {
      id: "allegheny-chop-house",
      name: "Allegheny Chop House",
      type: "restaurant",
      licenseNumber: "R-22904",
      city: "Pittsburgh",
      county: "Allegheny",
      region: "West",
      salesRep: "Meghan Park",
    },
  ],
  orders: [
    {
      id: "the-walnut-room-last-order",
      accountId: "the-walnut-room",
      accountName: "The Walnut Room",
      date: "2026-05-12",
      revenue: 0,
      cases: 0,
    },
  ],
  visits: [],
};

const failures: string[] = [];

if (!portfolioContainsPaDemo(paBook)) {
  failures.push("Expected PA demo portfolio to be detected");
}

const cleaned = stripPaDemoPortfolio(paBook);
if (cleaned.accounts.length !== 0) {
  failures.push(`Expected 0 accounts after strip, got ${cleaned.accounts.length}`);
}
if (cleaned.orders.length !== 0) {
  failures.push(`Expected 0 orders after strip, got ${cleaned.orders.length}`);
}

const mixed: PortfolioState = {
  ...paBook,
  accounts: [
    ...paBook.accounts,
    {
      id: "napa-valley-bistro",
      name: "Napa Valley Bistro",
      type: "restaurant",
      city: "Napa",
    },
  ],
  orders: [
    ...paBook.orders,
    {
      id: "napa-valley-bistro-2026-08-26-0-pinot-noir",
      accountId: "napa-valley-bistro",
      accountName: "Napa Valley Bistro",
      date: "2026-08-26",
      revenue: 2400,
      cases: 18,
      product: "Pinot Noir",
    },
  ],
};

const mixedClean = stripPaDemoPortfolio(mixed);
if (mixedClean.accounts.length !== 1) {
  failures.push(`Expected 1 real account after strip, got ${mixedClean.accounts.length}`);
}
if (mixedClean.accounts[0]?.name !== "Napa Valley Bistro") {
  failures.push("Real account was removed by mistake");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("OK — PA demo book detection and stripping works");
