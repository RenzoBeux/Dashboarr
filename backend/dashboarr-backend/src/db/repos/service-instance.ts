import { getDb } from "../client.js";
import type { ServiceId, ServiceInstancePayload } from "../../types.js";
import { decryptSecret, encryptSecret } from "../../crypto/secrets.js";

interface ServiceInstanceRow {
  id: string;
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

export interface StoredServiceInstance {
  id: string;
  serviceId: ServiceId;
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

function mapRow(row: ServiceInstanceRow): StoredServiceInstance {
  return {
    id: row.id,
    serviceId: row.service_id as ServiceId,
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

export function upsertServiceInstance(payload: ServiceInstancePayload): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO service_instance
       (id, service_id, enabled, name, local_url, remote_url, use_remote,
        api_key, username, password, wol_mac, poll_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       service_id  = excluded.service_id,
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
    payload.kind,
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

/**
 * Replaces the entire service_instance set in one transaction. Anything not in
 * `instances` is removed — that's how the app's "delete instance" UI takes
 * effect on the backend.
 */
export function replaceAllServiceInstances(instances: ServiceInstancePayload[]): void {
  const db = getDb();
  const tx = db.transaction((items: ServiceInstancePayload[]) => {
    db.prepare("DELETE FROM service_instance").run();
    for (const item of items) {
      upsertServiceInstance(item);
    }
  });
  tx(instances);
}

export function listServiceInstances(): StoredServiceInstance[] {
  const rows = getDb()
    .prepare<[], ServiceInstanceRow>("SELECT * FROM service_instance")
    .all();
  return rows.map(mapRow);
}

export function listEnabledServiceInstances(): StoredServiceInstance[] {
  const rows = getDb()
    .prepare<[], ServiceInstanceRow>("SELECT * FROM service_instance WHERE enabled = 1")
    .all();
  return rows.map(mapRow);
}

export function getServiceInstance(id: string): StoredServiceInstance | null {
  const row = getDb()
    .prepare<[string], ServiceInstanceRow>("SELECT * FROM service_instance WHERE id = ?")
    .get(id);
  return row ? mapRow(row) : null;
}

/**
 * Returns the sole enabled instance of a kind, or null when there are 0 or >1.
 * Used by the webhook resolver to attribute (and apply per-instance notification
 * overrides for) an inbound event when the URL carries no `?instance=` — with a
 * single instance there's no ambiguity about which one sent it.
 */
export function getSoleEnabledInstanceByKind(kind: ServiceId): StoredServiceInstance | null {
  const rows = getDb()
    .prepare<[string], ServiceInstanceRow>(
      "SELECT * FROM service_instance WHERE enabled = 1 AND service_id = ?",
    )
    .all(kind);
  const [first] = rows;
  return rows.length === 1 && first ? mapRow(first) : null;
}

/**
 * Used by the offline-push attribution path: we only want to disambiguate the
 * push body when a kind has more than one enabled instance.
 */
export function countEnabledInstancesByKind(): Map<ServiceId, number> {
  const rows = getDb()
    .prepare<[], { service_id: string; n: number }>(
      "SELECT service_id, COUNT(*) AS n FROM service_instance WHERE enabled = 1 GROUP BY service_id",
    )
    .all();
  const out = new Map<ServiceId, number>();
  for (const r of rows) out.set(r.service_id as ServiceId, r.n);
  return out;
}
