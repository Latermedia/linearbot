import { getDatabase } from "./connection.js";
import type { Issue, Project, Engineer, Initiative } from "./schema.js";

/**
 * Centralized database queries for the Linear bot.
 * All SQL queries should be defined here to maintain consistency
 * and make it easier to optimize or modify the schema.
 */

/**
 * Get all issues with optional filtering
 */
export function getAllIssues(): Issue[] {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM issues`);
  return query.all() as Issue[];
}

/**
 * Get all started issues (state_type = 'started')
 */
export function getStartedIssues(): Issue[] {
  const db = getDatabase();
  const query = db.prepare(`
    SELECT * FROM issues
    WHERE state_type = 'started'
      AND completed_at IS NULL
      AND canceled_at IS NULL
      AND (state_name NOT LIKE '%done%' AND state_name NOT LIKE '%completed%')
    ORDER BY assignee_name, team_name, title
  `);
  return query.all() as Issue[];
}

/**
 * Get started issues for specific teams
 */
export function getStartedIssuesByTeams(teamKeys: string[]): Issue[] {
  if (teamKeys.length === 0) return [];

  const db = getDatabase();
  const placeholders = teamKeys.map(() => "?").join(",");
  const query = db.prepare(`
    SELECT * FROM issues
    WHERE state_type = 'started'
      AND completed_at IS NULL
      AND canceled_at IS NULL
      AND (state_name NOT LIKE '%done%' AND state_name NOT LIKE '%completed%')
      AND team_key IN (${placeholders})
    ORDER BY assignee_name, team_name, title
  `);
  return query.all(...teamKeys) as Issue[];
}

/**
 * Get all issues that have a project assigned
 */
export function getIssuesWithProjects(): Issue[] {
  const db = getDatabase();
  console.log(
    "[getIssuesWithProjects] Querying database for issues with projects..."
  );

  // First check total count
  const totalCountQuery = db.prepare(`SELECT COUNT(*) as count FROM issues`);
  const totalCount = (totalCountQuery.get() as { count: number }).count;
  console.log("[getIssuesWithProjects] Total issues in database:", totalCount);

  const query = db.prepare(`
    SELECT * FROM issues
    WHERE project_id IS NOT NULL
    ORDER BY team_name, project_name, identifier
  `);
  const results = query.all() as Issue[];
  console.log("[getIssuesWithProjects] Issues with projects:", results.length);

  return results;
}

/**
 * Get started issues with projects and assignees (for multi-project analysis)
 */
export function getStartedProjectIssuesWithAssignees(): Issue[] {
  const db = getDatabase();
  const query = db.prepare(`
    SELECT * FROM issues
    WHERE state_type = 'started'
    AND project_id IS NOT NULL
    AND assignee_name IS NOT NULL
    ORDER BY assignee_name, project_name
  `);
  return query.all() as Issue[];
}

/**
 * Get all existing issue IDs (for sync deduplication)
 */
export function getExistingIssueIds(): Set<string> {
  const db = getDatabase();
  const query = db.prepare(`SELECT id FROM issues`);
  const rows = query.all() as { id: string }[];
  return new Set(rows.map((row) => row.id));
}

/**
 * Get total issue count
 */
export function getTotalIssueCount(): number {
  const db = getDatabase();
  const query = db.prepare(`SELECT COUNT(*) as count FROM issues`);
  const result = query.get() as { count: number };
  return result.count;
}

/**
 * Upsert an issue (insert or update)
 */
export function upsertIssue(issue: {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  team_id: string;
  team_name: string;
  team_key: string;
  state_id: string;
  state_name: string;
  state_type: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar_url: string | null;
  creator_id: string | null;
  creator_name: string | null;
  priority: number | null;
  estimate: number | null;
  last_comment_at: string | null;
  comment_count: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  url: string;
  project_id: string | null;
  project_name: string | null;
  project_state_category: string | null;
  project_status: string | null;
  project_health: string | null;
  project_updated_at: string | null;
  project_lead_id: string | null;
  project_lead_name: string | null;
  project_target_date: string | null;
  project_start_date: string | null;
  project_completed_at: string | null;
  parent_id: string | null;
  labels: string | null;
}): void {
  const db = getDatabase();
  const query = db.prepare(`
    INSERT INTO issues (
      id, identifier, title, description, team_id, team_name, team_key,
      state_id, state_name, state_type,
      assignee_id, assignee_name, assignee_avatar_url, creator_id, creator_name,
      priority, estimate, last_comment_at, comment_count,
      created_at, updated_at, started_at, completed_at, canceled_at, url,
      project_id, project_name, project_state_category, project_status, project_health, project_updated_at,
      project_lead_id, project_lead_name, project_target_date, project_start_date, project_completed_at, parent_id, labels
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      identifier = excluded.identifier,
      title = excluded.title,
      description = excluded.description,
      team_id = excluded.team_id,
      team_name = excluded.team_name,
      team_key = excluded.team_key,
      state_id = excluded.state_id,
      state_name = excluded.state_name,
      state_type = excluded.state_type,
      assignee_id = excluded.assignee_id,
      assignee_name = excluded.assignee_name,
      assignee_avatar_url = excluded.assignee_avatar_url,
      creator_id = excluded.creator_id,
      creator_name = excluded.creator_name,
      priority = excluded.priority,
      estimate = excluded.estimate,
      last_comment_at = excluded.last_comment_at,
      comment_count = excluded.comment_count,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      canceled_at = excluded.canceled_at,
      url = excluded.url,
      project_id = excluded.project_id,
      project_name = excluded.project_name,
      project_state_category = excluded.project_state_category,
      project_status = excluded.project_status,
      project_health = excluded.project_health,
      project_updated_at = excluded.project_updated_at,
      project_lead_id = excluded.project_lead_id,
      project_lead_name = excluded.project_lead_name,
      project_target_date = excluded.project_target_date,
      project_start_date = excluded.project_start_date,
      project_completed_at = excluded.project_completed_at,
      parent_id = excluded.parent_id,
      labels = excluded.labels
  `);

  query.run(
    issue.id,
    issue.identifier,
    issue.title,
    issue.description,
    issue.team_id,
    issue.team_name,
    issue.team_key,
    issue.state_id,
    issue.state_name,
    issue.state_type,
    issue.assignee_id,
    issue.assignee_name,
    issue.assignee_avatar_url,
    issue.creator_id,
    issue.creator_name,
    issue.priority,
    issue.estimate,
    issue.last_comment_at,
    issue.comment_count,
    issue.created_at,
    issue.updated_at,
    issue.started_at,
    issue.completed_at,
    issue.canceled_at,
    issue.url,
    issue.project_id,
    issue.project_name,
    issue.project_state_category,
    issue.project_status,
    issue.project_health,
    issue.project_updated_at,
    issue.project_lead_id,
    issue.project_lead_name,
    issue.project_target_date,
    issue.project_start_date,
    issue.project_completed_at,
    issue.parent_id,
    issue.labels
  );
}

/**
 * Get all issues for a specific project
 */
export function getIssuesByProject(projectId: string): Issue[] {
  const db = getDatabase();
  const query = db.prepare(`
    SELECT * FROM issues
    WHERE project_id = ?
    ORDER BY team_name, identifier
  `);
  return query.all(projectId) as Issue[];
}

/**
 * Delete issues from specific teams (used for ignored teams)
 */
export function deleteIssuesByTeams(teamKeys: string[]): void {
  if (teamKeys.length === 0) return;

  const db = getDatabase();
  const placeholders = teamKeys.map(() => "?").join(",");
  const query = db.prepare(`
    DELETE FROM issues WHERE team_key IN (${placeholders})
  `);
  query.run(...teamKeys);
}

/**
 * Get all projects with computed metrics
 */
export function getAllProjects(): Project[] {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM projects`);
  return query.all() as Project[];
}

