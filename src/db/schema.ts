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
      url TEXT NOT NULL
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
}
