import { getDb } from "../client.js";

const MAX_ROWS = 1000;

export function recordWebhook(source: string, payload: unknown): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO webhook_events (source, received_at, payload_json) VALUES (?, ?, ?)",
  ).run(source, Date.now(), JSON.stringify(payload));
  // Trim
  db.prepare(
    `DELETE FROM webhook_events
     WHERE id IN (
       SELECT id FROM webhook_events ORDER BY id DESC LIMIT -1 OFFSET ?
     )`,
  ).run(MAX_ROWS);
}

export interface WebhookEventRow {
  id: number;
  source: string;
  receivedAt: number;
  /** Parsed payload_json, or null when the stored text is not valid JSON. */
  payload: unknown;
}

/** Newest first. `limit` is clamped to 1..200. */
export function listRecentWebhookEvents(limit: number): WebhookEventRow[] {
  const n = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = getDb()
    .prepare<[number], { id: number; source: string; received_at: number; payload_json: string }>(
      "SELECT id, source, received_at, payload_json FROM webhook_events ORDER BY id DESC LIMIT ?",
    )
    .all(n);
  return rows.map((row) => {
    let payload: unknown = null;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = null;
    }
    return { id: row.id, source: row.source, receivedAt: row.received_at, payload };
  });
}
