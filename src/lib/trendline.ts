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
    const newItem = { ...item } as T & Record<string, number>;
    for (const def of definitions) {
      const series = trendSeriesMap.get(def.trendKey);
      if (series && idx < series.length) {
        newItem[def.trendKey] = series[idx];
      }
    }
    return newItem;
  });

  return {
    data: augmentedData,
    statsMap,
  };
}
