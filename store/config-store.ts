import { create } from "zustand";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as LocalAuthentication from "expo-local-authentication";
import {
  initStorage,
  getJSON,
  setJSON,
  getBoolean,
  setBoolean,
  getString,
  setString,
  getSecret,
  setSecret,
  deleteSecret,
  deleteKey,
} from "@/store/storage";
import {
  SERVICE_IDS,
  SERVICE_DEFAULTS,
  STORAGE_KEYS,
  SECRET_PREFIX,
  DEFAULT_DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_NAME,
  WIDGET_ID_RENAMES,
  DASHBOARD_WIDGET_IDS,
  UI_SCALES,
  DEFAULT_UI_SCALE,
} from "@/lib/constants";
import type { UiScale } from "@/lib/constants";
import { DEFAULT_DASHBOARD_ICON } from "@/lib/dashboard-icons";
import { DEFAULT_DASHBOARD_COLOR } from "@/lib/dashboard-colors";
import { MAX_PINNED_TABS } from "@/lib/tab-routes";
import {
  CURRENT_CONFIG_VERSION,
  migrateConfig,
  migrateWidgetSlotSettings,
} from "@/store/config-migrations";
import { validateExportPayload } from "@/store/config-schema";
import {
  decryptEnvelope,
  encryptJsonString,
  isEncryptedEnvelope,
} from "@/lib/config-crypto";
import { useBackendStore } from "@/store/backend-store";
import { queryClient } from "@/lib/query-client";
import type { ServiceId, WidgetId } from "@/lib/constants";
import { normalizeBssid } from "@/lib/wifi";
import { normalizeServiceUrl } from "@/lib/url-validation";
import { generateInstanceId } from "@/lib/uuid";

export interface WakeOnLanDevice {
  id: string;
  name: string;
  mac: string;
  broadcastAddress?: string;
  port?: number;
}

export interface HomeNetwork {
  id: string;
  ssid: string;
  // Optional AP MAC pin. Empty string means SSID-only match for this entry —
  // the rogue-AP guard from v6 lives per-entry now so each AP in a mesh can
  // carry its own pin.
  bssid: string;
}

// Per-service connection config (URLs, enabled flag, display name). One
// ServiceInstance row exists per configured server — users can have multiple
// rows of the same kind (e.g. two qBittorrents).
export interface ServiceConfig {
  enabled: boolean;
  name: string;
  localUrl: string;
  remoteUrl: string;
  useRemote: boolean;
  // v23: opt this server out of TLS certificate validation (accept self-signed
  // / otherwise-invalid certs). Per-instance and off by default. The hostnames
  // of instances with this on are pushed to the native layer (see
  // lib/insecure-tls.ts), which bypasses trust evaluation for exactly those
  // hosts. Absent/undefined behaves like false.
  ignoreCertErrors?: boolean;
}

// A configured service instance: a ServiceConfig plus a stable UUID `id` that
// keys per-instance secrets, query cache, and per-instance widget bindings.
// The UUID is generated on instance creation and is preserved across renames,
// reorders, and exports/imports.
export interface ServiceInstance extends ServiceConfig {
  id: string;
}

export interface ServiceSecrets {
  apiKey?: string;
  username?: string;
  password?: string;
  // Per-service custom HTTP headers (e.g. CF-Access-Client-Id for reverse-proxy
  // auth). Stored alongside other secrets in SecureStore because values often
  // contain bearer tokens.
  customHeaders?: Record<string, string>;
}

// Per-slot settings live as an opaque record on the slot itself. The widget
// registry owns the shape (via defaultSettings) — the store just persists what
// each widget hands back. Values must be plain JSON-serializable objects.
export type WidgetSlotSettings = Record<string, unknown>;

// One widget on a dashboard. Carries a stable UUID `id` so settings stay tied
// to this specific placement even if the user removes the widget and re-adds
// it later (which gets a fresh slot id and so a fresh empty settings record).
// `widgetId` keys into WIDGET_REGISTRY for the component/icon/defaults.
export interface WidgetSlot {
  id: string;
  widgetId: WidgetId;
  settings?: WidgetSlotSettings;
}

// A user-named dashboard. Each user has at least one (the auto-created
// "Default"). The active one — selected via `activeDashboardId` — is what the
// dashboard screen renders. Slot ids are globally unique across all dashboards
// because they live in our memory at the same time and the slot-keyed query
// cache would otherwise collide.
//
// v20: dashboards become workspaces. `attachedInstances` filters every
// dashboard-aware surface at per-instance granularity (so a user with two
// Radarrs can attach the "Home" instance to one dashboard and the "Cabin"
// instance to another, without the Cabin Radarr's offline status leaking
// into the Home dashboard's health grid). `pinnedTabs` orders the
// user-chosen middle slots of the bottom tab bar; kind-level pickability
// still applies (e.g. a Movies tab needs at least one attached Radarr).
// `icon` and `color` give each workspace a visual identity surfaced in the
// picker, the dashboard header, and the bottom Dashboard tab. All four are
// optional so pre-v20 dashboards (and external imports) still validate.
export interface Dashboard {
  id: string;
  name: string;
  widgets: WidgetSlot[];
  // lucide icon name (e.g. "Film"). Unknown names fall back to the default
  // at render time via resolveDashboardIcon.
  icon?: string;
  // hex string from the curated palette in lib/dashboard-colors.ts. Unknown
  // values fall back to the default via resolveDashboardColor.
  color?: string;
  // Instance UUIDs attached to this workspace (per-instance, not per-kind).
  // Missing/undefined behaves like "all current instances attached" so
  // pre-v20 dashboards keep their global behavior. Stored UUIDs that no
  // longer match a live instance are ignored silently — re-creating an
  // instance with the same UUID restores its attachment without a re-pick.
  attachedInstances?: string[];
  // Route names of the middle bottom-tab slots, in display order. Capped at
  // MAX_PINNED_TABS by the setter. Missing/undefined falls back to the
  // pre-v20 bottom bar (downloads / calendar / services where applicable).
  pinnedTabs?: string[];
  // v22: per-workspace active instance selection. Each kind that has an entry
  // pins a specific UUID; kinds without an entry resolve at read time to the
  // first attached enabled instance of that kind. Stored UUIDs that fall out
  // of the dashboard's attached set (or get disabled / deleted) are silently
  // ignored by the resolver — they don't need to be cleaned eagerly, except
  // on instance delete (we prune to keep storage tidy).
  activeInstance?: Partial<Record<ServiceId, string>>;
  // v29: optional per-workspace home-network selection (#148). Missing/undefined
  // means "use ALL home networks" (the default), mirroring how
  // `attachedInstances === undefined` means auto-attach. An explicit array
  // selects a subset of the GLOBAL homeNetworks by id — ids that no longer match
  // a live network are ignored at resolve time, and an empty array means "no
  // home network for this workspace → always remote". Home networks themselves
  // are created/edited/deleted only on the Home Networks screen; this is purely
  // which of them attach to this workspace. Only the *active* dashboard's
  // selection is evaluated (see resolveEffectiveHomeNetworks /
  // evaluateHomeNetwork in lib/network.ts).
  homeNetworkIds?: string[];
}

// Legacy widget-settings shape carried by v13 exports. v13→v14 migration folds
// these into per-slot settings on the auto-built Default dashboard. We still
// export the type so the v14 export migration can reference it.
export type WidgetSettingsMap = Partial<Record<WidgetId, Record<string, unknown>>>;

// Notification preferences (v2+). Lives on the config store so it hydrates
// after initStorage() completes — the old standalone notifications-store
// hydrated synchronously before the AsyncStorage cache was populated, which
// caused the "enabled" toggle to revert to `true` on every cold start.
// Notification categories that can be toggled per-event-type. Kept as a
// string-literal union next to NotificationSettings so adding/removing a
// category is a single source of truth.
export type NotifCategory =
  | "torrentCompleted"
  | "sabnzbdCompleted"
  | "nzbgetCompleted"
  | "radarrDownloaded"
  | "sonarrDownloaded"
  | "serviceOffline"
  | "overseerrNewRequest";

export interface NotificationSettings {
  enabled: boolean;
  torrentCompleted: boolean;
  sabnzbdCompleted: boolean;
  nzbgetCompleted: boolean;
  radarrDownloaded: boolean;
  sonarrDownloaded: boolean;
  serviceOffline: boolean;
  overseerrNewRequest: boolean;
  // v21: per-instance overrides keyed by instance UUID. A category absent from
  // an instance's override map falls through to the global toggle. Allows
  // "notify me from the primary Radarr but stay silent from the testing one"
  // without splitting the global toggles per kind.
  perInstance?: Record<string, Partial<Record<NotifCategory, boolean>>>;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  torrentCompleted: true,
  sabnzbdCompleted: true,
  nzbgetCompleted: true,
  radarrDownloaded: true,
  sonarrDownloaded: true,
  serviceOffline: true,
  overseerrNewRequest: true,
};

interface ConfigState {
  // Authoritative multi-instance state (v13+). One array of ServiceInstance
  // entries per kind; each carries its own UUID, URLs, and enabled flag.
  serviceInstances: Record<ServiceId, ServiceInstance[]>;
  // Secrets keyed by instance UUID, not ServiceId. One row per ServiceInstance.id.
  instanceSecrets: Record<string, ServiceSecrets>;
  // v22: derived view of the active workspace's `activeInstance` map, with
  // resolver fallback applied (first attached+enabled instance of each kind
  // when the workspace has no explicit pin). The source of truth is
  // `dashboards[activeDashboardId].activeInstance` — this top-level shape is
  // kept so existing consumers that read `state.activeInstance[kind]` (and
  // the derived `services`/`secrets` views below) keep working without
  // workspace-awareness churn. Recomputed by `deriveActiveInstance()` on
  // every workspace switch / attachment change / instance enable/delete.
  activeInstance: Record<ServiceId, string | null>;

  // Legacy single-instance views of the active instance, keyed by ServiceId.
  // Computed from serviceInstances + instanceSecrets + activeInstance after
  // every mutation so existing consumers that read state.services[id] /
  // state.secrets[id] keep working until they're migrated to be instance-aware
  // in later steps.
  services: Record<ServiceId, ServiceConfig>;
  secrets: Record<ServiceId, ServiceSecrets>;

  autoSwitchNetwork: boolean;
  // EPHEMERAL (never persisted). True when we are NOT on a confirmed home
  // network, so the URL resolver prefers remote. Recomputed fresh each launch +
  // on every network change + on app resume by evaluateHomeNetwork() in
  // lib/network.ts. Defaults to TRUE (away → remote): we must never send the
  // private local URL to an untrusted network before confirming we're home, or a
  // stranger's device at the same private address harvests the API key. Local is
  // therefore used ONLY on a confirmed home network. Was persisted; persisting a
  // live network observation across launches caused the stale-cold-start half of
  // #106.
  networkAwayFromHome: boolean;
  homeNetworks: HomeNetwork[];
  // v17: per-user display order for the Services tab. Unknown ids are skipped
  // at render time; any SERVICE_IDS missing from the list fall in at the end
  // in canonical order, so adding a new service kind never gets hidden.
  servicesOrder: ServiceId[];
  // v14: per-user named dashboards. The active one is rendered. Each dashboard
  // owns an ordered list of WidgetSlot entries; per-widget settings live on
  // the slot, not in a global map keyed by WidgetId. This is what lets the
  // same widget appear with different instance bindings on different
  // dashboards (e.g. Downloads bound to qBit-Home on "Home", qBit-Cabin on
  // "Cabin").
  dashboards: Dashboard[];
  activeDashboardId: string;
  wolDevices: WakeOnLanDevice[];
  hydrated: boolean;
  demoMode: boolean;
  hapticsEnabled: boolean;
  // Headers merged into every outgoing service request (Cloudflare Access etc.).
  // Per-service customHeaders override on top of these.
  globalCustomHeaders: Record<string, string>;
  // Accessibility multiplier applied app-wide via NativeWind's rem observable.
  uiScale: UiScale;
  notificationSettings: NotificationSettings;
}