/**
 * Get a single project by ID
 */
export function getProjectById(projectId: string): Project | null {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM projects WHERE project_id = ?`);
  const result = query.get(projectId) as Project | undefined;
  return result || null;
}

/**
 * Upsert a project (insert or update)
 */
export function upsertProject(project: Project): void {
  const db = getDatabase();
  const query = db.prepare(`
    INSERT INTO projects (
      project_id, project_name, project_state_category, project_status, project_health, project_updated_at,
      project_lead_id, project_lead_name, project_description,
      total_issues, completed_issues, in_progress_issues, engineer_count,
      missing_estimate_count, missing_priority_count, no_recent_comment_count,
      wip_age_violation_count, missing_description_count,
      total_points, missing_points, average_cycle_time, average_lead_time,
      linear_progress, velocity, estimate_accuracy, days_per_story_point,
      has_status_mismatch, is_stale_update, missing_lead, has_violations, missing_health, has_date_discrepancy,
      start_date, last_activity_date, estimated_end_date, target_date, completed_at,
      issues_by_state, engineers, teams, velocity_by_team, labels, project_updates, last_synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(project_id) DO UPDATE SET
      project_name = excluded.project_name,
      project_state_category = excluded.project_state_category,
      project_status = excluded.project_status,
      project_health = excluded.project_health,
      project_updated_at = excluded.project_updated_at,
      project_lead_id = excluded.project_lead_id,
      project_lead_name = excluded.project_lead_name,
      project_description = excluded.project_description,
      total_issues = excluded.total_issues,
      completed_issues = excluded.completed_issues,
      in_progress_issues = excluded.in_progress_issues,
      engineer_count = excluded.engineer_count,
      missing_estimate_count = excluded.missing_estimate_count,
      missing_priority_count = excluded.missing_priority_count,
      no_recent_comment_count = excluded.no_recent_comment_count,
      wip_age_violation_count = excluded.wip_age_violation_count,
      missing_description_count = excluded.missing_description_count,
      total_points = excluded.total_points,
      missing_points = excluded.missing_points,
      average_cycle_time = excluded.average_cycle_time,
      average_lead_time = excluded.average_lead_time,
      linear_progress = excluded.linear_progress,
      velocity = excluded.velocity,
      estimate_accuracy = excluded.estimate_accuracy,
      days_per_story_point = excluded.days_per_story_point,
      has_status_mismatch = excluded.has_status_mismatch,
      is_stale_update = excluded.is_stale_update,
      missing_lead = excluded.missing_lead,
      has_violations = excluded.has_violations,
      missing_health = excluded.missing_health,
      has_date_discrepancy = excluded.has_date_discrepancy,
      start_date = excluded.start_date,
      last_activity_date = excluded.last_activity_date,
      estimated_end_date = excluded.estimated_end_date,
      target_date = excluded.target_date,
      completed_at = excluded.completed_at,
      issues_by_state = excluded.issues_by_state,
      engineers = excluded.engineers,
      teams = excluded.teams,
      velocity_by_team = excluded.velocity_by_team,
      labels = excluded.labels,
      project_updates = excluded.project_updates,
      last_synced_at = excluded.last_synced_at
  `);

  query.run(
    project.project_id,
    project.project_name,
    project.project_state_category,
    project.project_status,
    project.project_health,
    project.project_updated_at,
    project.project_lead_id,
    project.project_lead_name,
    project.project_description,
    project.total_issues,
    project.completed_issues,
    project.in_progress_issues,
    project.engineer_count,
    project.missing_estimate_count,
    project.missing_priority_count,
    project.no_recent_comment_count,
    project.wip_age_violation_count,
    project.missing_description_count,
    project.total_points,
    project.missing_points,
    project.average_cycle_time,
    project.average_lead_time,
    project.linear_progress,
    project.velocity,
    project.estimate_accuracy,
    project.days_per_story_point,
    project.has_status_mismatch,
    project.is_stale_update,
    project.missing_lead,
    project.has_violations,
    project.missing_health,
    project.has_date_discrepancy,
    project.start_date,
    project.last_activity_date,
    project.estimated_end_date,
    project.target_date,
    project.completed_at,
    project.issues_by_state,
    project.engineers,
    project.teams,
    project.velocity_by_team,
    project.labels,
    project.project_updates,
    project.last_synced_at
  );
}

/**
 * Delete projects that no longer exist (by project IDs)
 */
export function deleteProjectsByProjectIds(projectIds: string[]): void {
  if (projectIds.length === 0) return;

  const db = getDatabase();
  const placeholders = projectIds.map(() => "?").join(",");
  const query = db.prepare(`
    DELETE FROM projects WHERE project_id IN (${placeholders})
  `);
  query.run(...projectIds);
}

/**
 * Get projects filtered by label name
 */
export function getProjectsByLabel(labelName: string): Project[] {
  const db = getDatabase();
  const query = db.prepare(`
    SELECT * FROM projects
    WHERE labels IS NOT NULL
    AND labels LIKE ?
  `);
  // Search for label in JSON array string
  const searchPattern = `%"${labelName}"%`;
  return query.all(searchPattern) as Project[];
}

/**
 * Get projects that are "in progress" (project_state_category contains "progress" or "started")
 */
export function getInProgressProjects(): Project[] {
  const db = getDatabase();
  const query = db.prepare(`
    SELECT * FROM projects
    WHERE project_state_category IS NOT NULL
    AND (
      LOWER(project_state_category) LIKE '%progress%'
      OR LOWER(project_state_category) LIKE '%started%'
    )
  `);
  return query.all() as Project[];
}

/**
 * Get all engineers with computed WIP metrics
 */
export function getAllEngineers(): Engineer[] {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM engineers ORDER BY assignee_name`);
  return query.all() as Engineer[];
}

