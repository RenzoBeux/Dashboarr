/**
 * Initial schema for dashboarr-backend. Single-user-per-deploy.
 *
 * Inlined as a TS constant so `tsc` emits it into `dist/` without the Docker
 * image needing a separate COPY step for SQL files. When adding a new
 * migration, prefer appending statements to this constant (IF NOT EXISTS) or
 * introducing a numbered constant and running them in order.
 */
export const INIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id              TEXT PRIMARY KEY,
  expo_push_token TEXT NOT NULL UNIQUE,
  shared_secret   TEXT NOT NULL,
  platform        TEXT NOT NULL,
  app_version     TEXT,
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  invalid         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_devices_valid ON devices(invalid);

CREATE TABLE IF NOT EXISTS service_config (
  service_id  TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  local_url   TEXT NOT NULL DEFAULT '',
  remote_url  TEXT NOT NULL DEFAULT '',
  use_remote  INTEGER NOT NULL DEFAULT 0,
  api_key     TEXT,
  username    TEXT,
  password    TEXT,
  wol_mac     TEXT,
  poll_ms     INTEGER,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seen_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_settings (
  key     TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  received_at  INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source, received_at DESC);

CREATE TABLE IF NOT EXISTS pairing_tokens (
  token       TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL,
  claimed_at  INTEGER
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
