import {
  DEFAULT_DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_NAME,
  WIDGET_ID_RENAMES,
  UI_SCALES,
  DEFAULT_UI_SCALE,
  SERVICE_IDS,
} from "@/lib/constants";
import type { ExportPayload } from "@/store/config-store";
import { generateInstanceId } from "@/lib/uuid";
import { DEFAULT_DASHBOARD_ICON } from "@/lib/dashboard-icons";
import { DEFAULT_DASHBOARD_COLOR } from "@/lib/dashboard-colors";
import { defaultPinnedTabsForInstall } from "@/lib/tab-routes";

/**
 * Bump this when the export schema changes and add a matching migration.
 * Export always writes this version; import migrates up from whatever it finds.
 *
 * History:
 *   v0  — pre-versioning (no version field)
 *   v1  — first versioned format (may be missing newer services)
 *   v2  — added backend pairing + notification settings
 *   v3  — moved wake-on-LAN from per-service to global config
 *   v4  — multiple WOL devices (wakeOnLan → wolDevices array)
 *   v5  — dashboardOrder renamed to dashboardWidgets
 *   v6  — added optional homeBSSID for rogue-AP-resistant auto-switch
 *   v7  — added per-widget settings; renamed sonarr-calendar → calendar
 *   v8  — added hapticsEnabled global preference
 *   v9  — added jellyfin service entry (no schema change; defaultServices()
 *         backfills the new id, so this is a version stamp only)
 *   v10 — added customHeaders per service (in secrets) + globalCustomHeaders
 *         at the top level for reverse-proxy auth (Cloudflare Access etc.)
 *   v11 — replaced single homeSSID/homeBSSID with homeNetworks: HomeNetwork[]
 *         so mesh setups can mark every AP as "home"
 *   v12 — added uiScale (accessibility): app-wide font/spacing/icon multiplier
 *   v13 — multi-instance services: services becomes Record<ServiceId,
 *         ServiceInstance[]> where each instance carries a stable UUID id;
 *         secrets re-keyed by instance UUID instead of ServiceId; new
 *         activeInstance: Record<ServiceId, string | null> tracks the
 *         currently-selected instance per service kind.
 *   v14 — multi-dashboard + per-slot widget settings. Replaces flat
 *         dashboardWidgets: WidgetId[] + widgetSettings: Record<WidgetId, …>
 *         with dashboards: Dashboard[] (each with a UUID id, a name, and an
 *         ordered WidgetSlot[] where each slot has its own UUID + per-slot
 *         settings) and activeDashboardId: string. The migration folds legacy
 *         widget list + settings map into a single Default dashboard.
 *   v15 — multi-select widget instance binding. Per-slot settings rename
 *         instanceId → instanceIds (and sonarrInstanceId/radarrInstanceId on
 *         calendar) and broaden the value from `string | "all"` to
 *         `string[] | "all"`. Scalar legacy ids are wrapped in single-element
 *         arrays; "all" sentinels carry over unchanged. Same transform runs at
 *         hydrate time on locally-persisted dashboards.
 *   v16 — added sabnzbd service entry (no schema change; defaultInstances()
 *         backfills the new id at import time, so this is a version stamp only).
 *   v17 — added servicesOrder: ServiceId[] for the user-defined Services tab
 *         tile order. Older exports lack the field; default to [] which the
 *         render-side logic interprets as "use canonical SERVICE_IDS order".
 *   v18 — useRemote toggle semantics fix: was being clobbered by the auto-
 *         switch hook as derived state, now means "force remote even at
 *         home" (user override). Migration resets useRemote to false on
 *         every instance for users who had autoSwitchNetwork on, since the
 *         stored values were last-known network state, not user intent.
 *         Users with auto-switch off keep their useRemote values.
 *   v19 — added nzbget service entry (no schema change; defaultInstances()
 *         backfills the new id at import time, so this is a version stamp only).
 *   v20 — dashboards become workspaces. Each Dashboard gains optional `icon`
 *         (lucide name), `color` (hex from palette), `attachedInstances`
 *         (instance UUIDs; drives per-instance workspace filtering so a
 *         multi-instance user can pin "Radarr Home" to one dashboard and
 *         "Radarr Cabin" to another), and `pinnedTabs` (route names of
 *         user-pinned middle bottom tabs).  Migration backfills sensible
 *         defaults: icon = LayoutDashboard, color = blue,
 *         attachedInstances = every UUID present in the payload (so
 *         existing dashboards keep their global behavior), pinnedTabs = the
 *         pre-v20 bar (downloads/calendar/services) intersected with what's
 *         actually enabled on this install.
 *   v21 — per-instance notification overrides. notificationSettings gains an
 *         optional `perInstance: Record<instanceId, Partial<categories>>`
 *         map that lets a user silence one Radarr instance without
 *         affecting siblings. Pure version stamp — absence of the field
 *         falls through to the existing global toggles via
 *         shouldNotifyForInstance().
 *   v22 — activeInstance becomes per-workspace. The top-level
 *         `activeInstance: Record<ServiceId, string | null>` moves onto each
 *         Dashboard as an optional `activeInstance: Partial<Record<ServiceId,
 *         string>>` map. Migration folds the global pointer into every
 *         dashboard, filtered to instance UUIDs the dashboard actually
 *         attaches (auto-attach mode keeps the full set). Runtime fallback:
 *         when a dashboard has no entry for a kind, resolve to the first
 *         attached+enabled instance of that kind.
 *   v23 — per-instance `ignoreCertErrors` on ServiceConfig (opt a server out
 *         of TLS certificate validation). Pure version stamp — optional field,
 *         absence means false.
 *   v24 — added the emby service entry. Pure version stamp — defaultInstances()
 *         iterates SERVICE_IDS and backfills a disabled emby instance at import
 *         time, so older exports just need the version field bumped.
 *   v25 — added the tracearr service entry. Pure version stamp — defaultInstances()
 *         iterates SERVICE_IDS and backfills a disabled tracearr instance at
 *         import time, so older exports just need the version field bumped.
 *   v26 — added the rtorrent service entry. Pure version stamp — defaultInstances()
 *         iterates SERVICE_IDS and backfills a disabled rtorrent instance at
 *         import time, so older exports just need the version field bumped.
 */
