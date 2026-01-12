import { Database } from "bun:sqlite";

export interface Issue {
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
  priority: number;
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
  project_target_date: string | null; // Linear's target date for the project
  project_start_date: string | null; // Linear's start date for the project
  project_completed_at: string | null; // Linear's completedAt date for the project
  parent_id: string | null; // For subissue detection
  labels: string | null; // JSON array of label objects
}

export interface Project {
  project_id: string;
  project_name: string;
  project_state_category: string | null;
  project_status: string | null;
  project_health: string | null;
  project_updated_at: string | null;
  project_lead_id: string | null;
  project_lead_name: string | null;
  project_description: string | null;
  project_content: string | null;
  total_issues: number;
  completed_issues: number;
  in_progress_issues: number;
  engineer_count: number;
  missing_estimate_count: number;
  missing_priority_count: number;
  no_recent_comment_count: number;
  wip_age_violation_count: number;
  missing_description_count: number;
  total_points: number;
  missing_points: number;
  average_cycle_time: number | null;
  average_lead_time: number | null;
  linear_progress: number | null;
  velocity: number;
  estimate_accuracy: number | null;
  days_per_story_point: number | null;
  has_status_mismatch: number;
  is_stale_update: number;
  missing_lead: number;
  has_violations: number;
  missing_health: number;
  has_date_discrepancy: number; // 1 if target date and predicted date differ by >30 days
  start_date: string | null;
  last_activity_date: string;
  estimated_end_date: string | null;
  target_date: string | null; // Linear's explicit target date for the project
  issues_by_state: string;
  engineers: string;
  teams: string;
  velocity_by_team: string;
  labels: string | null;
  project_updates: string | null;
  last_synced_at: string | null;
  completed_at: string | null; // ISO timestamp when project was completed
}

export interface Engineer {
  assignee_id: string;
  assignee_name: string;
  avatar_url: string | null;
  team_ids: string; // JSON array
  team_names: string; // JSON array
  wip_issue_count: number;
  wip_total_points: number;
  wip_limit_violation: number; // 1 if over threshold
  oldest_wip_age_days: number | null;
  last_activity_at: string | null;
  missing_estimate_count: number;
  missing_priority_count: number;
  no_recent_comment_count: number;
  wip_age_violation_count: number;
  active_issues: string; // JSON array of issue summaries
}

export interface Initiative {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  status: string | null;
  target_date: string | null; // ISO timestamp
  completed_at: string | null; // ISO timestamp
  started_at: string | null; // ISO timestamp
  archived_at: string | null; // ISO timestamp
  health: string | null;
  health_updated_at: string | null; // ISO timestamp
  health_updates: string | null; // JSON array of health updates (ProjectUpdate[])
  owner_id: string | null;
  owner_name: string | null;
  creator_id: string | null;
  creator_name: string | null;
  project_ids: string | null; // JSON array of project IDs
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Metrics snapshot levels
 */
export type MetricsSnapshotLevel = "org" | "domain" | "team";

/**
 * Metrics snapshot record for Four Pillars tracking
 */
export interface MetricsSnapshot {
  id: number;
  captured_at: string; // ISO timestamp
  schema_version: number; // For Zod schema versioning
  level: MetricsSnapshotLevel; // 'org' | 'domain' | 'team'
  level_id: string | null; // null for org, domain name, or team key
  metrics_json: string; // JSON blob with pillar metrics
  created_at: string; // ISO timestamp
}

/**
 * Expected columns in the issues table (in order)
 */
const EXPECTED_ISSUES_COLUMNS = [
  "id",
  "identifier",
  "title",
  "description",
  "team_id",
  "team_name",
  "team_key",
  "state_id",
  "state_name",
  "state_type",
  "assignee_id",
  "assignee_name",
  "assignee_avatar_url",
  "creator_id",
  "creator_name",
  "priority",
  "estimate",
  "last_comment_at",
  "comment_count",
  "created_at",
  "updated_at",
  "started_at",
  "completed_at",
  "canceled_at",
  "url",
  "project_id",
  "project_name",
  "project_state_category",
  "project_status",
  "project_health",
  "project_updated_at",
  "project_lead_id",
  "project_lead_name",
  "project_target_date",
  "project_start_date",
  "project_completed_at",
  "parent_id",
  "labels",
];

/**
 * Validate that the issues table has the expected schema
 */
export function validateSchema(db: Database): {
  valid: boolean;
  error?: string;
} {
  try {
    const columns = db.prepare("PRAGMA table_info(issues)").all() as Array<{
      name: string;
      type: string;
    }>;
    const columnNames = columns.map((col) => col.name);

    // Check if all expected columns exist
    const missingColumns = EXPECTED_ISSUES_COLUMNS.filter(
      (col) => !columnNames.includes(col)
    );

    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Missing columns: ${missingColumns.join(", ")}`,
      };
    }

    // Check column count matches
    if (columnNames.length !== EXPECTED_ISSUES_COLUMNS.length) {
      return {
        valid: false,
        error: `Column count mismatch: expected ${EXPECTED_ISSUES_COLUMNS.length}, found ${columnNames.length}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error validating schema",
    };
  }
}

