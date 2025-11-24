/**
 * Threshold constants used throughout the application
 * Centralizes magic numbers and makes them easily configurable
 */

/**
 * Comment tracking thresholds
 */
export const COMMENT_THRESHOLDS = {
  /** Hours before considering a comment "old" */
  RECENT_HOURS: 24,
  /** Days to keep comment logs before cleanup */
  LOG_RETENTION_DAYS: 30,
} as const;

/**
 * WIP (Work in Progress) constraint thresholds
 */
export const WIP_THRESHOLDS = {
  /** Ideal maximum issues per assignee */
  IDEAL: 5,
  /** Warning threshold for assignee issue count */
  WARNING: 6,
  /** Critical threshold for assignee issue count */
  CRITICAL: 8,
  /** "OK" badge threshold */
  OK: 4,
} as const;

/**
 * Project activity thresholds
 */
export const PROJECT_THRESHOLDS = {
  /** Days without update to consider project stale */
  STALE_DAYS: 7,
  /** Days for determining recent activity */
  RECENT_ACTIVITY_DAYS: 14,
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
 * Rate limiting
 */
export const RATE_LIMITS = {
  /** Milliseconds to wait between API comment requests */
  COMMENT_DELAY_MS: 500,
} as const;

/**
 * UI pagination
 */
export const UI_CONSTANTS = {
  /** Default terminal width fallback */
  DEFAULT_TERMINAL_WIDTH: 80,
  /** Default terminal height fallback */
  DEFAULT_TERMINAL_HEIGHT: 24,
  /** Lines reserved for header/footer in views */
  HEADER_FOOTER_LINES: 7,
  /** Lines reserved for header/footer in list views with extra info */
  LIST_VIEW_HEADER_LINES: 8,
  /** Lines reserved in projects view (projects are tall) */
  PROJECTS_VIEW_LINES_PER_ITEM: 7,
  /** Minimum visible lines to show */
  MIN_VISIBLE_LINES: 5,
} as const;

/**
 * Text truncation
 */
export const TEXT_LIMITS = {
  /** Max issue title length before truncation in list views */
  ISSUE_TITLE_SHORT: 40,
  /** Max issue title length in detailed views */
  ISSUE_TITLE_MEDIUM: 50,
  /** Max issue title length in wide views */
  ISSUE_TITLE_LONG: 60,
  /** Max description preview length */
  DESCRIPTION_PREVIEW: 300,
  /** Max assignee name width in tables */
  ASSIGNEE_NAME_WIDTH: 35,
  /** Max team name width in tables */
  TEAM_NAME_WIDTH: 30,
  /** Max project name width in tables */
  PROJECT_NAME_WIDTH: 50,
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
  /** Safety limit to prevent infinite loops */
  MAX_PAGES: 100,
} as const;

