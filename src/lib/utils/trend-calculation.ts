/**
 * Trend Calculation Utilities
 *
 * Functions for calculating trend direction and percentage change
 * from historical metrics data.
 */

import type { TrendDataPoint } from "../../routes/api/metrics/trends/+server";

export interface TrendResult {
  direction: "up" | "down" | "stable";
  percentChange: number;
  hasEnoughData: boolean;
  /** Actual number of days the comparison spans */
  actualDays?: number;
}

/**
 * Calculate the trend for a metric by comparing current value to historical value
 *
 * @param currentValue - The current metric value
 * @param historicalValue - The historical value to compare against
 * @param threshold - Minimum percentage change to consider a trend (default 2%)
 * @returns TrendResult with direction, change percentage, and data availability
 */
export function calculateTrend(
  currentValue: number,
  historicalValue: number,
  threshold = 2
): TrendResult {
  // Calculate absolute percentage point change (not relative)
  // e.g., 20% -> 30% = +10 percentage points, not +50% relative
  const percentChange = currentValue - historicalValue;

  // Determine direction based on threshold
  let direction: "up" | "down" | "stable";
  if (Math.abs(percentChange) < threshold) {
    direction = "stable";
  } else if (percentChange > 0) {
    direction = "up";
  } else {
    direction = "down";
  }

  return {
    direction,
    percentChange: Math.abs(percentChange),
    hasEnoughData: true,
  };
}

/**
 * Get the oldest data point from the dataset
 */
export function getOldestDataPoint(
  dataPoints: TrendDataPoint[]
): TrendDataPoint | null {
  if (dataPoints.length === 0) return null;
  // Data points are sorted chronologically (oldest first)
  return dataPoints[0];
}

/**
 * Get data points from a specific time period ago, or fall back to oldest available
 *
 * @param dataPoints - All available trend data points (sorted chronologically)
 * @param daysAgo - Number of days back to look
 * @param windowDays - How many days of data to include (default 1)
 * @returns Object with data points and actual days span
 */
export function getDataPointsFromPeriodOrOldest(
  dataPoints: TrendDataPoint[],
  daysAgo: number,
  windowDays = 1
): { points: TrendDataPoint[]; actualDays: number } {
  if (dataPoints.length === 0) {
    return { points: [], actualDays: 0 };
  }

  const now = new Date();
  const targetStart = new Date(now);
  targetStart.setDate(targetStart.getDate() - daysAgo - windowDays);
  const targetEnd = new Date(now);
  targetEnd.setDate(targetEnd.getDate() - daysAgo);

  // Try to get points from the target period
  const periodPoints = dataPoints.filter((dp) => {
    const capturedAt = new Date(dp.capturedAt);
    return capturedAt >= targetStart && capturedAt <= targetEnd;
  });

  if (periodPoints.length > 0) {
    return { points: periodPoints, actualDays: daysAgo };
  }

  // Fall back to oldest available data point
  const oldest = dataPoints[0];
  const oldestDate = new Date(oldest.capturedAt);
  const actualDays = Math.max(
    1,
    Math.round((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  return { points: [oldest], actualDays };
}

/**
 * Extract metric values from trend data points for a specific pillar
 */
export type MetricExtractor = (dp: TrendDataPoint) => number | null;

export const metricExtractors = {
  wipHealth: (dp: TrendDataPoint) => dp.teamHealth.healthyWorkloadPercent,
  projectHealth: (dp: TrendDataPoint) => dp.velocityHealth.onTrackPercent,
  productivity: (dp: TrendDataPoint) =>
    dp.productivity.trueThroughputPerEngineer,
  quality: (dp: TrendDataPoint) => dp.quality.compositeScore,
} as const;

/**
 * Calculate trends for a metric over week and month periods.
 * Always shows trends using available data - falls back to oldest snapshot
 * if we don't have data from the exact target period.
 *
 * @param dataPoints - All trend data points (sorted chronologically, oldest first)
 * @param extractor - Function to extract the metric value from a data point
 * @param currentValue - Current metric value (if different from latest data point)
 * @returns Object with week and month trend results
 */
export function calculateMetricTrends(
  dataPoints: TrendDataPoint[],
  extractor: MetricExtractor,
  currentValue?: number
): { week: TrendResult; month: TrendResult } {
  const noData: TrendResult = {
    direction: "stable",
    percentChange: 0,
    hasEnoughData: false,
  };

  // Need at least 1 data point to compare against
  if (dataPoints.length === 0) {
    return { week: noData, month: noData };
  }

  // Get current value - prefer explicitly provided, fall back to latest data point
  const current = currentValue ?? extractor(dataPoints[dataPoints.length - 1]);

  if (current === null || current === undefined) {
    return { week: noData, month: noData };
  }

  // For comparison, we need historical data that's older than "now"
  // If currentValue was provided externally, we can use all data points as historical
  // If not, we need at least 2 points (one for current, one for historical)
  const historicalPoints =
    currentValue !== undefined ? dataPoints : dataPoints.slice(0, -1); // Exclude the latest if we're using it as current

  if (historicalPoints.length === 0) {
    return { week: noData, month: noData };
  }

  // Calculate how many days of historical data we have
  const oldestDate = new Date(historicalPoints[0].capturedAt);
  const now = new Date();
  const totalDaysOfData = Math.max(
    1,
    Math.round((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Get data for week comparison (7 days ago, with 2-day window, or oldest)
  const weekData = getDataPointsFromPeriodOrOldest(historicalPoints, 7, 2);
  const weekValues = weekData.points
    .map(extractor)
    .filter((v): v is number => v !== null);

  // Calculate week trend
  let weekTrend: TrendResult = noData;
  if (weekValues.length > 0) {
    const weekAvg =
      weekValues.reduce((sum, v) => sum + v, 0) / weekValues.length;
    weekTrend = {
      ...calculateTrend(current, weekAvg),
      actualDays: weekData.actualDays || totalDaysOfData,
    };
  }

  // Get data for month comparison (30 days ago, with 3-day window)
  // Only show month trend if we have data from at least 14 days ago
  // (so it's meaningfully different from the week trend)
  let monthTrend: TrendResult = noData;

  if (totalDaysOfData >= 14) {
    const monthData = getDataPointsFromPeriodOrOldest(historicalPoints, 30, 3);
    const monthValues = monthData.points
      .map(extractor)
      .filter((v): v is number => v !== null);

    if (monthValues.length > 0) {
      const monthAvg =
        monthValues.reduce((sum, v) => sum + v, 0) / monthValues.length;
      monthTrend = {
        ...calculateTrend(current, monthAvg),
        actualDays: monthData.actualDays,
      };
    }
  }

  return { week: weekTrend, month: monthTrend };
}

/**
 * Check if we have enough historical data for a period
 */
export function hasEnoughDataForPeriod(
  dataPoints: TrendDataPoint[],
  daysAgo: number,
  windowDays = 1
): boolean {
  const { points } = getDataPointsFromPeriodOrOldest(
    dataPoints,
    daysAgo,
    windowDays
  );
  return points.length > 0;
}