/**
 * Reset the database by deleting all tables and recreating them
 */
export function resetDatabase(db: Database): void {
  console.log("[DB] Resetting database...");
  db.run("DROP TABLE IF EXISTS engineers");
  db.run("DROP TABLE IF EXISTS projects");
  db.run("DROP TABLE IF EXISTS issues");
  db.run("DROP TABLE IF EXISTS initiatives");
  db.run("DROP TABLE IF EXISTS sync_metadata");
  db.run("DROP TABLE IF EXISTS metrics_snapshots");
  // Drop indices as they will be recreated
  db.run("DROP INDEX IF EXISTS idx_issues_team_id");
  db.run("DROP INDEX IF EXISTS idx_issues_state_type");
  db.run("DROP INDEX IF EXISTS idx_issues_assignee_id");
  db.run("DROP INDEX IF EXISTS idx_issues_project_id");
  db.run("DROP INDEX IF EXISTS idx_projects_project_id");
  db.run("DROP INDEX IF EXISTS idx_engineers_assignee_id");
  db.run("DROP INDEX IF EXISTS idx_metrics_snapshots_captured_at");
  db.run("DROP INDEX IF EXISTS idx_metrics_snapshots_level");
  initializeDatabase(db);
  console.log("[DB] Database reset complete");
}

