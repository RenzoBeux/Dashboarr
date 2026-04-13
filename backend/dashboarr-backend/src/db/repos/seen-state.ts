import { getDb } from "../client.js";

/**
 * Persists poller state + cross-source dedupe keys.
 * Key conventions:
 *   - `qbt:hashes:downloading`          → JSON-encoded array of torrent hashes currently downloading
 *   - `radarr:queue:ids`                → JSON-encoded array of queue IDs currently present
 *   - `sonarr:queue:ids`                → JSON-encoded array of queue IDs currently present
 *   - `overseerr:pending:ids`           → JSON-encoded array of request IDs in pending
 *   - `health:<serviceId>:online`       → "1" or "0"
 *   - `event:<source>:<type>:<extId>`   → "1" once an event has been dispatched
 */

export function getState<T>(key: string): T | null {
  const row = getDb()
    .prepare<[string], { value: string }>("SELECT value FROM seen_state WHERE key = ?")
    .get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setState(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO seen_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), Date.now());
}

export function deleteState(key: string): void {
  getDb().prepare("DELETE FROM seen_state WHERE key = ?").run(key);
}

/**
 * Atomic "claim" for event dedupe. Returns true if this is the first time we've
 * seen this key — callers should only dispatch the push when `true`.
 */
export function claimEvent(key: string): boolean {
  const result = getDb()
    .prepare(
      `INSERT INTO seen_state (key, value, updated_at)
       VALUES (?, '1', ?)
       ON CONFLICT(key) DO NOTHING`,
    )
    .run(key, Date.now());
  return result.changes === 1;
}
