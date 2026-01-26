import { z } from "zod";

/**
 * Metrics Snapshot Schema Version Registry
 *
 * This file contains versioned Zod schemas for metrics snapshots.
 * When evolving the schema:
 * 1. Create a new schema version (e.g., MetricsSnapshotV2)
 * 2. Update CURRENT_SCHEMA_VERSION
 * 3. Add migration logic if needed for historical queries
 */

export const CURRENT_SCHEMA_VERSION = 1;

// ============================================================================
// Status Enums
// ============================================================================

// Core status values (new schema)
const CorePillarStatusSchema = z.enum([
  "peakFlow",
  "strongRhythm",
  "steadyProgress",
  "earlyTraction",
  "lowTraction",
]);

// Legacy status values (old schema) - mapped to new values during parsing
const LegacyPillarStatusSchema = z.enum(["healthy", "warning", "critical"]);

// Map legacy status to new pillar status
function mapLegacyStatus(legacy: string): PillarStatus {
  switch (legacy) {
    case "healthy":
      return "peakFlow";
    case "warning":
      return "steadyProgress";
    case "critical":
      return "lowTraction";
    default:
      return "steadyProgress";
  }
}

// Combined schema that accepts both old and new values, normalizing to new
export const PillarStatusSchema = z
  .union([CorePillarStatusSchema, LegacyPillarStatusSchema])
  .transform((val): PillarStatus => {
    if (["healthy", "warning", "critical"].includes(val)) {
      return mapLegacyStatus(val);
    }
    return val as PillarStatus;
  });

export type PillarStatus = z.infer<typeof CorePillarStatusSchema>;

/** Display labels for pillar statuses */
export const PillarStatusLabels: Record<PillarStatus, string> = {
  peakFlow: "Peak Flow",
  strongRhythm: "Strong Rhythm",
  steadyProgress: "Steady Progress",
  earlyTraction: "Early Traction",
  lowTraction: "Low Traction",
};

export const PendingStatusSchema = z.literal("pending");

/** Health source: "human" = Self-reported, "velocity" = Trajectory Alert */
export const HealthSourceSchema = z.enum(["human", "velocity"]);
export type HealthSource = z.infer<typeof HealthSourceSchema>;

export const ProjectHealthSchema = z.enum(["onTrack", "atRisk", "offTrack"]);
export type ProjectHealth = z.infer<typeof ProjectHealthSchema>;

// ============================================================================
// Pillar 1: Team Health
// ============================================================================

// Base schema for teamHealth - all fields optional for backward compat, then transformed
const TeamHealthBaseSchema = z.object({
  // New fields (may not exist in old snapshots)
  healthyWorkloadPercent: z.number().optional(),
  wipViolationCount: z.number().optional(),
  multiProjectViolationCount: z.number().optional(),
  impactedProjectCount: z.number().optional(),
  // Fields that exist in both old and new
  healthyIcCount: z.number(),
  totalIcCount: z.number(),
  totalProjectCount: z.number(),
  status: PillarStatusSchema,
  // Legacy fields (exist in old snapshots, may be derived in new)
  icWipViolationPercent: z.number().optional(),
  projectWipViolationPercent: z.number().optional(),
  healthyProjectCount: z.number().optional(),
});

export const TeamHealthSchemaV1 = TeamHealthBaseSchema.transform((data) => {
  // Compute missing fields from available data for backward compatibility
  const healthyWorkloadPercent =
    data.healthyWorkloadPercent ??
    (data.icWipViolationPercent !== undefined
      ? 100 - data.icWipViolationPercent
      : data.totalIcCount > 0
        ? (data.healthyIcCount / data.totalIcCount) * 100
        : 100);

  const wipViolationCount =
    data.wipViolationCount ?? data.totalIcCount - data.healthyIcCount;

  const multiProjectViolationCount = data.multiProjectViolationCount ?? 0;

  const impactedProjectCount =
    data.impactedProjectCount ??
    (data.projectWipViolationPercent !== undefined && data.totalProjectCount > 0
      ? Math.round(
          (data.projectWipViolationPercent / 100) * data.totalProjectCount
        )
      : data.healthyProjectCount !== undefined
        ? data.totalProjectCount - data.healthyProjectCount
        : 0);

  const icWipViolationPercent =
    data.icWipViolationPercent ?? 100 - healthyWorkloadPercent;

  const projectWipViolationPercent =
    data.projectWipViolationPercent ??
    (data.totalProjectCount > 0
      ? (impactedProjectCount / data.totalProjectCount) * 100
      : 0);

  const healthyProjectCount =
    data.healthyProjectCount ?? data.totalProjectCount - impactedProjectCount;

  return {
    healthyWorkloadPercent,
    healthyIcCount: data.healthyIcCount,
    totalIcCount: data.totalIcCount,
    wipViolationCount,
    multiProjectViolationCount,
    impactedProjectCount,
    totalProjectCount: data.totalProjectCount,
    status: data.status,
    icWipViolationPercent,
    projectWipViolationPercent,
    healthyProjectCount,
  };
});