export function initializeDatabase(db: Database): void {
  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  // Create issues table with denormalized team and state info
  db.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      team_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      team_key TEXT NOT NULL,
      state_id TEXT NOT NULL,
      state_name TEXT NOT NULL,
      state_type TEXT NOT NULL,
      assignee_id TEXT,
      assignee_name TEXT,
      assignee_avatar_url TEXT,
      creator_id TEXT,
      creator_name TEXT,
      priority INTEGER NOT NULL,
      estimate REAL,
      last_comment_at TEXT,
      comment_count INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      canceled_at TEXT,
      url TEXT NOT NULL,
      project_id TEXT,
      project_name TEXT,
      project_state_category TEXT,
      project_status TEXT,
      project_health TEXT,
      project_updated_at TEXT,
      project_lead_id TEXT,
      project_lead_name TEXT,
      project_target_date TEXT,
      project_start_date TEXT,
      project_completed_at TEXT,
      parent_id TEXT,
      labels TEXT
    )
  `);

  // Rename project_state to project_state_category in issues table (migration)
  try {
    db.run(
      `ALTER TABLE issues RENAME COLUMN project_state TO project_state_category`
    );
  } catch (_e) {
    // Column might not exist or already renamed, ignore
  }

  // Create projects table with computed metrics
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      project_state_category TEXT,
      project_status TEXT,
      project_health TEXT,
      project_updated_at TEXT,
      project_lead_id TEXT,
      project_lead_name TEXT,
      project_description TEXT,
      project_content TEXT,
      total_issues INTEGER NOT NULL,
      completed_issues INTEGER NOT NULL,
      in_progress_issues INTEGER NOT NULL,
      engineer_count INTEGER NOT NULL,
      missing_estimate_count INTEGER NOT NULL,
      missing_priority_count INTEGER NOT NULL,
      no_recent_comment_count INTEGER NOT NULL,
      wip_age_violation_count INTEGER NOT NULL,
      missing_description_count INTEGER NOT NULL,
      total_points REAL NOT NULL,
      missing_points INTEGER NOT NULL,
      average_cycle_time REAL,
      average_lead_time REAL,
      linear_progress REAL,
      velocity REAL NOT NULL,
      estimate_accuracy REAL,
      days_per_story_point REAL,
      has_status_mismatch INTEGER NOT NULL,
      is_stale_update INTEGER NOT NULL,
      missing_lead INTEGER NOT NULL,
      has_violations INTEGER NOT NULL,
      missing_health INTEGER NOT NULL,
      has_date_discrepancy INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      last_activity_date TEXT NOT NULL,
      estimated_end_date TEXT,
      target_date TEXT,
      completed_at TEXT,
      issues_by_state TEXT NOT NULL,
      engineers TEXT NOT NULL,
      teams TEXT NOT NULL,
      velocity_by_team TEXT NOT NULL,
      labels TEXT,
      project_updates TEXT,
      last_synced_at TEXT
    )
  `);

  // Rename project_state to project_state_category in projects table (migration)
  try {
    db.run(
      `ALTER TABLE projects RENAME COLUMN project_state TO project_state_category`
    );
  } catch (_e) {
    // Column might not exist or already renamed, ignore
  }

  // Create engineers table with computed WIP metrics
  db.run(`
    CREATE TABLE IF NOT EXISTS engineers (
      assignee_id TEXT PRIMARY KEY,
      assignee_name TEXT NOT NULL,
      avatar_url TEXT,
      team_ids TEXT NOT NULL,
      team_names TEXT NOT NULL,
      wip_issue_count INTEGER NOT NULL,
      wip_total_points REAL NOT NULL,
      wip_limit_violation INTEGER NOT NULL,
      oldest_wip_age_days REAL,
      last_activity_at TEXT,
      missing_estimate_count INTEGER NOT NULL,
      missing_priority_count INTEGER NOT NULL,
      no_recent_comment_count INTEGER NOT NULL,
      wip_age_violation_count INTEGER NOT NULL,
      active_issues TEXT NOT NULL
    )
  `);

  // Create initiatives table
  db.run(`
    CREATE TABLE IF NOT EXISTS initiatives (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT,
      status TEXT,
      target_date TEXT,
      completed_at TEXT,
      started_at TEXT,
      archived_at TEXT,
      health TEXT,
      health_updated_at TEXT,
      health_updates TEXT,
      owner_id TEXT,
      owner_name TEXT,
      creator_id TEXT,
      creator_name TEXT,
      project_ids TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create sync metadata table to track sync status and timing
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_sync_time TEXT,
      sync_status TEXT NOT NULL DEFAULT 'idle',
      sync_error TEXT,
      sync_progress_percent INTEGER,
      partial_sync_state TEXT,
      api_query_count INTEGER,
      sync_status_message TEXT
    )
  `);

  // Create metrics_snapshots table for Four Pillars tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      level TEXT NOT NULL,
      level_id TEXT,
      metrics_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add phase_query_counts column if it doesn't exist (migration)
  // Stores JSON object mapping phase names to query counts: {"initial_issues": 50, "active_projects": 1200, ...}
  try {
    db.run(`ALTER TABLE sync_metadata ADD COLUMN phase_query_counts TEXT`);
  } catch (_e) {
    // Column already exists, ignore
  }

  // Initialize sync_metadata if it doesn't exist
  db.run(`
    INSERT OR IGNORE INTO sync_metadata (id, sync_status) VALUES (1, 'idle')
  `);

  // Create indices for better query performance
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_issues_team_id 
    ON issues(team_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_issues_state_type 
    ON issues(state_type)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_issues_assignee_id 
    ON issues(assignee_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_issues_project_id 
    ON issues(project_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_project_id 
    ON projects(project_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_engineers_assignee_id 
    ON engineers(assignee_id)
  `);

  // Indices for metrics_snapshots queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_captured_at 
    ON metrics_snapshots(captured_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_level 
    ON metrics_snapshots(level, level_id)
  `);
}
