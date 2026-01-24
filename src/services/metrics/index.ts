/**
 * Metrics Service
 *
 * Four Pillars metrics capture and analysis.
 */

// Snapshot capture
export {
  captureMetricsSnapshots,
  captureOrgSnapshot,
  getMetricsSummary,
  type CaptureResult,
} from "./capture-snapshot.js";

// Team Health pillar
export {
  calculateTeamHealth,
  calculateTeamHealthForTeam,
  calculateTeamHealthForDomain,
  hasProjectViolation,
  hasProjectWipViolation, // deprecated, use hasProjectViolation
  getProjectEngineersInViolation,
  type EngineerTeamMapping,
} from "./team-health.js";

// Velocity Health pillar
export {
  calculateVelocityHealth,
  calculateVelocityHealthForTeam,
  calculateVelocityHealthForDomain,
  calculateEffectiveHealth,
  calculateDaysOffTarget,
  getProjectsNeedingAttention,
} from "./velocity-health.js";

// Quality Health pillar
export {
  calculateQualityHealth,
  calculateQualityHealthForTeam,
  calculateQualityHealthForDomain,
  isBugIssue,
  getOldestOpenBugs,
  getBugTrends,
} from "./quality-health.js";

// Team Productivity pillar (GetDX integration)
export {
  calculateProductivityHealthForOrg,
  calculateProductivityHealthForDomain,
  calculateProductivityHealthForTeam,
  type ProductivityStatus,
  type ProductivityHealthResult,
  type ProductivityPendingResult,
} from "./productivity-health.js";