export const CURRENT_CONFIG_VERSION = 26;

// Per-slot field renames introduced in v15. Same pairs are applied by the
// hydrate-time migration in config-store.ts so the import path and the local
// upgrade path produce identical data shapes.
export const INSTANCE_BINDING_FIELD_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["instanceId", "instanceIds"],
  ["sonarrInstanceId", "sonarrInstanceIds"],
  ["radarrInstanceId", "radarrInstanceIds"],
];

// Walks one slot's settings record and returns a new record with v14 binding
// fields renamed and their values broadened to the v15 shape. Returns the
// same reference (no copy) when no rename was needed, so callers can treat a
// reference-equal result as "nothing to persist".
export function migrateSlotSettingsBindings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  let next: Record<string, unknown> | null = null;
  for (const [oldKey, newKey] of INSTANCE_BINDING_FIELD_RENAMES) {
    if (!(oldKey in settings)) continue;
    if (newKey in settings) {
      // Already migrated — just drop the legacy key without overwriting.
      next = next ?? { ...settings };
      delete next[oldKey];
      continue;
    }
    const v = settings[oldKey];
    next = next ?? { ...settings };
    if (v === "all" || (Array.isArray(v) && v.every((x) => typeof x === "string"))) {
      next[newKey] = v;
    } else if (typeof v === "string" && v.length > 0) {
      next[newKey] = [v];
    } else {
      next[newKey] = "all";
    }
    delete next[oldKey];
  }
  return next ?? settings;
}

// v25 generalized the Tautulli-only "Now Playing" widget (tautulli-activity)
// into the unified Tautulli + Tracearr stream monitor (stream-monitor), which
// split its single `instanceIds` binding into per-source `tautulliInstanceIds`
// / `tracearrInstanceIds`. Without this, an upgrading user who scoped the old
// widget to specific Tautulli instances would silently fall back to "all".
// Idempotent: drops the legacy key once the new one exists. Returns the same
// reference when nothing changed so callers can treat reference-equality as
// "nothing to persist".
function migrateStreamMonitorBindings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  if (!("instanceIds" in settings)) return settings;
  const { instanceIds, ...rest } = settings;
  // If the new key is already present the old one is just stale — drop it.
  if ("tautulliInstanceIds" in rest) return rest;
  return { ...rest, tautulliInstanceIds: instanceIds };
}

/**
 * Migrate one widget slot's settings to the current shape: the generic v15
 * binding-field renames, plus any widget-specific renames keyed by the
 * (already WIDGET_ID_RENAMES-resolved) widget id. Applied on both the hydrate
 * and import paths so locally-upgraded and re-imported configs converge.
 * Returns the same reference when nothing changed.
 */
