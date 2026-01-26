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
 */
export function getStatusBadgeClasses(
  status: PillarStatus | "unknown"
): string {
  switch (status) {
    case "peakFlow":
      return "bg-success-400/20 text-success-400 border-success-400/30";
    case "strongRhythm":
      return "bg-success-500/20 text-success-500 border-success-500/30";
    case "steadyProgress":
      return "bg-warning-500/20 text-warning-500 border-warning-500/30";
    case "earlyTraction":
      return "bg-danger-500/20 text-danger-500 border-danger-500/30";
    case "lowTraction":
      return "bg-danger-600/20 text-danger-600 border-danger-600/30";
    case "unknown":
    default:
      return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
  }
}

/**
 * Get text color class for a pillar status
 */
export function getStatusTextColor(status: PillarStatus | "unknown"): string {
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
export function getStatusBgColor(status: PillarStatus | "unknown"): string {
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
export function getStatusLabel(status: PillarStatus | "unknown"): string {
  return STATUS_LABELS[status];
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
