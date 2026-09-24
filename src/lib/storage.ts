import {
  portfolioContainsPaDemo,
  stripPaDemoPortfolio,
} from "./pa-demo";
import type { PortfolioState } from "./types";

const STORAGE_KEY = "cellar-pulse.portfolio.v6";
const MIGRATION_KEY = "cellar-pulse.migrated.v6";

const LEGACY_STORAGE_KEYS = [
  "cellar-pulse.portfolio",
  "cellar-pulse.portfolio.v1",
  "cellar-pulse.portfolio.v2",
  "cellar-pulse.portfolio.v3",
  "cellar-pulse.portfolio.v4",
  "cellar-pulse.portfolio.v5",
];

function isPaSampleBook(state: PortfolioState): boolean {
  return portfolioContainsPaDemo(state);
}

export function purgeAllCellarPulseStorage(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("cellar-pulse")) keys.push(key);
  }
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

export function purgeLegacyPortfolioStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

/** One-time migration: wipe every cached portfolio (removes embedded PA demo book). */
export function runPortfolioMigration(): boolean {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(MIGRATION_KEY) === "1") return false;

  purgeAllCellarPulseStorage();
  window.localStorage.setItem(MIGRATION_KEY, "1");
  return true;
}

export function loadPortfolio(): PortfolioState | null {
  if (typeof window === "undefined") return null;

  runPortfolioMigration();
  purgeLegacyPortfolioStorage();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PortfolioState;
    if (!parsed || !Array.isArray(parsed.accounts)) return null;

    if (isPaSampleBook(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const cleaned = stripPaDemoPortfolio(parsed);
    if (cleaned.accounts.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const demoRemoved =
      cleaned.accounts.length !== parsed.accounts.length ||
      cleaned.orders.length !== parsed.orders.length ||
      cleaned.reports.length !== parsed.reports.length;
    if (demoRemoved) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }

    return cleaned;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function savePortfolio(state: PortfolioState): void {
  if (typeof window === "undefined") return;
  const cleaned = stripPaDemoPortfolio(state);
  if (portfolioContainsPaDemo(cleaned) || cleaned.accounts.length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

export function clearPortfolio(): void {
  if (typeof window === "undefined") return;
  purgeAllCellarPulseStorage();
  window.localStorage.setItem(MIGRATION_KEY, "1");
}
