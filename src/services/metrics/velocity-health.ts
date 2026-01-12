/**
 * Velocity Health Pillar Calculation
 *
 * Core Question: Are projects tracking to goal?
 * Core Metric: % of Projects On Track (Inherited Velocity vs. Target Burn Down)
 *
 * Hybrid Logic:
 * 1. Trust pessimistic human judgment (offTrack/atRisk from Linear)
 * 2. Override optimistic human judgment if velocity shows otherwise
 * 3. Trust optimistic human judgment only if velocity agrees
 *
 * Thresholds:
 * - 2-4 weeks off target = at risk
 * - 4+ weeks off target = off track
 */

import type { Project } from "../../db/schema.js";
import type {
  VelocityHealthV1,
  ProjectVelocityStatusV1,
  HealthSource,
} from "../../types/metrics-snapshot.js";
import { getPillarStatus } from "../../types/metrics-snapshot.js";

/** Days off target threshold for "at risk" status */
const AT_RISK_DAYS_THRESHOLD = 14; // 2 weeks

/** Days off target threshold for "off track" status */
const OFF_TRACK_DAYS_THRESHOLD = 28; // 4 weeks

/**
 * Effective health result from hybrid calculation
 */
interface EffectiveHealthResult {
  effectiveHealth: string;
  calculatedHealth: string;
  healthSource: HealthSource;
  daysOffTarget: number | null;
}

/**
 * Calculate how many days the predicted completion is off from target
 *
 * @param project - The project to analyze
 * @returns Days off target (positive = late), or null if can't calculate
 */
