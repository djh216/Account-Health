import {
  emptyCustomerDirectory,
  type CustomerDirectory,
  type CustomerRecord,
} from "./customer-directory";

const DB_NAME = "cellar-pulse-customers";
const DB_VERSION = 1;
const STORE_NAME = "directory";
const RECORD_KEY = "active";

export type CustomerSnapshot = {
  directory: CustomerDirectory;
  hydrated: boolean;
};

const SERVER_SNAPSHOT: CustomerSnapshot = {
  directory: emptyCustomerDirectory(),
  hydrated: false,
};

const listeners = new Set<() => void>();
let snapshot: CustomerSnapshot = SERVER_SNAPSHOT;
let loadStarted = false;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeCustomerDirectory(listener: () => void): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => listeners.delete(listener);
}

export function getCustomerDirectorySnapshot(): CustomerSnapshot {
  return snapshot;
}

export function getServerCustomerDirectorySnapshot(): CustomerSnapshot {
  return SERVER_SNAPSHOT;
}

export async function replaceCustomerDirectory(directory: CustomerDirectory): Promise<void> {
  const next = sanitizeDirectory(directory);
  snapshot = { directory: next, hydrated: true };
  notify();
  await idbSave(next);
}

export async function clearCustomerDirectory(): Promise<void> {
  snapshot = { directory: emptyCustomerDirectory(), hydrated: true };
  notify();
  await idbClear();
}

function ensureLoaded() {
  if (loadStarted || typeof window === "undefined") return;
  loadStarted = true;
  void idbLoad().then((stored) => {
    snapshot = {
      directory: stored ?? emptyCustomerDirectory(),
      hydrated: true,
    };
    notify();
  });
}

function sanitizeDirectory(value: CustomerDirectory): CustomerDirectory {
  const customers = Array.isArray(value.customers)
    ? value.customers.filter(isCustomerRecord)
    : [];
  return {
    customers,
    sourceFileName: typeof value.sourceFileName === "string" ? value.sourceFileName : null,
    uploadedAt: typeof value.uploadedAt === "string" ? value.uploadedAt : null,
  };
}

function isCustomerRecord(value: unknown): value is CustomerRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as CustomerRecord;
  return typeof record.id === "string" && typeof record.name === "string" && record.name.trim().length > 0;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSave(directory: CustomerDirectory): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;
    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(directory, RECORD_KEY);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

async function idbLoad(): Promise<CustomerDirectory | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise<CustomerDirectory | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(RECORD_KEY);
        request.onsuccess = () => {
          const value = request.result as CustomerDirectory | undefined;
          if (!value || !Array.isArray(value.customers)) {
            resolve(null);
            return;
          }
          resolve(sanitizeDirectory(value));
        };
        request.onerror = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbClear(): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;
    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(RECORD_KEY);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
