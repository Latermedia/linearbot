/**
 * Data cleanup utilities for sync
 *
 * This module handles cleanup of unwanted data at the start of sync,
 * such as removing issues and engineers from ignored teams or excluded assignees.
 *
 * Team filtering supports two modes:
 * - Whitelist (WHITELIST_TEAM_KEYS): Only include issues from these teams
 * - Blacklist (IGNORED_TEAM_KEYS): Exclude issues from these teams
 *
 * If whitelist is set, it takes precedence - only whitelisted teams are included.
 */

import {
  deleteIssuesByTeams,
  deleteIssuesNotInTeams,
  deleteIssuesByAssigneeNames,
  deleteEngineersByNames,
  cleanupProjectTeams,
  deleteProjectsNotInTeams,
  deleteEngineersNotInTeams,
} from "../../db/queries.js";

export interface CleanupConfig {
  /** Team keys to exclude (e.g., ["CS", "SUPPORT"]) - blacklist */
  ignoredTeamKeys: string[];
  /** Team keys to include (e.g., ["ENG", "PLAT"]) - whitelist, takes precedence if set */
  whitelistTeamKeys: string[];
  /** Assignee names to exclude (e.g., contractors) - case-sensitive */
  ignoredAssigneeNames: string[];
}

export interface CleanupResult {
  /** Number of issues deleted from ignored teams */
  deletedTeamIssues: number;
  /** Number of issues deleted from ignored assignees */
  deletedAssigneeIssues: number;
  /** Number of engineers deleted from ignored assignees */
  deletedEngineers: number;
  /** Number of projects with teams field cleaned up */
  cleanedUpProjects: number;
  /** Number of projects deleted (had no whitelisted teams) */
  deletedProjects: number;
  /** Number of engineers deleted (had no whitelisted teams) */
  deletedNonWhitelistEngineers: number;
}

/**
 * Parse cleanup configuration from environment variables
 */
export function getCleanupConfig(): CleanupConfig {
  const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
    ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
    : [];

  const whitelistTeamKeys = process.env.WHITELIST_TEAM_KEYS
    ? process.env.WHITELIST_TEAM_KEYS.split(",").map((key) => key.trim())
    : [];

  const ignoredAssigneeNames = process.env.IGNORED_ASSIGNEE_NAMES
    ? process.env.IGNORED_ASSIGNEE_NAMES.split(",").map((name) => name.trim())
    : [];

  return {
    ignoredTeamKeys,
    whitelistTeamKeys,
    ignoredAssigneeNames,
  };
}

/**
 * Run data cleanup at the start of sync
 *
 * This removes:
 * - Issues NOT in whitelisted teams (if whitelist is set)
 * - Issues from ignored teams (if not using whitelist)
 * - Issues assigned to ignored assignees (e.g., contractors)
 * - Engineer records for ignored assignees
 * - Stale team references from projects table
 * - Projects with no whitelisted teams
 * - Engineers with no whitelisted teams
 */
export function runCleanup(config: CleanupConfig): CleanupResult {
  const result: CleanupResult = {
    deletedTeamIssues: 0,
    deletedAssigneeIssues: 0,
    deletedEngineers: 0,
    cleanedUpProjects: 0,
    deletedProjects: 0,
    deletedNonWhitelistEngineers: 0,
  };

  // Whitelist mode: delete all issues NOT in the whitelist
  if (config.whitelistTeamKeys.length > 0) {
    console.log(
      `[CLEANUP] Whitelist mode - only keeping teams: ${config.whitelistTeamKeys.join(", ")}`
    );
    result.deletedTeamIssues = deleteIssuesNotInTeams(config.whitelistTeamKeys);
    if (result.deletedTeamIssues > 0) {
      console.log(
        `[CLEANUP] Removed ${result.deletedTeamIssues} issue(s) from non-whitelisted teams`
      );
    }

    // Clean up stale teams from projects table
    result.cleanedUpProjects = cleanupProjectTeams(config.whitelistTeamKeys);
    if (result.cleanedUpProjects > 0) {
      console.log(
        `[CLEANUP] Cleaned up teams field in ${result.cleanedUpProjects} project(s)`
      );
    }

    // Delete projects that have no whitelisted teams
    result.deletedProjects = deleteProjectsNotInTeams(config.whitelistTeamKeys);
    if (result.deletedProjects > 0) {
      console.log(
        `[CLEANUP] Removed ${result.deletedProjects} project(s) with no whitelisted teams`
      );
    }

    // Delete engineers that have no whitelisted teams
    result.deletedNonWhitelistEngineers = deleteEngineersNotInTeams(
      config.whitelistTeamKeys
    );
    if (result.deletedNonWhitelistEngineers > 0) {
      console.log(
        `[CLEANUP] Removed ${result.deletedNonWhitelistEngineers} engineer(s) with no whitelisted teams`
      );
    }
  } else if (config.ignoredTeamKeys.length > 0) {
    // Blacklist mode: delete issues from ignored teams
    console.log(
      `[CLEANUP] Removing issues from ${config.ignoredTeamKeys.length} ignored team(s): ${config.ignoredTeamKeys.join(", ")}`
    );
    deleteIssuesByTeams(config.ignoredTeamKeys);
  }

  // Clean up ignored assignees
  if (config.ignoredAssigneeNames.length > 0) {
    console.log(
      `[CLEANUP] Removing data for ${config.ignoredAssigneeNames.length} ignored assignee(s): ${config.ignoredAssigneeNames.join(", ")}`
    );

    result.deletedAssigneeIssues += deleteIssuesByAssigneeNames(
      config.ignoredAssigneeNames
    );
    result.deletedEngineers = deleteEngineersByNames(
      config.ignoredAssigneeNames
    );

    if (result.deletedAssigneeIssues > 0 || result.deletedEngineers > 0) {
      console.log(
        `[CLEANUP] Removed ${result.deletedAssigneeIssues} issue(s) and ${result.deletedEngineers} engineer record(s) for ignored assignees`
      );
    }
  }

  return result;
}

/**
 * Check if an assignee name should be ignored
 */
export function isIgnoredAssignee(
  assigneeName: string | null | undefined,
  ignoredAssigneeNames: string[]
): boolean {
  if (!assigneeName || ignoredAssigneeNames.length === 0) return false;
  return ignoredAssigneeNames.includes(assigneeName);
}

/**
 * Check if a team should be included based on whitelist/blacklist rules
 *
 * @param teamKey - The team key (e.g., "ENG")
 * @param config - Cleanup config with whitelist and blacklist
 * @returns true if the team should be included, false if it should be filtered out
 */
export function isTeamIncluded(
  teamKey: string,
  config: Pick<CleanupConfig, "ignoredTeamKeys" | "whitelistTeamKeys">
): boolean {
  const { ignoredTeamKeys, whitelistTeamKeys } = config;

  // If whitelist is set, only include teams on the whitelist (by key)
  if (whitelistTeamKeys.length > 0) {
    return whitelistTeamKeys.includes(teamKey);
  }

  // Otherwise, use blacklist - exclude teams in ignoredTeamKeys
  return !ignoredTeamKeys.includes(teamKey);
}
