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
  priority: number;
  created_at: string;
  updated_at: string;
  url: string;
  project_id: string | null;
  project_name: string | null;
  project_state: string | null;
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
      priority INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      url TEXT NOT NULL,
      project_id TEXT,
      project_name TEXT,
      project_state TEXT,
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
