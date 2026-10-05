import { todayIso } from "./format";
import { stripPaDemoPortfolio } from "./pa-demo";
import { ensureUploadLastVisitIndex } from "./upload-last-visits";
import {
  clearPortfolio,
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

function withUploadLastVisitIndex(state: PortfolioState): PortfolioState {
  const uploadLastVisitIndex = ensureUploadLastVisitIndex(state);
  if (uploadLastVisitIndex === state.uploadLastVisitIndex) return state;
  return { ...state, uploadLastVisitIndex };
}

export function getPortfolioSnapshot(): PortfolioState {
  if (memory) return memory;
  const stored = loadPortfolio();
  memory = withUploadLastVisitIndex(stored ?? EMPTY_PORTFOLIO);
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
        memory = withUploadLastVisitIndex(full);
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
  const cleaned = stripPaDemoPortfolio(resolved);
  memory = cleaned.accounts.length > 0 ? cleaned : EMPTY_PORTFOLIO;
  savePortfolio(memory);
  notify();
}

export function resetPortfolio(): void {
  clearPortfolio();
  memory = EMPTY_PORTFOLIO;
  notify();
}
