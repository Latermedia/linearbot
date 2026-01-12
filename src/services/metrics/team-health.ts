/**
 * Team Health Pillar Calculation
 *
 * Core Question: Is work flowing or stuck?
 * Core Metric: % of ICs and % of Projects in/out of WIP constraints
 *
 * If people and projects are within healthy WIP limits, work is flowing.
 * If not, we're overloaded or blocked somewhere.
 */

import type { Engineer, Project, Issue } from "../../db/schema.js";
import type {
  TeamHealthV1,
  PillarStatus,
} from "../../types/metrics-snapshot.js";
import { getPillarStatus } from "../../types/metrics-snapshot.js";

/**
 * Build a mapping of team key to team name from issues
 * This allows us to match engineers (who have team_names) to domain team keys
 */
function buildTeamKeyToNameMap(issues: Issue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const issue of issues) {
    if (issue.team_key && issue.team_name) {
      // Store with uppercase key for case-insensitive matching
      map.set(issue.team_key.toUpperCase(), issue.team_name);
    }
  }
  return map;
}

/**
 * Calculate Team Health metrics from engineers and projects data
 *
 * @param engineers - All engineers with WIP data
 * @param projects - All active projects
 * @param projectFilter - Optional filter function to scope to specific projects
 * @returns TeamHealthV1 metrics object
 */
