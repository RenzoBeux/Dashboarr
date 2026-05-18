import { SERVICE_IDS, DASHBOARD_WIDGET_IDS, UI_SCALES } from "@/lib/constants";
import type { ServiceId, WidgetId } from "@/lib/constants";
import type {
  Dashboard,
  ExportPayload,
  HomeNetwork,
  ServiceInstance,
  ServiceSecrets,
  WakeOnLanDevice,
  WidgetSlot,
} from "@/store/config-store";
import type { NotificationSettings } from "@/store/config-store";
import { MAX_PINNED_TABS } from "@/lib/tab-routes";

const SERVICE_ID_SET: ReadonlySet<string> = new Set(SERVICE_IDS);
const WIDGET_ID_SET: ReadonlySet<string> = new Set(DASHBOARD_WIDGET_IDS);

// Accepts the 8 hex characters palette swatches use. Restrictive on purpose —
// rejects "transparent", named colors, and rgba() so the field stays a stable
// JSON-serializable string the picker can map back to a palette entry.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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

// RFC 7230 token chars — same set the spec allows in field-name. Rejecting
// CR/LF in values closes off header-injection if someone hand-edits an export.
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const MAX_HEADERS_PER_SCOPE = 32;
const MAX_HOME_NETWORKS = 20;

function coerceHeaderMap(v: unknown): Record<string, string> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(v)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 200) return null;
    if (!HEADER_NAME_RE.test(key)) return null;
    if (typeof value !== "string" || value.length > 4096) return null;
    if (/[\r\n]/.test(value)) return null;
    out[key] = value;
    if (++count > MAX_HEADERS_PER_SCOPE) return null;
  }
  return out;
}

function coerceServiceInstance(v: unknown): ServiceInstance | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 128) return null;
  if (typeof v.enabled !== "boolean") return null;
  if (typeof v.name !== "string" || v.name.length > 200) return null;
  if (!isHttpUrlOrEmpty(v.localUrl)) return null;
  if (!isHttpUrlOrEmpty(v.remoteUrl)) return null;
  if (typeof v.useRemote !== "boolean") return null;
  return {
    id: v.id,
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
  if (v.customHeaders !== undefined && v.customHeaders !== null) {
    const headers = coerceHeaderMap(v.customHeaders);
    if (!headers) return null;
    if (Object.keys(headers).length > 0) out.customHeaders = headers;
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

function coerceHomeNetwork(v: unknown): HomeNetwork | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 128) return null;
  if (typeof v.ssid !== "string" || v.ssid.length === 0 || v.ssid.length > 64) return null;
  if (typeof v.bssid !== "string" || v.bssid.length > 64) return null;
  return { id: v.id, ssid: v.ssid, bssid: v.bssid };
}

function coerceWidgetSlot(v: unknown): WidgetSlot | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 128) return null;
  if (typeof v.widgetId !== "string") return null;
  if (!WIDGET_ID_SET.has(v.widgetId)) return null;
  const slot: WidgetSlot = { id: v.id, widgetId: v.widgetId as WidgetId };
  if (v.settings !== undefined && v.settings !== null) {
    if (!isPlainObject(v.settings)) return null;
    slot.settings = v.settings as Record<string, unknown>;
  }
  return slot;
}