/**
 * Get a single engineer by assignee ID
 */
export function getEngineerById(assigneeId: string): Engineer | null {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM engineers WHERE assignee_id = ?`);
  const result = query.get(assigneeId) as Engineer | undefined;
  return result || null;
}

/**
 * Upsert an engineer (insert or update)
 */
export function upsertEngineer(engineer: Engineer): void {
  const db = getDatabase();
  const query = db.prepare(`
    INSERT INTO engineers (
      assignee_id, assignee_name, avatar_url, team_ids, team_names,
      wip_issue_count, wip_total_points, wip_limit_violation,
      oldest_wip_age_days, last_activity_at,
      missing_estimate_count, missing_priority_count,
      no_recent_comment_count, wip_age_violation_count,
      active_issues
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assignee_id) DO UPDATE SET
      assignee_name = excluded.assignee_name,
      avatar_url = excluded.avatar_url,
      team_ids = excluded.team_ids,
      team_names = excluded.team_names,
      wip_issue_count = excluded.wip_issue_count,
      wip_total_points = excluded.wip_total_points,
      wip_limit_violation = excluded.wip_limit_violation,
      oldest_wip_age_days = excluded.oldest_wip_age_days,
      last_activity_at = excluded.last_activity_at,
      missing_estimate_count = excluded.missing_estimate_count,
      missing_priority_count = excluded.missing_priority_count,
      no_recent_comment_count = excluded.no_recent_comment_count,
      wip_age_violation_count = excluded.wip_age_violation_count,
      active_issues = excluded.active_issues
  `);

  query.run(
    engineer.assignee_id,
    engineer.assignee_name,
    engineer.avatar_url,
    engineer.team_ids,
    engineer.team_names,
    engineer.wip_issue_count,
    engineer.wip_total_points,
    engineer.wip_limit_violation,
    engineer.oldest_wip_age_days,
    engineer.last_activity_at,
    engineer.missing_estimate_count,
    engineer.missing_priority_count,
    engineer.no_recent_comment_count,
    engineer.wip_age_violation_count,
    engineer.active_issues
  );
}

/**
 * Delete engineers by their assignee IDs
 */
export function deleteEngineersByIds(assigneeIds: string[]): void {
  if (assigneeIds.length === 0) return;

  const db = getDatabase();
  const placeholders = assigneeIds.map(() => "?").join(",");
  const query = db.prepare(`
    DELETE FROM engineers WHERE assignee_id IN (${placeholders})
  `);
  query.run(...assigneeIds);
}

/**
 * Get all existing engineer IDs (for cleanup)
 */
export function getExistingEngineerIds(): Set<string> {
  const db = getDatabase();
  const query = db.prepare(`SELECT assignee_id FROM engineers`);
  const rows = query.all() as { assignee_id: string }[];
  return new Set(rows.map((row) => row.assignee_id));
}

/**
 * Sync phases
 */
export type SyncPhase =
  | "initial_issues"
  | "recently_updated_issues"
  | "active_projects"
  | "planned_projects"
  | "completed_projects"
  | "initiative_projects"
  | "computing_metrics"
  | "initiatives"
  | "complete";

/**
 * Partial sync state structure
 */
export interface PartialSyncState {
  currentPhase?: SyncPhase;
  initialIssuesSync: "complete" | "incomplete";
  projectSyncs: Array<{
    projectId: string;
    status: "complete" | "incomplete";
  }>;
  plannedProjectsSync?: "complete" | "incomplete";
  plannedProjectSyncs?: Array<{
    projectId: string;
    status: "complete" | "incomplete";
  }>;
  completedProjectsSync?: "complete" | "incomplete";
  completedProjectSyncs?: Array<{
    projectId: string;
    status: "complete" | "incomplete";
  }>;
  initiativesSync?: "complete" | "incomplete";
}

/**
 * Sync metadata interface
 */
export interface SyncMetadata {
  id: number;
  last_sync_time: string | null;
  sync_status: "idle" | "syncing" | "error";
  sync_error: string | null;
  sync_progress_percent: number | null;
  partial_sync_state: string | null;
  api_query_count: number | null;
}

/**
 * Get sync metadata from database
 */
export function getSyncMetadata(): SyncMetadata | null {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM sync_metadata WHERE id = 1`);
  const result = query.get() as SyncMetadata | undefined;
  return result || null;
}

