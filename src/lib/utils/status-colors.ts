/**
 * Shared utilities for 5-tier status colors
 * Provides consistent color mapping for pillar statuses across the app
 */

import type { PillarStatus } from "../../types/metrics-snapshot";
import {
  WIP_LIMIT,
  MULTI_PROJECT_THRESHOLDS,
} from "../../constants/thresholds";

/**
 * Get pillar status for WIP issue count
 * Lower is better: fewer WIP issues = better flow state
 *
 * Thresholds based on WIP_LIMIT (5):
 * - 1-2: Peak Flow (well under limit)
 * - 3-4: Strong Rhythm (comfortable room)
 * - 5: Steady Progress (at limit)
 * - 6-7: Early Traction (over limit)
 * - 8+: Low Traction (significantly over)
 */
export function getWIPCountStatus(count: number): PillarStatus {
  if (count <= 2) return "peakFlow";
  if (count <= 4) return "strongRhythm";
  if (count <= WIP_LIMIT) return "steadyProgress";
  if (count <= 7) return "earlyTraction";
  return "lowTraction";
}

/**
 * Get pillar status for active project count
 * Lower is better: single project focus = ideal
 *
 * Thresholds aligned with MULTI_PROJECT_THRESHOLDS:
 * - 1: Peak Flow (ideal single-project focus)
 * - 2: Steady Progress (split attention - CAUTION level)
 * - 3: Early Traction (too many - WARNING level)
 * - 4+: Low Traction (way too many - CRITICAL level)
 */
export function getProjectCountStatus(
  count: number | undefined
): PillarStatus | "unknown" {
  if (count === undefined || count === 0) return "unknown";
  if (count <= MULTI_PROJECT_THRESHOLDS.FOCUSED) return "peakFlow";
  if (count < MULTI_PROJECT_THRESHOLDS.WARNING) return "steadyProgress";
  if (count < MULTI_PROJECT_THRESHOLDS.CRITICAL) return "earlyTraction";
  return "lowTraction";
}

/**
 * Get badge classes for a pillar status
 * Returns classes for background, text, and border colors
 * Uses opaque backgrounds to avoid color shifting on different backgrounds
 */
export function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "peakFlow":
      return "bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-400";
    case "strongRhythm":
      return "bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-400";
    case "steadyProgress":
      return "bg-warning-100 dark:bg-warning-900 text-warning-700 dark:text-warning-400";
    case "earlyTraction":
      return "bg-danger-100 dark:bg-danger-900 text-danger-700 dark:text-danger-400";
    case "lowTraction":
      return "bg-danger-200 dark:bg-danger-900 text-danger-800 dark:text-danger-400";
    case "unknown":
    default:
      return "bg-black-100 dark:bg-black-800 text-black-500 dark:text-black-400";
  }
}

/**
 * Get text color class for a pillar status
 */
export function getStatusTextColor(status: string): string {
  switch (status) {
    case "peakFlow":
      return "text-success-400";
    case "strongRhythm":
      return "text-success-500";
    case "steadyProgress":
      return "text-warning-500";
    case "earlyTraction":
      return "text-danger-500";
    case "lowTraction":
      return "text-danger-600";
    case "unknown":
    default:
      return "text-neutral-400";
  }
}

/**
 * Get background color class for a pillar status (solid)
 */
export function getStatusBgColor(status: string): string {
  switch (status) {
    case "peakFlow":
      return "bg-success-400";
    case "strongRhythm":
      return "bg-success-500";
    case "steadyProgress":
      return "bg-warning-500";
    case "earlyTraction":
      return "bg-danger-500";
    case "lowTraction":
      return "bg-danger-600";
    case "unknown":
    default:
      return "bg-neutral-500";
  }
}

/**
 * Human-readable status labels
 */
const STATUS_LABELS: Record<PillarStatus | "unknown", string> = {
  peakFlow: "Peak Flow",
  strongRhythm: "Strong Rhythm",
  steadyProgress: "Steady Progress",
  earlyTraction: "Early Traction",
  lowTraction: "Low Traction",
  unknown: "Unknown",
};

/**
 * Get human-readable label for a pillar status
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as PillarStatus | "unknown"] ?? status;
}

/**
 * Concise WIP-specific status labels
 */
