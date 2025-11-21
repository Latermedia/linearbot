import { Database } from "bun:sqlite";
import { initializeDatabase } from "./schema.js";
import { join } from "path";
import { existsSync } from "fs";

let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    const dbPath = "linear-bot.db";
    const fullPath = join(process.cwd(), dbPath);
    const dbExists = existsSync(fullPath);
    
    console.log(`[DB] Creating database connection...`);
    console.log(`[DB] Database path: ${fullPath}`);
    console.log(`[DB] File exists: ${dbExists}`);
    console.log(`[DB] Runtime: ${typeof Bun !== 'undefined' ? 'Bun' : 'Node.js'}`);
    
    try {
      dbInstance = new Database(dbPath);
      console.log(`[DB] Database instance created successfully`);
      
      console.log(`[DB] Initializing database schema...`);
      initializeDatabase(dbInstance);
      console.log(`[DB] Database schema initialized`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[DB] Failed to create database connection: ${errorMsg}`);
      throw error;
    }
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