function coerceDashboard(v: unknown): Dashboard | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string" || v.id.length === 0 || v.id.length > 128) return null;
  if (typeof v.name !== "string" || v.name.length === 0 || v.name.length > 200) return null;
  if (!Array.isArray(v.widgets)) return null;
  const widgets: WidgetSlot[] = [];
  for (const w of v.widgets) {
    const slot = coerceWidgetSlot(w);
    if (!slot) continue;
    widgets.push(slot);
  }
  const out: Dashboard = { id: v.id, name: v.name, widgets };
  // v20: optional identity + workspace fields. Each is rejected only when
  // present-but-malformed; absent fields fall back at render time via the
  // resolve helpers, so old payloads validate cleanly.
  if (v.icon !== undefined && v.icon !== null) {
    if (typeof v.icon !== "string" || v.icon.length === 0 || v.icon.length > 64) {
      return null;
    }
    out.icon = v.icon;
  }
  if (v.color !== undefined && v.color !== null) {
    if (typeof v.color !== "string" || !HEX_COLOR_RE.test(v.color)) return null;
    out.color = v.color;
  }
  if (v.attachedInstances !== undefined && v.attachedInstances !== null) {
    if (!Array.isArray(v.attachedInstances)) return null;
    const seen = new Set<string>();
    const attached: string[] = [];
    for (const id of v.attachedInstances) {
      // Instance UUIDs aren't validated against a known set here (they're
      // user-generated and may legitimately reference instances that don't
      // exist on this device yet — e.g. cross-device import). Render-side
      // intersects with live instances; non-matches are silently ignored.
      if (typeof id !== "string" || id.length === 0 || id.length > 128) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      attached.push(id);
    }
    out.attachedInstances = attached;
  }
  if (v.pinnedTabs !== undefined && v.pinnedTabs !== null) {
    if (!Array.isArray(v.pinnedTabs)) return null;
    const seen = new Set<string>();
    const pinned: string[] = [];
    for (const tab of v.pinnedTabs) {
      if (typeof tab !== "string" || tab.length === 0 || tab.length > 64) continue;
      if (seen.has(tab)) continue;
      seen.add(tab);
      pinned.push(tab);
      if (pinned.length >= MAX_PINNED_TABS) break;
    }
    out.pinnedTabs = pinned;
  }
  return out;
}

