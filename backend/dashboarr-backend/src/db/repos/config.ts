import { getDb } from "../client.js";
import type { ServiceId, NotificationSettings } from "../../types.js";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../types.js";
import type { StoredServiceInstance } from "./service-instance.js";

/**
 * Notification toggles persistence. Per-kind only — there's no per-instance
 * "mute Radarr Seedbox" UI today; if it lands later, swap this table for one
 * keyed by (instance_id, category).
 */

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

/**
 * Derived view of an instance, keyed by `id = ServiceId` (the kind), used by
 * the lower-level service callers in services/*.ts. They don't care which
 * instance produced the URL/credentials — they just need the kind to pick
 * the right API base and auth scheme. This type predates multi-instance
 * support; instead of refactoring every service caller, the scheduler hands
 * each poller a StoredServiceInstance which is then adapted via
 * instanceToServiceConfig() before the service-layer call.
 */
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

export function instanceToServiceConfig(inst: StoredServiceInstance): StoredServiceConfig {
  return {
    id: inst.serviceId,
    enabled: inst.enabled,
    name: inst.name,
    localUrl: inst.localUrl,
    remoteUrl: inst.remoteUrl,
    useRemote: inst.useRemote,
    apiKey: inst.apiKey,
    username: inst.username,
    password: inst.password,
    wolMac: inst.wolMac,
    pollMs: inst.pollMs,
    updatedAt: inst.updatedAt,
  };
}
