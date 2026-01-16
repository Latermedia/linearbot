/**
 * Threshold constants used throughout the application
 * Centralizes magic numbers and makes them easily configurable
 */

/** Hard limit for WIP issues per engineer */
export const WIP_LIMIT = 5;

/**
 * Project activity thresholds
 */
export const PROJECT_THRESHOLDS = {
  /** Days without update to consider project stale */
  STALE_DAYS: 7,
  /** Days for determining recent activity */
  RECENT_ACTIVITY_DAYS: 14,
  /** Days for deep history sync (1 year) */
  DEEP_HISTORY_DAYS: 365,
} as const;

/**
 * WIP age thresholds
 */
export const WIP_AGE_THRESHOLDS = {
  /** Days before considering a started issue stale (WIP age violation) */
  WIP_AGE_DAYS: 14,
} as const;

/**
 * Multi-project thresholds for engineers
 */
export const MULTI_PROJECT_THRESHOLDS = {
  /** Ideal: engineer on 1 project */
  FOCUSED: 1,
  /** Caution: engineer on 2 projects */
  CAUTION: 2,
  /** Warning: engineer on 3+ projects */
  WARNING: 3,
  /** Critical: engineer on 4+ projects */
  CRITICAL: 4,
} as const;

/**
 * Text truncation
 */
export const TEXT_LIMITS = {
  /** Max description preview length */
  DESCRIPTION_PREVIEW: 300,
} as const;

/**
 * Timeout durations
 */
export const TIMEOUTS = {
  /** Status message display time (ms) */
  STATUS_MESSAGE_MS: 3000,
  /** Notification auto-clear time (ms) */
  NOTIFICATION_MS: 2000,
  /** Linear API connection timeout (ms) */
  API_TIMEOUT_MS: 10000,
} as const;

/**
 * Pagination limits
 */
export const PAGINATION = {
  /** GraphQL query page size */
  GRAPHQL_PAGE_SIZE: 100,
  /** Smaller page size for queries with nested data (to stay under complexity limits) */
  GRAPHQL_PAGE_SIZE_WITH_NESTED: 25,
  /** Safety limit to prevent infinite loops */
  MAX_PAGES: 100,
} as const;