export function getWIPStatusLabel(count: number): string {
  const status = getWIPCountStatus(count);
  switch (status) {
    case "peakFlow":
      return "Excellent";
    case "strongRhythm":
      return "Good";
    case "steadyProgress":
      return "At Limit";
    case "earlyTraction":
      return "Over Limit";
    case "lowTraction":
      return "Critical";
  }
}

/**
 * Concise project-specific status labels
 */
export function getProjectStatusLabel(count: number | undefined): string {
  const status = getProjectCountStatus(count);
  switch (status) {
    case "peakFlow":
      return "Focused";
    case "steadyProgress":
      return "Split";
    case "earlyTraction":
      return "Spread Thin";
    case "lowTraction":
      return "Overloaded";
    case "unknown":
    default:
      return "—";
  }
}

/**
 * Get pillar status for gaps count (issue hygiene violations)
 * Lower is better: fewer gaps = better hygiene
 *
 * Thresholds:
 * - 0: Peak Flow (perfect hygiene)
 * - 1-2: Strong Rhythm (minimal gaps)
 * - 3-4: Steady Progress (some gaps)
 * - 5-6: Early Traction (concerning)
 * - 7+: Low Traction (critical)
 */
export function getGapsCountStatus(count: number): PillarStatus {
  if (count === 0) return "peakFlow";
  if (count <= 2) return "strongRhythm";
  if (count <= 4) return "steadyProgress";
  if (count <= 6) return "earlyTraction";
  return "lowTraction";
}

/**
 * Get pillar status for bug age in days
 * Lower is better: fresher bugs are easier to fix with context still fresh
 *
 * Thresholds:
 * - 0-7 days: Peak Flow (fresh, actively being addressed)
 * - 8-14 days: Strong Rhythm (still reasonable, within 2 weeks)
 * - 15-30 days: Steady Progress (getting stale, needs attention)
 * - 31-60 days: Early Traction (concerning, 1-2 months old)
 * - 61+ days: Low Traction (critical, context is fading)
 */
export function getBugAgeStatus(ageDays: number): PillarStatus {
  if (ageDays <= 7) return "peakFlow";
  if (ageDays <= 14) return "strongRhythm";
  if (ageDays <= 30) return "steadyProgress";
  if (ageDays <= 60) return "earlyTraction";
  return "lowTraction";
}

/**
 * Get text color class for bug age
 * Uses the status color mapping for consistency
 */
export function getBugAgeColorClass(ageDays: number): string {
  const status = getBugAgeStatus(ageDays);
  return getStatusTextColor(status);
}

/**
 * Calculate bug age in days from a created_at timestamp
 */
export function calculateBugAgeDays(createdAt: string | Date): number {
  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const now = new Date();
  return Math.floor(
    (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Format bug age for display
 */
export function formatBugAge(ageDays: number): string {
  if (ageDays === 0) return "< 1d";
  if (ageDays === 1) return "1d";
  return `${ageDays}d`;
}

/**
 * Get pillar status for WIP age in days
 * Lower is better: issues shouldn't stay in progress too long
 *
 * Thresholds based on 14-day trigger being worst:
 * - 0-3 days: Peak Flow (fresh, just started)
 * - 4-7 days: Strong Rhythm (healthy progress, within a week)
 * - 8-10 days: Steady Progress (getting long, over a week)
 * - 11-13 days: Early Traction (concerning, approaching trigger)
 * - 14+ days: Low Traction (critical, at or past 14-day trigger)
 */
export function getWIPAgeStatus(
  ageDays: number | null
): PillarStatus | "unknown" {
  if (ageDays === null) return "unknown";
  if (ageDays <= 3) return "peakFlow";
  if (ageDays <= 7) return "strongRhythm";
  if (ageDays <= 10) return "steadyProgress";
  if (ageDays <= 13) return "earlyTraction";
  return "lowTraction";
}

/**
 * Get text color class for WIP age
 * Uses the status color mapping for consistency
 */
export function getWIPAgeColorClass(ageDays: number | null): string {
  const status = getWIPAgeStatus(ageDays);
  if (status === "unknown") return "text-black-600 dark:text-black-500";
  return getStatusTextColor(status);
}
