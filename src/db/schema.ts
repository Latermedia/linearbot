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
}

export interface CommentLog {
  id: number;
  issue_id: string;
  comment_type: string;
  commented_at: string;
}

export interface Project {
  project_id: string;
  project_name: string;
  project_state: string | null;
  project_health: string | null;
  project_updated_at: string | null;
  project_lead_id: string | null;
  project_lead_name: string | null;
  project_description: string | null;
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
  start_date: string | null;
  last_activity_date: string;
  estimated_end_date: string | null;
  issues_by_state: string;
  engineers: string;
  teams: string;
  velocity_by_team: string;
  labels: string | null;
  project_updates: string | null;
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
  "created_at",
  "updated_at",
  "started_at",
  "completed_at",
  "canceled_at",
  "url",
  "project_id",
  "project_name",
  "project_state",
  "project_health",
  "project_updated_at",
  "project_lead_id",
  "project_lead_name",
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
  db.run("DROP TABLE IF EXISTS comment_log");
  db.run("DROP TABLE IF EXISTS engineers");
  db.run("DROP TABLE IF EXISTS projects");
  db.run("DROP TABLE IF EXISTS issues");
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      url TEXT NOT NULL,
      project_id TEXT,
      project_name TEXT,
      project_state TEXT,
      project_health TEXT,
      project_updated_at TEXT,
      project_lead_id TEXT,
      project_lead_name TEXT
    )
  `);

  // Add project lead columns if they don't exist (migration)
  try {
    db.run(`ALTER TABLE issues ADD COLUMN project_lead_id TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN project_lead_name TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN project_health TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add creator columns if they don't exist (migration)
  try {
    db.run(`ALTER TABLE issues ADD COLUMN creator_id TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN creator_name TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add assignee avatar column if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE issues ADD COLUMN assignee_avatar_url TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add estimate and last_comment_at columns if they don't exist (migration)
  try {
    db.run(`ALTER TABLE issues ADD COLUMN estimate REAL`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN last_comment_at TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN started_at TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN completed_at TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run(`ALTER TABLE issues ADD COLUMN canceled_at TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add labels column to projects table if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE projects ADD COLUMN labels TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  // Add project_description column to projects table if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE projects ADD COLUMN project_description TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  // Add project_updates column to projects table if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE projects ADD COLUMN project_updates TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create projects table with computed metrics
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      project_state TEXT,
      project_health TEXT,
      project_updated_at TEXT,
      project_lead_id TEXT,
      project_lead_name TEXT,
      project_description TEXT,
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
      start_date TEXT,
      last_activity_date TEXT NOT NULL,
      estimated_end_date TEXT,
      issues_by_state TEXT NOT NULL,
      engineers TEXT NOT NULL,
      teams TEXT NOT NULL,
      velocity_by_team TEXT NOT NULL,
      labels TEXT,
      project_updates TEXT
    )
  `);

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

  // Add avatar_url column to engineers table if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE engineers ADD COLUMN avatar_url TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create comment log table to track bot comments
  db.run(`
    CREATE TABLE IF NOT EXISTS comment_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id TEXT NOT NULL,
      comment_type TEXT NOT NULL,
      commented_at TEXT NOT NULL,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
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
      partial_sync_state TEXT
    )
  `);

  // Add partial_sync_state column if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE sync_metadata ADD COLUMN partial_sync_state TEXT`);
  } catch (e) {
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
    CREATE INDEX IF NOT EXISTS idx_comment_log_issue_id 
    ON comment_log(issue_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_comment_log_type_date 
    ON comment_log(comment_type, commented_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_project_id 
    ON projects(project_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_engineers_assignee_id 
    ON engineers(assignee_id)
  `);
}
