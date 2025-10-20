import { Database } from "bun:sqlite";
import { initializeDatabase } from "./schema.js";

let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database("linear-bot.db");
    initializeDatabase(dbInstance);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