export type TeamHealthV1 = z.infer<typeof TeamHealthSchemaV1>;

// ============================================================================
// Pillar 2: Project Health (UI: "Project Health", internal: velocityHealth)
// Sources: Self-reported (human) vs Trajectory Alert (velocity)
// ============================================================================

export const ProjectVelocityStatusSchemaV1 = z.object({
  projectId: z.string(),
  projectName: z.string(),
  /** Human-entered health from Linear - Self-reported (null if not set) */
  linearHealth: z.string().nullable(),
  /** Velocity-based calculated health - Trajectory Alert */
  calculatedHealth: z.string(),
  /** Final effective health (hybrid logic result) */
  effectiveHealth: z.string(),
  /** Days predicted completion is off from target (null if no target) */
  daysOffTarget: z.number().nullable(),
  /** Source: "human" = Self-reported, "velocity" = Trajectory Alert */
  healthSource: HealthSourceSchema,
});

export type ProjectVelocityStatusV1 = z.infer<
  typeof ProjectVelocityStatusSchemaV1
>;

export const VelocityHealthSchemaV1 = z.object({
  /** Percentage of projects on track */
  onTrackPercent: z.number(),
  /** Percentage of projects at risk */
  atRiskPercent: z.number(),
  /** Percentage of projects off track */
  offTrackPercent: z.number(),
  /** Detailed status for each project */
  projectStatuses: z.array(ProjectVelocityStatusSchemaV1),
  /** Overall status for this pillar */
  status: PillarStatusSchema,
});

export type VelocityHealthV1 = z.infer<typeof VelocityHealthSchemaV1>;

// ============================================================================
// Pillar 3: Team Productivity (GetDX TrueThroughput integration)
// ============================================================================

/** Extended status including "unknown" for unconfigured thresholds */
const CoreProductivityStatusSchema = z.enum([
  "peakFlow",
  "strongRhythm",
  "steadyProgress",
  "earlyTraction",
  "lowTraction",
  "unknown",
  "pending",
]);

// Combined schema that accepts both old and new values, normalizing to new
export const ProductivityStatusSchema = z
  .union([CoreProductivityStatusSchema, LegacyPillarStatusSchema])
  .transform((val): ProductivityStatus => {
    if (["healthy", "warning", "critical"].includes(val)) {
      // Map legacy status to productivity status
      switch (val) {
        case "healthy":
          return "peakFlow";
        case "warning":
          return "steadyProgress";
        case "critical":
          return "lowTraction";
        default:
          return "unknown";
      }
    }
    return val as ProductivityStatus;
  });

export type ProductivityStatus = z.infer<typeof CoreProductivityStatusSchema>;

/** Pending state - for teams or when GetDX is not configured */
export const TeamProductivityPendingSchemaV1 = z.object({
  status: z.literal("pending"),
  notes: z.string(),
});

/** Active state - with GetDX TrueThroughput data */
export const TeamProductivityActiveSchemaV1 = z.object({
  /** TrueThroughput score from GetDX */
  trueThroughput: z.number(),
  /** Number of engineers (if available from GetDX) */
  engineerCount: z.number().nullable(),
  /** TrueThroughput per engineer */
  trueThroughputPerEngineer: z.number().nullable(),
  /** Status: healthy/warning/critical if thresholds configured, else unknown */
  status: ProductivityStatusSchema,
});

/** Union of pending and active productivity schemas */
export const TeamProductivitySchemaV1 = z.union([
  TeamProductivityPendingSchemaV1,
  TeamProductivityActiveSchemaV1,
]);

export type TeamProductivityV1 = z.infer<typeof TeamProductivitySchemaV1>;
export type TeamProductivityPendingV1 = z.infer<
  typeof TeamProductivityPendingSchemaV1
>;
export type TeamProductivityActiveV1 = z.infer<
  typeof TeamProductivityActiveSchemaV1
>;

// ============================================================================
// Pillar 4: Quality (Bug Metrics)
// ============================================================================

