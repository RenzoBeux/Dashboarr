import { getDb } from "../client.js";
import type { ServiceId, NotificationSettings, NotifCategory, AppriseConfig } from "../../types.js";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../types.js";
import type { StoredServiceInstance } from "./service-instance.js";

/**
 * Notification toggles persistence. The boolean per-category toggles live in
 * `notification_settings`. v21 added per-instance overrides — stored as a JSON
 * blob in the generic `kv` table since it's read whole on every dispatch and
 * is naturally sparse (most users have no overrides).
 */

const PER_INSTANCE_KV_KEY = "notification.perInstance";
const APPRISE_KV_KEY = "notification.apprise";

export function saveNotificationSettings(settings: NotificationSettings): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO notification_settings (key, enabled) VALUES (?, ?)",
    );
    for (const [k, v] of Object.entries(settings)) {
      // Non-boolean fields are stored as JSON blobs in `kv` below, not as
      // key→boolean rows here.
      if (k === "perInstance" || k === "apprise") continue;
      stmt.run(k, v ? 1 : 0);
    }

    if (settings.perInstance && Object.keys(settings.perInstance).length > 0) {
      db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(
        PER_INSTANCE_KV_KEY,
        JSON.stringify(settings.perInstance),
      );
    } else {
      db.prepare("DELETE FROM kv WHERE key = ?").run(PER_INSTANCE_KV_KEY);
    }

    // Persist Apprise config whenever a notify URL is present (even if disabled,
    // so toggling off doesn't drop the URL). Cleared when no URL is set.
    if (settings.apprise && settings.apprise.url) {
      db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(
        APPRISE_KV_KEY,
        JSON.stringify(settings.apprise),
      );
    } else {
      db.prepare("DELETE FROM kv WHERE key = ?").run(APPRISE_KV_KEY);
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
  const result: Record<string, unknown> = { ...DEFAULT_NOTIFICATION_SETTINGS };
  for (const row of rows) {
    result[row.key] = row.enabled === 1;
  }

  const perRow = getDb()
    .prepare<[string], { value: string }>("SELECT value FROM kv WHERE key = ?")
    .get(PER_INSTANCE_KV_KEY);
  if (perRow?.value) {
    try {
      const parsed = JSON.parse(perRow.value);
      if (parsed && typeof parsed === "object") {
        result.perInstance = parsed as Record<
          string,
          Partial<Record<NotifCategory, boolean>>
        >;
      }
    } catch {
      // Malformed JSON in kv — drop it silently rather than crash the
      // dispatcher. Next saveNotificationSettings call rewrites it.
    }
  }

  const appriseRow = getDb()
    .prepare<[string], { value: string }>("SELECT value FROM kv WHERE key = ?")
    .get(APPRISE_KV_KEY);
  if (appriseRow?.value) {
    try {
      const parsed = JSON.parse(appriseRow.value);
      if (parsed && typeof parsed === "object") {
        result.apprise = parsed as AppriseConfig;
      }
    } catch {
      // Malformed JSON — drop silently, same rationale as perInstance above.
    }
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
