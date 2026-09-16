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
  ensureColumns(db);
  runOneTimeMigrations(db);
  return db;
}

/**
 * Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS does
 * not alter an existing table, so each one is checked against PRAGMA
 * table_info and added when missing — idempotent, no flag to keep.
 */
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  // backend 1.7: optimistic-concurrency token for the web editor's slot writes.
  { table: "config_backup", column: "revision", ddl: "revision INTEGER NOT NULL DEFAULT 0" },
];

function ensureColumns(database: Database.Database): void {
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const cols = database.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
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
