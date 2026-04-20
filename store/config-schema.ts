import { SERVICE_IDS, DASHBOARD_WIDGET_IDS } from "@/lib/constants";
import type { ServiceId, WidgetId } from "@/lib/constants";
import type { ExportPayload, ServiceConfig, ServiceSecrets, WakeOnLanDevice } from "@/store/config-store";
import type { NotificationSettings } from "@/store/notifications-store";

const SERVICE_ID_SET: ReadonlySet<string> = new Set(SERVICE_IDS);
const WIDGET_ID_SET: ReadonlySet<string> = new Set(DASHBOARD_WIDGET_IDS);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isHttpUrlOrEmpty(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function coerceServiceConfig(v: unknown): ServiceConfig | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.enabled !== "boolean") return null;
  if (typeof v.name !== "string" || v.name.length > 200) return null;
  if (!isHttpUrlOrEmpty(v.localUrl)) return null;
  if (!isHttpUrlOrEmpty(v.remoteUrl)) return null;
  if (typeof v.useRemote !== "boolean") return null;
  return {
    enabled: v.enabled,
    name: v.name,
    localUrl: v.localUrl,
    remoteUrl: v.remoteUrl,
    useRemote: v.useRemote,
  };
}

function coerceServiceSecrets(v: unknown): ServiceSecrets | null {
  if (!isPlainObject(v)) return null;
  const out: ServiceSecrets = {};
  for (const key of ["apiKey", "username", "password"] as const) {
    const raw = v[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string" || raw.length > 4096) return null;
    out[key] = raw;
  }
  return out;
}

function coerceWolDevice(v: unknown): WakeOnLanDevice | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 128) return null;
  if (typeof v.name !== "string" || v.name.length > 200) return null;
  if (typeof v.mac !== "string" || v.mac.length > 32) return null;
  const out: WakeOnLanDevice = { id: v.id, name: v.name, mac: v.mac };
  if (v.broadcastAddress !== undefined) {
    if (typeof v.broadcastAddress !== "string" || v.broadcastAddress.length > 45) return null;
    out.broadcastAddress = v.broadcastAddress;
  }
  if (v.port !== undefined) {
    if (typeof v.port !== "number" || !Number.isInteger(v.port) || v.port < 1 || v.port > 65535) {
      return null;
    }
    out.port = v.port;
  }
  return out;
}

function coerceNotificationSettings(v: unknown): NotificationSettings | null {
  if (!isPlainObject(v)) return null;
  const keys = [
    "enabled",
    "torrentCompleted",
    "radarrDownloaded",
    "sonarrDownloaded",
    "serviceOffline",
    "overseerrNewRequest",
  ] as const;
  const out: Partial<NotificationSettings> = {};
  for (const key of keys) {
    if (typeof v[key] !== "boolean") return null;
    out[key] = v[key] as boolean;
  }
  return out as NotificationSettings;
}

function coerceBackend(v: unknown): ExportPayload["backend"] | null {
  if (!isPlainObject(v)) return null;
  const urlOk = v.url === null || isHttpUrlOrEmpty(v.url);
  const secretOk = v.sharedSecret === null || (typeof v.sharedSecret === "string" && v.sharedSecret.length <= 512);
  const idOk = v.deviceId === null || (typeof v.deviceId === "string" && v.deviceId.length <= 256);
  if (!urlOk || !secretOk || !idOk) return null;
  return {
    url: typeof v.url === "string" ? v.url : null,
    sharedSecret: typeof v.sharedSecret === "string" ? v.sharedSecret : null,
    deviceId: typeof v.deviceId === "string" ? v.deviceId : null,
  };
}

/**
 * Validate and sanitize a post-migration ExportPayload. Returns a cleaned
 * payload on success or throws a descriptive Error on any shape violation.
 *
 * Every field is checked: unknown service IDs are dropped (forward-compatible),
 * non-http(s) URLs are rejected, oversize strings are rejected, enum fields
 * must match the known set.
 */
export function validateExportPayload(raw: unknown): ExportPayload {
  if (!isPlainObject(raw)) throw new Error("Config root must be an object");
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 0) {
    throw new Error("Config version is missing or invalid");
  }
  if (typeof raw.exportedAt !== "string" || raw.exportedAt.length > 64) {
    throw new Error("Config exportedAt is missing or invalid");
  }
  if (!isPlainObject(raw.services)) throw new Error("Config services is missing or invalid");
  if (!isPlainObject(raw.secrets)) throw new Error("Config secrets is missing or invalid");
  if (typeof raw.autoSwitchNetwork !== "boolean") throw new Error("Config autoSwitchNetwork is invalid");
  if (typeof raw.homeSSID !== "string" || raw.homeSSID.length > 64) throw new Error("Config homeSSID is invalid");
  if (raw.homeBSSID !== undefined && (typeof raw.homeBSSID !== "string" || raw.homeBSSID.length > 64)) {
    throw new Error("Config homeBSSID is invalid");
  }
  if (!Array.isArray(raw.dashboardWidgets)) throw new Error("Config dashboardWidgets is invalid");

  const services = {} as Record<ServiceId, ServiceConfig>;
  for (const [id, value] of Object.entries(raw.services)) {
    if (!SERVICE_ID_SET.has(id)) continue;
    const coerced = coerceServiceConfig(value);
    if (!coerced) throw new Error(`Config services.${id} is invalid`);
    services[id as ServiceId] = coerced;
  }

  const secrets = {} as Record<ServiceId, ServiceSecrets>;
  for (const [id, value] of Object.entries(raw.secrets)) {
    if (!SERVICE_ID_SET.has(id)) continue;
    const coerced = coerceServiceSecrets(value);
    if (!coerced) throw new Error(`Config secrets.${id} is invalid`);
    secrets[id as ServiceId] = coerced;
  }

  const dashboardWidgets: WidgetId[] = [];
  for (const item of raw.dashboardWidgets) {
    if (typeof item === "string" && WIDGET_ID_SET.has(item)) {
      dashboardWidgets.push(item as WidgetId);
    }
  }

  const payload: ExportPayload = {
    version: raw.version,
    exportedAt: raw.exportedAt,
    services,
    secrets,
    autoSwitchNetwork: raw.autoSwitchNetwork,
    homeSSID: raw.homeSSID,
    dashboardWidgets,
  };

  if (typeof raw.homeBSSID === "string") {
    payload.homeBSSID = raw.homeBSSID;
  }

  if (raw.backend !== undefined && raw.backend !== null) {
    const coerced = coerceBackend(raw.backend);
    if (!coerced) throw new Error("Config backend is invalid");
    payload.backend = coerced;
  }

  if (raw.notificationSettings !== undefined && raw.notificationSettings !== null) {
    const coerced = coerceNotificationSettings(raw.notificationSettings);
    if (!coerced) throw new Error("Config notificationSettings is invalid");
    payload.notificationSettings = coerced;
  }

  if (raw.wolDevices !== undefined && raw.wolDevices !== null) {
    if (!Array.isArray(raw.wolDevices)) throw new Error("Config wolDevices is invalid");
    const devices: WakeOnLanDevice[] = [];
    for (const item of raw.wolDevices) {
      const coerced = coerceWolDevice(item);
      if (!coerced) throw new Error("Config wolDevices entry is invalid");
      devices.push(coerced);
    }
    payload.wolDevices = devices;
  }

  return payload;
}