export interface ExportPayload {
  version: number;
  exportedAt: string;
  // v13: array of ServiceInstance per kind, each carrying a UUID id.
  services: Record<ServiceId, ServiceInstance[]>;
  // v13: keyed by instance UUID, not ServiceId.
  secrets: Record<string, ServiceSecrets>;
  autoSwitchNetwork: boolean;
  // v11 — replaces homeSSID/homeBSSID with a per-AP list so mesh setups can
  // register every SSID/BSSID pair the user considers "home".
  homeNetworks: HomeNetwork[];
  // v14: per-user named dashboards with per-slot settings. Replaces the v7-v13
  // `dashboardWidgets: WidgetId[]` + `widgetSettings: Record<WidgetId, …>`.
  dashboards: Dashboard[];
  activeDashboardId: string;
  // v2
  backend?: { url: string | null; sharedSecret: string | null; deviceId: string | null };
  notificationSettings?: NotificationSettings;
  // v4
  wolDevices?: WakeOnLanDevice[];
  // v8
  hapticsEnabled?: boolean;
  // v10
  globalCustomHeaders?: Record<string, string>;
  // v12
  uiScale?: UiScale;
  // v17 — user-defined Services tab tile order.
  servicesOrder?: ServiceId[];
}

export type ExportStage = "preparing" | "encrypting" | "finalizing";
export type ImportStage = "decrypting" | "restoring";

// Macrotask yield so React can paint the new stage before the next CPU-bound
// step hogs the JS thread (pbkdf2 in particular only yields microtasks).
const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

interface ConfigActions {
  hydrate: () => Promise<void>;

  // Multi-instance (v13+) actions. Operate by UUID so renames/reorders don't
  // invalidate references.
  addInstance: (
    id: ServiceId,
    init?: Partial<Omit<ServiceInstance, "id">>,
  ) => ServiceInstance;
  removeInstance: (id: ServiceId, instanceId: string) => Promise<void>;
  updateInstance: (
    id: ServiceId,
    instanceId: string,
    patch: Partial<Omit<ServiceInstance, "id">>,
  ) => void;
  toggleInstance: (id: ServiceId, instanceId: string) => void;
  moveInstance: (id: ServiceId, instanceId: string, direction: "up" | "down") => void;
  setActiveInstance: (id: ServiceId, instanceId: string | null) => void;
  // v22: explicit-dashboard variant. Writes the kind's pin onto the named
  // dashboard's `activeInstance` map. `setActiveInstance` above is the
  // common case (writes to whichever workspace is currently active).
  setDashboardActiveInstance: (
    dashboardId: string,
    id: ServiceId,
    instanceId: string | null,
  ) => void;
  updateInstanceSecrets: (
    instanceId: string,
    secrets: Partial<ServiceSecrets>,
  ) => Promise<void>;

  // Legacy single-instance helpers. These operate on the active instance for
  // the given kind and exist so consumers that haven't been migrated to be
  // instance-aware keep working. They'll be retired once the rest of the
  // codebase passes instanceId explicitly.
  updateService: (id: ServiceId, config: Partial<ServiceConfig>) => void;
  toggleService: (id: ServiceId) => void;
  updateSecrets: (id: ServiceId, secrets: Partial<ServiceSecrets>) => Promise<void>;

  setAutoSwitch: (enabled: boolean) => void;
  // Set by evaluateHomeNetwork() (lib/network.ts) on every network change.
  // EPHEMERAL — never persisted.
  setNetworkAwayFromHome: (away: boolean) => void;
  addHomeNetwork: (network: Omit<HomeNetwork, "id">) => HomeNetwork;
  updateHomeNetwork: (id: string, patch: Partial<Omit<HomeNetwork, "id">>) => void;
  removeHomeNetwork: (id: string) => void;
  setHomeNetworks: (networks: HomeNetwork[]) => void;

  // Dashboards (v14+). Operate on the named dashboard list. Removing the last
  // dashboard is rejected by the action — every install always has at least
  // one dashboard so the screen never has nothing to render.
  addDashboard: (name: string) => Dashboard;
  removeDashboard: (dashboardId: string) => void;
  renameDashboard: (dashboardId: string, name: string) => void;
  setActiveDashboard: (dashboardId: string) => void;
  moveDashboard: (dashboardId: string, direction: "up" | "down") => void;
  // v20: dashboard identity + workspace filter + bottom-tab pinning. All four
  // setters persist via setJSON(STORAGE_KEYS.dashboards, ...).
  setDashboardIcon: (dashboardId: string, icon: string) => void;
  setDashboardColor: (dashboardId: string, color: string) => void;
  setDashboardAttachedInstances: (dashboardId: string, instanceIds: string[]) => void;
  setDashboardPinnedTabs: (dashboardId: string, tabIds: string[]) => void;
  // v29: per-workspace home-network selection (#148). Pass an array of global
  // home-network ids to attach a custom subset, or `undefined` to use all.
  setDashboardHomeNetworkIds: (
    dashboardId: string,
    ids: string[] | undefined,
  ) => void;

  // Slots (v14+). Operate on the active dashboard's widget list. addWidget
  // returns the new slot so callers can reference it (e.g. open settings sheet).
  addWidget: (widgetId: WidgetId) => WidgetSlot | null;
  removeSlot: (slotId: string) => void;
  moveSlot: (slotId: string, direction: "up" | "down") => void;
  setSlotSettings: (slotId: string, settings: WidgetSlotSettings) => void;
  resetSlotSettings: (slotId: string) => void;

  setServicesOrder: (order: ServiceId[]) => void;
  setWolDevices: (devices: WakeOnLanDevice[]) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setGlobalCustomHeaders: (headers: Record<string, string>) => void;
  setUiScale: (scale: UiScale) => void;
  setNotificationSetting: <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
  ) => void;
  // v21: write or clear a per-instance notification override. Passing
  // "inherit" deletes the entry; passing a boolean stores it. Cleans up
  // empty per-instance records so the persisted shape stays tidy.
  setInstanceNotificationOverride: (
    instanceId: string,
    category: NotifCategory,
    value: boolean | "inherit",
  ) => void;

  // Lookup helpers. instanceId is optional — when omitted, the active instance
  // for that kind is used (legacy single-instance behavior).
  getInstance: (id: ServiceId, instanceId: string) => ServiceInstance | undefined;
  getActiveInstanceId: (id: ServiceId) => string | null;
  getEnabledInstances: (id: ServiceId) => ServiceInstance[];
  getMergedHeaders: (id: ServiceId, instanceId?: string) => Record<string, string>;
  getActiveUrl: (id: ServiceId, instanceId?: string) => string;

  // Dashboard/slot lookups. Used by the dashboard screen + widget settings
  // sheet to resolve a slot from its UUID without re-deriving the active
  // dashboard each time.
  getActiveDashboard: () => Dashboard | undefined;
  getSlot: (slotId: string) => WidgetSlot | undefined;

  enableDemoMode: () => void;
  disableDemoMode: () => Promise<void>;
  exportConfig: (passphrase: string, onStage?: (stage: ExportStage) => void) => Promise<void>;
  importConfig: (
    requestPassphrase: () => Promise<string | null>,
    onStage?: (stage: ImportStage) => void,
  ) => Promise<boolean>;
}

type ConfigStore = ConfigState & ConfigActions;

function defaultServiceConfig(id: ServiceId): ServiceConfig {
  const defaults = SERVICE_DEFAULTS[id];
  return {
    enabled: false,
    name: defaults.name,
    localUrl: "",
    remoteUrl: "",
    useRemote: false,
    ignoreCertErrors: false,
  };
}

// Build a single ServiceInstance with a freshly-generated UUID and the given
// (optional) overrides on top of the kind defaults.
function makeInstance(
  id: ServiceId,
  init?: Partial<Omit<ServiceInstance, "id">>,
): ServiceInstance {
  return { id: generateInstanceId(), ...defaultServiceConfig(id), ...(init ?? {}) };
}

// Default state for a fresh install: each kind starts with one disabled
// instance carrying default URLs/credentials, mirroring the v12 UX where every
// service had a slot ready in settings.
function defaultInstances(): Record<ServiceId, ServiceInstance[]> {
  const out = {} as Record<ServiceId, ServiceInstance[]>;
  for (const id of SERVICE_IDS) {
    out[id] = [makeInstance(id)];
  }
  return out;
}

function defaultActiveInstance(
  instances: Record<ServiceId, ServiceInstance[]>,
): Record<ServiceId, string | null> {
  const out = {} as Record<ServiceId, string | null>;
  for (const id of SERVICE_IDS) {
    out[id] = instances[id][0]?.id ?? null;
  }
  return out;
}

// v22: resolve the workspace-aware active instance per kind. Reads the active
// dashboard's optional `activeInstance` map first; if the kind has no pin (or
// the pinned UUID is disabled / unattached / missing), falls back to the
// first attached + enabled instance of that kind. Returns null when no
// instance of the kind exists or none are attached + enabled.
//
// Used to populate the derived top-level `state.activeInstance` view on every
// mutation that could change resolution: workspace switch, attachment change,
// per-dashboard pin set/clear, instance add/remove/toggle.
function deriveActiveInstance(
  dashboards: Dashboard[],
  activeDashboardId: string,
  serviceInstances: Record<ServiceId, ServiceInstance[]>,
): Record<ServiceId, string | null> {
  const dashboard = dashboards.find((d) => d.id === activeDashboardId);
  const attached = dashboard?.attachedInstances;
  const isAttached = (id: string): boolean =>
    attached === undefined ? true : attached.includes(id);

  const out = {} as Record<ServiceId, string | null>;
  for (const kind of SERVICE_IDS) {
    const list = serviceInstances[kind] ?? [];
    if (list.length === 0) {
      out[kind] = null;
      continue;
    }
    const pinned = dashboard?.activeInstance?.[kind];
    if (pinned) {
      const hit = list.find(
        (i) => i.id === pinned && i.enabled && isAttached(i.id),
      );
      if (hit) {
        out[kind] = hit.id;
        continue;
      }
    }
    const fallback = list.find((i) => i.enabled && isAttached(i.id));
    out[kind] = fallback?.id ?? null;
  }
  return out;
}

// Helper: bundled recomputation for the trio of derived views that depend on
// active-instance resolution. Call after any mutation that could affect the
// active dashboard's per-kind pick or its attachment set.
function recomputeDerivedFromActive(
  dashboards: Dashboard[],
  activeDashboardId: string,
  serviceInstances: Record<ServiceId, ServiceInstance[]>,
  instanceSecrets: Record<string, ServiceSecrets>,
): {
  activeInstance: Record<ServiceId, string | null>;
  services: Record<ServiceId, ServiceConfig>;
  secrets: Record<ServiceId, ServiceSecrets>;
} {
  const activeInstance = deriveActiveInstance(
    dashboards,
    activeDashboardId,
    serviceInstances,
  );
  const services = deriveLegacyServices(serviceInstances, activeInstance);
  const secrets = deriveLegacySecrets(
    serviceInstances,
    instanceSecrets,
    activeInstance,
  );
  return { activeInstance, services, secrets };
}

