import { Database } from "bun:sqlite";
import { initializeDatabase, validateSchema, resetDatabase } from "./schema.js";
import { join } from "path";
import { existsSync } from "fs";

let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    // Use /data directory on Fly.io (persistent volume), fallback to current directory for local dev
    const dataDir = process.env.DATABASE_PATH || process.cwd();
    const dbPath = join(dataDir, "linear-bot.db");
    const dbExists = existsSync(dbPath);
    
    console.log(`[DB] Creating database connection...`);
    console.log(`[DB] Database path: ${dbPath}`);
    console.log(`[DB] Data directory: ${dataDir}`);
    console.log(`[DB] File exists: ${dbExists}`);
    console.log(`[DB] Runtime: ${typeof Bun !== 'undefined' ? 'Bun' : 'Node.js'}`);
    
    try {
      dbInstance = new Database(dbPath);
      console.log(`[DB] Database instance created successfully`);
      
      console.log(`[DB] Initializing database schema...`);
      initializeDatabase(dbInstance);
      
      // Validate schema after initialization
      const validation = validateSchema(dbInstance);
      if (!validation.valid) {
        console.error(`[DB] ⚠️ Schema validation failed: ${validation.error}`);
        console.error(`[DB] ⚠️ Database will NOT be auto-reset to prevent data loss.`);
        console.error(`[DB] ⚠️ If you need to reset, run: bun run reset-db`);
        console.error(`[DB] ⚠️ Continuing with existing database structure...`);
        // Don't auto-reset - too dangerous! User must explicitly reset
        // throw new Error(`Database schema validation failed: ${validation.error}`);
      } else {
        console.log(`[DB] Database schema initialized and validated`);
      }
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

export function resetDatabaseConnection(): void {
  if (dbInstance) {
    resetDatabase(dbInstance);
    dbInstance = null; // Force reconnection on next getDatabase() call
  }
}
