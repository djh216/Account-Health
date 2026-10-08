"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FREQUENCY_DROP_ROSTER_CHANGE_EVENT,
  syncFrequencyDropRoster,
  type FrequencyDropClearance,
} from "@/lib/frequency-drop-roster";
import type { AccountFrequencyAlert } from "@/lib/frequency-alerts";

export function useFrequencyDropRoster(
  portfolioKey: string,
  repFilter: string,
  alerts: AccountFrequencyAlert[],
  asOf: string,
  enabled: boolean,
) {
  const [recentClearances, setRecentClearances] = useState<FrequencyDropClearance[]>(
    [],
  );

  const alertSignature = useMemo(
    () => alerts.map((a) => a.id).sort().join("|"),
    [alerts],
  );

  useEffect(() => {
    if (!enabled) return;

    const apply = () => {
      const synced = syncFrequencyDropRoster({
        portfolioKey,
        repFilter,
        alerts,
        asOf,
      });
      setRecentClearances(synced.recentClearances);
    };

    apply();
    window.addEventListener(FREQUENCY_DROP_ROSTER_CHANGE_EVENT, apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener(FREQUENCY_DROP_ROSTER_CHANGE_EVENT, apply);
      window.removeEventListener("storage", apply);
    };
  }, [alertSignature, portfolioKey, repFilter, asOf, enabled, alerts]);

  const visibleClearances = enabled ? recentClearances : [];

  return {
    recentClearances: visibleClearances,
    recentClearanceCount: visibleClearances.length,
  };
}
