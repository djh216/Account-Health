import { normalizeName } from "./format";

/** Normalized account names always treated as Philadelphia territory for rep remapping. */
const PHILADELPHIA_TERRITORY_ACCOUNT_NAMES_EXACT = new Set(
  [
    "Winnie's Manayunk",
    "Winnies Manayunk",
    "Scarpetta",
    "Scarpetta Philadelphia",
    "Restaurant Aleksandar",
    "My Loup",
    "Jansen, Green",
    "Jansen & Green",
    "Jansen Green",
    "Valley Country Club",
    "Pizzeria Vetri - Rittenhouse",
    "Pizzeria Vetri Rittenhouse",
    "Fiore Rosso",
  ].map(normalizeName),
);

/**
 * Philadelphia city neighborhoods / labels that often appear without "Philadelphia"
 * in region or county on the account master.
 */
const PHILADELPHIA_GEOGRAPHY_MARKERS = [
  "philadelphia",
  "manayunk",
  "rittenhouse",
  "center city",
  "old city",
  "fishtown",
  "university city",
  "society hill",
  "queen village",
  "passyunk",
  "south philly",
  "north philly",
  "west philly",
  "east passyunk",
];

export function isKnownPhiladelphiaAccountName(accountName: string | undefined | null): boolean {
  if (!accountName?.trim()) return false;
  const normalized = normalizeName(accountName);
  if (PHILADELPHIA_TERRITORY_ACCOUNT_NAMES_EXACT.has(normalized)) return true;

  if (normalized.includes("winnies") && normalized.includes("manayunk")) return true;
  if (normalized.includes("vetri") && normalized.includes("rittenhouse")) return true;
  if (normalized.startsWith("scarpetta")) return true;
  if (normalized.includes("fiore rosso")) return true;
  if (normalized.includes("restaurant aleksandar")) return true;
  if (normalized.includes("my loup")) return true;
  if (normalized.includes("valley country club")) return true;
  if (normalized.includes("jansen") && normalized.includes("green")) return true;

  return false;
}

export function isPhiladelphiaGeographyLabel(value: string): boolean {
  const normalized = normalizeName(value);
  if (!normalized) return false;
  if (normalized === normalizeName("Philadelphia")) return true;
  return PHILADELPHIA_GEOGRAPHY_MARKERS.some(
    (marker) => normalized === marker || normalized.includes(marker),
  );
}