export const QualityHealthSchemaV1 = z.object({
  /** Total open bugs with "type: bug" label */
  openBugCount: z.number(),
  /** Bugs opened in the measurement period (14 days) */
  bugsOpenedInPeriod: z.number(),
  /** Bugs closed in the measurement period (14 days) */
  bugsClosedInPeriod: z.number(),
  /** Net bug change (opened - closed); positive = growing backlog */
  netBugChange: z.number(),
  /** Average age of open bugs in days */
  averageBugAgeDays: z.number(),
  /** Age of the oldest open bug in days */
  maxBugAgeDays: z.number(),
  /** Composite score 0-100 (higher = healthier) */
  compositeScore: z.number(),
  /** Overall status for this pillar */
  status: PillarStatusSchema,
});

export type QualityHealthV1 = z.infer<typeof QualityHealthSchemaV1>;

// ============================================================================
// Pillar 5: Linear Hygiene (Tactical Discipline)
// ============================================================================

export const LinearHygieneSchemaV1 = z.object({
  /** TOPLINE: Hygiene score 0-100 (higher = healthier) */
  hygieneScore: z.number(),
  /** Total gaps across all engineers and projects */
  totalGaps: z.number(),
  /** Maximum possible gaps (used for score calculation) */
  maxPossibleGaps: z.number(),

  // Engineer-level gap breakdown
  /** Issues missing estimates */
  missingEstimateCount: z.number(),
  /** Issues missing priority */
  missingPriorityCount: z.number(),
  /** Issues without recent comment (3 business days) */
  noRecentCommentCount: z.number(),
  /** Issues in progress too long */
  wipAgeViolationCount: z.number(),

  // Project-level gap breakdown
  /** Projects without a lead */
  missingLeadCount: z.number(),
  /** Projects with stale updates (7+ days) */
  staleUpdateCount: z.number(),
  /** Projects with status mismatch */
  statusMismatchCount: z.number(),
  /** Projects missing health status */
  missingHealthCount: z.number(),
  /** Projects with date discrepancy (target vs predicted >30 days) */
  dateDiscrepancyCount: z.number(),

  // Summary counts
  /** Number of engineers with at least one gap */
  engineersWithGaps: z.number(),
  /** Total number of engineers */
  totalEngineers: z.number(),
  /** Number of projects with at least one gap */
  projectsWithGaps: z.number(),
  /** Total number of projects */
  totalProjects: z.number(),

  /** Overall status for this pillar */
  status: PillarStatusSchema,
});

export type LinearHygieneV1 = z.infer<typeof LinearHygieneSchemaV1>;

// ============================================================================
// Metadata
// ============================================================================

export const MetricsLevelSchema = z.enum(["org", "domain", "team"]);
export type MetricsLevel = z.infer<typeof MetricsLevelSchema>;

export const SnapshotMetadataSchemaV1 = z.object({
  /** ISO timestamp when snapshot was captured */
  capturedAt: z.string(),
  /** ISO timestamp of last successful sync (null if never synced) */
  syncedAt: z.string().nullable(),
  /** Aggregation level */
  level: MetricsLevelSchema,
  /** Level identifier (null for org, domain name, or team key) */
  levelId: z.string().nullable(),
});

export type SnapshotMetadataV1 = z.infer<typeof SnapshotMetadataSchemaV1>;

// ============================================================================
// Complete Snapshot Schema V1
// ============================================================================

export const MetricsSnapshotSchemaV1 = z.object({
  /** Schema version for future migrations */
  schemaVersion: z.literal(1),

  /** Pillar 1: Team Health - Is work flowing or stuck? */
  teamHealth: TeamHealthSchemaV1,

  /** Pillar 2: Project Health - Are projects tracking to goal? (Self-reported + Trajectory Alert) */
  velocityHealth: VelocityHealthSchemaV1,

  /** Pillar 3: Team Productivity - Is output healthy and consistent? (TBD) */
  teamProductivity: TeamProductivitySchemaV1,

  /** Pillar 4: Quality - Are we building stable or creating debt? */
  quality: QualityHealthSchemaV1,

  /** Pillar 5: Linear Hygiene - Are we following tactical discipline? (optional for backward compat) */
  linearHygiene: LinearHygieneSchemaV1.optional(),

  /** Snapshot metadata */
  metadata: SnapshotMetadataSchemaV1,
});

export type MetricsSnapshotV1 = z.infer<typeof MetricsSnapshotSchemaV1>;

// ============================================================================
// Schema Version Union (for future versions)
// ============================================================================

/**
 * Union of all schema versions for parsing unknown data.
 * Add new versions here as they're created.
 */
