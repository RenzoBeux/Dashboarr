import {
  SERVICE_IDS,
  DASHBOARD_WIDGET_IDS,
  UI_SCALES,
  MAX_HOME_NETWORKS,
} from "@/lib/constants";
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
import type { NotificationSettings, NotifCategory, AppriseConfig } from "@/store/config-store";
import { NOTIF_CATEGORIES } from "@/lib/notification-categories";
import { ALL_PICKABLE_TABS, MAX_PINNED_TABS } from "@/lib/tab-routes";

const NOTIF_CATEGORY_SET: ReadonlySet<string> = new Set(NOTIF_CATEGORIES);

const SERVICE_ID_SET: ReadonlySet<string> = new Set(SERVICE_IDS);
const PICKABLE_TAB_SET: ReadonlySet<string> = new Set(ALL_PICKABLE_TABS);
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
  const out: ServiceInstance = {
    id: v.id,
    enabled: v.enabled,
    name: v.name,
    localUrl: v.localUrl,
    remoteUrl: v.remoteUrl,
    useRemote: v.useRemote,
    // v23: optional. Coerce to a strict boolean so a missing/garbage value
    // (older exports, hand-edited files) lands on the secure default.
    ignoreCertErrors: v.ignoreCertErrors === true,
  };
  // v36 (#287): optional per-instance arr add-flow defaults. Drop invalid
  // values rather than rejecting the whole instance — absence just falls back
  // to first-in-list at add time.
  if (isPositiveInt(v.defaultQualityProfileId)) {
    out.defaultQualityProfileId = v.defaultQualityProfileId;
  }
  if (isPositiveInt(v.defaultMetadataProfileId)) {
    out.defaultMetadataProfileId = v.defaultMetadataProfileId;
  }
  if (
    typeof v.defaultRootFolderPath === "string" &&
    v.defaultRootFolderPath.length > 0 &&
    v.defaultRootFolderPath.length <= 1024
  ) {
    out.defaultRootFolderPath = v.defaultRootFolderPath;
  }
  return out;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
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
  // v22: per-workspace active instance pin per kind. Stored UUIDs that point
  // at instances the device doesn't currently have are kept — the resolver
  // tolerates staleness, and cross-device imports may legitimately carry
  // unknown UUIDs.
  if (v.activeInstance !== undefined && v.activeInstance !== null) {
    if (!isPlainObject(v.activeInstance)) return null;
    const cleaned: Partial<Record<ServiceId, string>> = {};
    for (const [kind, raw] of Object.entries(v.activeInstance)) {
      if (!(SERVICE_IDS as readonly string[]).includes(kind)) continue;
      if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) continue;
      cleaned[kind as ServiceId] = raw;
    }
    if (Object.keys(cleaned).length > 0) {
      out.activeInstance = cleaned;
    }
  }
  // v29: optional per-workspace home-network selection (#148). Present-but-not-
  // array is rejected; otherwise dedupe + drop empties (import-tolerant, like
  // attachedInstances), and cap at MAX_HOME_NETWORKS. Ids aren't validated
  // against the live list — the resolver ignores stale ids. An explicit empty
  // array is preserved — it's a valid selection ("no home network here").
  if (v.homeNetworkIds !== undefined && v.homeNetworkIds !== null) {
    if (!Array.isArray(v.homeNetworkIds)) return null;
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of v.homeNetworkIds) {
      if (typeof id !== "string" || id.length === 0 || id.length > 128) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_HOME_NETWORKS) break;
    }
    out.homeNetworkIds = ids;
  }
  // v30: optional per-workspace Services-tab order. Present-but-not-array is
  // rejected; otherwise dedupe + drop unknown service ids (forward-compat, like
  // the global servicesOrder). Absence means "use the global order".
  if (v.servicesOrder !== undefined && v.servicesOrder !== null) {
    if (!Array.isArray(v.servicesOrder)) return null;
    const seen = new Set<string>();
    const order: ServiceId[] = [];
    for (const sid of v.servicesOrder) {
      if (typeof sid !== "string") continue;
      if (!SERVICE_ID_SET.has(sid)) continue; // forward-compat: drop unknowns
      if (seen.has(sid)) continue;
      seen.add(sid);
      order.push(sid as ServiceId);
    }
    out.servicesOrder = order;
  }
  // v37: optional per-workspace bottom-tab icon overrides (#195). Present-but-
  // not-object is rejected; otherwise drop unknown tab keys and malformed
  // values. Icon names are deliberately NOT validated against the lucide
  // registry here (this module must stay free of react-native imports for
  // jest) — render-time resolveTabIcon falls back to the default, same policy
  // as the `icon` field above.
  if (v.tabIcons !== undefined && v.tabIcons !== null) {
    if (!isPlainObject(v.tabIcons)) return null;
    const icons: Record<string, string> = {};
    for (const [tab, icon] of Object.entries(v.tabIcons)) {
      if (!PICKABLE_TAB_SET.has(tab)) continue;
      if (typeof icon !== "string" || icon.length === 0 || icon.length > 64) continue;
      icons[tab] = icon;
    }
    if (Object.keys(icons).length > 0) {
      out.tabIcons = icons;
    }
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
  const optionalKeys = [
    "sabnzbdCompleted",
    "nzbgetCompleted",
    "tracearrViolation",
    "tracearrNewDevice",
    "tracearrTrustScore",
    "tracearrServerDown",
    "tracearrServerUp",
    "tracearrStreamStarted",
    "tracearrStreamStopped",
  ] as const;
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
  // v21: per-instance overrides. Validate the shape; drop unknown categories
  // silently so a future-added category doesn't fail the whole import on an
  // older app build, but reject malformed values (non-object, non-boolean) so
  // we don't write garbage into the store.
  if (v.perInstance !== undefined) {
    if (!isPlainObject(v.perInstance)) return null;
    const perInstance: Record<string, Partial<Record<NotifCategory, boolean>>> = {};
    for (const [instanceId, overrides] of Object.entries(v.perInstance)) {
      if (typeof instanceId !== "string" || instanceId.length === 0 || instanceId.length > 128) return null;
      if (!isPlainObject(overrides)) return null;
      const cleaned: Partial<Record<NotifCategory, boolean>> = {};
      for (const [cat, val] of Object.entries(overrides)) {
        if (!NOTIF_CATEGORY_SET.has(cat)) continue;
        if (typeof val !== "boolean") return null;
        cleaned[cat as NotifCategory] = val;
      }
      if (Object.keys(cleaned).length > 0) {
        perInstance[instanceId] = cleaned;
      }
    }
    if (Object.keys(perInstance).length > 0) {
      out.perInstance = perInstance;
    }
  }
  // v34: optional Apprise sink. Mirror the "drop unknown categories" philosophy
  // used for perInstance above — a malformed `apprise` is silently dropped rather
  // than failing the ENTIRE config import (services, secrets, dashboards…) over
  // one optional field. The live UI stores the URL without scheme validation, so
  // a legitimate backup can carry a value this importer would otherwise reject;
  // don't strand the whole restore on it. A missing `apprise` is fine (older
  // export) and falls back to "unset" at hydrate time.
  if (isPlainObject(v.apprise)) {
    const a = v.apprise;
    if (
      typeof a.enabled === "boolean" &&
      isHttpUrlOrEmpty(a.url) &&
      typeof a.tags === "string" &&
      a.tags.length <= 256
    ) {
      const apprise: AppriseConfig = { enabled: a.enabled, url: a.url, tags: a.tags };
      out.apprise = apprise;
    }
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

  // v22: top-level `activeInstance` was dropped; per-dashboard
  // `dashboard.activeInstance` is now the source of truth (validated inside
  // coerceDashboard below). The migration chain (v21→v22) folds any legacy
  // top-level field onto each dashboard before we get here, so a v22+
  // payload should never carry the legacy key — but coerceDashboard
  // tolerates either shape going forward for forward-compat with imports
  // that hand-edit the JSON.

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

  if (raw.treatVpnAsHome !== undefined) {
    if (typeof raw.treatVpnAsHome !== "boolean") throw new Error("Config treatVpnAsHome is invalid");
    payload.treatVpnAsHome = raw.treatVpnAsHome;
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
