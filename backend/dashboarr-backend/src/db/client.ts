import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "../env.js";
import { INIT_SCHEMA } from "./schema.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const env = getEnv();
  mkdirSync(env.DATA_DIR, { recursive: true });
  const dbPath = join(env.DATA_DIR, "dashboarr.db");

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  db.exec(INIT_SCHEMA);
  runOneTimeMigrations(db);
  return db;
}

/**
 * One-shot data fixups gated by a `kv` flag so they run exactly once per
 * database. Schema changes belong in INIT_SCHEMA (idempotent via IF NOT
 * EXISTS); this is for things SQL DDL can't express.
 */
function runOneTimeMigrations(database: Database.Database): void {
  const flagRow = database
    .prepare<[string], { value: string }>("SELECT value FROM kv WHERE key = ?")
    .get("migrations:multi_instance:done");
  if (flagRow) return;

  // The pollers used to namespace seen_state by service kind
  // (qbt:hashes:downloading, radarr:queue:ids, …). Multi-instance pollers
  // namespace by instance UUID, so the legacy rows are orphaned and would
  // never match. Worse: the qBittorrent poller treats "no prior state" as
  // baseline (no pushes) but a stale per-kind row with a different shape
  // would just sit there forever. Wipe poller snapshots; keep the
  // event:* dedupe rows so we don't re-fire pushes for past events.
  database
    .prepare("DELETE FROM seen_state WHERE key NOT LIKE 'event:%'")
    .run();

  database
    .prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)")
    .run("migrations:multi_instance:done", "1");
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
