import type { AccountHealth, HealthFactor } from "./types";

function factorMap(factors: HealthFactor[]): Map<string, HealthFactor> {
  return new Map(factors.map((factor) => [factor.key, factor]));
}

function pushUniqueReason(
  bucket: Array<{ weight: number; text: string }>,
  weight: number,
  text: string,
): void {
  if (bucket.some((entry) => entry.text === text)) return;
  bucket.push({ weight, text });
}

/** Human-readable drivers of scoreChange14d for account detail. */
export function explainHealthScoreChange(
  current: AccountHealth,
  prior: AccountHealth,
): string[] {
  const reasons: Array<{ weight: number; text: string }> = [];
  const priorFactors = factorMap(prior.factors);

  if ((current.recentOrders14d ?? 0) > 0) {
    pushUniqueReason(
      reasons,
      3,
      `${current.recentOrders14d} order${current.recentOrders14d === 1 ? "" : "s"} in the last 14 days.`,
    );
  }
  if ((current.recentVisits14d ?? 0) > 0) {
    pushUniqueReason(
      reasons,
      2.8,
      `${current.recentVisits14d} rep stop${current.recentVisits14d === 1 ? "" : "s"} logged in the last 14 days.`,
    );
  }

  for (const factor of current.factors) {
    const prev = priorFactors.get(factor.key);
    if (!prev) continue;
    const scoreDelta = factor.score - prev.score;
    const contributionDelta = factor.score * factor.weight - prev.score * prev.weight;
    if (scoreDelta === 0) continue;
    if (Math.abs(contributionDelta) < 0.35 && Math.abs(scoreDelta) < 2) continue;

    const direction = scoreDelta > 0 ? "up" : "down";
    const detailSnippet = factor.detail.trim().split(/(?<=[.!])\s+/)[0]?.trim() ?? "";
    const detailHint =
      detailSnippet.length > 0 && detailSnippet.length <= 120
        ? ` ${detailSnippet}`
        : "";
    pushUniqueReason(
      reasons,
      Math.abs(contributionDelta) + Math.abs(scoreDelta) * 0.05,
      `${factor.label} ${direction} ${Math.abs(scoreDelta)} points (${prev.score} → ${factor.score}).${detailHint}`,
    );
  }

  if (
    current.daysSinceOrder !== null &&
    prior.daysSinceOrder !== null &&
    current.daysSinceOrder < prior.daysSinceOrder - 1
  ) {
    pushUniqueReason(
      reasons,
      2.5,
      `New order activity — last order is now ${current.daysSinceOrder} days ago (was ${prior.daysSinceOrder} days ago).`,
    );
  } else if (
    current.lastOrderDate &&
    prior.lastOrderDate &&
    current.lastOrderDate !== prior.lastOrderDate &&
    (current.daysSinceOrder ?? 999) < (prior.daysSinceOrder ?? 999)
  ) {
    pushUniqueReason(
      reasons,
      2.5,
      `Last order date moved forward to ${current.lastOrderDate}.`,
    );
  }

  if (
    current.daysSinceVisit !== null &&
    prior.daysSinceVisit !== null &&
    current.daysSinceVisit < prior.daysSinceVisit - 1
  ) {
    pushUniqueReason(
      reasons,
      2.2,
      `Rep visit activity — last visit is now ${current.daysSinceVisit} days ago (was ${prior.daysSinceVisit} days ago).`,
    );
  } else if (
    current.lastVisitDate &&
    prior.lastVisitDate &&
    current.lastVisitDate !== prior.lastVisitDate &&
    (current.daysSinceVisit ?? 999) < (prior.daysSinceVisit ?? 999)
  ) {
    pushUniqueReason(
      reasons,
      2.2,
      `Last visit date moved forward to ${current.lastVisitDate}.`,
    );
  }

  if (current.visitCount90 > prior.visitCount90) {
    pushUniqueReason(
      reasons,
      1.8,
      `More stops in the 90-day window (${prior.visitCount90} → ${current.visitCount90} visits).`,
    );
  }

  if (
    current.avgVisitDurationMinutes90 != null &&
    prior.avgVisitDurationMinutes90 != null &&
    Math.abs(current.avgVisitDurationMinutes90 - prior.avgVisitDurationMinutes90) >= 8
  ) {
    const delta = Math.round(
      current.avgVisitDurationMinutes90 - prior.avgVisitDurationMinutes90,
    );
    pushUniqueReason(
      reasons,
      1.2,
      `Average time on site shifted ${delta > 0 ? "up" : "down"} by ${Math.abs(delta)} minutes (90-day avg).`,
    );
  }

  if (current.volume90 > prior.volume90 * 1.08 && prior.volume90 > 0) {
    pushUniqueReason(
      reasons,
      1.5,
      `90-day order volume increased vs the prior 14-day snapshot.`,
    );
  } else if (current.volume90 < prior.volume90 * 0.92 && current.volume90 >= 0) {
    pushUniqueReason(
      reasons,
      1.5,
      `90-day order volume decreased vs the prior 14-day snapshot.`,
    );
  }

  const net = current.score - prior.score;
  if (reasons.length === 0) {
    if (net === 0) {
      return ["Score unchanged vs 14 days ago — no material shifts in orders or visit factors."];
    }
    return [
      `Net score ${net > 0 ? "up" : "down"} ${Math.abs(net)} points vs 14 days ago; individual factors moved slightly.`,
    ];
  }

  return reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((entry) => entry.text);
}
