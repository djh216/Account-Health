import {
  idbClearPortfolio,
  idbLoadPortfolio,
  idbSavePortfolio,
} from "./idb";
import {
  portfolioContainsPaDemo,
  stripPaDemoPortfolio,
} from "./pa-demo";
import type { PortfolioState } from "./types";

const STORAGE_KEY = "cellar-pulse.portfolio.v6";
const MIGRATION_KEY = "cellar-pulse.migrated.v6";
const IDB_INDICATOR_KEY = "cellar-pulse.idb-active.v6";

// Safe size limit (~400KB) to prevent ever exhausting browser localStorage quota
const MAX_LOCAL_STORAGE_CHARS = 400_000;

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
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("cellar-pulse")) keys.push(key);
    }
    for (const key of keys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export function purgeLegacyPortfolioStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

/** One-time migration: wipe every cached portfolio (removes embedded PA demo book). */
export function runPortfolioMigration(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(MIGRATION_KEY) === "1") return false;

    purgeAllCellarPulseStorage();
    try {
      window.localStorage.setItem(MIGRATION_KEY, "1");
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous initial read from localStorage for fast initial render tick.
 */
export function loadPortfolio(): PortfolioState | null {
  if (typeof window === "undefined") return null;

  runPortfolioMigration();
  purgeLegacyPortfolioStorage();

  try {
    // If large data indicator is set, portfolio lives in IndexedDB
    if (window.localStorage.getItem(IDB_INDICATOR_KEY) === "1") {
      return null;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PortfolioState;
    if (!parsed || !Array.isArray(parsed.accounts)) return null;

    if (isPaSampleBook(parsed)) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return null;
    }

    const cleaned = stripPaDemoPortfolio(parsed);
    if (cleaned.accounts.length === 0) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return null;
    }

    const demoRemoved =
      cleaned.accounts.length !== parsed.accounts.length ||
      cleaned.orders.length !== parsed.orders.length ||
      cleaned.reports.length !== parsed.reports.length;
    if (demoRemoved) {
      try {
        const serialized = JSON.stringify(cleaned);
        if (serialized.length <= MAX_LOCAL_STORAGE_CHARS) {
          window.localStorage.setItem(STORAGE_KEY, serialized);
        }
      } catch {}
    }

    return cleaned;
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return null;
  }
}

/**
 * Asynchronously load the complete portfolio from IndexedDB.
 * Used for full restoration especially when dataset exceeds localStorage quota.
 */
export async function loadPortfolioAsync(): Promise<PortfolioState | null> {
  if (typeof window === "undefined") return null;

  try {
    const idbState = await idbLoadPortfolio();
    if (idbState && Array.isArray(idbState.accounts) && idbState.accounts.length > 0) {
      if (isPaSampleBook(idbState)) {
        await idbClearPortfolio();
        return null;
      }
      const cleaned = stripPaDemoPortfolio(idbState);
      if (cleaned.accounts.length === 0) {
        await idbClearPortfolio();
        return null;
      }
      return cleaned;
    }
  } catch {
    // ignore
  }

  // Fallback to localStorage if IndexedDB is empty
  return loadPortfolio();
}

/**
 * Save portfolio with robust fallback:
 * 1. Always saves complete data to IndexedDB (asynchronously, unlimited browser storage)
 * 2. Caches in localStorage ONLY if payload is small (<400KB) to prevent QuotaExceededError
 * 3. Never throws unhandled QuotaExceededError or pollutes the browser console
 */
export function savePortfolio(state: PortfolioState): void {
  if (typeof window === "undefined") return;

  const cleaned = stripPaDemoPortfolio(state);
  if (portfolioContainsPaDemo(cleaned) || cleaned.accounts.length === 0) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(IDB_INDICATOR_KEY);
    } catch {}
    void idbClearPortfolio();
    return;
  }

  // 1. Asynchronously persist full state into IndexedDB (virtually unlimited quota)
  void idbSavePortfolio(cleaned);

  // 2. Only attempt localStorage caching if payload size is safe (< 400KB)
  try {
    const serialized = JSON.stringify(cleaned);
    if (serialized.length <= MAX_LOCAL_STORAGE_CHARS) {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      try {
        window.localStorage.removeItem(IDB_INDICATOR_KEY);
      } catch {}
    } else {
      // Large dataset: store in IndexedDB and keep localStorage clean
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.setItem(IDB_INDICATOR_KEY, "1");
      } catch {}
    }
  } catch {
    // If setItem fails (e.g. storage full from other keys), cleanly fallback to IndexedDB
    purgeLegacyPortfolioStorage();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.setItem(IDB_INDICATOR_KEY, "1");
    } catch {}
  }
}

export function clearPortfolio(): void {
  if (typeof window === "undefined") return;
  purgeAllCellarPulseStorage();
  try {
    window.localStorage.setItem(MIGRATION_KEY, "1");
    window.localStorage.removeItem(IDB_INDICATOR_KEY);
  } catch {}
  void idbClearPortfolio();
}
