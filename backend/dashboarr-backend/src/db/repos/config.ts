import { getDb } from "../client.js";
import type { ServiceId, ServiceConfigPayload, NotificationSettings } from "../../types.js";
import { DEFAULT_NOTIFICATION_SETTINGS, SERVICE_IDS } from "../../types.js";
import { decryptSecret, encryptSecret } from "../../crypto/secrets.js";

interface ServiceConfigRow {
  service_id: string;
  enabled: number;
  name: string;
  local_url: string;
  remote_url: string;
  use_remote: number;
  api_key: string | null;
  username: string | null;
  password: string | null;
  wol_mac: string | null;
  poll_ms: number | null;
  updated_at: number;
}

export interface StoredServiceConfig {
  id: ServiceId;
  enabled: boolean;
  name: string;
  localUrl: string;
  remoteUrl: string;
  useRemote: boolean;
  apiKey: string | null;
  username: string | null;
  password: string | null;
  wolMac: string | null;
  pollMs: number | null;
  updatedAt: number;
}

function mapRow(row: ServiceConfigRow): StoredServiceConfig {
  return {
    id: row.service_id as ServiceId,
    enabled: row.enabled === 1,
    name: row.name,
    localUrl: row.local_url,
    remoteUrl: row.remote_url,
    useRemote: row.use_remote === 1,
    apiKey: decryptSecret(row.api_key),
    username: decryptSecret(row.username),
    password: decryptSecret(row.password),
    wolMac: row.wol_mac,
    pollMs: row.poll_ms,
    updatedAt: row.updated_at,
  };
}

export function upsertServiceConfig(payload: ServiceConfigPayload): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO service_config
       (service_id, enabled, name, local_url, remote_url, use_remote,
        api_key, username, password, wol_mac, poll_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service_id) DO UPDATE SET
       enabled     = excluded.enabled,
       name        = excluded.name,
       local_url   = excluded.local_url,
       remote_url  = excluded.remote_url,
       use_remote  = excluded.use_remote,
       api_key     = excluded.api_key,
       username    = excluded.username,
       password    = excluded.password,
       wol_mac     = excluded.wol_mac,
       poll_ms     = excluded.poll_ms,
       updated_at  = excluded.updated_at`,
  ).run(
    payload.id,
    payload.enabled ? 1 : 0,
    payload.name,
    payload.localUrl,
    payload.remoteUrl,
    payload.useRemote ? 1 : 0,
    encryptSecret(payload.apiKey ?? null),
    encryptSecret(payload.username ?? null),
    encryptSecret(payload.password ?? null),
    payload.wolMac ?? null,
    payload.pollMs ?? null,
    Date.now(),
  );
}

export function replaceAllServiceConfigs(configs: ServiceConfigPayload[]): void {
  const db = getDb();
  const tx = db.transaction((items: ServiceConfigPayload[]) => {
    db.prepare("DELETE FROM service_config").run();
    for (const item of items) {
      upsertServiceConfig(item);
    }
  });
  tx(configs);
}

export function listServiceConfigs(): StoredServiceConfig[] {
  const rows = getDb()
    .prepare<[], ServiceConfigRow>("SELECT * FROM service_config")
    .all();
  return rows.map(mapRow);
}

export function getServiceConfig(id: ServiceId): StoredServiceConfig | null {
  const row = getDb()
    .prepare<[string], ServiceConfigRow>("SELECT * FROM service_config WHERE service_id = ?")
    .get(id);
  return row ? mapRow(row) : null;
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO notification_settings (key, enabled) VALUES (?, ?)",
    );
    for (const [k, v] of Object.entries(settings)) {
      stmt.run(k, v ? 1 : 0);
    }
  });
  tx();
}

export function loadNotificationSettings(): NotificationSettings {
  const rows = getDb()
    .prepare<[], { key: string; enabled: number }>(
      "SELECT key, enabled FROM notification_settings",
    )
    .all();
  const result: Record<string, boolean> = { ...DEFAULT_NOTIFICATION_SETTINGS };
  for (const row of rows) {
    result[row.key] = row.enabled === 1;
  }
  return result as NotificationSettings;
}

export function serviceIdsWithConfig(): ServiceId[] {
  const rows = getDb()
    .prepare<[], { service_id: string }>("SELECT service_id FROM service_config WHERE enabled = 1")
    .all();
  const set = new Set(rows.map((r) => r.service_id));
  return SERVICE_IDS.filter((id) => set.has(id));
}