function coerceNotificationSettings(v: unknown): NotificationSettings | null {
  if (!isPlainObject(v)) return null;
  // Required keys must all be booleans. Newer keys (added when a service was
  // introduced post-v2) are optional during coercion so a backup made before
  // the key existed validates cleanly; the missing entry falls back to its
  // default at hydrate time.
  const requiredKeys = [
    "enabled",
    "torrentCompleted",
    "radarrDownloaded",
    "sonarrDownloaded",
    "serviceOffline",
    "overseerrNewRequest",
  ] as const;
  const optionalKeys = ["sabnzbdCompleted", "nzbgetCompleted"] as const;
  const out: Partial<NotificationSettings> = {};
  for (const key of requiredKeys) {
    if (typeof v[key] !== "boolean") return null;
    out[key] = v[key] as boolean;
  }
  for (const key of optionalKeys) {
    if (v[key] === undefined) continue;
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
  if (!Array.isArray(raw.homeNetworks)) throw new Error("Config homeNetworks is invalid");
  if (raw.homeNetworks.length > MAX_HOME_NETWORKS) {
    throw new Error("Config homeNetworks has too many entries");
  }
  if (!Array.isArray(raw.dashboards)) throw new Error("Config dashboards is invalid");

  // v13: services is Record<ServiceId, ServiceInstance[]>. Reject entries that
  // aren't arrays so a downgrade-then-upgrade payload (or a hand-edited file)
  // can't slip through with the old singleton shape.
  const services = {} as Record<ServiceId, ServiceInstance[]>;
  const seenInstanceIds = new Set<string>();
  for (const [id, value] of Object.entries(raw.services)) {
    if (!SERVICE_ID_SET.has(id)) continue;
    if (!Array.isArray(value)) throw new Error(`Config services.${id} is invalid`);
    const list: ServiceInstance[] = [];
    for (const entry of value) {
      const coerced = coerceServiceInstance(entry);
      if (!coerced) throw new Error(`Config services.${id} entry is invalid`);
      // Instance UUIDs must be globally unique — the secrets/widget-settings
      // maps key off them, and a duplicate would silently merge configs.
      if (seenInstanceIds.has(coerced.id)) {
        throw new Error(`Config services.${id} has duplicate instance id`);
      }
      seenInstanceIds.add(coerced.id);
      list.push(coerced);
    }
    services[id as ServiceId] = list;
  }

  // v13: secrets keyed by instance UUID, not ServiceId. Drop entries whose
  // UUID doesn't appear in the services list (forward-compatible orphan cleanup).
  const secrets: Record<string, ServiceSecrets> = {};
  for (const [uuid, value] of Object.entries(raw.secrets)) {
    if (!seenInstanceIds.has(uuid)) continue;
    const coerced = coerceServiceSecrets(value);
    if (!coerced) throw new Error(`Config secrets.${uuid} is invalid`);
    secrets[uuid] = coerced;
  }

  // v13: activeInstance is Record<ServiceId, string | null>. Validate that
  // every referenced UUID exists in the services list for that kind.
  if (raw.activeInstance !== undefined && !isPlainObject(raw.activeInstance)) {
    throw new Error("Config activeInstance is invalid");
  }
  const activeInstance = {} as Record<ServiceId, string | null>;
  const rawActive = (raw.activeInstance as Record<string, unknown> | undefined) ?? {};
  for (const id of SERVICE_IDS) {
    const v = rawActive[id];
    if (v === null || v === undefined) {
      activeInstance[id] = null;
      continue;
    }
    if (typeof v !== "string") {
      throw new Error(`Config activeInstance.${id} is invalid`);
    }
    const list = services[id] ?? [];
    activeInstance[id] = list.some((i) => i.id === v) ? v : (list[0]?.id ?? null);
  }

  // v14: dashboards is the source of truth. Each entry must coerce cleanly;
  // unknown widget ids inside slots are dropped silently (forward-compat).
  // Duplicate slot ids across the whole list are rejected so the slot-keyed
  // settings store can't accidentally collapse two slots into one.
  const dashboards: Dashboard[] = [];
  const seenDashboardIds = new Set<string>();
  const seenSlotIdsGlobal = new Set<string>();
  for (const item of raw.dashboards) {
    const coerced = coerceDashboard(item);
    if (!coerced) throw new Error("Config dashboards entry is invalid");
    if (seenDashboardIds.has(coerced.id)) {
      throw new Error("Config dashboards has duplicate id");
    }
    seenDashboardIds.add(coerced.id);
    for (const slot of coerced.widgets) {
      if (seenSlotIdsGlobal.has(slot.id)) {
        throw new Error("Config dashboards has duplicate slot id");
      }
      seenSlotIdsGlobal.add(slot.id);
    }
    dashboards.push(coerced);
  }
  if (dashboards.length === 0) throw new Error("Config dashboards is empty");

  let activeDashboardId: string;
  if (typeof raw.activeDashboardId !== "string") {
    activeDashboardId = dashboards[0].id;
  } else if (dashboards.some((d) => d.id === raw.activeDashboardId)) {
    activeDashboardId = raw.activeDashboardId;
  } else {
    activeDashboardId = dashboards[0].id;
  }

  const homeNetworks: HomeNetwork[] = [];
  for (const item of raw.homeNetworks) {
    const coerced = coerceHomeNetwork(item);
    if (!coerced) throw new Error("Config homeNetworks entry is invalid");
    homeNetworks.push(coerced);
  }

  const payload: ExportPayload = {
    version: raw.version,
    exportedAt: raw.exportedAt,
    services,
    secrets,
    activeInstance,
    autoSwitchNetwork: raw.autoSwitchNetwork,
    homeNetworks,
    dashboards,
    activeDashboardId,
  };

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

  if (raw.hapticsEnabled !== undefined) {
    if (typeof raw.hapticsEnabled !== "boolean") throw new Error("Config hapticsEnabled is invalid");
    payload.hapticsEnabled = raw.hapticsEnabled;
  }

  if (raw.globalCustomHeaders !== undefined && raw.globalCustomHeaders !== null) {
    const headers = coerceHeaderMap(raw.globalCustomHeaders);
    if (!headers) throw new Error("Config globalCustomHeaders is invalid");
    payload.globalCustomHeaders = headers;
  }

  if (raw.uiScale !== undefined) {
    if (
      typeof raw.uiScale !== "number" ||
      !(UI_SCALES as readonly number[]).includes(raw.uiScale)
    ) {
      throw new Error("Config uiScale is invalid");
    }
    payload.uiScale = raw.uiScale as ExportPayload["uiScale"];
  }

  if (raw.servicesOrder !== undefined && raw.servicesOrder !== null) {
    if (!Array.isArray(raw.servicesOrder)) throw new Error("Config servicesOrder is invalid");
    if (raw.servicesOrder.length > SERVICE_IDS.length) {
      throw new Error("Config servicesOrder has too many entries");
    }
    const seen = new Set<string>();
    const order: ServiceId[] = [];
    for (const id of raw.servicesOrder) {
      if (typeof id !== "string") throw new Error("Config servicesOrder entry is invalid");
      if (!SERVICE_ID_SET.has(id)) continue; // forward-compat: drop unknowns
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id as ServiceId);
    }
    payload.servicesOrder = order;
  }

  return payload;
}
