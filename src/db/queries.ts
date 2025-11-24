import { getDatabase } from "./connection.js";
import type { Issue, Project } from "./schema.js";

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
  console.log('[getIssuesWithProjects] Querying database for issues with projects...');
  
  // First check total count
  const totalCountQuery = db.prepare(`SELECT COUNT(*) as count FROM issues`);
  const totalCount = (totalCountQuery.get() as { count: number }).count;
  console.log('[getIssuesWithProjects] Total issues in database:', totalCount);
  
  const query = db.prepare(`
    SELECT * FROM issues
    WHERE project_id IS NOT NULL
    ORDER BY team_name, project_name, identifier
  `);
  const results = query.all() as Issue[];
  console.log('[getIssuesWithProjects] Issues with projects:', results.length);
  
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
  creator_id: string | null;
  creator_name: string | null;
  priority: number | null;
  estimate: number | null;
  last_comment_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  url: string;
  project_id: string | null;
  project_name: string | null;
  project_state: string | null;
  project_health: string | null;
  project_updated_at: string | null;
  project_lead_id: string | null;
  project_lead_name: string | null;
}): void {
  const db = getDatabase();
  const query = db.prepare(`
    INSERT INTO issues (
      id, identifier, title, description, team_id, team_name, team_key,
      state_id, state_name, state_type,
      assignee_id, assignee_name, creator_id, creator_name,
      priority, estimate, last_comment_at,
      created_at, updated_at, started_at, completed_at, canceled_at, url,
      project_id, project_name, project_state, project_health, project_updated_at,
      project_lead_id, project_lead_name
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
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
      creator_id = excluded.creator_id,
      creator_name = excluded.creator_name,
      priority = excluded.priority,
      estimate = excluded.estimate,
      last_comment_at = excluded.last_comment_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      canceled_at = excluded.canceled_at,
      url = excluded.url,
      project_id = excluded.project_id,
      project_name = excluded.project_name,
      project_state = excluded.project_state,
      project_health = excluded.project_health,
      project_updated_at = excluded.project_updated_at,
      project_lead_id = excluded.project_lead_id,
      project_lead_name = excluded.project_lead_name
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
    issue.creator_id,
    issue.creator_name,
    issue.priority,
    issue.estimate,
    issue.last_comment_at,
    issue.created_at,
    issue.updated_at,
    issue.started_at,
    issue.completed_at,
    issue.canceled_at,
    issue.url,
    issue.project_id,
    issue.project_name,
    issue.project_state,
    issue.project_health,
    issue.project_updated_at,
    issue.project_lead_id,
    issue.project_lead_name
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
      project_id, project_name, project_state, project_health, project_updated_at,
      project_lead_id, project_lead_name,
      total_issues, completed_issues, in_progress_issues, engineer_count,
      missing_estimate_count, missing_priority_count, no_recent_comment_count,
      wip_age_violation_count, missing_description_count,
      total_points, missing_points, average_cycle_time, average_lead_time,
      linear_progress, velocity, estimate_accuracy, days_per_story_point,
      has_status_mismatch, is_stale_update, missing_lead, has_violations, missing_health,
      start_date, last_activity_date, estimated_end_date,
      issues_by_state, engineers, teams, velocity_by_team, labels
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(project_id) DO UPDATE SET
      project_name = excluded.project_name,
      project_state = excluded.project_state,
      project_health = excluded.project_health,
      project_updated_at = excluded.project_updated_at,
      project_lead_id = excluded.project_lead_id,
      project_lead_name = excluded.project_lead_name,
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
      start_date = excluded.start_date,
      last_activity_date = excluded.last_activity_date,
      estimated_end_date = excluded.estimated_end_date,
      issues_by_state = excluded.issues_by_state,
      engineers = excluded.engineers,
      teams = excluded.teams,
      velocity_by_team = excluded.velocity_by_team,
      labels = excluded.labels
  `);

  query.run(
    project.project_id,
    project.project_name,
    project.project_state,
    project.project_health,
    project.project_updated_at,
    project.project_lead_id,
    project.project_lead_name,
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
    project.start_date,
    project.last_activity_date,
    project.estimated_end_date,
    project.issues_by_state,
    project.engineers,
    project.teams,
    project.velocity_by_team,
    project.labels
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
 * Get projects that are "in progress" (project_state contains "progress" or "started")
 */
export function getInProgressProjects(): Project[] {
  const db = getDatabase();
  const query = db.prepare(`
    SELECT * FROM projects
    WHERE project_state IS NOT NULL
    AND (
      LOWER(project_state) LIKE '%progress%'
      OR LOWER(project_state) LIKE '%started%'
    )
  `);
  return query.all() as Project[];
}

