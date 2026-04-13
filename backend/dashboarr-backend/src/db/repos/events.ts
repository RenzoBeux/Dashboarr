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
