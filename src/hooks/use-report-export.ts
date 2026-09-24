"use client";

import { useCallback, useMemo, useState } from "react";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import {
  downloadFocusHealthPdf,
  type FocusHealthPdfInput,
} from "@/lib/report-export";
import { focusAccountsByHorizon } from "@/lib/score";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import { todayIso } from "@/lib/format";

export function useReportExport() {
  const { state, snapshot, repFilter } = useFilteredPortfolio();
  const [busy, setBusy] = useState(false);

  const enrichedAccounts = useMemo(
    () => enrichAccountsWithTerritoryValue(snapshot.accounts, state.orders),
    [snapshot.accounts, state.orders],
  );

  const focusByHorizon = useMemo(
    () => focusAccountsByHorizon(enrichedAccounts),
    [enrichedAccounts],
  );

  const generatedAt = state.analysisAsOf ?? snapshot.asOf ?? todayIso();

  const printInput = useMemo((): FocusHealthPdfInput | null => {
    if (snapshot.accounts.length === 0) return null;
    return {
      repFilter,
      asOf: snapshot.asOf,
      generatedAt,
      focusByHorizon,
    };
  }, [
    repFilter,
    snapshot.asOf,
    generatedAt,
    focusByHorizon,
    snapshot.accounts.length,
  ]);

  const canExport = printInput !== null;

  const exportReport = useCallback(async () => {
    if (!printInput) {
      throw new Error("Upload account data to generate a report.");
    }
    setBusy(true);
    try {
      downloadFocusHealthPdf(printInput);
    } finally {
      setBusy(false);
    }
  }, [printInput]);

  return {
    busy,
    canExport,
    exportReport,
  };
}
