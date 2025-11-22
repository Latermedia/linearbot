import { getDatabase } from "./connection.js";
import type { Issue } from "./schema.js";

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
  const query = db.prepare(`
    SELECT * FROM issues
    WHERE project_id IS NOT NULL
    ORDER BY team_name, project_name, identifier
  `);
  return query.all() as Issue[];
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
      created_at, updated_at, url,
      project_id, project_name, project_state, project_health, project_updated_at,
      project_lead_id, project_lead_name
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
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