export function calculateTeamHealth(
  engineers: Engineer[],
  projects: Project[],
  projectFilter?: (project: Project) => boolean
): TeamHealthV1 {
  // Apply project filter if provided
  const filteredProjects = projectFilter
    ? projects.filter(projectFilter)
    : projects;

  // Filter to only "in progress" projects
  const activeProjects = filteredProjects.filter((p) => {
    const stateCategory = p.project_state_category?.toLowerCase() || "";
    return (
      stateCategory.includes("progress") || stateCategory.includes("started")
    );
  });

  // Get engineers who are working on the filtered projects
  const relevantEngineerIds = new Set<string>();
  for (const project of activeProjects) {
    try {
      const projectEngineers = JSON.parse(
        project.engineers || "[]"
      ) as string[];
      for (const engineerName of projectEngineers) {
        // Find engineer by name (since projects store names, not IDs)
        const engineer = engineers.find(
          (e) => e.assignee_name === engineerName
        );
        if (engineer) {
          relevantEngineerIds.add(engineer.assignee_id);
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Filter engineers to only those working on relevant projects
  const relevantEngineers = engineers.filter((e) =>
    relevantEngineerIds.has(e.assignee_id)
  );

  // If no relevant engineers, use all engineers with WIP
  const engineersToAnalyze =
    relevantEngineers.length > 0
      ? relevantEngineers
      : engineers.filter((e) => e.wip_issue_count > 0);

  // Calculate IC WIP violations (using existing wip_limit_violation flag)
  const icsInViolation = engineersToAnalyze.filter(
    (e) => e.wip_limit_violation === 1
  );
  const icViolationPercent =
    engineersToAnalyze.length > 0
      ? (icsInViolation.length / engineersToAnalyze.length) * 100
      : 0;

  // Calculate project WIP violations
  // A project has a WIP violation if ANY engineer on it is in WIP violation
  const projectsWithViolation = activeProjects.filter((project) => {
    return hasProjectWipViolation(project, engineers);
  });

  const projectViolationPercent =
    activeProjects.length > 0
      ? (projectsWithViolation.length / activeProjects.length) * 100
      : 0;

  // Calculate healthy counts
  const healthyIcCount = engineersToAnalyze.length - icsInViolation.length;
  const healthyProjectCount =
    activeProjects.length - projectsWithViolation.length;

  // Determine overall status based on the worse of the two metrics
  const icStatus = getPillarStatus(icViolationPercent);
  const projectStatus = getPillarStatus(projectViolationPercent);
  const overallStatus = getWorseStatus(icStatus, projectStatus);

  return {
    icWipViolationPercent: Math.round(icViolationPercent * 10) / 10,
    projectWipViolationPercent: Math.round(projectViolationPercent * 10) / 10,
    healthyIcCount,
    totalIcCount: engineersToAnalyze.length,
    healthyProjectCount,
    totalProjectCount: activeProjects.length,
    status: overallStatus,
  };
}

/**
 * Check if a project has any engineer in WIP violation
 *
 * @param project - The project to check
 * @param engineers - All engineers with WIP data
 * @returns true if any engineer on the project is in WIP violation
 */
export function hasProjectWipViolation(
  project: Project,
  engineers: Engineer[]
): boolean {
  try {
    const projectEngineers = JSON.parse(project.engineers || "[]") as string[];

    for (const engineerName of projectEngineers) {
      const engineer = engineers.find((e) => e.assignee_name === engineerName);
      if (engineer && engineer.wip_limit_violation === 1) {
        return true;
      }
    }

    return false;
  } catch {
    // Invalid JSON, assume no violation
    return false;
  }
}

/**
 * Get engineers who are in WIP violation for a specific project
 */
export function getProjectEngineersInViolation(
  project: Project,
  engineers: Engineer[]
): Engineer[] {
  const result: Engineer[] = [];

  try {
    const projectEngineers = JSON.parse(project.engineers || "[]") as string[];

    for (const engineerName of projectEngineers) {
      const engineer = engineers.find((e) => e.assignee_name === engineerName);
      if (engineer && engineer.wip_limit_violation === 1) {
        result.push(engineer);
      }
    }
  } catch {
    // Invalid JSON, return empty
  }

  return result;
}

/**
 * Calculate team-specific health metrics
 *
 * @param teamKey - The team key to filter by
 * @param engineers - All engineers
 * @param projects - All projects
 * @param issues - All issues (used to build team key → name mapping)
 * @returns TeamHealthV1 metrics for the specific team
 */
export function calculateTeamHealthForTeam(
  teamKey: string,
  engineers: Engineer[],
  projects: Project[],
  issues: Issue[] = []
): TeamHealthV1 {
  const teamKeyUpper = teamKey.toUpperCase();

  // Build team key → team name mapping from issues
  const teamKeyToName = buildTeamKeyToNameMap(issues);
  const teamName = teamKeyToName.get(teamKeyUpper);

  // Filter engineers by team (matching by team name)
  const teamEngineers = engineers.filter((e) => {
    try {
      const teamNames = JSON.parse(e.team_names || "[]") as string[];
      // Match by exact team name if we have the mapping, otherwise try substring match
      if (teamName) {
        return teamNames.some(
          (name) => name.toUpperCase() === teamName.toUpperCase()
        );
      }
      // Fallback: try matching by key in name (less accurate)
      return teamNames.some((name) =>
        name.toUpperCase().includes(teamKeyUpper)
      );
    } catch {
      return false;
    }
  });

  // Filter projects by team (matching by team key)
  const teamProjects = projects.filter((p) => {
    try {
      const teams = JSON.parse(p.teams || "[]") as string[];
      return teams.some((t) => t.toUpperCase() === teamKeyUpper);
    } catch {
      return false;
    }
  });

  return calculateTeamHealth(teamEngineers, teamProjects);
}

/**
 * Calculate domain-specific health metrics
 *
 * @param domainTeamKeys - Array of team keys that belong to the domain
 * @param engineers - All engineers
 * @param projects - All projects
 * @param issues - All issues (used to build team key → name mapping)
 * @returns TeamHealthV1 metrics for the domain
 */
export function calculateTeamHealthForDomain(
  domainTeamKeys: string[],
  engineers: Engineer[],
  projects: Project[],
  issues: Issue[] = []
): TeamHealthV1 {
  const domainKeysUpper = domainTeamKeys.map((k) => k.toUpperCase());

  // Build team key → team name mapping from issues
  const teamKeyToName = buildTeamKeyToNameMap(issues);

  // Get team names that correspond to domain keys
  const domainTeamNames = new Set<string>();
  for (const key of domainKeysUpper) {
    const teamName = teamKeyToName.get(key);
    if (teamName) {
      domainTeamNames.add(teamName.toUpperCase());
    }
  }

  // Filter engineers by domain teams (matching by team name)
  const domainEngineers = engineers.filter((e) => {
    try {
      const teamNames = JSON.parse(e.team_names || "[]") as string[];
      return teamNames.some((name) => domainTeamNames.has(name.toUpperCase()));
    } catch {
      return false;
    }
  });

  // Filter projects by domain teams (matching by team key)
  const domainProjects = projects.filter((p) => {
    try {
      const teams = JSON.parse(p.teams || "[]") as string[];
      return teams.some((t) => domainKeysUpper.includes(t.toUpperCase()));
    } catch {
      return false;
    }
  });

  return calculateTeamHealth(domainEngineers, domainProjects);
}

/**
 * Get the worse of two pillar statuses
 */
function getWorseStatus(a: PillarStatus, b: PillarStatus): PillarStatus {
  const priority: Record<PillarStatus, number> = {
    healthy: 0,
    warning: 1,
    critical: 2,
  };

  return priority[a] >= priority[b] ? a : b;
}
