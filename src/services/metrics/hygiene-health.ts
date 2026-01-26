/**
 * Linear Hygiene Pillar Calculation
 *
 * Core Question: Are we following tactical discipline in Linear?
 * Core Metric: Hygiene score based on gaps (0-100, higher = healthier)
 *
 * Engineer-level gaps (per issue):
 * - Missing estimates
 * - Missing priority
 * - No recent comment (3 business days)
 * - WIP age violations (in progress too long)
 *
 * Project-level gaps (binary flags):
 * - Missing lead
 * - Stale update (7+ days)
 * - Status mismatch
 * - Missing health status
 * - Date discrepancy (target vs predicted >30 days)
 *
 * Hygiene Score Formula:
 * Score = (1 - (totalGaps / maxPossibleGaps)) × 100
 *
 * Where:
 * - maxPossibleGaps = (totalWipIssues × 4) + (totalProjects × 5)
 * - 4 = engineer gap types per issue
 * - 5 = project gap types
 *
 * Status Thresholds:
 * - >= 90% = healthy
 * - 75-90% = warning
 * - < 75% = critical
 */

import type { Engineer, Project } from "../../db/schema.js";
import type { LinearHygieneV1 } from "../../types/metrics-snapshot.js";
import { getHygieneStatus } from "../../types/metrics-snapshot.js";

/** Number of gap types tracked per engineer's issues */
const ENGINEER_GAP_TYPES = 4;

/** Number of gap types tracked per project */
const PROJECT_GAP_TYPES = 5;

/**
 * Check if an engineer has any hygiene gaps
 */
function engineerHasGaps(engineer: Engineer): boolean {
  return (
    engineer.missing_estimate_count > 0 ||
    engineer.missing_priority_count > 0 ||
    engineer.no_recent_comment_count > 0 ||
    engineer.wip_age_violation_count > 0
  );
}

/**
 * Count total gaps for a single engineer
 */
function countEngineerGaps(engineer: Engineer): number {
  return (
    engineer.missing_estimate_count +
    engineer.missing_priority_count +
    engineer.no_recent_comment_count +
    engineer.wip_age_violation_count
  );
}

/**
 * Check if a project has any hygiene gaps
 */
function projectHasGaps(project: Project): boolean {
  return (
    project.missing_lead === 1 ||
    project.is_stale_update === 1 ||
    project.has_status_mismatch === 1 ||
    project.missing_health === 1 ||
    project.has_date_discrepancy === 1
  );
}

/**
 * Count total gaps for a single project
 */
function countProjectGaps(project: Project): number {
  return (
    project.missing_lead +
    project.is_stale_update +
    project.has_status_mismatch +
    project.missing_health +
    project.has_date_discrepancy
  );
}

/**
 * Filter projects to only those with WIP issues (in_progress_issues > 0)
 * This ensures we only count active projects in hygiene calculations
 */
function filterActiveProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.in_progress_issues > 0);
}

/**
 * Filter engineers to only those with WIP issues
 */
function filterActiveEngineers(engineers: Engineer[]): Engineer[] {
  return engineers.filter((e) => e.wip_issue_count > 0);
}

/**
 * Calculate Linear Hygiene metrics from engineers and projects data
 *
 * @param engineers - All engineers (will be filtered to active only)
 * @param projects - All projects (will be filtered to active only)
 * @param engineerFilter - Optional filter function for engineers
 * @param projectFilter - Optional filter function for projects
 * @returns LinearHygieneV1 metrics object
 */
export function calculateHygieneHealth(
  engineers: Engineer[],
  projects: Project[],
  engineerFilter?: (engineer: Engineer) => boolean,
  projectFilter?: (project: Project) => boolean
): LinearHygieneV1 {
  // Apply filters if provided
  let filteredEngineers = engineerFilter
    ? engineers.filter(engineerFilter)
    : engineers;
  let filteredProjects = projectFilter
    ? projects.filter(projectFilter)
    : projects;

  // Filter to active only (with WIP)
  filteredEngineers = filterActiveEngineers(filteredEngineers);
  filteredProjects = filterActiveProjects(filteredProjects);

  // Calculate engineer gap totals
  let missingEstimateCount = 0;
  let missingPriorityCount = 0;
  let noRecentCommentCount = 0;
  let wipAgeViolationCount = 0;
  let engineersWithGaps = 0;
  let totalWipIssues = 0;

  for (const engineer of filteredEngineers) {
    missingEstimateCount += engineer.missing_estimate_count;
    missingPriorityCount += engineer.missing_priority_count;
    noRecentCommentCount += engineer.no_recent_comment_count;
    wipAgeViolationCount += engineer.wip_age_violation_count;
    totalWipIssues += engineer.wip_issue_count;

    if (engineerHasGaps(engineer)) {
      engineersWithGaps++;
    }
  }

  // Calculate project gap totals
  let missingLeadCount = 0;
  let staleUpdateCount = 0;
  let statusMismatchCount = 0;
  let missingHealthCount = 0;
  let dateDiscrepancyCount = 0;
  let projectsWithGaps = 0;

  for (const project of filteredProjects) {
    missingLeadCount += project.missing_lead;
    staleUpdateCount += project.is_stale_update;
    statusMismatchCount += project.has_status_mismatch;
    missingHealthCount += project.missing_health;
    dateDiscrepancyCount += project.has_date_discrepancy;

    if (projectHasGaps(project)) {
      projectsWithGaps++;
    }
  }

  // Calculate totals
  const totalEngineerGaps =
    missingEstimateCount +
    missingPriorityCount +
    noRecentCommentCount +
    wipAgeViolationCount;

  const totalProjectGaps =
    missingLeadCount +
    staleUpdateCount +
    statusMismatchCount +
    missingHealthCount +
    dateDiscrepancyCount;

  const totalGaps = totalEngineerGaps + totalProjectGaps;

  // Calculate max possible gaps
  // Engineer max = total WIP issues × 4 gap types per issue
  // Project max = total projects × 5 gap types per project
  const maxEngineerGaps = totalWipIssues * ENGINEER_GAP_TYPES;
  const maxProjectGaps = filteredProjects.length * PROJECT_GAP_TYPES;
  const maxPossibleGaps = maxEngineerGaps + maxProjectGaps;

  // Calculate hygiene score
  let hygieneScore: number;
  if (maxPossibleGaps === 0) {
    // No WIP issues and no projects = perfect hygiene (nothing to violate)
    hygieneScore = 100;
  } else {
    hygieneScore = Math.round((1 - totalGaps / maxPossibleGaps) * 100);
    // Clamp to 0-100
    hygieneScore = Math.max(0, Math.min(100, hygieneScore));
  }

  // Determine status
  const status = getHygieneStatus(hygieneScore);

  return {
    hygieneScore,
    totalGaps,
    maxPossibleGaps,

    // Engineer breakdown
    missingEstimateCount,
    missingPriorityCount,
    noRecentCommentCount,
    wipAgeViolationCount,

    // Project breakdown
    missingLeadCount,
    staleUpdateCount,
    statusMismatchCount,
    missingHealthCount,
    dateDiscrepancyCount,

    // Summary counts
    engineersWithGaps,
    totalEngineers: filteredEngineers.length,
    projectsWithGaps,
    totalProjects: filteredProjects.length,

    status,
  };
}

