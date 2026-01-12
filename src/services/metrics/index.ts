/**
 * Metrics Service
 *
 * Four Pillars metrics capture and analysis for leadership reviews.
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
  hasProjectWipViolation,
  getProjectEngineersInViolation,
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
