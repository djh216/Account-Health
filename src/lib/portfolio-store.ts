import { todayIso } from "./format";
import { stripPaDemoPortfolio } from "./pa-demo";
import { clearPortfolio, loadPortfolio, savePortfolio } from "./storage";
import type { PortfolioState } from "./types";

const listeners = new Set<() => void>();

let memory: PortfolioState | null = null;

const EMPTY_PORTFOLIO: PortfolioState = {
  accounts: [],
  orders: [],
  visits: [],
  reports: [],
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

export function getPortfolioSnapshot(): PortfolioState {
  if (memory) return memory;
  const stored = loadPortfolio();
  memory = stored ?? EMPTY_PORTFOLIO;
  return memory;
}

export function reloadPortfolioFromStorage(): void {
  memory = null;
  memory = loadPortfolio() ?? EMPTY_PORTFOLIO;
  notify();
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
