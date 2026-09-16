import type { Device } from "../db/repos/devices.js";
import { activeUrlSide } from "../services/active-url.js";
import type { ConfigBackupMeta } from "../db/repos/config-backup.js";
import type { WebhookEventRow } from "../db/repos/events.js";
import type { StoredServiceInstance } from "../db/repos/service-instance.js";
import type { PollerStatus } from "../workers/scheduler.js";
import type {
  Overview,
  OverviewBackup,
  OverviewDevice,
  OverviewInstance,
  OverviewWebhook,
} from "./overview-types.js";
import { summarizeWebhookEvent } from "./webhook-summary.js";

/** Shape of the `health:<instanceId>:online` seen_state row (see transitions.ts diffHealth). */
export interface HealthState {
  online: boolean;
  failCount: number;
}

export interface OverviewInputs {
  version: string;
  uptimeMs: number;
  encryptionEnabled: boolean;
  publicUrl: string | null;
  backendUseRemote: boolean;
  devices: Device[];
  instances: StoredServiceInstance[];
  pollers: PollerStatus[];
  /** Lookup of the persisted health row for an instance, or null when never observed. */
  health: (instanceId: string) => { value: HealthState; updatedAt: number } | null;
  webhooks: WebhookEventRow[];
  backups: ConfigBackupMeta[];
  now: number;
}

/**
 * Reduces a URL to scheme + host + path for display. Userinfo (`user:pass@`),
 * the query string and the fragment are all dropped: config validation only
 * requires an http(s) URL, so a base URL like `https://host/api?apikey=…` is
 * accepted and must not reach the page. Unparseable input is replaced by an
 * empty string rather than echoed, for the same reason.
 */
export function displayUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

/**
 * Scrubs URLs embedded in a poller error message. ServiceHttpError (and
 * undici's own errors) quote the full request URL, which can carry a
 * `user:pass@` userinfo or an API key in the query string. Userinfo and the
 * entire query/fragment are dropped from every http(s) URL in the text.
 */
export function redactErrorText(message: string): string {
  return message.replace(/https?:\/\/[^\s"'<>)]+/g, (url) => {
    const noUserinfo = url.replace(/^(https?:\/\/)[^/@\s]*@/, "$1");
    return noUserinfo.replace(/[?#].*$/, "");
  });
}

/**
 * Pure assembly of the overview DTO. Every object is built field by field on
 * purpose: spreading a stored row would leak the next credential column that
 * gets added to the schema.
 *
 * Known limitation: `hasApiKey` / `hasCredentials` read the decrypted values,
 * and `decryptSecret` returns null when a value cannot be decrypted (lost
 * CONFIG_ENCRYPTION_KEY). Such an instance therefore shows "no API key" rather
 * than "unreadable"; the poller's lastError still reveals the auth failure.
 */
export function buildOverview(input: OverviewInputs): Overview {
  const pollerById = new Map(input.pollers.map((p) => [p.id, p]));

  const instances: OverviewInstance[] = [...input.instances]
    .sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.name.localeCompare(b.name))
    .map((inst) => {
      const poller = pollerById.get(inst.id);
      const health = input.health(inst.id);
      return {
        id: inst.id,
        kind: inst.serviceId,
        name: inst.name,
        enabled: inst.enabled,
        useRemote: inst.useRemote,
        localUrl: displayUrl(inst.localUrl),
        remoteUrl: displayUrl(inst.remoteUrl),
        activeUrl: activeUrlSide(inst.localUrl, inst.remoteUrl, input.backendUseRemote),
        hasApiKey: !!inst.apiKey,
        hasCredentials: !!inst.username || !!inst.password,
        pollMs: inst.pollMs,
        updatedAt: inst.updatedAt,
        poller: poller
          ? {
              intervalMs: poller.intervalMs,
              lastRunAt: poller.lastRunAt,
              lastError: poller.lastError === null ? null : redactErrorText(poller.lastError),
              failingSince: poller.failingSince,
            }
          : null,
        health: health
          ? {
              online: !!health.value.online,
              failCount: typeof health.value.failCount === "number" ? health.value.failCount : 0,
              updatedAt: health.updatedAt,
            }
          : null,
      };
    });

  const devices: OverviewDevice[] = input.devices.map((d) => ({
    id: d.id,
    platform: d.platform,
    appVersion: d.appVersion,
    createdAt: d.createdAt,
    lastSeenAt: d.lastSeenAt,
    invalid: d.invalid,
  }));

  const webhooks: OverviewWebhook[] = input.webhooks.map((w) => {
    const { eventType, summary } = summarizeWebhookEvent(w.source, w.payload);
    return { id: w.id, source: w.source, receivedAt: w.receivedAt, eventType, summary };
  });

  const backups: OverviewBackup[] = input.backups.map((b) => ({
    deviceId: b.deviceId,
    platform: b.platform,
    appVersion: b.appVersion,
    paired: b.paired,
    sizeBytes: b.sizeBytes,
    configVersion: b.configVersion,
    exportedAt: b.exportedAt,
    updatedAt: b.updatedAt,
  }));

  return {
    version: input.version,
    uptimeMs: input.uptimeMs,
    encryptionEnabled: input.encryptionEnabled,
    publicUrl: input.publicUrl === null ? null : displayUrl(input.publicUrl) || null,
    backendUseRemote: input.backendUseRemote,
    generatedAt: input.now,
    devices,
    instances,
    webhooks,
    backups,
  };
}