export function migrateWidgetSlotSettings(
  widgetId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const bound = migrateSlotSettingsBindings(settings);
  if (widgetId === "stream-monitor") return migrateStreamMonitorBindings(bound);
  return bound;
}

/**
 * Each key N is a function that transforms a version-N payload into version N+1.
 * To add a new migration:
 *   1. Bump CURRENT_CONFIG_VERSION
 *   2. Add an entry:  [OLD]: (payload) => ({ ...transformed, version: OLD + 1 })
 */
const migrations: Record<number, (payload: any) => any> = {
  // v0 (pre-versioning) → v1
  0: (payload) => ({
    version: 1,
    exportedAt: payload.exportedAt ?? new Date().toISOString(),
    services: payload.services ?? {},
    secrets: payload.secrets ?? {},
    autoSwitchNetwork: payload.autoSwitchNetwork ?? false,
    homeSSID: payload.homeSSID ?? "",
    dashboardOrder: payload.dashboardOrder ?? [],
  }),

  // v1 → v2: add backend pairing + notification settings
  1: (payload) => ({
    ...payload,
    version: 2,
    backend: payload.backend ?? null,
    notificationSettings: payload.notificationSettings ?? null,
  }),

  // v2 → v3: move wake-on-LAN from per-service to global
  2: (payload) => {
    let wakeOnLan = null;
    const services: Record<string, any> = {};
    for (const [id, svc] of Object.entries(payload.services ?? {})) {
      const { wakeOnLan: wolConfig, ...rest } = svc as any;
      if (!wakeOnLan && wolConfig?.mac) {
        wakeOnLan = wolConfig;
      }
      services[id] = rest;
    }
    return { ...payload, version: 3, services, wakeOnLan };
  },

  // v3 → v4: single wakeOnLan → wolDevices array
  3: (payload) => {
    const wolDevices: any[] = [];
    if (payload.wakeOnLan?.mac) {
      wolDevices.push({
        id: "migrated-1",
        name: "Server",
        mac: payload.wakeOnLan.mac,
        broadcastAddress: payload.wakeOnLan.broadcastAddress,
        port: payload.wakeOnLan.port,
      });
    }
    const { wakeOnLan: _, ...rest } = payload;
    return { ...rest, version: 4, wolDevices };
  },

  // v4 → v5: dashboardOrder renamed to dashboardWidgets
  4: (payload) => {
    const { dashboardOrder, ...rest } = payload;
    const dashboardWidgets = Array.isArray(dashboardOrder) && dashboardOrder.length > 0
      ? dashboardOrder
      : DEFAULT_DASHBOARD_WIDGETS;
    return { ...rest, version: 5, dashboardWidgets };
  },

  // v5 → v6: added optional homeBSSID. Pre-v6 exports lack it; default empty
  // so existing auto-switch falls back to SSID-only matching (old behavior).
  5: (payload) => ({
    ...payload,
    version: 6,
    homeBSSID: typeof payload.homeBSSID === "string" ? payload.homeBSSID : "",
  }),

  // v6 → v7: rename retired widget ids in dashboardWidgets and add empty
  // widgetSettings. Old exports never had settings, so an empty record means
  // every widget will fall back to defaultSettings declared in the registry.
  6: (payload) => {
    const ids = Array.isArray(payload.dashboardWidgets) ? payload.dashboardWidgets : [];
    const remapped = ids.map((id: unknown) =>
      typeof id === "string" && id in WIDGET_ID_RENAMES ? WIDGET_ID_RENAMES[id] : id,
    );
    // Drop dupes that the rename can produce (e.g. user already had `calendar`).
    const seen = new Set<string>();
    const dashboardWidgets: string[] = [];
    for (const id of remapped) {
      if (typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      dashboardWidgets.push(id);
    }
    return { ...payload, version: 7, dashboardWidgets, widgetSettings: {} };
  },

  // v7 → v8: add hapticsEnabled. Pre-v8 backups never recorded the preference,
  // so default to true to match the long-standing always-on behavior.
  7: (payload) => ({
    ...payload,
    version: 8,
    hapticsEnabled: typeof payload.hapticsEnabled === "boolean" ? payload.hapticsEnabled : true,
  }),

  // v8 → v9: jellyfin added to SERVICE_IDS. importConfig merges over
  // defaultServices() afterward, so older payloads that lack a jellyfin entry
  // get the disabled default automatically — nothing to transform here.
  8: (payload) => ({ ...payload, version: 9 }),

  // v9 → v10: added customHeaders per-service (in secrets) and a top-level
  // globalCustomHeaders. Older payloads have neither; defaulting to an empty
  // object preserves the prior "no extra headers" behavior.
  9: (payload) => ({
    ...payload,
    version: 10,
    globalCustomHeaders:
      payload.globalCustomHeaders && typeof payload.globalCustomHeaders === "object"
        ? payload.globalCustomHeaders
        : {},
  }),

  // v10 → v11: replace single homeSSID / optional homeBSSID with a list of
  // HomeNetwork entries so mesh setups can register every AP. Empty SSID =>
  // no networks (auto-switch was effectively unconfigured anyway). Old fields
  // are dropped from the payload — the new key is the source of truth.
  10: (payload) => {
    const ssid = typeof payload.homeSSID === "string" ? payload.homeSSID : "";
    const bssid = typeof payload.homeBSSID === "string" ? payload.homeBSSID : "";
    const homeNetworks: { id: string; ssid: string; bssid: string }[] =
      ssid.length > 0 ? [{ id: "migrated-1", ssid, bssid }] : [];
    const { homeSSID: _s, homeBSSID: _b, ...rest } = payload;
    return { ...rest, version: 11, homeNetworks };
  },

  // v11 → v12: add uiScale (accessibility multiplier for fonts/spacing/icons).
  // Pre-v12 backups never recorded it, so default to 1 (no scaling) which
  // matches the prior behavior. Whitelist the value: anything outside the
  // allowed set falls back to the default.
  11: (payload) => ({
    ...payload,
    version: 12,
    uiScale: (UI_SCALES as readonly number[]).includes(payload.uiScale)
      ? payload.uiScale
      : DEFAULT_UI_SCALE,
  }),

  // v12 → v13: multi-instance services. Each entry in `services` becomes a
  // single-element array of ServiceInstance with a generated UUID; secrets
  // get re-keyed from `secrets[serviceId]` to `secrets[uuid]` using the same
  // UUID; activeInstance[serviceId] is initialized to that UUID so existing
  // consumers see the same data they did before.
  12: (payload) => {
    const oldServices = (payload.services && typeof payload.services === "object"
      ? payload.services
      : {}) as Record<string, any>;
    const oldSecrets = (payload.secrets && typeof payload.secrets === "object"
      ? payload.secrets
      : {}) as Record<string, any>;

    const services: Record<string, any[]> = {};
    const secrets: Record<string, any> = {};
    const activeInstance: Record<string, string | null> = {};

    for (const [serviceId, cfg] of Object.entries(oldServices)) {
      if (!cfg || typeof cfg !== "object") continue;
      const uuid = generateInstanceId();
      services[serviceId] = [{ id: uuid, ...cfg }];
      activeInstance[serviceId] = uuid;
      const s = oldSecrets[serviceId];
      if (s && typeof s === "object") {
        secrets[uuid] = s;
      }
    }

    return { ...payload, version: 13, services, secrets, activeInstance };
  },

  // v13 → v14: multi-dashboard + per-slot settings. Folds legacy
  // dashboardWidgets: WidgetId[] + widgetSettings: Record<WidgetId, …> into a
  // single Default dashboard with one slot per widget id, copying the legacy
  // per-WidgetId settings onto each slot. Drops the now-redundant top-level
  // dashboardWidgets / widgetSettings fields.
  13: (payload) => {
    const widgetIds: string[] = Array.isArray(payload.dashboardWidgets)
      ? payload.dashboardWidgets.filter((id: unknown): id is string => typeof id === "string")
      : [];
    const legacySettings: Record<string, Record<string, unknown>> =
      payload.widgetSettings && typeof payload.widgetSettings === "object" && !Array.isArray(payload.widgetSettings)
        ? payload.widgetSettings
        : {};

    const widgets = widgetIds.map((widgetId) => {
      const settings = legacySettings[widgetId];
      const slot: any = { id: generateInstanceId(), widgetId };
      if (settings && typeof settings === "object" && Object.keys(settings).length > 0) {
        slot.settings = { ...settings };
      }
      return slot;
    });

    const dashboard = {
      id: generateInstanceId(),
      name: DEFAULT_DASHBOARD_NAME,
      widgets,
    };

    const { dashboardWidgets: _dw, widgetSettings: _ws, ...rest } = payload;
    return {
      ...rest,
      version: 14,
      dashboards: [dashboard],
      activeDashboardId: dashboard.id,
    };
  },

  // v14 → v15: rename per-slot instanceId/sonarrInstanceId/radarrInstanceId to
  // their plural forms and wrap scalar legacy ids in single-element arrays.
  // Slots without settings or without binding fields pass through untouched.
  14: (payload) => {
    const dashboards = Array.isArray(payload.dashboards) ? payload.dashboards : [];
    const migratedDashboards = dashboards.map((d: any) => {
      if (!d || typeof d !== "object" || !Array.isArray(d.widgets)) return d;
      const widgets = d.widgets.map((w: any) => {
        if (!w || typeof w !== "object") return w;
        if (!w.settings || typeof w.settings !== "object" || Array.isArray(w.settings)) {
          return w;
        }
        const migrated = migrateSlotSettingsBindings(
          w.settings as Record<string, unknown>,
        );
        if (migrated === w.settings) return w;
        return { ...w, settings: migrated };
      });
      return { ...d, widgets };
    });
    return { ...payload, version: 15, dashboards: migratedDashboards };
  },

  // v15 → v16: sabnzbd added to SERVICE_IDS. importConfig merges over
  // defaultInstances() afterward, so older payloads that lack a sabnzbd entry
  // get the disabled default automatically — nothing to transform here.
  15: (payload) => ({ ...payload, version: 16 }),

  // v16 → v17: added servicesOrder. Older payloads had no concept of a
  // user-defined Services tab order — default to [] which the render-side
  // logic treats as "fall back to canonical SERVICE_IDS order".
  16: (payload) => ({
    ...payload,
    version: 17,
    servicesOrder: Array.isArray(payload.servicesOrder) ? payload.servicesOrder : [],
  }),

  // v17 → v18: useRemote becomes a user override ("force remote even at
  // home") instead of a derived network-state cache. For installs that had
  // autoSwitchNetwork on, the persisted useRemote values reflect last-known
  // network state, not user intent — reset them to false so the toggle
  // shows the user's actual override (which they never set if auto-switch
  // was doing the work). Installs with auto-switch off keep useRemote
  // exactly as the user configured it.
  17: (payload) => {
    if (!payload.autoSwitchNetwork) {
      return { ...payload, version: 18 };
    }
    const services: Record<string, any> = {};
    for (const [serviceId, instances] of Object.entries(payload.services ?? {})) {
      if (!Array.isArray(instances)) {
        services[serviceId] = instances;
        continue;
      }
      services[serviceId] = instances.map((inst: any) =>
        inst && typeof inst === "object"
          ? { ...inst, useRemote: false }
          : inst,
      );
    }
    return { ...payload, version: 18, services };
  },

  // v18 → v19: added the nzbget service. Pure version stamp — defaultInstances()
  // already iterates SERVICE_IDS and backfills a disabled instance for any
  // newly-added service, so older exports just need the version field bumped.
  18: (payload) => ({ ...payload, version: 19 }),

  // v19 → v20: dashboards become workspaces. Backfill icon/color/pinned
  // with sensible defaults. Deliberately leave `attachedInstances`
  // undefined on migrated dashboards — the render-time fallback in
  // `useAttachedInstances` treats absent as "every currently-known instance
  // attached", which means future instances the user adds later also
  // auto-attach to migrated dashboards. Once the user opens the editor and
  // saves, the dashboard transitions to an explicit list (curated mode).
  19: (payload) => {
    const defaultPins = defaultPinnedTabsForInstall(payload.services ?? {});
    const dashboards = Array.isArray(payload.dashboards)
      ? payload.dashboards.map((d: any) => {
          if (!d || typeof d !== "object") return d;
          // Forward-fix: a pre-rename development build of v20 briefly used
          // `attachedServices: ServiceId[]`. Expand it to instance UUIDs so
          // those installs upgrade cleanly. New imports won't carry this.
          let attachedInstances: string[] | undefined;
          if (Array.isArray(d.attachedInstances)) {
            attachedInstances = d.attachedInstances;
          } else if (Array.isArray(d.attachedServices)) {
            const kinds = new Set(d.attachedServices);
            attachedInstances = [];
            for (const id of SERVICE_IDS) {
              if (!kinds.has(id)) continue;
              for (const inst of (payload.services ?? {})[id] ?? []) {
                if (inst && typeof inst.id === "string") {
                  attachedInstances.push(inst.id);
                }
              }
            }
          }
          const { attachedServices: _drop, ...rest } = d;
          const base = {
            ...rest,
            icon: typeof d.icon === "string" ? d.icon : DEFAULT_DASHBOARD_ICON,
            color: typeof d.color === "string" ? d.color : DEFAULT_DASHBOARD_COLOR,
            pinnedTabs: Array.isArray(d.pinnedTabs) ? d.pinnedTabs : defaultPins,
          };
          return attachedInstances !== undefined
            ? { ...base, attachedInstances }
            : base;
        })
      : payload.dashboards;
    return { ...payload, version: 20, dashboards };
  },

  // v20 → v21: per-instance notification overrides. Pure version stamp — the
  // new `notificationSettings.perInstance` field is optional and `undefined`
  // is the "no overrides" default. Older exports that lack the field are
  // already correct after this bump.
  20: (payload) => ({ ...payload, version: 21 }),

  // v21 → v22: activeInstance migrates from a single global Record<ServiceId,
  // string|null> at the top level onto each Dashboard as an optional
  // `activeInstance: Partial<Record<ServiceId, string>>`. For each dashboard,
  // we fold the global pointer in, filtered to instance UUIDs that the
  // dashboard actually attaches (or the full set for auto-attach
  // dashboards). The top-level field is dropped so storage doesn't carry two
  // sources of truth.
  21: (payload) => {
    const global: Record<string, unknown> =
      payload.activeInstance && typeof payload.activeInstance === "object"
        ? (payload.activeInstance as Record<string, unknown>)
        : {};
    const dashboards = Array.isArray(payload.dashboards)
      ? payload.dashboards.map((d: any) => {
          if (!d || typeof d !== "object") return d;
          const attached: string[] | undefined = Array.isArray(d.attachedInstances)
            ? d.attachedInstances
            : undefined;
          const out: Record<string, string> = {};
          for (const [kind, id] of Object.entries(global)) {
            if (typeof id !== "string" || id.length === 0) continue;
            if (attached === undefined || attached.includes(id)) {
              out[kind] = id;
            }
          }
          if (Object.keys(out).length === 0) return d;
          return { ...d, activeInstance: out };
        })
      : payload.dashboards;
    const { activeInstance: _drop, ...rest } = payload;
    return { ...rest, version: 22, dashboards };
  },

  // v22 → v23: per-instance `ignoreCertErrors` (opt a server out of TLS
  // certificate validation). Pure version stamp — the field is optional and
  // absent means false, so older exports are already correct. The schema
  // validator (coerceServiceInstance) coerces the field on import.
  22: (payload) => ({ ...payload, version: 23 }),

  // v23 → v24: emby added to SERVICE_IDS. importConfig merges over
  // defaultInstances() afterward, so older payloads that lack an emby entry
  // get the disabled default automatically — nothing to transform here.
  23: (payload) => ({ ...payload, version: 24 }),

  // v24 → v25: tracearr added to SERVICE_IDS. importConfig merges over
  // defaultInstances() afterward, so older payloads that lack a tracearr entry
  // get the disabled default automatically — nothing to transform here. The
  // "tautulli-activity" → "stream-monitor" widget rename is handled separately
  // by WIDGET_ID_RENAMES on both the hydrate and import paths.
  24: (payload) => ({ ...payload, version: 25 }),

  // v25 → v26: rtorrent added to SERVICE_IDS. importConfig merges over
  // defaultInstances() afterward, so older payloads that lack an rtorrent entry
  // get the disabled default automatically — nothing to transform here.
  25: (payload) => ({ ...payload, version: 26 }),
};

/**
 * Takes a raw parsed config (any version) and runs migrations sequentially
 * until it reaches CURRENT_CONFIG_VERSION.
 */
export function migrateConfig(raw: any): ExportPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid config file");
  }

  let version: number = typeof raw.version === "number" ? raw.version : 0;
  let payload = { ...raw };

  if (version > CURRENT_CONFIG_VERSION) {
    throw new Error(
      `Config version ${version} is newer than this app supports (v${CURRENT_CONFIG_VERSION}). Update the app first.`,
    );
  }

  while (version < CURRENT_CONFIG_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration path from config version ${version}`);
    }
    payload = migrate(payload);
    version = payload.version;
  }

  if (!payload.services || typeof payload.services !== "object") {
    throw new Error("Invalid config file — no services found");
  }

  return payload as ExportPayload;
}
