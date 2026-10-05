import type { FocusHorizon } from "./types";

export const FOCUS_SECTIONS: Array<{
  horizon: FocusHorizon;
  title: string;
  description: string;
}> = [
  {
    horizon: "this_week",
    title: "Focus this week · top 10 priorities",
    description:
      "Risk, visit cadence vs tier policy, value tier, then health score (action plan order).",
  },
  {
    horizon: "two_weeks",
    title: "Focus 2 weeks out · next 10 priorities",
    description:
      "Accounts ranked 11–20 by the action plan order (risk, visit cadence, tier, score).",
  },
  {
    horizon: "three_weeks",
    title: "Focus 3 weeks out · next 10 priorities",
    description:
      "Accounts ranked 21–30 — same visit-cadence and tier-weighted priority order.",
  },
];