export function calculateDaysOffTarget(project: Project): number | null {
  // Need both target date and estimated end date
  if (!project.target_date || !project.estimated_end_date) {
    return null;
  }

  const targetDate = new Date(project.target_date);
  const predictedDate = new Date(project.estimated_end_date);

  // Calculate difference in days (positive = predicted is later than target)
  const diffMs = predictedDate.getTime() - targetDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Calculate velocity-based health status
 *
 * @param daysOff - Days predicted completion is off from target
 * @returns Calculated health status based on velocity
 */
export function calculateVelocityBasedHealth(daysOff: number | null): string {
  if (daysOff === null) {
    // No data to calculate, assume on track
    return "onTrack";
  }

  // If predicted is earlier than target, we're on track
  if (daysOff <= 0) {
    return "onTrack";
  }

  // Apply thresholds
  if (daysOff > OFF_TRACK_DAYS_THRESHOLD) {
    return "offTrack";
  }

  if (daysOff > AT_RISK_DAYS_THRESHOLD) {
    return "atRisk";
  }

  return "onTrack";
}

/**
 * Apply hybrid logic to determine effective health
 *
 * Rules:
 * 1. Trust pessimistic human judgment (offTrack/atRisk)
 * 2. Override optimistic human judgment if velocity disagrees
 * 3. Trust optimistic human judgment if velocity agrees
 *
 * @param project - The project to analyze
 * @returns Effective health result with source information
 */
export function calculateEffectiveHealth(
  project: Project
): EffectiveHealthResult {
  const linearHealth = project.project_health; // Human-entered
  const daysOff = calculateDaysOffTarget(project);
  const calculatedHealth = calculateVelocityBasedHealth(daysOff);

  // Normalize Linear health values to our format
  const normalizedLinearHealth = normalizeHealthValue(linearHealth);

  // Rule 1: Trust pessimistic human judgment
  if (
    normalizedLinearHealth === "offTrack" ||
    normalizedLinearHealth === "atRisk"
  ) {
    return {
      effectiveHealth: normalizedLinearHealth,
      calculatedHealth,
      healthSource: "human",
      daysOffTarget: daysOff,
    };
  }

  // Rule 2: Override optimistic human judgment with velocity data
  if (calculatedHealth === "offTrack" || calculatedHealth === "atRisk") {
    return {
      effectiveHealth: calculatedHealth,
      calculatedHealth,
      healthSource: "velocity",
      daysOffTarget: daysOff,
    };
  }

  // Rule 3: Trust optimistic human judgment if velocity agrees
  return {
    effectiveHealth: normalizedLinearHealth || "onTrack",
    calculatedHealth,
    healthSource: "human",
    daysOffTarget: daysOff,
  };
}

/**
 * Normalize health value from Linear to our standard format
 */
function normalizeHealthValue(health: string | null): string | null {
  if (!health) return null;

  const lower = health.toLowerCase();

  if (lower.includes("off") || lower.includes("track")) {
    if (lower.includes("off")) return "offTrack";
    if (lower.includes("on")) return "onTrack";
  }

  if (lower.includes("risk")) return "atRisk";
  if (lower === "ontrack") return "onTrack";
  if (lower === "offtrack") return "offTrack";
  if (lower === "atrisk") return "atRisk";

  return health;
}

/**
 * Calculate Velocity Health metrics for a set of projects
 *
 * @param projects - Projects to analyze
 * @param projectFilter - Optional filter function
 * @returns VelocityHealthV1 metrics object
 */
export function calculateVelocityHealth(
  projects: Project[],
  projectFilter?: (project: Project) => boolean
): VelocityHealthV1 {
  // Apply filter if provided
  const filteredProjects = projectFilter
    ? projects.filter(projectFilter)
    : projects;

  // Only analyze "in progress" projects
  const activeProjects = filteredProjects.filter((p) => {
    const stateCategory = p.project_state_category?.toLowerCase() || "";
    return (
      stateCategory.includes("progress") || stateCategory.includes("started")
    );
  });

  // Calculate effective health for each project
  const projectStatuses: ProjectVelocityStatusV1[] = activeProjects.map(
    (project) => {
      const result = calculateEffectiveHealth(project);

      return {
        projectId: project.project_id,
        projectName: project.project_name,
        linearHealth: project.project_health,
        calculatedHealth: result.calculatedHealth,
        effectiveHealth: result.effectiveHealth,
        daysOffTarget: result.daysOffTarget,
        healthSource: result.healthSource,
      };
    }
  );

  // Calculate percentages
  const total = projectStatuses.length;
  const onTrack = projectStatuses.filter(
    (p) => p.effectiveHealth === "onTrack"
  ).length;
  const atRisk = projectStatuses.filter(
    (p) => p.effectiveHealth === "atRisk"
  ).length;
  const offTrack = projectStatuses.filter(
    (p) => p.effectiveHealth === "offTrack"
  ).length;

  const onTrackPercent = total > 0 ? (onTrack / total) * 100 : 100;
  const atRiskPercent = total > 0 ? (atRisk / total) * 100 : 0;
  const offTrackPercent = total > 0 ? (offTrack / total) * 100 : 0;

  // Determine overall status
  // Use the inverse of on-track percentage for status calculation
  const notOnTrackPercent = 100 - onTrackPercent;
  const status = getPillarStatus(notOnTrackPercent);

  return {
    onTrackPercent: Math.round(onTrackPercent * 10) / 10,
    atRiskPercent: Math.round(atRiskPercent * 10) / 10,
    offTrackPercent: Math.round(offTrackPercent * 10) / 10,
    projectStatuses,
    status,
  };
}

/**
 * Calculate Velocity Health for a specific team
 *
 * @param teamKey - The team key to filter by
 * @param projects - All projects
 * @returns VelocityHealthV1 for the team
 */
export function calculateVelocityHealthForTeam(
  teamKey: string,
  projects: Project[]
): VelocityHealthV1 {
  return calculateVelocityHealth(projects, (p) => {
    try {
      const teams = JSON.parse(p.teams || "[]") as string[];
      return teams.some((t) => t.toUpperCase() === teamKey.toUpperCase());
    } catch {
      return false;
    }
  });
}

/**
 * Calculate Velocity Health for a domain
 *
 * @param domainTeamKeys - Array of team keys in the domain
 * @param projects - All projects
 * @returns VelocityHealthV1 for the domain
 */
export function calculateVelocityHealthForDomain(
  domainTeamKeys: string[],
  projects: Project[]
): VelocityHealthV1 {
  const domainKeysUpper = domainTeamKeys.map((k) => k.toUpperCase());

  return calculateVelocityHealth(projects, (p) => {
    try {
      const teams = JSON.parse(p.teams || "[]") as string[];
      return teams.some((t) => domainKeysUpper.includes(t.toUpperCase()));
    } catch {
      return false;
    }
  });
}

/**
 * Get projects that are off track or at risk
 */
export function getProjectsNeedingAttention(
  projects: Project[]
): { project: Project; status: ProjectVelocityStatusV1 }[] {
  const activeProjects = projects.filter((p) => {
    const stateCategory = p.project_state_category?.toLowerCase() || "";
    return (
      stateCategory.includes("progress") || stateCategory.includes("started")
    );
  });

  return activeProjects
    .map((project) => {
      const result = calculateEffectiveHealth(project);
      return {
        project,
        status: {
          projectId: project.project_id,
          projectName: project.project_name,
          linearHealth: project.project_health,
          calculatedHealth: result.calculatedHealth,
          effectiveHealth: result.effectiveHealth,
          daysOffTarget: result.daysOffTarget,
          healthSource: result.healthSource,
        },
      };
    })
    .filter(
      ({ status }) =>
        status.effectiveHealth === "offTrack" ||
        status.effectiveHealth === "atRisk"
    )
    .sort((a, b) => {
      // Sort by severity (offTrack first), then by days off target
      if (a.status.effectiveHealth !== b.status.effectiveHealth) {
        return a.status.effectiveHealth === "offTrack" ? -1 : 1;
      }
      const aDays = a.status.daysOffTarget ?? 0;
      const bDays = b.status.daysOffTarget ?? 0;
      return bDays - aDays; // Most overdue first
    });
}
