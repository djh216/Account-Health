import { todayIso } from "./format";
import { stripPaDemoPortfolio } from "./pa-demo";
import { ensureUploadLastVisitIndex } from "./upload-last-visits";
import { getRepFilterSnapshot, resetRepFilter, setRepFilter } from "./rep-filter";
import {
  isDavidHallRep,
  normalizeVisitSalesRep,
  remapPortfolioSalesReps,
  stripDavidHallFromPortfolio,
} from "./visit-rep-remap";
import {
  clearPortfolio,
  clearPortfolioStorageAsync,
  loadPortfolio,
  loadPortfolioAsync,
  savePortfolio,
} from "./storage";
import type { PortfolioState } from "./types";

const listeners = new Set<() => void>();

let memory: PortfolioState | null = null;

const EMPTY_PORTFOLIO: PortfolioState = {
  accounts: [],
  orders: [],
  visits: [],
  reports: [],
  uploadLastVisitIndex: {},
  analysisAsOf: todayIso(),
};

export function emptyPortfolio(): PortfolioState {
  return EMPTY_PORTFOLIO;
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribePortfolio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function cleanPortfolioState(state: PortfolioState): PortfolioState {
  return stripDavidHallFromPortfolio(
    remapPortfolioSalesReps(stripPaDemoPortfolio(state)),
  );
}

function withUploadLastVisitIndex(state: PortfolioState): PortfolioState {
  const uploadLastVisitIndex = ensureUploadLastVisitIndex(state);
  if (uploadLastVisitIndex === state.uploadLastVisitIndex) return state;
  return { ...state, uploadLastVisitIndex };
}

function finalizeLoadedPortfolio(state: PortfolioState): PortfolioState {
  return cleanPortfolioState(withUploadLastVisitIndex(state));
}

function persistIfPortfolioMutated(before: PortfolioState, after: PortfolioState): void {
  if (after.accounts.length === 0) return;
  if (
    after.visits.length !== before.visits.length ||
    after.uploadLastVisitIndex !== before.uploadLastVisitIndex ||
    after.accounts.some(
      (account, index) => account.salesRep !== before.accounts[index]?.salesRep,
    ) ||
    after.visits.some((visit, index) => visit.salesRep !== before.visits[index]?.salesRep)
  ) {
    savePortfolio(after);
  }
}

function syncRepFilterAfterPortfolioClean(): void {
  if (typeof window === "undefined") return;
  const current = getRepFilterSnapshot();
  if (current === "all") return;
  if (isDavidHallRep(current)) {
    resetRepFilter();
    return;
  }
  const remapped = normalizeVisitSalesRep(current);
  if (remapped && remapped !== current) {
    setRepFilter(remapped);
  }
}

export function getPortfolioSnapshot(): PortfolioState {
  if (memory) {
    const cleaned = finalizeLoadedPortfolio(memory);
    if (cleaned !== memory) {
      memory = cleaned;
      savePortfolio(memory);
      syncRepFilterAfterPortfolioClean();
      notify();
    }
    return memory;
  }
  const stored = loadPortfolio();
  const before = stored ?? EMPTY_PORTFOLIO;
  const after = finalizeLoadedPortfolio(before);
  memory = after;
  persistIfPortfolioMutated(before, after);
  syncRepFilterAfterPortfolioClean();
  return memory;
}

export async function hydratePortfolioFromStorage(): Promise<PortfolioState> {
  try {
    const full = await loadPortfolioAsync();
    if (full && Array.isArray(full.accounts) && full.accounts.length > 0) {
      const memAccounts = memory?.accounts?.length ?? 0;
      const memOrders = memory?.orders?.length ?? 0;
      const fullAccounts = full.accounts.length;
      const fullOrders = full.orders?.length ?? 0;

      // Update memory if IndexedDB has restored data and memory was empty or smaller (due to quota)
      if (
        !memory ||
        memory === EMPTY_PORTFOLIO ||
        fullAccounts > memAccounts ||
        fullOrders > memOrders
      ) {
        const before = memory ?? EMPTY_PORTFOLIO;
        const after = finalizeLoadedPortfolio(full);
        memory = after;
        persistIfPortfolioMutated(full, after);
        if (before !== EMPTY_PORTFOLIO && before !== full) {
          persistIfPortfolioMutated(before, after);
        }
        syncRepFilterAfterPortfolioClean();
        notify();
      }
    }
  } catch {
    // ignore
  }
  return memory ?? EMPTY_PORTFOLIO;
}

export function reloadPortfolioFromStorage(): void {
  memory = null;
  memory = loadPortfolio() ?? EMPTY_PORTFOLIO;
  notify();
  void hydratePortfolioFromStorage();
}

export function getServerPortfolioSnapshot(): PortfolioState {
  return EMPTY_PORTFOLIO;
}

export function setPortfolio(
  next: PortfolioState | ((current: PortfolioState) => PortfolioState),
): void {
  const current = memory ?? getPortfolioSnapshot();
  const resolved = typeof next === "function" ? next(current) : next;
  const cleaned = cleanPortfolioState(resolved);
  memory = cleaned.accounts.length > 0 ? cleaned : EMPTY_PORTFOLIO;
  savePortfolio(memory);
  notify();
}

export function resetPortfolio(): void {
  clearPortfolio();
  memory = EMPTY_PORTFOLIO;
  notify();
}

/** Wipe portfolio + browser storage, then reload so caches and IndexedDB cannot restore old data. */
export async function hardResetApp(): Promise<void> {
  if (typeof window === "undefined") return;
  memory = EMPTY_PORTFOLIO;
  await clearPortfolioStorageAsync();
  resetRepFilter();
  notify();
  window.location.reload();
}