/**
 * Get team keys for a project from its teams JSON
 */
function getProjectTeamKeys(project: Project): string[] {
  try {
    const teams = JSON.parse(project.teams || "[]") as string[];
    return teams.map((t) => t.toUpperCase());
  } catch {
    return [];
  }
}

/**
 * Calculate Linear Hygiene for a specific team
 *
 * @param teamKey - The team key to filter by
 * @param engineers - All engineers
 * @param projects - All projects
 * @param engineerTeamMapping - Optional mapping of engineer names to team keys
 * @returns LinearHygieneV1 for the team
 */
export function calculateHygieneHealthForTeam(
  teamKey: string,
  engineers: Engineer[],
  projects: Project[],
  engineerTeamMapping?: Record<string, string>
): LinearHygieneV1 {
  const teamKeyUpper = teamKey.toUpperCase();

  // Engineer filter: use mapping if available, otherwise include all
  const engineerFilter = engineerTeamMapping
    ? (engineer: Engineer) => {
        const mappedTeam = engineerTeamMapping[engineer.assignee_name];
        return mappedTeam?.toUpperCase() === teamKeyUpper;
      }
    : undefined;

  // Project filter: check if team is in project's teams
  const projectFilter = (project: Project) => {
    const projectTeams = getProjectTeamKeys(project);
    return projectTeams.includes(teamKeyUpper);
  };

  return calculateHygieneHealth(
    engineers,
    projects,
    engineerFilter,
    projectFilter
  );
}

/**
 * Calculate Linear Hygiene for a domain
 *
 * @param domainTeamKeys - Array of team keys in the domain
 * @param engineers - All engineers
 * @param projects - All projects
 * @param engineerTeamMapping - Optional mapping of engineer names to team keys
 * @returns LinearHygieneV1 for the domain
 */
export function calculateHygieneHealthForDomain(
  domainTeamKeys: string[],
  engineers: Engineer[],
  projects: Project[],
  engineerTeamMapping?: Record<string, string>
): LinearHygieneV1 {
  const domainKeysUpper = domainTeamKeys.map((k) => k.toUpperCase());

  // Engineer filter: use mapping if available
  const engineerFilter = engineerTeamMapping
    ? (engineer: Engineer) => {
        const mappedTeam = engineerTeamMapping[engineer.assignee_name];
        return mappedTeam
          ? domainKeysUpper.includes(mappedTeam.toUpperCase())
          : false;
      }
    : undefined;

  // Project filter: check if any of project's teams are in the domain
  const projectFilter = (project: Project) => {
    const projectTeams = getProjectTeamKeys(project);
    return projectTeams.some((t) => domainKeysUpper.includes(t));
  };

  return calculateHygieneHealth(
    engineers,
    projects,
    engineerFilter,
    projectFilter
  );
}

/**
 * Get engineers with gaps, sorted by total gap count (descending)
 *
 * @param engineers - All engineers
 * @param limit - Maximum number to return
 * @returns Array of engineers with their gap count
 */
export function getEngineersWithGaps(
  engineers: Engineer[],
  limit: number = 20
): { engineer: Engineer; totalGaps: number }[] {
  const activeEngineers = filterActiveEngineers(engineers);

  return activeEngineers
    .filter(engineerHasGaps)
    .map((engineer) => ({
      engineer,
      totalGaps: countEngineerGaps(engineer),
    }))
    .sort((a, b) => b.totalGaps - a.totalGaps)
    .slice(0, limit);
}

/**
 * Get projects with gaps, sorted by total gap count (descending)
 *
 * @param projects - All projects
 * @param limit - Maximum number to return
 * @returns Array of projects with their gap count
 */
export function getProjectsWithGaps(
  projects: Project[],
  limit: number = 20
): { project: Project; totalGaps: number }[] {
  const activeProjects = filterActiveProjects(projects);

  return activeProjects
    .filter(projectHasGaps)
    .map((project) => ({
      project,
      totalGaps: countProjectGaps(project),
    }))
    .sort((a, b) => b.totalGaps - a.totalGaps)
    .slice(0, limit);
}
