"use client";

import { useCallback, useSyncExternalStore } from "react";
import { purgeOrdersMatchingActivityVisits } from "@/lib/activity-import";
import { mergeAccounts, mergeOrders, mergeVisits, rowsToRecords } from "@/lib/parse";
import { isVisitStyleImport } from "@/lib/visit-rep-remap";
import { remapStoredVisitsForImport, remapVisitImportRecords } from "@/lib/visit-rep-remap";
import {
  getPortfolioSnapshot,
  getServerPortfolioSnapshot,
  resetPortfolio,
  setPortfolio,
  subscribePortfolio,
} from "@/lib/portfolio-store";
import type { ParseResult } from "@/lib/types";

export function usePortfolio() {
  const state = useSyncExternalStore(
    subscribePortfolio,
    getPortfolioSnapshot,
    getServerPortfolioSnapshot,
  );

  const importParseResult = useCallback((result: ParseResult) => {
    const records = rowsToRecords(result);
    remapVisitImportRecords(records, result.kind);
    const rowCount =
      result.kind === "orders"
        ? records.orders.length
        : result.kind === "visits"
          ? records.visits.length
          : records.accounts.length;
    setPortfolio((current) => {
      const orders = isVisitStyleImport(result.kind)
        ? purgeOrdersMatchingActivityVisits(current.orders, records.visits)
        : mergeOrders(current.orders, records.orders);

      return {
      accounts: mergeAccounts(current.accounts, records.accounts),
      orders,
      visits: mergeVisits(
        remapStoredVisitsForImport(current.visits, result.kind, records.visits),
        records.visits,
      ),
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
    };
    });
    return records;
  }, []);

  return {
    state,
    importParseResult,
    reset: resetPortfolio,
  };
}