export const MetricsSnapshotSchema = MetricsSnapshotSchemaV1;
export type MetricsSnapshot = MetricsSnapshotV1;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse and validate a metrics snapshot JSON string
 */
export function parseMetricsSnapshot(json: string): MetricsSnapshot {
  const data = JSON.parse(json);
  return MetricsSnapshotSchema.parse(data);
}

/**
 * Safely parse a metrics snapshot, returning null on failure
 */
export function safeParseMetricsSnapshot(json: string): MetricsSnapshot | null {
  try {
    const data = JSON.parse(json);
    const result = MetricsSnapshotSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Create an empty/default metrics snapshot for a given level
 */
export function createEmptyMetricsSnapshot(
  level: MetricsLevel,
  levelId: string | null,
  capturedAt: string,
  syncedAt: string | null
): MetricsSnapshotV1 {
  return {
    schemaVersion: 1,
    teamHealth: {
      healthyWorkloadPercent: 100,
      healthyIcCount: 0,
      totalIcCount: 0,
      wipViolationCount: 0,
      multiProjectViolationCount: 0,
      impactedProjectCount: 0,
      totalProjectCount: 0,
      status: "peakFlow",
      // Legacy fields
      icWipViolationPercent: 0,
      projectWipViolationPercent: 0,
      healthyProjectCount: 0,
    },
    velocityHealth: {
      onTrackPercent: 100,
      atRiskPercent: 0,
      offTrackPercent: 0,
      projectStatuses: [],
      status: "peakFlow",
    },
    teamProductivity: {
      status: "pending",
      notes: "Awaiting GetDX TrueThroughput integration",
    },
    quality: {
      openBugCount: 0,
      bugsOpenedInPeriod: 0,
      bugsClosedInPeriod: 0,
      netBugChange: 0,
      averageBugAgeDays: 0,
      maxBugAgeDays: 0,
      compositeScore: 100,
      status: "peakFlow",
    },
    linearHygiene: {
      hygieneScore: 100,
      totalGaps: 0,
      maxPossibleGaps: 0,
      missingEstimateCount: 0,
      missingPriorityCount: 0,
      noRecentCommentCount: 0,
      wipAgeViolationCount: 0,
      missingLeadCount: 0,
      staleUpdateCount: 0,
      statusMismatchCount: 0,
      missingHealthCount: 0,
      dateDiscrepancyCount: 0,
      engineersWithGaps: 0,
      totalEngineers: 0,
      projectsWithGaps: 0,
      totalProjects: 0,
      status: "peakFlow",
    },
    metadata: {
      capturedAt,
      syncedAt,
      level,
      levelId,
    },
  };
}

/**
 * Determine pillar status based on violation percentage thresholds
 *
 * Thresholds (score = 100 - violationPercent):
 * - 81-100% score (0-19% violation) = Peak Flow
 * - 61-80% score (20-39% violation) = Strong Rhythm
 * - 41-60% score (40-59% violation) = Steady Progress
 * - 21-40% score (60-79% violation) = Early Traction
 * - 0-20% score (80-100% violation) = Low Traction
 */
export function getPillarStatus(violationPercent: number): PillarStatus {
  if (violationPercent < 20) return "peakFlow";
  if (violationPercent < 40) return "strongRhythm";
  if (violationPercent < 60) return "steadyProgress";
  if (violationPercent < 80) return "earlyTraction";
  return "lowTraction";
}

/**
 * Determine overall pillar status from an array of individual statuses
 * Returns the worst (lowest) status from the array
 */
export function aggregatePillarStatuses(
  statuses: PillarStatus[]
): PillarStatus {
  if (statuses.length === 0) return "peakFlow";
  // Order from worst to best - return first match (worst status wins)
  if (statuses.includes("lowTraction")) return "lowTraction";
  if (statuses.includes("earlyTraction")) return "earlyTraction";
  if (statuses.includes("steadyProgress")) return "steadyProgress";
  if (statuses.includes("strongRhythm")) return "strongRhythm";
  return "peakFlow";
}

/**
 * Determine hygiene pillar status based on score thresholds
 * - Peak Flow: Score > 80%
 * - Strong Rhythm: Score > 60%
 * - Steady Progress: Score > 40%
 * - Early Traction: Score > 20%
 * - Low Traction: Score <= 20%
 */
export function getHygieneStatus(score: number): PillarStatus {
  if (score > 80) return "peakFlow";
  if (score > 60) return "strongRhythm";
  if (score > 40) return "steadyProgress";
  if (score > 20) return "earlyTraction";
  return "lowTraction";
}
