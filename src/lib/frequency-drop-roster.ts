import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import type { AccountFrequencyAlert } from "./frequency-alerts";

export const FREQUENCY_DROP_ROSTER_CHANGE_EVENT =
  "cellar-pulse-frequency-drop-roster-change";

const STORAGE_KEY = "cellar-pulse.frequency-drop-roster.v1";

/** Accounts that cleared the report within this window count as "recent". */
export const FREQUENCY_DROP_RECENT_CLEARANCE_DAYS = 28;

export type FrequencyDropClearance = {
  id: string;
  accountName: string;
  clearedAt: string;
};

type RosterBucket = {
  onReport: Record<string, string>;
  recentClearances: FrequencyDropClearance[];
};

type RosterStore = Record<string, RosterBucket>;

function rosterScopeKey(portfolioKey: string, repFilter: string): string {
  return `${portfolioKey}::${repFilter}`;
}

function readStore(): RosterStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as RosterStore;
  } catch {
    return {};
  }
}

function writeStore(store: RosterStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(FREQUENCY_DROP_ROSTER_CHANGE_EVENT));
  } catch {
    // ignore storage write errors
  }
}

function pruneClearances(
  clearances: FrequencyDropClearance[],
  asOf: string,
): FrequencyDropClearance[] {
  const asOfDate = parseISO(asOf.slice(0, 10));
  const cutoff = subDays(asOfDate, FREQUENCY_DROP_RECENT_CLEARANCE_DAYS * 3);
  return clearances.filter((entry) => parseISO(entry.clearedAt.slice(0, 10)) >= cutoff);
}

export function syncFrequencyDropRoster({
  portfolioKey,
  repFilter,
  alerts,
  asOf,
}: {
  portfolioKey: string;
  repFilter: string;
  alerts: AccountFrequencyAlert[];
  asOf: string;
}): {
  recentClearances: FrequencyDropClearance[];
  recentClearanceCount: number;
} {
  if (typeof window === "undefined") {
    return { recentClearances: [], recentClearanceCount: 0 };
  }

  const scope = rosterScopeKey(portfolioKey, repFilter);
  const store = readStore();
  const bucket: RosterBucket = store[scope] ?? {
    onReport: {},
    recentClearances: [],
  };

  const currentOnReport = new Map<string, string>();
  for (const alert of alerts) {
    currentOnReport.set(alert.id, alert.accountName);
  }

  const previousIds = new Set(Object.keys(bucket.onReport));
  const clearedAt = new Date().toISOString();
  let clearances = [...bucket.recentClearances];

  for (const id of previousIds) {
    if (currentOnReport.has(id)) continue;
    const accountName = bucket.onReport[id] ?? id;
    clearances = clearances.filter((entry) => entry.id !== id);
    clearances.push({ id, accountName, clearedAt });
  }

  for (const id of currentOnReport.keys()) {
    clearances = clearances.filter((entry) => entry.id !== id);
  }

  clearances.sort(
    (a, b) => b.clearedAt.localeCompare(a.clearedAt),
  );
  clearances = pruneClearances(clearances, asOf);

  const onReport: Record<string, string> = {};
  for (const [id, accountName] of currentOnReport) {
    onReport[id] = accountName;
  }

  store[scope] = {
    onReport,
    recentClearances: clearances,
  };
  writeStore(store);

  const asOfDate = parseISO(asOf.slice(0, 10));
  const recentCutoff = subDays(asOfDate, FREQUENCY_DROP_RECENT_CLEARANCE_DAYS);
  const recentClearances = clearances.filter(
    (entry) => parseISO(entry.clearedAt.slice(0, 10)) >= recentCutoff,
  );

  return {
    recentClearances,
    recentClearanceCount: recentClearances.length,
  };
}

export function readFrequencyDropRecentClearances(
  portfolioKey: string,
  repFilter: string,
  asOf: string,
): FrequencyDropClearance[] {
  const scope = rosterScopeKey(portfolioKey, repFilter);
  const bucket = readStore()[scope];
  if (!bucket) return [];
  const asOfDate = parseISO(asOf.slice(0, 10));
  const recentCutoff = subDays(asOfDate, FREQUENCY_DROP_RECENT_CLEARANCE_DAYS);
  return bucket.recentClearances.filter(
    (entry) => parseISO(entry.clearedAt.slice(0, 10)) >= recentCutoff,
  );
}

/** Days since an account left the frequency drop report. */
export function daysSinceFrequencyDropClearance(
  clearedAt: string,
  asOf: string,
): number {
  return differenceInCalendarDays(
    parseISO(asOf.slice(0, 10)),
    parseISO(clearedAt.slice(0, 10)),
  );
}
