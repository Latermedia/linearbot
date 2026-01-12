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

export const PillarStatusSchema = z.enum(["healthy", "warning", "critical"]);
export type PillarStatus = z.infer<typeof PillarStatusSchema>;

export const PendingStatusSchema = z.literal("pending");

export const HealthSourceSchema = z.enum(["human", "velocity"]);
export type HealthSource = z.infer<typeof HealthSourceSchema>;

export const ProjectHealthSchema = z.enum(["onTrack", "atRisk", "offTrack"]);
export type ProjectHealth = z.infer<typeof ProjectHealthSchema>;

// ============================================================================
// Pillar 1: Team Health
// ============================================================================

export const TeamHealthSchemaV1 = z.object({
  /** Percentage of ICs over WIP threshold (6+ issues) */
  icWipViolationPercent: z.number(),
  /** Percentage of projects with ANY engineer in WIP violation */
  projectWipViolationPercent: z.number(),
  /** Number of ICs within healthy WIP limits */
  healthyIcCount: z.number(),
  /** Total number of ICs */
  totalIcCount: z.number(),
  /** Number of projects with no WIP violations */
  healthyProjectCount: z.number(),
  /** Total number of active projects */
  totalProjectCount: z.number(),
  /** Overall status for this pillar */
  status: PillarStatusSchema,
});

export type TeamHealthV1 = z.infer<typeof TeamHealthSchemaV1>;

// ============================================================================
// Pillar 2: Velocity Health
// ============================================================================

export const ProjectVelocityStatusSchemaV1 = z.object({
  projectId: z.string(),
  projectName: z.string(),
  /** Human-entered health from Linear (null if not set) */
  linearHealth: z.string().nullable(),
  /** Velocity-based calculated health */
  calculatedHealth: z.string(),
  /** Final effective health (hybrid logic result) */
  effectiveHealth: z.string(),
  /** Days predicted completion is off from target (null if no target) */
  daysOffTarget: z.number().nullable(),
  /** Source of the effective health decision */
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
export const ProductivityStatusSchema = z.enum([
  "healthy",
  "warning",
  "critical",
  "unknown",
  "pending",
]);
export type ProductivityStatus = z.infer<typeof ProductivityStatusSchema>;

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

  /** Pillar 2: Velocity Health - Are projects tracking to goal? */
  velocityHealth: VelocityHealthSchemaV1,

  /** Pillar 3: Team Productivity - Is output healthy and consistent? (TBD) */
  teamProductivity: TeamProductivitySchemaV1,

  /** Pillar 4: Quality - Are we building stable or creating debt? */
  quality: QualityHealthSchemaV1,

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
      icWipViolationPercent: 0,
      projectWipViolationPercent: 0,
      healthyIcCount: 0,
      totalIcCount: 0,
      healthyProjectCount: 0,
      totalProjectCount: 0,
      status: "healthy",
    },
    velocityHealth: {
      onTrackPercent: 100,
      atRiskPercent: 0,
      offTrackPercent: 0,
      projectStatuses: [],
      status: "healthy",
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
      status: "healthy",
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
 */
export function getPillarStatus(violationPercent: number): PillarStatus {
  if (violationPercent < 10) return "healthy";
  if (violationPercent < 25) return "warning";
  return "critical";
}

/**
 * Determine overall pillar status from an array of individual statuses
 */
export function aggregatePillarStatuses(
  statuses: PillarStatus[]
): PillarStatus {
  if (statuses.length === 0) return "healthy";
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  return "healthy";
}
