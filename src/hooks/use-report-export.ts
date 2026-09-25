"use client";

import { useCallback, useMemo, useState } from "react";
import { useFilteredPortfolio } from "@/hooks/use-filtered-portfolio";
import {
  downloadFrequencyAlertsPdf,
  type FrequencyAlertsPdfInput,
} from "@/lib/report-export";
import { enrichAccountsWithTerritoryValue } from "@/lib/territory-value";
import { detectOrderFrequencyDrops } from "@/lib/frequency-alerts";
import { todayIso } from "@/lib/format";

export function useReportExport() {
  const { state, snapshot, repFilter } = useFilteredPortfolio();
  const [busy, setBusy] = useState(false);

  const enrichedAccounts = useMemo(
    () => enrichAccountsWithTerritoryValue(snapshot.accounts, state.orders),
    [snapshot.accounts, state.orders],
  );

  const alerts = useMemo(
    () =>
      detectOrderFrequencyDrops(
        enrichedAccounts,
        state.orders,
        state.analysisAsOf ?? snapshot.asOf,
      ),
    [enrichedAccounts, state.orders, state.analysisAsOf, snapshot.asOf],
  );

  const generatedAt = state.analysisAsOf ?? snapshot.asOf ?? todayIso();

  const printInput = useMemo((): FrequencyAlertsPdfInput | null => {
    if (snapshot.accounts.length === 0) return null;
    return {
      repFilter,
      asOf: state.analysisAsOf ?? snapshot.asOf ?? todayIso(),
      generatedAt,
      alerts,
    };
  }, [
    repFilter,
    state.analysisAsOf,
    snapshot.asOf,
    generatedAt,
    alerts,
    snapshot.accounts.length,
  ]);

  const canExport = printInput !== null;

  const exportReport = useCallback(async () => {
    if (!printInput) {
      throw new Error("Upload account data to generate a report.");
    }
    setBusy(true);
    try {
      downloadFrequencyAlertsPdf(printInput);
    } finally {
      setBusy(false);
    }
  }, [printInput]);

  return {
    busy,
    canExport,
    alertsCount: alerts.length,
    exportReport,
  };
}
