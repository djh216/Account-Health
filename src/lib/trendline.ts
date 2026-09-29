/**
 * Linear regression and trendline calculation utilities for charting
 */

export interface TrendlineStats {
  slope: number;
  intercept: number;
  rSquared: number;
  direction: "up" | "down" | "flat";
  totalDelta: number;
  pctChange: number | null;
  formattedSlope: string;
}

export interface TrendlineDefinition {
  sourceKey: string;
  trendKey: string;
}

/**
 * Calculates ordinary least squares (OLS) linear regression for a 1D numeric array.
 * Values: y_i for x_i = 0, 1, ..., n-1
 */
export function calculateLinearFit(values: number[]): {
  values: number[];
  stats: TrendlineStats;
} {
  const n = values.length;
  if (n === 0) {
    return {
      values: [],
      stats: {
        slope: 0,
        intercept: 0,
        rSquared: 0,
        direction: "flat",
        totalDelta: 0,
        pctChange: 0,
        formattedSlope: "0 / period",
      },
    };
  }

  if (n === 1) {
    return {
      values: [values[0]],
      stats: {
        slope: 0,
        intercept: values[0],
        rSquared: 1,
        direction: "flat",
        totalDelta: 0,
        pctChange: 0,
        formattedSlope: "0 / period",
      },
    };
  }

  // Mean of X and Y
  const xMean = (n - 1) / 2;
  const ySum = values.reduce((acc, v) => acc + v, 0);
  const yMean = ySum / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const xDiff = i - xMean;
    const yDiff = values[i] - yMean;
    num += xDiff * yDiff;
    den += xDiff * xDiff;
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  // Calculate R-squared and predicted points
  let ssTot = 0;
  let ssRes = 0;
  const trendPoints: number[] = [];

  for (let i = 0; i < n; i++) {
    const yPred = slope * i + intercept;
    // Keep trendline bounded at 0 for volume/revenue
    const boundedY = Math.max(0, Math.round(yPred * 10) / 10);
    trendPoints.push(boundedY);

    ssTot += Math.pow(values[i] - yMean, 2);
    ssRes += Math.pow(values[i] - yPred, 2);
  }

  const rSquared = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  const totalDelta = Math.round(slope * (n - 1) * 10) / 10;
  const startVal = intercept;
  const pctChange =
    startVal > 0 ? Math.round(((slope * (n - 1)) / startVal) * 100) : null;

  let direction: "up" | "down" | "flat" = "flat";
  if (slope > 0.05) direction = "up";
  else if (slope < -0.05) direction = "down";

  const formattedSlope = `${slope > 0 ? "+" : ""}${slope.toFixed(1)} / period`;

  return {
    values: trendPoints,
    stats: {
      slope: Math.round(slope * 100) / 100,
      intercept: Math.round(intercept * 10) / 10,
      rSquared: Math.round(rSquared * 100) / 100,
      direction,
      totalDelta,
      pctChange,
      formattedSlope,
    },
  };
}

/**
 * Augments an array of chart objects with linear trendline data keys.
 */
export function augmentDataWithTrendlines<T extends Record<string, unknown>>(
  data: T[],
  definitions: TrendlineDefinition[]
): {
  data: (T & Record<string, number>)[];
  statsMap: Map<string, TrendlineStats>;
} {
  if (!data || data.length === 0) {
    return { data: [], statsMap: new Map() };
  }

  const statsMap = new Map<string, TrendlineStats>();
  const trendSeriesMap = new Map<string, number[]>();

  for (const def of definitions) {
    const values = data.map((d) => {
      const val = d[def.sourceKey];
      return typeof val === "number" && !isNaN(val) ? val : 0;
    });

    const fit = calculateLinearFit(values);
    statsMap.set(def.sourceKey, fit.stats);
    trendSeriesMap.set(def.trendKey, fit.values);
  }

  const augmentedData = data.map((item, idx) => {
    const newItem: Record<string, unknown> = { ...item };
    for (const def of definitions) {
      const series = trendSeriesMap.get(def.trendKey);
      if (series && idx < series.length) {
        newItem[def.trendKey] = series[idx];
      }
    }
    return newItem as T & Record<string, number>;
  });

  return {
    data: augmentedData,
    statsMap,
  };
}

/**
 * Returns a sanitized key for trendline property mapping in Recharts to prevent dot-notation path splitting
 */
export function getSafeTrendKey(sourceKey: string): string {
  return `trend__${sourceKey.replace(/\./g, "_")}`;
}

/**
 * Provides a user-friendly confidence classification for R-squared goodness of fit
 */
export function describeFitConfidence(rSquared: number): {
  label: string;
  badgeClass: string;
} {
  if (rSquared >= 0.7) {
    return {
      label: "Strong Fit",
      badgeClass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    };
  }
  if (rSquared >= 0.4) {
    return {
      label: "Moderate Fit",
      badgeClass:
        "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800",
    };
  }
  return {
    label: "Volatile / Weak Fit",
    badgeClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  };
}

/**
 * Formats trendline slope with unit and granularity period
 */
export function formatTrendSlope(
  slope: number,
  unit: string = "btls",
  granularity: string = "monthly"
): string {
  const periodLabel = granularity === "weekly" ? "wk" : "mo";
  const sign = slope > 0 ? "+" : "";
  if (unit === "$") {
    return `${sign}$${Math.abs(Math.round(slope)).toLocaleString()} / ${periodLabel}`;
  }
  return `${sign}${slope.toFixed(1)} ${unit} / ${periodLabel}`;
}
