import type { Visit } from "./types";

/** Ignore Outfield home-base / warehouse outliers when averaging time on site. */
export const VISIT_DURATION_SCORE_CAP_MINUTES = 180;

export function cappedVisitDurationMinutes(minutes: number | undefined | null): number | null {
  if (minutes === undefined || minutes === null || !Number.isFinite(minutes)) return null;
  const value = Math.max(0, minutes);
  if (value <= 0) return null;
  return Math.min(value, VISIT_DURATION_SCORE_CAP_MINUTES);
}

export function visitDurationStats(recentVisits: Visit[]): {
  avgMinutes: number | null;
  lastVisitMinutes: number | null;
  stopsWithDuration: number;
} {
  const withDuration = recentVisits
    .map((visit) => cappedVisitDurationMinutes(visit.durationMinutes))
    .filter((value): value is number => value !== null);

  if (withDuration.length === 0) {
    return { avgMinutes: null, lastVisitMinutes: null, stopsWithDuration: 0 };
  }

  const avgMinutes =
    withDuration.reduce((sum, value) => sum + value, 0) / withDuration.length;

  const lastVisit = [...recentVisits]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((visit) => cappedVisitDurationMinutes(visit.durationMinutes) !== null);

  return {
    avgMinutes,
    lastVisitMinutes: lastVisit
      ? cappedVisitDurationMinutes(lastVisit.durationMinutes)
      : null,
    stopsWithDuration: withDuration.length,
  };
}

export function visitDurationEngagementScore(recentVisits: Visit[]): {
  score: number;
  detail: string;
} {
  const { avgMinutes, lastVisitMinutes, stopsWithDuration } =
    visitDurationStats(recentVisits);

  if (avgMinutes === null) {
    return {
      score: 50,
      detail: "No duration on file for stops in the last 90 days (map Duration on activity upload).",
    };
  }

  let score: number;
  if (avgMinutes < 8) {
    score = 32;
  } else if (avgMinutes < 20) {
    score = 55;
  } else if (avgMinutes < 45) {
    score = 78;
  } else if (avgMinutes < 90) {
    score = 92;
  } else {
    score = 86;
  }

  const lastPart =
    lastVisitMinutes !== null
      ? ` Last stop ${Math.round(lastVisitMinutes)} min.`
      : "";
  const detail =
    `Avg ${Math.round(avgMinutes)} min per stop (${stopsWithDuration} with duration in 90d).${lastPart}`.trim();

  return { score, detail };
}
