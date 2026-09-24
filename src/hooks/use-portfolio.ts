"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { mergeAccounts, mergeOrders, mergeVisits, rowsToRecords } from "@/lib/parse";
import {
  getPortfolioSnapshot,
  getServerPortfolioSnapshot,
  resetPortfolio,
  setPortfolio,
  subscribePortfolio,
} from "@/lib/portfolio-store";
import { buildSnapshot } from "@/lib/score";
import type { ParseResult } from "@/lib/types";

export function usePortfolio() {
  const state = useSyncExternalStore(
    subscribePortfolio,
    getPortfolioSnapshot,
    getServerPortfolioSnapshot,
  );

  const snapshot = useMemo(
    () => buildSnapshot(state.accounts, state.orders, state.visits, state.analysisAsOf),
    [state],
  );

  const importParseResult = useCallback((result: ParseResult) => {
    const records = rowsToRecords(result);
    const rowCount =
      result.kind === "orders"
        ? records.orders.length
        : result.kind === "visits"
          ? records.visits.length
          : records.accounts.length;
    setPortfolio((current) => ({
      accounts: mergeAccounts(current.accounts, records.accounts),
      orders: mergeOrders(current.orders, records.orders),
      visits: mergeVisits(current.visits, records.visits),
      analysisAsOf: new Date().toISOString().slice(0, 10),
      reports: [
        {
          id: `${Date.now()}-${result.fileName}`,
          fileName: result.fileName,
          kind: result.kind,
          uploadedAt: new Date().toISOString(),
          rowCount,
        },
        ...current.reports,
      ],
    }));
    return records;
  }, []);

  return {
    state,
    snapshot,
    importParseResult,
    reset: resetPortfolio,
  };
}
