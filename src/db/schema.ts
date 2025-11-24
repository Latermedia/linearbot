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

/**
 * Expected columns in the issues table (in order)
 */
const EXPECTED_ISSUES_COLUMNS = [
  'id', 'identifier', 'title', 'description', 'team_id', 'team_name', 'team_key',
  'state_id', 'state_name', 'state_type',
  'assignee_id', 'assignee_name', 'creator_id', 'creator_name',
  'priority', 'estimate', 'last_comment_at',
  'created_at', 'updated_at', 'started_at', 'completed_at', 'canceled_at', 'url',
  'project_id', 'project_name', 'project_state', 'project_health', 'project_updated_at',
  'project_lead_id', 'project_lead_name'
];

/**
 * Validate that the issues table has the expected schema
 */
export function validateSchema(db: Database): { valid: boolean; error?: string } {
  try {
    const columns = db.prepare("PRAGMA table_info(issues)").all() as Array<{ name: string; type: string }>;
    const columnNames = columns.map(col => col.name);
    
    // Check if all expected columns exist
    const missingColumns = EXPECTED_ISSUES_COLUMNS.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Missing columns: ${missingColumns.join(', ')}`
      };
    }
    
    // Check column count matches
    if (columnNames.length !== EXPECTED_ISSUES_COLUMNS.length) {
      return {
        valid: false,
        error: `Column count mismatch: expected ${EXPECTED_ISSUES_COLUMNS.length}, found ${columnNames.length}`
      };
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating schema'
    };
  }
}

/**
 * Reset the database by deleting all tables and recreating them
 */
export function resetDatabase(db: Database): void {
  console.log('[DB] Resetting database...');
  db.run("DROP TABLE IF EXISTS comment_log");
  db.run("DROP TABLE IF EXISTS issues");
  initializeDatabase(db);
  console.log('[DB] Database reset complete');
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
}