// The home-network ids that actually govern local/remote switching for a
// dashboard: its explicit selection (filtered to still-existing networks), or
// every global network when it has none (undefined = all). Mirrors
// resolveEffectiveHomeNetworks in lib/network.ts but returns just the id set —
// inlined here to avoid a config-store → lib/network import cycle.
function effectiveHomeNetworkIdSet(
  dashboard: Dashboard | undefined,
  globalHomeNetworks: HomeNetwork[],
): Set<string> {
  const allIds = globalHomeNetworks.map((n) => n.id);
  const ids = dashboard?.homeNetworkIds;
  if (ids === undefined) return new Set(allIds);
  const valid = new Set(allIds);
  return new Set(ids.filter((id) => valid.has(id)));
}

// Whether switching the active workspace from `oldDashboard` to `newDashboard`
// should reset networkAwayFromHome to the safe default (away → remote). The
// cached flag was computed against the OUTGOING dashboard's home networks; if
// the incoming dashboard governs a different set, a stale `false` would briefly
// send the private local URL on a network the new workspace doesn't trust —
// the switch-race exposure window (#148 review Rec #8). When the sets match the
// flag is still valid, so same-network switches don't needlessly flap to
// remote. Only meaningful while auto-switch is on and we're not already away;
// useNetworkAutoSwitch re-evaluates against the real SSID a tick later and
// clears the flag if we're actually home on the new workspace.
function switchInvalidatesAwayFlag(
  state: {
    autoSwitchNetwork: boolean;
    demoMode: boolean;
    networkAwayFromHome: boolean;
    homeNetworks: HomeNetwork[];
  },
  oldDashboard: Dashboard | undefined,
  newDashboard: Dashboard | undefined,
): boolean {
  if (!state.autoSwitchNetwork || state.demoMode) return false;
  if (state.networkAwayFromHome) return false; // already at the safe default
  const oldSet = effectiveHomeNetworkIdSet(oldDashboard, state.homeNetworks);
  const newSet = effectiveHomeNetworkIdSet(newDashboard, state.homeNetworks);
  if (oldSet.size !== newSet.size) return true;
  for (const id of oldSet) if (!newSet.has(id)) return true;
  return false;
}

function emptyLegacySecrets(): Record<ServiceId, ServiceSecrets> {
  const secrets = {} as Record<ServiceId, ServiceSecrets>;
  for (const id of SERVICE_IDS) {
    secrets[id] = {};
  }
  return secrets;
}

// Project the multi-instance state down to the legacy `services[serviceId]`
// shape consumers still read. Picks the active instance per kind, falling
// back to the first instance, then to default-shaped (disabled) config.
function deriveLegacyServices(
  instances: Record<ServiceId, ServiceInstance[]>,
  activeInstance: Record<ServiceId, string | null>,
): Record<ServiceId, ServiceConfig> {
  const out = {} as Record<ServiceId, ServiceConfig>;
  for (const id of SERVICE_IDS) {
    const list = instances[id] ?? [];
    // No raw first-instance tail (#3): when the workspace has no enabled+
    // attached instance of this kind, the legacy view falls to the default
    // (disabled) config rather than projecting an other-workspace instance.
    const activeId = activeInstance[id];
    const inst = activeId ? list.find((i) => i.id === activeId) : undefined;
    if (inst) {
      const { id: _id, ...cfg } = inst;
      out[id] = cfg;
    } else {
      out[id] = defaultServiceConfig(id);
    }
  }
  return out;
}

// Project the multi-instance state down to the legacy `secrets[serviceId]`
// shape consumers still read. Picks the active instance's secrets per kind,
// falling back to the first instance, then to {}.
function deriveLegacySecrets(
  instances: Record<ServiceId, ServiceInstance[]>,
  instanceSecrets: Record<string, ServiceSecrets>,
  activeInstance: Record<ServiceId, string | null>,
): Record<ServiceId, ServiceSecrets> {
  const out = emptyLegacySecrets();
  for (const id of SERVICE_IDS) {
    const list = instances[id] ?? [];
    // No raw first-instance tail (#3): an unattached workspace gets empty
    // secrets for the kind, never another workspace's API key.
    const activeId = activeInstance[id];
    if (activeId && instanceSecrets[activeId]) {
      out[id] = instanceSecrets[activeId];
    }
  }
  return out;
}

// Build the auto-created Default dashboard for a fresh install. Each entry in
// DEFAULT_DASHBOARD_WIDGETS becomes a slot with a generated UUID and no
// per-slot settings (widgets fall back to their registry-declared defaults).
// v20: `attachedInstances` stays undefined so the auto-attach semantic
// (every current and future instance is included) covers fresh installs
// without requiring the user to revisit the picker every time they add a
// new instance. Once they open the editor and save, the dashboard
// transitions to an explicit list — i.e. they're in curated mode.
function defaultDashboards(): Dashboard[] {
  return [
    {
      id: generateInstanceId(),
      name: DEFAULT_DASHBOARD_NAME,
      widgets: DEFAULT_DASHBOARD_WIDGETS.map((widgetId) => ({
        id: generateInstanceId(),
        widgetId,
      })),
      icon: DEFAULT_DASHBOARD_ICON,
      color: DEFAULT_DASHBOARD_COLOR,
      pinnedTabs: ["downloads", "calendar", "services"],
    },
  ];
}

// Convert a flat legacy widget id list + per-WidgetId settings map into a
// single Dashboard with one slot per widget. Used by both hydrate and the
// v13→v14 export migration so the two paths produce identical shapes.
// `attachedInstances` is intentionally absent — the render-time fallback
// treats undefined as "all currently-known instances attached", which is
// the right behavior for a freshly-migrated dashboard.
function buildLegacyDashboard(
  widgetIds: WidgetId[],
  legacySettings: Partial<Record<WidgetId, Record<string, unknown>>>,
): Dashboard {
  return {
    id: generateInstanceId(),
    name: DEFAULT_DASHBOARD_NAME,
    widgets: widgetIds.map((widgetId) => {
      const settings = legacySettings[widgetId];
      const slot: WidgetSlot = { id: generateInstanceId(), widgetId };
      if (settings && Object.keys(settings).length > 0) {
        // Pre-v14 widgetSettings carried scalar `instanceId` — fold the v15
        // rename (and any widget-specific renames) in here so users coming from
        // v13 land on the new shape in a single hydrate pass.
        slot.settings = migrateWidgetSlotSettings(widgetId, { ...settings });
      }
      return slot;
    }),
    icon: DEFAULT_DASHBOARD_ICON,
    color: DEFAULT_DASHBOARD_COLOR,
    pinnedTabs: ["downloads", "calendar", "services"],
  };
}

function generateHomeNetworkId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isHomeNetwork(value: unknown): value is HomeNetwork {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<HomeNetwork>;
  return (
    typeof v.id === "string" &&
    typeof v.ssid === "string" &&
    typeof v.bssid === "string"
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isServiceInstance(v: unknown): v is ServiceInstance {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.enabled === "boolean" &&
    typeof v.name === "string" &&
    typeof v.localUrl === "string" &&
    typeof v.remoteUrl === "string" &&
    typeof v.useRemote === "boolean"
  );
}

const VALID_SERVICE_IDS = new Set<string>(SERVICE_IDS);

// Filter a raw stored list down to known ServiceIds, drop duplicates, and
// preserve the user's chosen order. The list is allowed to be a partial
// subset — render-time logic appends any SERVICE_IDS not present here at the
// end in canonical order, so a user who only ever moved a single tile still
// gets every service rendered.
function sanitizeServicesOrder(raw: unknown): ServiceId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ServiceId[] = [];
  for (const id of raw) {
    if (typeof id !== "string") continue;
    if (!VALID_SERVICE_IDS.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id as ServiceId);
  }
  return out;
}

const VALID_WIDGET_IDS = new Set<string>(DASHBOARD_WIDGET_IDS);

function normalizeWidgetIds(ids: string[]): WidgetId[] {
  const seen = new Set<string>();
  const out: WidgetId[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = WIDGET_ID_RENAMES[raw] ?? raw;
    if (!VALID_WIDGET_IDS.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id as WidgetId);
  }
  return out;
}

function remapWidgetSettings(
  raw: Record<string, Record<string, unknown>>,
): WidgetSettingsMap {
  const out: WidgetSettingsMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const id = WIDGET_ID_RENAMES[key] ?? key;
    if (!VALID_WIDGET_IDS.has(id)) continue;
    // If both old and new keys are present, the newer key wins.
    if (out[id as WidgetId]) continue;
    out[id as WidgetId] = value;
  }
  return out;
}

const ACTIVE_INSTANCE_KEY = "app.activeInstance";

const initialInstances = defaultInstances();
const initialActiveInstance = defaultActiveInstance(initialInstances);
const initialDashboards = defaultDashboards();

