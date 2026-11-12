import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_URL ?? "./data/habit-tracker.db";

declare global {
  var __habitTrackerDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/** Singleton Drizzle instance over better-sqlite3 (WAL mode). */
export const db = globalThis.__habitTrackerDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalThis.__habitTrackerDb = db;
}