/**
 * Update sync metadata in database
 */
export function updateSyncMetadata(updates: {
  last_sync_time?: string | null;
  sync_status?: "idle" | "syncing" | "error";
  sync_error?: string | null;
  sync_progress_percent?: number | null;
  partial_sync_state?: string | null;
  api_query_count?: number | null;
}): void {
  const db = getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.last_sync_time !== undefined) {
    fields.push("last_sync_time = ?");
    values.push(updates.last_sync_time);
  }
  if (updates.sync_status !== undefined) {
    fields.push("sync_status = ?");
    values.push(updates.sync_status);
  }
  if (updates.sync_error !== undefined) {
    fields.push("sync_error = ?");
    values.push(updates.sync_error);
  }
  if (updates.sync_progress_percent !== undefined) {
    fields.push("sync_progress_percent = ?");
    values.push(updates.sync_progress_percent);
  }
  if (updates.partial_sync_state !== undefined) {
    fields.push("partial_sync_state = ?");
    values.push(updates.partial_sync_state);
  }
  if (updates.api_query_count !== undefined) {
    fields.push("api_query_count = ?");
    values.push(updates.api_query_count);
  }

  if (fields.length === 0) return;

  values.push(1); // id = 1
  const query = db.prepare(`
    UPDATE sync_metadata 
    SET ${fields.join(", ")}
    WHERE id = ?
  `);
  query.run(...values);
}

