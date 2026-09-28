import type { PortfolioState } from "./types";

const DB_NAME = "cellar-pulse-idb";
const DB_VERSION = 1;
const STORE_NAME = "portfolio";
const RECORD_KEY = "active_portfolio";

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function idbSavePortfolio(state: PortfolioState): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;

    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(state, RECORD_KEY);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function idbLoadPortfolio(): Promise<PortfolioState | null> {
  try {
    const db = await getDB();
    if (!db) return null;

    return await new Promise<PortfolioState | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(RECORD_KEY);

        req.onsuccess = () => {
          const val = req.result as PortfolioState | undefined;
          resolve(val ?? null);
        };
        req.onerror = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function idbClearPortfolio(): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;

    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(RECORD_KEY);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
