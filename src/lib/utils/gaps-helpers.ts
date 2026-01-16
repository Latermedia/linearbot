/**
 * Shared utilities for gaps (formerly violations) display
 */

/**
 * Get the color class for gaps count display
 * - >5: red (critical)
 * - >2: amber (warning)
 * - ≤2: green (healthy)
 */
export function getGapsColorClass(count: number): string {
  if (count > 5) return "text-red-500 dark:text-red-400";
  if (count > 2) return "text-amber-500 dark:text-amber-400";
  return "text-green-500 dark:text-green-400";
}

/**
 * Get simple binary color class for gaps (has gaps vs no gaps)
 * Used for summary stats where we just care if there are any gaps
 */
export function getGapsBinaryColorClass(count: number): string {
  return count > 0
    ? "text-amber-500 dark:text-amber-400"
    : "text-emerald-500 dark:text-emerald-400";
}