/**
 * Helper to set sync status
 */
export function setSyncStatus(status: "idle" | "syncing" | "error"): void {
  updateSyncMetadata({ sync_status: status });
}

/**
 * Helper to set sync progress
 */
export function setSyncProgress(percent: number | null): void {
  updateSyncMetadata({ sync_progress_percent: percent });
}

/**
 * Get partial sync state from database
 */
export function getPartialSyncState(): PartialSyncState | null {
  const db = getDatabase();
  const query = db.prepare(
    `SELECT partial_sync_state FROM sync_metadata WHERE id = 1`
  );
  const result = query.get() as
    | { partial_sync_state: string | null }
    | undefined;

  if (!result || !result.partial_sync_state) {
    return null;
  }

  try {
    return JSON.parse(result.partial_sync_state) as PartialSyncState;
  } catch (error) {
    console.error("[DB] Failed to parse partial sync state:", error);
    return null;
  }
}

/**
 * Save partial sync state to database
 */
export function savePartialSyncState(state: PartialSyncState): void {
  const db = getDatabase();
  const query = db.prepare(`
    UPDATE sync_metadata 
    SET partial_sync_state = ?
    WHERE id = 1
  `);
  query.run(JSON.stringify(state));
}

/**
 * Clear partial sync state from database
 */