export const useConfigStore = create<ConfigStore>((set, get) => ({
  serviceInstances: initialInstances,
  instanceSecrets: {},
  activeInstance: initialActiveInstance,
  services: deriveLegacyServices(initialInstances, initialActiveInstance),
  secrets: emptyLegacySecrets(),
  autoSwitchNetwork: false,
  networkAwayFromHome: true,
  homeNetworks: [],
  servicesOrder: [],
  dashboards: initialDashboards,
  activeDashboardId: initialDashboards[0].id,
  wolDevices: [],
  hydrated: false,
  demoMode: false,
  hapticsEnabled: true,
  globalCustomHeaders: {},
  uiScale: DEFAULT_UI_SCALE,
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,

  hydrate: async () => {
    // Populate in-memory cache from AsyncStorage
    await initStorage();

    // Read the new array shape; if absent or shaped like the v12 singleton,
    // build a one-element array around it and persist back so the migration is
    // a one-time cost. Generated UUIDs are stable across restarts.
    const instances = {} as Record<ServiceId, ServiceInstance[]>;
    const legacyToInstanceId: Record<ServiceId, string | null> = {} as Record<
      ServiceId,
      string | null
    >;
    let needsServicesPersist = false;
    for (const id of SERVICE_IDS) {
      const stored = getJSON<unknown>(`${STORAGE_KEYS.services}.${id}`);
      let list: ServiceInstance[] = [];
      if (Array.isArray(stored)) {
        for (const entry of stored) {
          if (isServiceInstance(entry)) list.push(entry);
        }
      } else if (isPlainObject(stored)) {
        // v12 legacy singleton — wrap into a single-instance array.
        const cfg = {
          ...defaultServiceConfig(id),
          ...stored,
        } as ServiceConfig;
        const inst: ServiceInstance = { id: generateInstanceId(), ...cfg };
        list = [inst];
        legacyToInstanceId[id] = inst.id;
        needsServicesPersist = true;
      }
      if (list.length === 0) {
        // Fresh install (or fully-empty entry) — seed with one disabled instance
        // so the settings UI has a slot to fill, matching the v12 default UX.
        list = [makeInstance(id)];
        needsServicesPersist = true;
      }
      instances[id] = list;
    }

    // Existing users had the legacy default "Overseerr" in AsyncStorage; show
    // the current default ("Seerr") instead. Custom names set by the user are
    // preserved (only the verbatim legacy default is replaced).
    for (const inst of instances.overseerr) {
      if (inst.name === "Overseerr") {
        inst.name = SERVICE_DEFAULTS.overseerr.name;
        needsServicesPersist = true;
      }
    }

    // v18 one-shot: pre-v18 builds wrote useRemote on every NetInfo event as
    // if it were derived state. The user could never actually set the toggle
    // for their preferred override without it getting clobbered. On first
    // launch of v18, reset useRemote to false on every instance for installs
    // that had auto-switch on — that returns the toggle to a clean slate
    // representing user intent. Installs that had auto-switch off had a
    // genuine user-controlled useRemote, so we leave those alone.
    const v18ResetDone = getBoolean(STORAGE_KEYS.v18UseRemoteReset);
    if (!v18ResetDone) {
      const autoSwitchWasOn = getBoolean(STORAGE_KEYS.autoSwitchNetwork);
      if (autoSwitchWasOn) {
        for (const id of SERVICE_IDS) {
          for (const inst of instances[id]) {
            if (inst.useRemote) {
              inst.useRemote = false;
              needsServicesPersist = true;
            }
          }
        }
      }
      setBoolean(STORAGE_KEYS.v18UseRemoteReset, true);
    }

    if (needsServicesPersist) {
      for (const id of SERVICE_IDS) {
        setJSON(`${STORAGE_KEYS.services}.${id}`, instances[id]);
      }
    }

    // Load secrets keyed by instance UUID. Also handles the v12 → v13 SecureStore
    // re-key: if a legacy `secrets.${serviceId}.*` key is found and the kind
    // had its singleton wrapped above, copy values to the new UUID-keyed slot
    // and delete the legacy ones so we don't keep duplicate secrets around.
    const instanceSecrets: Record<string, ServiceSecrets> = {};

    async function readSecretsForKey(
      key: string,
    ): Promise<ServiceSecrets | null> {
      const apiKey = await getSecret(`${SECRET_PREFIX}.${key}.apiKey`);
      const username = await getSecret(`${SECRET_PREFIX}.${key}.username`);
      const password = await getSecret(`${SECRET_PREFIX}.${key}.password`);
      const customHeadersRaw = await getSecret(
        `${SECRET_PREFIX}.${key}.customHeaders`,
      );
      let customHeaders: Record<string, string> | undefined;
      if (customHeadersRaw) {
        try {
          const parsed: unknown = JSON.parse(customHeadersRaw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            customHeaders = parsed as Record<string, string>;
          }
        } catch {
          // Corrupt entry — drop it so the user can re-enter rather than crash.
        }
      }
      const out: ServiceSecrets = {
        ...(apiKey ? { apiKey } : {}),
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
        ...(customHeaders ? { customHeaders } : {}),
      };
      const empty =
        !out.apiKey && !out.username && !out.password && !out.customHeaders;
      return empty ? null : out;
    }

    async function deleteSecretsForKey(key: string): Promise<void> {
      await deleteSecret(`${SECRET_PREFIX}.${key}.apiKey`);
      await deleteSecret(`${SECRET_PREFIX}.${key}.username`);
      await deleteSecret(`${SECRET_PREFIX}.${key}.password`);
      await deleteSecret(`${SECRET_PREFIX}.${key}.customHeaders`);
    }

    async function writeSecretsForKey(
      key: string,
      s: ServiceSecrets,
    ): Promise<void> {
      if (s.apiKey) await setSecret(`${SECRET_PREFIX}.${key}.apiKey`, s.apiKey);
      if (s.username)
        await setSecret(`${SECRET_PREFIX}.${key}.username`, s.username);
      if (s.password)
        await setSecret(`${SECRET_PREFIX}.${key}.password`, s.password);
      if (s.customHeaders && Object.keys(s.customHeaders).length > 0) {
        await setSecret(
          `${SECRET_PREFIX}.${key}.customHeaders`,
          JSON.stringify(s.customHeaders),
        );
      }
    }

    // First, migrate any v12 legacy secrets to the new UUID slots.
    for (const id of SERVICE_IDS) {
      const newInstanceId = legacyToInstanceId[id];
      if (!newInstanceId) continue;
      const legacy = await readSecretsForKey(id);
      if (legacy) {
        await writeSecretsForKey(newInstanceId, legacy);
      }
      await deleteSecretsForKey(id);
    }

    // Then load secrets for every known instance UUID across all kinds.
    for (const id of SERVICE_IDS) {
      for (const inst of instances[id]) {
        const s = await readSecretsForKey(inst.id);
        if (s) instanceSecrets[inst.id] = s;
      }
    }

    // v22: active instance is workspace-scoped, derived from
    // `dashboard.activeInstance` + attachment fallback. The legacy
    // `ACTIVE_INSTANCE_KEY` storage is no longer the source of truth — but on
    // first launch after upgrade, fold it onto each dashboard that doesn't
    // already carry an activeInstance map (mirrors the v21→v22 export
    // migration for local-only installs that never re-imported). One-shot.
    const legacyActive = getJSON<Record<string, unknown>>(ACTIVE_INSTANCE_KEY);
    // NOTE: we can't apply the legacy fold here yet — dashboards aren't built
    // at this point in hydrate (they're loaded a few hundred lines below).
    // Stash the legacy value and apply after the dashboards array exists.

    const autoSwitchNetwork = getBoolean(STORAGE_KEYS.autoSwitchNetwork);
    // Purge the orphaned persisted flag from older builds. networkAwayFromHome is
    // now ephemeral runtime state, recomputed fresh each launch by
    // evaluateHomeNetwork() (lib/network.ts) — persisting a live network
    // observation caused #106's stale-cold-start false-red.
    deleteKey("app.networkAwayFromHome");

    // Read the new array; if absent, migrate from legacy single-SSID keys so
    // upgraders who never re-import keep their auto-switch configuration.
    let homeNetworks: HomeNetwork[] = [];
    const storedHomeNetworks = getJSON<HomeNetwork[]>(STORAGE_KEYS.homeNetworks);
    if (Array.isArray(storedHomeNetworks)) {
      homeNetworks = storedHomeNetworks.filter(isHomeNetwork);
    } else {
      const legacySsid = getString("app.homeSSID");
      const legacyBssid = getString("app.homeBSSID");
      if (legacySsid && legacySsid.length > 0) {
        homeNetworks = [
          {
            id: "migrated-1",
            ssid: legacySsid,
            bssid: typeof legacyBssid === "string" ? legacyBssid : "",
          },
        ];
      }
      setJSON(STORAGE_KEYS.homeNetworks, homeNetworks);
      if (legacySsid !== undefined) deleteKey("app.homeSSID");
      if (legacyBssid !== undefined) deleteKey("app.homeBSSID");
    }

    // v14: dashboards are the source of truth. If the new key is present and
    // valid, use it. Otherwise fold legacy `dashboardWidgets` + `widgetSettings`
    // into a single Default dashboard so upgrading users keep their layout and
    // per-widget settings without re-doing them.
    let dashboards: Dashboard[] = [];
    let activeDashboardId = "";
    let dashboardsNeedPersist = false;

    const storedDashboards = getJSON<unknown>(STORAGE_KEYS.dashboards);
    if (Array.isArray(storedDashboards)) {
      for (const d of storedDashboards) {
        if (!isPlainObject(d)) continue;
        const widgets: WidgetSlot[] = [];
        if (Array.isArray(d.widgets)) {
          for (const w of d.widgets) {
            if (!isPlainObject(w)) continue;
            if (typeof w.id !== "string" || typeof w.widgetId !== "string") continue;
            const remapped = WIDGET_ID_RENAMES[w.widgetId] ?? w.widgetId;
            if (!VALID_WIDGET_IDS.has(remapped)) continue;
            const slot: WidgetSlot = { id: w.id, widgetId: remapped as WidgetId };
            if (isPlainObject(w.settings)) {
              // Apply the v14→v15 binding-field rename (and widget-specific
              // renames like tautulli-activity's instanceIds → tautulliInstanceIds)
              // to locally-persisted dashboards too — without this, an upgrading
              // user's stored keys would never get rewritten unless they
              // re-imported their config.
              const migrated = migrateWidgetSlotSettings(
                remapped,
                w.settings as Record<string, unknown>,
              );
              if (migrated !== w.settings) {
                dashboardsNeedPersist = true;
              }
              slot.settings = migrated as WidgetSlotSettings;
            }
            widgets.push(slot);
          }
        }
        if (typeof d.id === "string" && typeof d.name === "string") {
          const dashboard: Dashboard = { id: d.id, name: d.name, widgets };
          // v20: optional identity + workspace fields. Each is round-tripped
          // through hydrate so users upgrading from a pre-v20 build pick up
          // the migration's defaults on first launch; once set, edits stick.
          if (typeof d.icon === "string" && d.icon.length > 0) {
            dashboard.icon = d.icon;
          }
          if (typeof d.color === "string" && d.color.length > 0) {
            dashboard.color = d.color;
          }
          if (Array.isArray(d.attachedInstances)) {
            const seen = new Set<string>();
            const attached: string[] = [];
            for (const id of d.attachedInstances) {
              if (typeof id !== "string" || id.length === 0) continue;
              if (seen.has(id)) continue;
              seen.add(id);
              attached.push(id);
            }
            dashboard.attachedInstances = attached;
          } else if (Array.isArray(d.attachedServices)) {
            // Forward-fix for a pre-rename build of v20 that briefly used
            // ServiceId[] attachment. Expand each kind to all live instance
            // UUIDs so behavior is preserved across the rename.
            const kindSet = new Set<string>();
            for (const id of d.attachedServices) {
              if (typeof id === "string" && VALID_SERVICE_IDS.has(id)) {
                kindSet.add(id);
              }
            }
            const expanded: string[] = [];
            for (const kind of SERVICE_IDS) {
              if (!kindSet.has(kind)) continue;
              for (const inst of instances[kind] ?? []) {
                expanded.push(inst.id);
              }
            }
            dashboard.attachedInstances = expanded;
            dashboardsNeedPersist = true;
          }
          if (Array.isArray(d.pinnedTabs)) {
            const seen = new Set<string>();
            const pinned: string[] = [];
            for (const tab of d.pinnedTabs) {
              if (typeof tab !== "string" || tab.length === 0) continue;
              if (seen.has(tab)) continue;
              seen.add(tab);
              pinned.push(tab);
              if (pinned.length >= MAX_PINNED_TABS) break;
            }
            dashboard.pinnedTabs = pinned;
          }
          // v22: per-workspace activeInstance map (kind → instance UUID).
          // Unknown kinds and empty UUIDs are dropped; any post-hydrate
          // staleness (UUIDs that no longer exist) is handled by the
          // resolver, which silently falls back to the first attached enabled
          // instance.
          if (isPlainObject(d.activeInstance)) {
            const cleaned: Partial<Record<ServiceId, string>> = {};
            for (const [kind, raw] of Object.entries(d.activeInstance)) {
              if (typeof raw !== "string" || raw.length === 0) continue;
              if (!(SERVICE_IDS as readonly string[]).includes(kind)) continue;
              cleaned[kind as ServiceId] = raw;
            }
            if (Object.keys(cleaned).length > 0) {
              dashboard.activeInstance = cleaned;
            }
          }
          // Backfill v20 fields one-time for users upgrading from a v14-v19
          // local install (the AsyncStorage payload is the legacy shape, even
          // though the export migration handles them at import time).
          if (dashboard.icon === undefined) {
            dashboard.icon = DEFAULT_DASHBOARD_ICON;
            dashboardsNeedPersist = true;
          }
          if (dashboard.color === undefined) {
            dashboard.color = DEFAULT_DASHBOARD_COLOR;
            dashboardsNeedPersist = true;
          }
          // attachedInstances stays undefined on pre-v20 dashboards
          // intentionally — the render-time fallback treats absent as "all
          // currently-known instances attached", which is the only way for
          // future instances the user adds later to also auto-attach to
          // legacy dashboards. The fields below stay explicit because they
          // don't have a meaningful "auto" semantic.
          if (dashboard.pinnedTabs === undefined) {
            dashboard.pinnedTabs = ["downloads", "calendar", "services"];
            dashboardsNeedPersist = true;
          }
          dashboards.push(dashboard);
        }
      }
    }

    if (dashboards.length === 0) {
      // Migrate from v13: read legacy widget list + settings map and fold them
      // into a single Default dashboard. Honor the v6→v7 widget id renames and
      // v5 fallback for users coming from pre-widget builds.
      let legacyWidgets = getJSON<string[]>(STORAGE_KEYS.dashboardWidgetsLegacy);
      if (!legacyWidgets) {
        const olderLegacy = getJSON<string[]>(STORAGE_KEYS.dashboardOrderLegacy);
        if (olderLegacy && olderLegacy.length > 0) {
          legacyWidgets = olderLegacy;
        } else {
          legacyWidgets = [...DEFAULT_DASHBOARD_WIDGETS];
        }
      }
      const normalizedWidgets = normalizeWidgetIds(legacyWidgets);
      const legacySettingsRaw =
        getJSON<Record<string, Record<string, unknown>>>(
          STORAGE_KEYS.widgetSettingsLegacy,
        ) ?? {};
      const legacySettings = remapWidgetSettings(legacySettingsRaw);
      dashboards = [buildLegacyDashboard(normalizedWidgets, legacySettings)];
      activeDashboardId = dashboards[0].id;
      dashboardsNeedPersist = true;

      // Drop legacy keys so a downgrade-then-upgrade can't resurrect them.
      deleteKey(STORAGE_KEYS.dashboardWidgetsLegacy);
      deleteKey(STORAGE_KEYS.widgetSettingsLegacy);
      deleteKey(STORAGE_KEYS.dashboardOrderLegacy);
    } else {
      const storedActive = getString(STORAGE_KEYS.activeDashboardId);
      if (storedActive && dashboards.some((d) => d.id === storedActive)) {
        activeDashboardId = storedActive;
      } else {
        activeDashboardId = dashboards[0].id;
        dashboardsNeedPersist = true;
      }
    }

    if (dashboardsNeedPersist) {
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      setString(STORAGE_KEYS.activeDashboardId, activeDashboardId);
    }

    const servicesOrder = sanitizeServicesOrder(
      getJSON<unknown>(STORAGE_KEYS.servicesOrder),
    );

    const wolDevices = getJSON<WakeOnLanDevice[]>(STORAGE_KEYS.wolDevices) ?? [];
    const globalCustomHeaders =
      getJSON<Record<string, string>>(STORAGE_KEYS.globalCustomHeaders) ?? {};

    // Default to true for new installs and pre-v8 users who never had the toggle.
    // getBoolean can't distinguish missing from explicit false, so we probe the
    // raw string and treat "false" as the only off signal.
    const rawHaptics = getString(STORAGE_KEYS.hapticsEnabled);
    const hapticsEnabled = rawHaptics === undefined ? true : rawHaptics !== "false";

    const storedUiScale = getJSON<number>(STORAGE_KEYS.uiScale);
    const uiScale: UiScale =
      typeof storedUiScale === "number" &&
      (UI_SCALES as readonly number[]).includes(storedUiScale)
        ? (storedUiScale as UiScale)
        : DEFAULT_UI_SCALE;

    // Notification settings persisted under their own AsyncStorage key since
    // v2 (originally owned by a standalone notifications-store). Merge over
    // defaults so a partially-stored payload (older app picking up newer
    // schema) still resolves to a complete record.
    const storedNotificationSettings = getJSON<Partial<NotificationSettings>>(
      STORAGE_KEYS.notificationSettings,
    );
    const notificationSettings: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(storedNotificationSettings ?? {}),
    };

    const demoMode = getBoolean(STORAGE_KEYS.demoMode) ?? false;
    if (demoMode) {
      // Replace each kind's instances with a single demo instance so the
      // dashboard has data without touching real configs.
      for (const id of SERVICE_IDS) {
        const demoInst: ServiceInstance = {
          id: generateInstanceId(),
          ...defaultServiceConfig(id),
          enabled: true,
          localUrl: "http://demo.local",
          remoteUrl: "",
        };
        instances[id] = [demoInst];
      }
      // v22: drop curated attachments in memory so demo UUIDs resolve. Mirrors
      // the enableDemoMode action; not persisted (real attachments come back
      // on disableDemoMode → hydrate).
      for (let i = 0; i < dashboards.length; i++) {
        if (dashboards[i].attachedInstances === undefined) continue;
        const next = { ...dashboards[i] };
        delete (next as { attachedInstances?: unknown }).attachedInstances;
        dashboards[i] = next;
      }
    }

    // v22: one-shot upgrade — fold the legacy `ACTIVE_INSTANCE_KEY` payload
    // onto dashboards that don't already carry an activeInstance map. Mirrors
    // the v21→v22 export migration for local installs that never re-imported.
    if (legacyActive && typeof legacyActive === "object" && dashboards.length > 0) {
      let touched = false;
      for (let i = 0; i < dashboards.length; i++) {
        const d = dashboards[i];
        if (d.activeInstance) continue;
        const attached = Array.isArray(d.attachedInstances)
          ? new Set(d.attachedInstances)
          : null;
        const out: Partial<Record<ServiceId, string>> = {};
        for (const [kind, raw] of Object.entries(legacyActive)) {
          if (typeof raw !== "string" || raw.length === 0) continue;
          if (!(SERVICE_IDS as readonly string[]).includes(kind)) continue;
          if (attached === null || attached.has(raw)) {
            out[kind as ServiceId] = raw;
          }
        }
        if (Object.keys(out).length > 0) {
          dashboards[i] = { ...d, activeInstance: out };
          touched = true;
        }
      }
      if (touched) {
        setJSON(STORAGE_KEYS.dashboards, dashboards);
      }
    }
    // Always drop the legacy key — dashboards are the source of truth now.
    if (legacyActive !== undefined) {
      deleteKey(ACTIVE_INSTANCE_KEY);
    }

    const { activeInstance, services, secrets } = recomputeDerivedFromActive(
      dashboards,
      activeDashboardId,
      instances,
      instanceSecrets,
    );

    set({
      serviceInstances: instances,
      instanceSecrets,
      activeInstance,
      services,
      secrets,
      autoSwitchNetwork,
      homeNetworks,
      servicesOrder,
      dashboards,
      activeDashboardId,
      wolDevices,
      demoMode,
      hapticsEnabled,
      globalCustomHeaders,
      uiScale,
      notificationSettings,
      hydrated: true,
    });
  },

  // --- Multi-instance actions ---

  addInstance: (id, init) => {
    const inst = makeInstance(id, init);
    set((state) => {
      const list = [...(state.serviceInstances[id] ?? []), inst];
      const serviceInstances = { ...state.serviceInstances, [id]: list };
      setJSON(`${STORAGE_KEYS.services}.${id}`, list);
      // v22: no explicit "make this the active instance" write — the resolver
      // picks the new instance up automatically if the active workspace had
      // no pin for this kind (or its pin became invalid). When the kind has
      // an existing pin, that pin is preserved.
      const derived = recomputeDerivedFromActive(
        state.dashboards,
        state.activeDashboardId,
        serviceInstances,
        state.instanceSecrets,
      );
      return { serviceInstances, ...derived };
    });
    return inst;
  },

  removeInstance: async (id, instanceId) => {
    // Clear SecureStore entries for this instance before mutating state so a
    // crash mid-delete doesn't leave orphaned secrets behind.
    await deleteSecret(`${SECRET_PREFIX}.${instanceId}.apiKey`);
    await deleteSecret(`${SECRET_PREFIX}.${instanceId}.username`);
    await deleteSecret(`${SECRET_PREFIX}.${instanceId}.password`);
    await deleteSecret(`${SECRET_PREFIX}.${instanceId}.customHeaders`);

    set((state) => {
      const list = (state.serviceInstances[id] ?? []).filter((i) => i.id !== instanceId);
      const serviceInstances = { ...state.serviceInstances, [id]: list };
      const { [instanceId]: _removed, ...instanceSecrets } = state.instanceSecrets;
      setJSON(`${STORAGE_KEYS.services}.${id}`, list);

      // v22: prune the deleted UUID from every dashboard's `attachedInstances`
      // and `activeInstance[kind]` so storage doesn't accumulate orphans.
      // Auto-attach dashboards (attachedInstances === undefined) need no
      // change — they implicitly drop the deleted UUID. The runtime resolver
      // would tolerate stale pins, but pruning here keeps an exported config
      // tidy and survives downgrade-then-upgrade cycles.
      let dashboardsChanged = false;
      const dashboards = state.dashboards.map((d) => {
        let nextAttached = d.attachedInstances;
        let nextActiveMap = d.activeInstance;
        let localChanged = false;
        if (Array.isArray(nextAttached) && nextAttached.includes(instanceId)) {
          nextAttached = nextAttached.filter((x) => x !== instanceId);
          localChanged = true;
        }
        if (nextActiveMap && nextActiveMap[id] === instanceId) {
          const { [id]: _drop, ...rest } = nextActiveMap;
          nextActiveMap = Object.keys(rest).length === 0
            ? undefined
            : (rest as Partial<Record<ServiceId, string>>);
          localChanged = true;
        }
        if (!localChanged) return d;
        dashboardsChanged = true;
        const out: Dashboard = { ...d, attachedInstances: nextAttached };
        if (nextActiveMap === undefined) {
          delete (out as { activeInstance?: unknown }).activeInstance;
        } else {
          out.activeInstance = nextActiveMap;
        }
        return out;
      });
      if (dashboardsChanged) {
        setJSON(STORAGE_KEYS.dashboards, dashboards);
      }

      // v21: drop any per-instance notification overrides keyed to the
      // deleted instance so orphan keys don't accumulate in storage.
      let notificationSettings = state.notificationSettings;
      if (notificationSettings.perInstance?.[instanceId] !== undefined) {
        const { [instanceId]: _drop, ...rest } = notificationSettings.perInstance;
        notificationSettings = {
          ...notificationSettings,
          perInstance: Object.keys(rest).length === 0 ? undefined : rest,
        };
        setJSON(STORAGE_KEYS.notificationSettings, notificationSettings);
      }

      const derived = recomputeDerivedFromActive(
        dashboards,
        state.activeDashboardId,
        serviceInstances,
        instanceSecrets,
      );
      return {
        serviceInstances,
        instanceSecrets,
        dashboards,
        notificationSettings,
        ...derived,
      };
    });
  },

  updateInstance: (id, instanceId, patch) => {
    // Captured before the commit so the invalidate below can tell whether a
    // URL-affecting field actually changed.
    const prevInst = get().serviceInstances[id]?.find((i) => i.id === instanceId);
    set((state) => {
      const list = state.serviceInstances[id] ?? [];
      const idx = list.findIndex((i) => i.id === instanceId);
      if (idx === -1) return state;
      const prev = list[idx];
      const next = [...list];
      next[idx] = { ...prev, ...patch, id: prev.id };
      const serviceInstances = { ...state.serviceInstances, [id]: next };
      setJSON(`${STORAGE_KEYS.services}.${id}`, next);
      // v22: toggling `enabled` can flip the resolver's fallback (a freshly
      // disabled active pin needs to give way to the next attached+enabled
      // sibling). Other field edits don't affect resolution, but the
      // recompute is cheap.
      const enabledFlipped = "enabled" in patch && prev.enabled !== next[idx].enabled;
      if (enabledFlipped) {
        const derived = recomputeDerivedFromActive(
          state.dashboards,
          state.activeDashboardId,
          serviceInstances,
          state.instanceSecrets,
        );
        return { serviceInstances, ...derived };
      }
      // Field edit that doesn't affect resolution — re-derive `services`/
      // `secrets` against the unchanged `state.activeInstance` so legacy
      // readers reflect the patch (e.g. URL/name).
      const services = deriveLegacyServices(serviceInstances, state.activeInstance);
      const secrets = deriveLegacySecrets(
        serviceInstances,
        state.instanceSecrets,
        state.activeInstance,
      );
      return { serviceInstances, services, secrets };
    });
    // A URL edit changes the resolved base URL without changing the instance id
    // (the query key), so staleTime:Infinity reads wouldn't refetch (#4).
    // Invalidate this instance's cached queries when a URL field actually
    // changed — scoped so an unrelated save (e.g. rename) doesn't refetch.
    // TanStack v5 prefix-matches [id, instanceId] against [id, instanceId, …].
    if (prevInst) {
      const urlChanged =
        ("localUrl" in patch && patch.localUrl !== prevInst.localUrl) ||
        ("remoteUrl" in patch && patch.remoteUrl !== prevInst.remoteUrl) ||
        ("useRemote" in patch && patch.useRemote !== prevInst.useRemote);
      if (urlChanged) {
        void queryClient.invalidateQueries({ queryKey: [id, instanceId] });
      }
    }
  },

  toggleInstance: (id, instanceId) => {
    const list = get().serviceInstances[id] ?? [];
    const inst = list.find((i) => i.id === instanceId);
    if (!inst) return;
    get().updateInstance(id, instanceId, { enabled: !inst.enabled });
  },

  moveInstance: (id, instanceId, direction) => {
    set((state) => {
      const list = state.serviceInstances[id] ?? [];
      const idx = list.findIndex((i) => i.id === instanceId);
      if (idx === -1) return state;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= list.length) return state;
      const next = [...list];
      [next[idx], next[target]] = [next[target], next[idx]];
      const serviceInstances = { ...state.serviceInstances, [id]: next };
      setJSON(`${STORAGE_KEYS.services}.${id}`, next);
      const services = deriveLegacyServices(serviceInstances, state.activeInstance);
      return { serviceInstances, services };
    });
  },

  setActiveInstance: (id, instanceId) => {
    // v22: writes the kind pin onto the active dashboard's `activeInstance`
    // map. Workspaces other than the active one are untouched.
    get().setDashboardActiveInstance(get().activeDashboardId, id, instanceId);
  },

  setDashboardActiveInstance: (dashboardId, id, instanceId) => {
    set((state) => {
      const list = state.serviceInstances[id] ?? [];
      // Reject ids that don't refer to an existing instance — keeps state
      // consistent if a stale UUID slips through (e.g. from a prop).
      if (instanceId !== null && !list.some((i) => i.id === instanceId)) {
        return state;
      }
      const dashboard = state.dashboards.find((d) => d.id === dashboardId);
      if (!dashboard) return state;

      const prevMap = dashboard.activeInstance ?? {};
      const nextMap: Partial<Record<ServiceId, string>> = { ...prevMap };
      if (instanceId === null) {
        delete nextMap[id];
      } else {
        nextMap[id] = instanceId;
      }
      const finalMap: Partial<Record<ServiceId, string>> | undefined =
        Object.keys(nextMap).length === 0 ? undefined : nextMap;

      // No-op early-out: same kind pin already set; avoids needless storage
      // writes and re-renders for the common tap-the-already-active case.
      if ((prevMap[id] ?? null) === (instanceId ?? null)) {
        return state;
      }

      const dashboards = state.dashboards.map((d) => {
        if (d.id !== dashboardId) return d;
        const next: Dashboard = { ...d };
        if (finalMap === undefined) {
          delete (next as { activeInstance?: unknown }).activeInstance;
        } else {
          next.activeInstance = finalMap;
        }
        return next;
      });
      setJSON(STORAGE_KEYS.dashboards, dashboards);

      // Re-derive only when we just touched the active workspace; pinning a
      // kind on a non-active workspace doesn't affect the rendered tabs.
      if (dashboardId === state.activeDashboardId) {
        const derived = recomputeDerivedFromActive(
          dashboards,
          state.activeDashboardId,
          state.serviceInstances,
          state.instanceSecrets,
        );
        return { dashboards, ...derived };
      }
      return { dashboards };
    });
  },

  updateInstanceSecrets: async (instanceId, newSecrets) => {
    for (const [key, value] of Object.entries(newSecrets)) {
      const storageKey = `${SECRET_PREFIX}.${instanceId}.${key}`;
      if (key === "customHeaders") {
        // Stored as a JSON string so SecureStore (string-only) can hold it.
        const map = value as Record<string, string> | undefined;
        if (map && Object.keys(map).length > 0) {
          await setSecret(storageKey, JSON.stringify(map));
        } else {
          await deleteSecret(storageKey);
        }
      } else if (typeof value === "string" && value.length > 0) {
        await setSecret(storageKey, value);
      } else {
        await deleteSecret(storageKey);
      }
    }
    set((state) => {
      const merged: ServiceSecrets = {
        ...(state.instanceSecrets[instanceId] ?? {}),
        ...newSecrets,
      };
      // Drop empty customHeaders so consumers don't have to dance around {}.
      if (merged.customHeaders && Object.keys(merged.customHeaders).length === 0) {
        delete merged.customHeaders;
      }
      const instanceSecrets = { ...state.instanceSecrets, [instanceId]: merged };
      const secrets = deriveLegacySecrets(
        state.serviceInstances,
        instanceSecrets,
        state.activeInstance,
      );
      return { instanceSecrets, secrets };
    });
    // Credentials (API key / custom headers) feed request auth but aren't part
    // of the query key, so staleTime:Infinity reads would keep results fetched
    // with the OLD credentials (#4). A secrets save is inherently a credential
    // change, so no field-level guard — invalidate this instance's queries by
    // matching the instanceId slot of the key ([serviceId, instanceId, …]).
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[1] === instanceId,
    });
  },

  // --- Legacy single-instance shims ---

  updateService: (id, config) => {
    const activeId =
      get().activeInstance[id] ?? get().serviceInstances[id]?.[0]?.id ?? null;
    if (!activeId) return;
    get().updateInstance(id, activeId, config);
  },

  toggleService: (id) => {
    const activeId =
      get().activeInstance[id] ?? get().serviceInstances[id]?.[0]?.id ?? null;
    if (!activeId) return;
    get().toggleInstance(id, activeId);
  },

  updateSecrets: async (id, newSecrets) => {
    const activeId =
      get().activeInstance[id] ?? get().serviceInstances[id]?.[0]?.id ?? null;
    if (!activeId) return;
    await get().updateInstanceSecrets(activeId, newSecrets);
  },

  setAutoSwitch: (enabled) => {
    setBoolean(STORAGE_KEYS.autoSwitchNetwork, enabled);
    set({ autoSwitchNetwork: enabled });
  },

  setNetworkAwayFromHome: (away) => {
    // No-op when unchanged so NetInfo's chatty event stream doesn't re-key the
    // health query for an identical value. EPHEMERAL — never persisted.
    if (get().networkAwayFromHome === away) return;
    set({ networkAwayFromHome: away });
    // The resolved base URL flips local↔remote with this flag (getActiveUrl),
    // but query keys don't encode the URL — so staleTime:Infinity reads
    // (profiles, root folders, tags) would keep serving data fetched against
    // the OLD url after a home/away switch (#4). Invalidate so active queries
    // refetch against the new URL; previous data stays visible during the
    // refetch (invalidate, not reset → no skeleton flash).
    void queryClient.invalidateQueries();
  },

  addHomeNetwork: (network) => {
    const created: HomeNetwork = {
      id: generateHomeNetworkId(),
      ssid: network.ssid.trim(),
      bssid: normalizeBssid(network.bssid),
    };
    set((state) => {
      const next = [...state.homeNetworks, created];
      setJSON(STORAGE_KEYS.homeNetworks, next);
      return { homeNetworks: next };
    });
    return created;
  },

  updateHomeNetwork: (id, patch) => {
    set((state) => {
      const next = state.homeNetworks.map((n) =>
        n.id === id
          ? {
              ...n,
              ...(patch.ssid !== undefined ? { ssid: patch.ssid.trim() } : {}),
              ...(patch.bssid !== undefined ? { bssid: normalizeBssid(patch.bssid) } : {}),
            }
          : n,
      );
      setJSON(STORAGE_KEYS.homeNetworks, next);
      return { homeNetworks: next };
    });
  },

  removeHomeNetwork: (id) => {
    set((state) => {
      const next = state.homeNetworks.filter((n) => n.id !== id);
      setJSON(STORAGE_KEYS.homeNetworks, next);
      return { homeNetworks: next };
    });
  },

  setHomeNetworks: (networks) => {
    setJSON(STORAGE_KEYS.homeNetworks, networks);
    set({ homeNetworks: networks });
  },

  setServicesOrder: (order) => {
    const sanitized = sanitizeServicesOrder(order);
    setJSON(STORAGE_KEYS.servicesOrder, sanitized);
    set({ servicesOrder: sanitized });
  },

  // --- Dashboards (v14+) ---

  addDashboard: (name) => {
    // New dashboards default to "no instances attached" so the user can opt
    // in to exactly the workspace they want without first having to
    // deselect every unrelated instance. The empty list also makes the
    // bottom bar fall back to its pinnedTabs-only behavior cleanly. Pre-
    // existing dashboards (created before v20) carry full attachment via
    // the migration default.
    const dashboard: Dashboard = {
      id: generateInstanceId(),
      name: name.trim() || DEFAULT_DASHBOARD_NAME,
      widgets: [],
      icon: DEFAULT_DASHBOARD_ICON,
      color: DEFAULT_DASHBOARD_COLOR,
      attachedInstances: [],
      pinnedTabs: ["services"],
    };
    set((state) => {
      const dashboards = [...state.dashboards, dashboard];
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
    return dashboard;
  },

  removeDashboard: (dashboardId) => {
    let forcedAway = false;
    set((state) => {
      // Refuse to delete the last dashboard — the screen always needs one.
      if (state.dashboards.length <= 1) return state;
      const dashboards = state.dashboards.filter((d) => d.id !== dashboardId);
      if (dashboards.length === state.dashboards.length) return state;
      let activeDashboardId = state.activeDashboardId;
      const activeChanged = activeDashboardId === dashboardId;
      if (activeChanged) {
        activeDashboardId = dashboards[0].id;
        setString(STORAGE_KEYS.activeDashboardId, activeDashboardId);
      }
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      // v22: deleting the active workspace re-resolves the active instance
      // per kind against the new active workspace.
      if (activeChanged) {
        const derived = recomputeDerivedFromActive(
          dashboards,
          activeDashboardId,
          state.serviceInstances,
          state.instanceSecrets,
        );
        // Same safe-default reset as setActiveDashboard: the auto-selected
        // replacement workspace may govern a different home-network set (#148).
        const forceAway = switchInvalidatesAwayFlag(
          state,
          state.dashboards.find((d) => d.id === dashboardId),
          dashboards.find((d) => d.id === activeDashboardId),
        );
        forcedAway = forceAway;
        return {
          dashboards,
          activeDashboardId,
          ...derived,
          ...(forceAway ? { networkAwayFromHome: true } : {}),
        };
      }
      return { dashboards, activeDashboardId };
    });
    // Same as setActiveDashboard: the inline away reset bypasses
    // setNetworkAwayFromHome's invalidate, so refetch shared-instance queries
    // against the new (remote) URL (#4).
    if (forcedAway) void queryClient.invalidateQueries();
  },

  renameDashboard: (dashboardId, name) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, name: name.trim() || d.name } : d,
      );
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setActiveDashboard: (dashboardId) => {
    let forcedAway = false;
    set((state) => {
      if (!state.dashboards.some((d) => d.id === dashboardId)) return state;
      if (state.activeDashboardId === dashboardId) return state;
      setString(STORAGE_KEYS.activeDashboardId, dashboardId);
      // v22: a workspace switch re-resolves the active instance per kind
      // (different `activeInstance` map + different `attachedInstances` set).
      const derived = recomputeDerivedFromActive(
        state.dashboards,
        dashboardId,
        state.serviceInstances,
        state.instanceSecrets,
      );
      // v29: if the incoming workspace governs a different home-network set,
      // reset to the safe away default so the old dashboard's "home" flag can't
      // briefly expose the local URL on a network the new one doesn't trust
      // (#148 review Rec #8). useNetworkAutoSwitch re-evaluates a tick later.
      const forceAway = switchInvalidatesAwayFlag(
        state,
        state.dashboards.find((d) => d.id === state.activeDashboardId),
        state.dashboards.find((d) => d.id === dashboardId),
      );
      forcedAway = forceAway;
      return {
        activeDashboardId: dashboardId,
        ...derived,
        ...(forceAway ? { networkAwayFromHome: true } : {}),
      };
    });
    // The forced away→remote reset flips the resolved URL for any instance
    // shared with the previous workspace (same query key); the flag is set
    // inline above (not via setNetworkAwayFromHome) so it bypasses that
    // invalidate (#4). Refetch so shared-instance Infinity reads don't keep the
    // old workspace's URL data.
    if (forcedAway) void queryClient.invalidateQueries();
  },

  moveDashboard: (dashboardId, direction) => {
    set((state) => {
      const idx = state.dashboards.findIndex((d) => d.id === dashboardId);
      if (idx === -1) return state;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= state.dashboards.length) return state;
      const dashboards = [...state.dashboards];
      [dashboards[idx], dashboards[target]] = [dashboards[target], dashboards[idx]];
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setDashboardIcon: (dashboardId, icon) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, icon } : d,
      );
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setDashboardColor: (dashboardId, color) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, color } : d,
      );
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setDashboardAttachedInstances: (dashboardId, instanceIds) => {
    set((state) => {
      // Dedupe + drop empties. Order comes from the caller; we don't
      // validate UUIDs against live instances here so dashboards survive
      // an instance being temporarily removed and re-added with the same
      // id (e.g. via export/import). Render-side intersects with live
      // instances anyway.
      const seen = new Set<string>();
      const sanitized: string[] = [];
      for (const id of instanceIds) {
        if (typeof id !== "string" || id.length === 0) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        sanitized.push(id);
      }
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, attachedInstances: sanitized } : d,
      );
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      // v22: attachment changes on the active workspace can re-resolve the
      // active instance per kind (a previously-pinned UUID may no longer be
      // attached; the fallback set changes).
      if (dashboardId === state.activeDashboardId) {
        const derived = recomputeDerivedFromActive(
          dashboards,
          state.activeDashboardId,
          state.serviceInstances,
          state.instanceSecrets,
        );
        return { dashboards, ...derived };
      }
      return { dashboards };
    });
  },

  setDashboardPinnedTabs: (dashboardId, tabIds) => {
    set((state) => {
      // Cap at MAX_PINNED_TABS, dedupe, drop empty entries. The full set of
      // valid tab names isn't enforced here because the layout component
      // ignores entries it doesn't render — keeping validation loose lets
      // pinned items survive across app upgrades that add new tabs.
      const seen = new Set<string>();
      const sanitized: string[] = [];
      for (const tab of tabIds) {
        if (typeof tab !== "string" || tab.length === 0) continue;
        if (seen.has(tab)) continue;
        seen.add(tab);
        sanitized.push(tab);
        if (sanitized.length >= MAX_PINNED_TABS) break;
      }
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, pinnedTabs: sanitized } : d,
      );
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setDashboardHomeNetworkIds: (dashboardId, ids) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) => {
        if (d.id !== dashboardId) return d;
        // `undefined` → drop the key so the workspace uses ALL home networks
        // again (and picks up future ones), exactly like attachedInstances.
        if (ids === undefined) {
          const { homeNetworkIds: _omit, ...rest } = d;
          return rest;
        }
        // Dedupe + drop empties. We don't validate ids against the live
        // network list — cross-device imports may reference ids not present
        // yet; the resolver ignores stale ids at read time. An empty result is
        // a valid selection ("no home network here → always remote").
        const seen = new Set<string>();
        const sanitized: string[] = [];
        for (const id of ids) {
          if (typeof id !== "string" || id.length === 0) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          sanitized.push(id);
        }
        return { ...d, homeNetworkIds: sanitized };
      });
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  // --- Slots (v14+) ---

  addWidget: (widgetId) => {
    const slot: WidgetSlot = { id: generateInstanceId(), widgetId };
    let added = false;
    set((state) => {
      const dashboards = state.dashboards.map((d) => {
        if (d.id !== state.activeDashboardId) return d;
        added = true;
        return { ...d, widgets: [...d.widgets, slot] };
      });
      if (!added) return state;
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
    return added ? slot : null;
  },

  removeSlot: (slotId) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) => {
        if (d.id !== state.activeDashboardId) return d;
        return { ...d, widgets: d.widgets.filter((w) => w.id !== slotId) };
      });
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  moveSlot: (slotId, direction) => {
    set((state) => {
      let mutated = false;
      const dashboards = state.dashboards.map((d) => {
        if (d.id !== state.activeDashboardId) return d;
        const idx = d.widgets.findIndex((w) => w.id === slotId);
        if (idx === -1) return d;
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= d.widgets.length) return d;
        const widgets = [...d.widgets];
        [widgets[idx], widgets[target]] = [widgets[target], widgets[idx]];
        mutated = true;
        return { ...d, widgets };
      });
      if (!mutated) return state;
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setSlotSettings: (slotId, settings) => {
    set((state) => {
      let mutated = false;
      const dashboards = state.dashboards.map((d) => {
        const idx = d.widgets.findIndex((w) => w.id === slotId);
        if (idx === -1) return d;
        const widgets = [...d.widgets];
        widgets[idx] = { ...widgets[idx], settings: { ...settings } };
        mutated = true;
        return { ...d, widgets };
      });
      if (!mutated) return state;
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  resetSlotSettings: (slotId) => {
    set((state) => {
      let mutated = false;
      const dashboards = state.dashboards.map((d) => {
        const idx = d.widgets.findIndex((w) => w.id === slotId);
        if (idx === -1) return d;
        if (!d.widgets[idx].settings) return d;
        const widgets = [...d.widgets];
        const { settings: _drop, ...rest } = widgets[idx];
        widgets[idx] = rest;
        mutated = true;
        return { ...d, widgets };
      });
      if (!mutated) return state;
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
  },

  setWolDevices: (devices) => {
    setJSON(STORAGE_KEYS.wolDevices, devices);
    set({ wolDevices: devices });
  },

  setHapticsEnabled: (enabled) => {
    setBoolean(STORAGE_KEYS.hapticsEnabled, enabled);
    set({ hapticsEnabled: enabled });
  },

  setGlobalCustomHeaders: (headers) => {
    setJSON(STORAGE_KEYS.globalCustomHeaders, headers);
    set({ globalCustomHeaders: headers });
  },

  setUiScale: (scale) => {
    if (!(UI_SCALES as readonly number[]).includes(scale)) return;
    setJSON(STORAGE_KEYS.uiScale, scale);
    set({ uiScale: scale });
  },

  setNotificationSetting: (key, value) => {
    const next = { ...get().notificationSettings, [key]: value };
    setJSON(STORAGE_KEYS.notificationSettings, next);
    set({ notificationSettings: next });
  },

  setInstanceNotificationOverride: (instanceId, category, value) => {
    const current = get().notificationSettings;
    const map = { ...(current.perInstance ?? {}) };
    const entry = { ...(map[instanceId] ?? {}) };
    if (value === "inherit") {
      delete entry[category];
    } else {
      entry[category] = value;
    }
    if (Object.keys(entry).length === 0) {
      delete map[instanceId];
    } else {
      map[instanceId] = entry;
    }
    const next: NotificationSettings = {
      ...current,
      perInstance: Object.keys(map).length === 0 ? undefined : map,
    };
    setJSON(STORAGE_KEYS.notificationSettings, next);
    set({ notificationSettings: next });
  },

  // --- Lookup helpers ---

  getInstance: (id, instanceId) => {
    return get().serviceInstances[id]?.find((i) => i.id === instanceId);
  },

  getActiveInstanceId: (id) => {
    const state = get();
    // Only the workspace-resolved instance (attachment + enabled aware, kept in
    // sync by recomputeDerivedFromActive). NO raw serviceInstances[id][0] tail:
    // activeInstance[id] is null exactly when nothing is enabled+attached, so a
    // first-instance fallback could only resolve a disabled or other-workspace
    // instance — leaking its URL + API key on the next request (#3).
    return state.activeInstance[id] ?? null;
  },

  getEnabledInstances: (id) => {
    return (get().serviceInstances[id] ?? []).filter((i) => i.enabled);
  },

  getMergedHeaders: (id, instanceId) => {
    const state = get();
    // Explicit instanceId wins; otherwise the workspace-resolved active
    // instance. No raw first-instance tail — see getActiveInstanceId (#3).
    const targetId = instanceId ?? state.activeInstance[id];
    const perInstance = targetId
      ? state.instanceSecrets[targetId]?.customHeaders
      : undefined;
    return { ...state.globalCustomHeaders, ...(perInstance ?? {}) };
  },

  getActiveUrl: (id, instanceId) => {
    const state = get();
    const list = state.serviceInstances[id] ?? [];
    // Explicit instanceId wins; otherwise the workspace-resolved active
    // instance. No raw first-instance tail (#3) — when neither resolves,
    // targetId is undefined, list.find misses, and we return "" below, which is
    // the same "service offline in this workspace" result the away path gives.
    const targetId = instanceId ?? state.activeInstance[id];
    const inst = list.find((i) => i.id === targetId);
    if (!inst) return "";
    // Normalize on read so every consumer (serviceRequest, pingService, health
    // probes, widgets) sees a scheme-prefixed URL even when the stored value
    // was saved without one. Historical/migrated values can lack http://, which
    // causes fetch to throw "Invalid URL" — see #106.
    // NOTE: resolveActiveUrlKind (lib/url-validation.ts) mirrors this exact
    // decision tree to report local-vs-remote for the L/R health-grid badge —
    // keep the two in sync.
    const local = normalizeServiceUrl(inst.localUrl);
    const remote = normalizeServiceUrl(inst.remoteUrl);

    // 1. The per-instance "always use remote" user override always wins.
    if (inst.useRemote) return remote || local;
    // 2. Auto-switch off → user opted out of switching; use local (or remote if
    //    no local is configured).
    if (!state.autoSwitchNetwork) return local || remote;
    // 3. AWAY from a confirmed home network → REMOTE ONLY. We deliberately do
    //    NOT fall back to the private local URL on an untrusted network: a
    //    stranger's device at the same private address (e.g. 192.168.1.x on
    //    airport WiFi) would receive our API key. No remote configured → "" → the
    //    service is simply offline while away, which is the honest, safe result.
    //    `networkAwayFromHome` defaults to true, so this also holds during the
    //    brief cold-start window before evaluateHomeNetwork() confirms we're home.
    if (state.networkAwayFromHome) return remote;
    // 4. On a confirmed home network → local (or remote if no local configured).
    return local || remote;
  },

  getActiveDashboard: () => {
    const state = get();
    return (
      state.dashboards.find((d) => d.id === state.activeDashboardId) ??
      state.dashboards[0]
    );
  },

  getSlot: (slotId) => {
    for (const d of get().dashboards) {
      const slot = d.widgets.find((w) => w.id === slotId);
      if (slot) return slot;
    }
    return undefined;
  },

  enableDemoMode: () => {
    setBoolean(STORAGE_KEYS.demoMode, true);
    const demoInstances = {} as Record<ServiceId, ServiceInstance[]>;
    for (const id of SERVICE_IDS) {
      const inst: ServiceInstance = {
        id: generateInstanceId(),
        ...defaultServiceConfig(id),
        enabled: true,
        localUrl: "http://demo.local",
        remoteUrl: "",
      };
      demoInstances[id] = [inst];
    }
    set((state) => {
      // v22: force every dashboard into auto-attach mode in memory (not
      // persisted) so the resolver picks up the freshly-generated demo UUIDs.
      // The user's stored attachments come back on disableDemoMode → hydrate.
      const demoDashboards = state.dashboards.map((d) => {
        if (d.attachedInstances === undefined) return d;
        const next: Dashboard = { ...d };
        delete (next as { attachedInstances?: unknown }).attachedInstances;
        return next;
      });
      const derived = recomputeDerivedFromActive(
        demoDashboards,
        state.activeDashboardId,
        demoInstances,
        {},
      );
      return {
        demoMode: true,
        serviceInstances: demoInstances,
        instanceSecrets: {},
        dashboards: demoDashboards,
        ...derived,
      };
    });
    queryClient.clear();
  },

  disableDemoMode: async () => {
    deleteKey(STORAGE_KEYS.demoMode);
    queryClient.clear();
    await get().hydrate();
  },

  exportConfig: async (passphrase: string, onStage) => {
    onStage?.("preparing");
    await yieldToPaint();
    // Require device auth so a bystander with a momentarily-unlocked phone
    // can't dump secrets by exporting with a passphrase they chose. Skip
    // only if the device has no lock at all — no security boundary to enforce.
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level !== LocalAuthentication.SecurityLevel.NONE) {
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to export configuration",
        fallbackLabel: "Use passcode",
      });
      if (!auth.success) {
        if ("error" in auth && (auth.error === "user_cancel" || auth.error === "app_cancel" || auth.error === "system_cancel")) {
          return;
        }
        const reason = "error" in auth ? auth.error : "failed";
        throw new Error(`Device authentication ${reason}`);
      }
    }

    const {
      serviceInstances,
      instanceSecrets,
      autoSwitchNetwork,
      homeNetworks,
      servicesOrder,
      dashboards,
      activeDashboardId,
      wolDevices,
      hapticsEnabled,
      globalCustomHeaders,
      uiScale,
      notificationSettings: notifSettings,
    } = get();
    const { url, sharedSecret, deviceId } = useBackendStore.getState();

    const payload: ExportPayload = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      services: serviceInstances,
      secrets: instanceSecrets,
      // v22: activeInstance is now per-dashboard, serialized inside the
      // `dashboards` array — no top-level field.
      autoSwitchNetwork,
      homeNetworks,
      servicesOrder,
      dashboards,
      activeDashboardId,
      backend: { url, sharedSecret, deviceId },
      notificationSettings: notifSettings,
      wolDevices,
      hapticsEnabled,
      globalCustomHeaders,
      uiScale,
    };

    onStage?.("encrypting");
    await yieldToPaint();
    const envelope = await encryptJsonString(JSON.stringify(payload), passphrase);

    onStage?.("finalizing");
    await yieldToPaint();
    const file = new File(Paths.cache, "dashboarr-config.json");
    file.create({ overwrite: true });
    file.write(JSON.stringify(envelope, null, 2));

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device");
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Export Dashboarr Config",
      UTI: "public.json",
    });
  },

  importConfig: async (requestPassphrase, onStage) => {
    // On iOS, expo-document-picker maps the `type` filter via
    // `UTType(mimeType:)`. For some MIME types (including "application/json")
    // that initializer returns nil in release builds, leaving the picker with
    // zero content types and `getDocumentAsync` throws. Use the wildcard
    // ("*/*") which the library hardcodes to UTType.item, then rely on the
    // JSON.parse below to reject non-JSON files.
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return false;

    const pickedFile = new File(result.assets[0].uri);
    const content = await pickedFile.text();

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error("File is not valid JSON");
    }

    // Encrypted (current) format: unwrap it first, then proceed as normal.
    // Unencrypted format is still accepted so existing backups can be imported.
    if (isEncryptedEnvelope(raw)) {
      const passphrase = await requestPassphrase();
      if (!passphrase) return false;
      onStage?.("decrypting");
      await yieldToPaint();
      const decrypted = await decryptEnvelope(raw, passphrase);
      try {
        raw = JSON.parse(decrypted);
      } catch {
        throw new Error("Decrypted content is not valid JSON");
      }
    }

    onStage?.("restoring");
    await yieldToPaint();
    const migrated = migrateConfig(raw);
    const payload = validateExportPayload(migrated);

    // Wipe any existing per-instance SecureStore entries before restoring so
    // we never leak secrets from a previous configuration that the imported
    // backup didn't replace.
    const currentInstanceIds = new Set<string>();
    for (const id of SERVICE_IDS) {
      for (const inst of get().serviceInstances[id] ?? []) {
        currentInstanceIds.add(inst.id);
      }
    }
    for (const oldId of currentInstanceIds) {
      await deleteSecret(`${SECRET_PREFIX}.${oldId}.apiKey`);
      await deleteSecret(`${SECRET_PREFIX}.${oldId}.username`);
      await deleteSecret(`${SECRET_PREFIX}.${oldId}.password`);
      await deleteSecret(`${SECRET_PREFIX}.${oldId}.customHeaders`);
    }

    // Merge imported services over fresh defaults so every kind keeps a slot
    // in settings even if the backup omits one.
    const mergedInstances = defaultInstances();
    for (const id of SERVICE_IDS) {
      const list = payload.services[id];
      if (Array.isArray(list) && list.length > 0) {
        mergedInstances[id] = list;
      }
      setJSON(`${STORAGE_KEYS.services}.${id}`, mergedInstances[id]);
    }

    // Restore secrets keyed by instance UUID.
    const mergedSecrets: Record<string, ServiceSecrets> = {};
    for (const [uuid, s] of Object.entries(payload.secrets ?? {})) {
      if (!s) continue;
      mergedSecrets[uuid] = s;
      if (s.apiKey) await setSecret(`${SECRET_PREFIX}.${uuid}.apiKey`, s.apiKey);
      if (s.username) await setSecret(`${SECRET_PREFIX}.${uuid}.username`, s.username);
      if (s.password) await setSecret(`${SECRET_PREFIX}.${uuid}.password`, s.password);
      if (s.customHeaders && Object.keys(s.customHeaders).length > 0) {
        await setSecret(
          `${SECRET_PREFIX}.${uuid}.customHeaders`,
          JSON.stringify(s.customHeaders),
        );
      }
    }

    // v22: active instance per kind is carried inside each dashboard's
    // `activeInstance` map (the v21→v22 migration already folded any
    // pre-v22 top-level `activeInstance` onto dashboards). No separate
    // storage key — `STORAGE_KEYS.dashboards` is the source of truth.
    // Clean the legacy key from any prior install so a downgrade can't
    // resurrect a stale global pointer.
    deleteKey(ACTIVE_INSTANCE_KEY);

    // Restore app settings
    setBoolean(STORAGE_KEYS.autoSwitchNetwork, payload.autoSwitchNetwork ?? false);
    const importedHomeNetworks = payload.homeNetworks ?? [];
    setJSON(STORAGE_KEYS.homeNetworks, importedHomeNetworks);

    // Dashboards (v14): trust the migrated payload — the migration chain has
    // already folded any legacy widgetSettings/dashboardWidgets into a single
    // Default dashboard. If the post-migration payload is somehow empty we
    // seed a fresh Default so the dashboard screen always has something.
    const importedDashboards: Dashboard[] =
      Array.isArray(payload.dashboards) && payload.dashboards.length > 0
        ? payload.dashboards
        : defaultDashboards();
    const importedActiveDashboardId =
      typeof payload.activeDashboardId === "string" &&
      importedDashboards.some((d) => d.id === payload.activeDashboardId)
        ? payload.activeDashboardId
        : importedDashboards[0].id;
    setJSON(STORAGE_KEYS.dashboards, importedDashboards);
    setString(STORAGE_KEYS.activeDashboardId, importedActiveDashboardId);
    // Drop legacy keys from any prior install so they don't shadow the new
    // dashboards on next hydrate.
    deleteKey(STORAGE_KEYS.dashboardWidgetsLegacy);
    deleteKey(STORAGE_KEYS.widgetSettingsLegacy);

    setJSON(STORAGE_KEYS.wolDevices, payload.wolDevices ?? []);
    const importedHapticsEnabled = payload.hapticsEnabled ?? true;
    setBoolean(STORAGE_KEYS.hapticsEnabled, importedHapticsEnabled);
    const importedGlobalCustomHeaders = payload.globalCustomHeaders ?? {};
    setJSON(STORAGE_KEYS.globalCustomHeaders, importedGlobalCustomHeaders);
    const importedUiScale: UiScale =
      payload.uiScale && (UI_SCALES as readonly number[]).includes(payload.uiScale)
        ? payload.uiScale
        : DEFAULT_UI_SCALE;
    setJSON(STORAGE_KEYS.uiScale, importedUiScale);
    const importedServicesOrder = sanitizeServicesOrder(payload.servicesOrder);
    setJSON(STORAGE_KEYS.servicesOrder, importedServicesOrder);

    // Restore backend pairing (v2+)
    if (payload.backend?.url && payload.backend?.sharedSecret) {
      await useBackendStore.getState().pair({
        url: payload.backend.url,
        sharedSecret: payload.backend.sharedSecret,
        deviceId: payload.backend.deviceId ?? "",
      });
    }

    // Restore notification settings (v2+). Persist to the legacy storage key
    // (so older app versions on the same device can still read them) and
    // assign to the store below in the bulk set().
    const importedNotificationSettings: NotificationSettings = payload.notificationSettings
      ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...payload.notificationSettings }
      : DEFAULT_NOTIFICATION_SETTINGS;
    if (payload.notificationSettings) {
      setJSON(STORAGE_KEYS.notificationSettings, importedNotificationSettings);
    }

    const { activeInstance: derivedActiveInstance, services: derivedServices, secrets: derivedSecrets } =
      recomputeDerivedFromActive(
        importedDashboards,
        importedActiveDashboardId,
        mergedInstances,
        mergedSecrets,
      );

    // Reload everything into the store
    set({
      serviceInstances: mergedInstances,
      instanceSecrets: mergedSecrets,
      activeInstance: derivedActiveInstance,
      services: derivedServices,
      secrets: derivedSecrets,
      autoSwitchNetwork: payload.autoSwitchNetwork ?? false,
      homeNetworks: importedHomeNetworks,
      servicesOrder: importedServicesOrder,
      dashboards: importedDashboards,
      activeDashboardId: importedActiveDashboardId,
      wolDevices: payload.wolDevices ?? [],
      hapticsEnabled: importedHapticsEnabled,
      globalCustomHeaders: importedGlobalCustomHeaders,
      uiScale: importedUiScale,
      notificationSettings: importedNotificationSettings,
    });

    return true;
  },
}));
