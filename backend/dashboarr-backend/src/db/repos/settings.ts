import { randomBytes } from "node:crypto";
import { getDb } from "../client.js";

/**
 * Miscellaneous server-owned settings (webhook path secrets, etc) stored
 * in the `kv` table. App-facing notification settings live in
 * `notification_settings` via config.ts.
 */

function getKv(key: string): string | null {
  const row = getDb()
    .prepare<[string], { value: string }>("SELECT value FROM kv WHERE key = ?")
    .get(key);
  return row ? row.value : null;
}

function setKv(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

const WEBHOOK_SECRET_KEY = "webhook_secret";

/**
 * Single shared secret used by all webhook path suffixes. Generated on first
 * boot and persisted. Rotate by deleting the `kv` row — next boot regenerates.
 */
export function getWebhookSecret(): string {
  const existing = getKv(WEBHOOK_SECRET_KEY);
  if (existing) return existing;
  const secret = randomBytes(16).toString("hex");
  setKv(WEBHOOK_SECRET_KEY, secret);
  return secret;
}