export function clearPartialSyncState(): void {
  const db = getDatabase();
  const query = db.prepare(`
    UPDATE sync_metadata 
    SET partial_sync_state = NULL
    WHERE id = 1
  `);
  query.run();
}

/**
 * Get all initiatives
 */
export function getAllInitiatives(): Initiative[] {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM initiatives`);
  return query.all() as Initiative[];
}

/**
 * Get a single initiative by ID
 */
export function getInitiativeById(initiativeId: string): Initiative | null {
  const db = getDatabase();
  const query = db.prepare(`SELECT * FROM initiatives WHERE id = ?`);
  const result = query.get(initiativeId) as Initiative | undefined;
  return result || null;
}

/**
 * Upsert an initiative (insert or update)
 */
export function upsertInitiative(initiative: Initiative): void {
  const db = getDatabase();
  const query = db.prepare(`
    INSERT INTO initiatives (
      id, name, description, status, target_date, completed_at, started_at, archived_at,
      health, health_updated_at, health_updates, owner_id, owner_name, creator_id, creator_name,
      project_ids, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      target_date = excluded.target_date,
      completed_at = excluded.completed_at,
      started_at = excluded.started_at,
      archived_at = excluded.archived_at,
      health = excluded.health,
      health_updated_at = excluded.health_updated_at,
      health_updates = excluded.health_updates,
      owner_id = excluded.owner_id,
      owner_name = excluded.owner_name,
      creator_id = excluded.creator_id,
      creator_name = excluded.creator_name,
      project_ids = excluded.project_ids,
      updated_at = excluded.updated_at
  `);

  query.run(
    initiative.id,
    initiative.name,
    initiative.description,
    initiative.status,
    initiative.target_date,
    initiative.completed_at,
    initiative.started_at,
    initiative.archived_at,
    initiative.health,
    initiative.health_updated_at,
    initiative.health_updates,
    initiative.owner_id,
    initiative.owner_name,
    initiative.creator_id,
    initiative.creator_name,
    initiative.project_ids,
    initiative.created_at,
    initiative.updated_at
  );
}

/**
 * Delete initiatives by their IDs
 */
export function deleteInitiativesByIds(initiativeIds: string[]): void {
  if (initiativeIds.length === 0) return;

  const db = getDatabase();
  const placeholders = initiativeIds.map(() => "?").join(",");
  const query = db.prepare(`
    DELETE FROM initiatives WHERE id IN (${placeholders})
  `);
  query.run(...initiativeIds);
}
