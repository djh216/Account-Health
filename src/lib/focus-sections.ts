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
      "Risk first, then value tier, then weakest health scores.",
  },
  {
    horizon: "two_weeks",
    title: "Focus 2 weeks out · next 10 priorities",
    description:
      "Accounts ranked 11–20 by the same risk, tier, and score order.",
  },
  {
    horizon: "three_weeks",
    title: "Focus 3 weeks out · next 10 priorities",
    description:
      "Accounts ranked 21–30 — longer-range plan using the same priority order.",
  },
];
