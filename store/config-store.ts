import { create } from "zustand";
import type {
  AppriseConfig,
  Dashboard,
  ExportPayload,
  HomeNetwork,
  NotifCategory,
  NotificationSettings,
  ServiceConfig,
  ServiceInstance,
  ServiceSecrets,
  WakeOnLanDevice,
  WebShortcut,
  WidgetSettingsMap,
  WidgetSlot,
  WidgetSlotSettings,
} from "@/lib/config-types";
export type {
  AppriseConfig,
  Dashboard,
  ExportPayload,
  HomeNetwork,
  NotifCategory,
  NotificationSettings,
  ServiceConfig,
  ServiceInstance,
  ServiceSecrets,
  WakeOnLanDevice,
  WebShortcut,
  WidgetSettingsMap,
  WidgetSlot,
  WidgetSlotSettings,
} from "@/lib/config-types";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  defaultDashboards,
  defaultInstances,
  defaultServiceConfig,
  makeInstance,
} from "@/lib/config-defaults";
export { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/config-defaults";
import type { SeerrAuthMode } from "@/lib/seerr-auth";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import {
  initStorage,
  getJSON,
  setJSON,
  setMany,
  persistMany,
  persistWithSecrets,
  type SecretChange,
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
  MAX_HOME_NETWORKS,
} from "@/lib/constants";
import type { UiScale } from "@/lib/constants";
import {
  DEFAULT_APP_THEME,
  isValidAppTheme,
  type AppThemeId,
} from "@/lib/app-themes";
import {
  DEFAULT_WEEK_START,
  isValidWeekStart,
  type WeekStart,
} from "@/lib/week-start";
import {
  DEFAULT_DASHBOARD_ICON,
  type DashboardIconName,
} from "@/lib/dashboard-icons";
import { DEFAULT_DASHBOARD_COLOR } from "@/lib/dashboard-colors";
import { clearDigestSessions } from "@/lib/http-auth";
import {
  drainSeerrLogins,
  dropSeerrSession,
  forgetSeerrSession,
  suspendSeerrLogins,
} from "@/lib/seerr-session";
import { seerrHostOf } from "@/lib/seerr-auth";
import {
  ALL_PICKABLE_TABS,
  MAX_PINNED_TABS,
  type TabRouteId,
} from "@/lib/tab-routes";
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
import { prepareBackendRestore, useBackendStore } from "@/store/backend-store";
import { requireDeviceAuth } from "@/lib/device-auth";
import { useAddDefaultsStore, addDefaultsKey } from "@/store/add-defaults-store";
import { queryClient } from "@/lib/query-client";
import { ARR_LINK_DETECTION } from "@/lib/bazarr-link";
import type { ServiceId, WidgetId } from "@/lib/constants";
import { normalizeBssid } from "@/lib/wifi";
import {
  normalizeServiceUrl,
  workspaceForcesRemote,
} from "@/lib/url-validation";
import {
  matchesHomeNetwork,
  sameWifiIdentity,
  type WifiIdentity,
} from "@/lib/home-network-match";
import { generateInstanceId } from "@/lib/uuid";

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
  // EPHEMERAL (never persisted). The WiFi network the device is on right now
  // (null off WiFi, or while a VPN masks the SSID), written by the same
  // evaluateHomeNetwork() pass that writes `networkAwayFromHome`. That flag is
  // the ACTIVE dashboard's verdict; this is what `resolveInstanceNetwork` uses
  // to judge an instance attached to ANOTHER dashboard against that dashboard's
  // own home networks (#418). Two houses with identical LAN addressing would
  // otherwise probe the other house's instance at a local URL that reaches the
  // wrong box and answers "authentication failed".
  currentWifi: WifiIdentity | null;
  // EPHEMERAL (never persisted). Whether the device is currently on a WiFi
  // network, literally. Tracked independently of auto-switch by
  // useNetworkAutoSwitch so it is correct even when switching is off. `null`
  // = not yet determined (cold start, before NetInfo reports). Read by the
  // Home Networks screen (diagnostics, the SSID-permission prompts).
  isOnWifi: boolean | null;
  // EPHEMERAL (never persisted). Whether the device is on a LAN link: WiFi or
  // wired Ethernet (Android reports the latter as its own type). The off-WiFi
  // LAN guard in lib/http-client reads this synchronously: a private/LAN URL
  // can never be reached on cellular, so probing it there just hangs and
  // (because the health grid awaits the whole probe batch) freezes every dot
  // red, the Glances/#106 report. Kept apart from `isOnWifi` so a wired device
  // keeps the guard down without the Home Networks screen claiming WiFi.
  isOnLan: boolean | null;
  // EPHEMERAL (never persisted). Whether a VPN tunnel is currently active
  // (native check — see lib/vpn.ts; NetInfo can't report this). Tracked
  // alongside isOnWifi and refreshed by evaluateHomeNetwork() on resume. A VPN
  // can route private ranges to the home LAN, so the off-WiFi LAN guard stands
  // down while one is up, and the opt-in `treatVpnAsHome` setting counts it as
  // a confirmed home network (#185).
  isVpnActive: boolean;
  // While a VPN is connected, behave as if on a confirmed home network: local
  // URLs are used and the away→remote-only rule is suspended. Off by default —
  // the device can only detect that *some* VPN is up, not which one, so the
  // user must opt in (same caveat as Home Assistant Companion's "VPN connected"
  // home-network option). Only consulted when autoSwitchNetwork is on (#185).
  treatVpnAsHome: boolean;
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
  // User-defined web shortcuts rendered by the Shortcuts widget (#344).
  shortcuts: WebShortcut[];
  // Seerr sign-in (#332): instance id -> hosts that must be logged into with
  // credentials before their jar cookie may be trusted again. Set for every
  // host of an instance on a credential/URL change or removal; a host leaves
  // the list only when a credential login succeeds there. Persisted, unlike
  // the in-memory session cache, because the jar keeps its cookies across
  // launches and a change saved just before a restart must still take.
  seerrStaleHosts: Record<string, string[]>;
  hydrated: boolean;
  demoMode: boolean;
  hapticsEnabled: boolean;
  // Headers merged into every outgoing service request (Cloudflare Access etc.).
  // Per-service customHeaders override on top of these.
  globalCustomHeaders: Record<string, string>;
  // Accessibility multiplier applied app-wide via NativeWind's rem observable.
  uiScale: UiScale;
  // Global chrome tint preset applied via NativeWind CSS vars (ThemeRoot).
  appTheme: AppThemeId;
  // Calendar first day of week: follow the device or force Sunday/Monday.
  weekStart: WeekStart;
  notificationSettings: NotificationSettings;
}


export type ExportStage = "preparing" | "encrypting" | "finalizing";
export type ImportStage = "downloading" | "decrypting" | "restoring";

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

  setAutoSwitch: (enabled: boolean) => void;
  // Set by evaluateHomeNetwork() (lib/network.ts) on every network change.
  // EPHEMERAL — never persisted.
  setNetworkAwayFromHome: (away: boolean) => void;
  // Set by evaluateHomeNetwork() alongside the away flag. EPHEMERAL.
  setCurrentWifi: (wifi: WifiIdentity | null) => void;
  // The evaluator's write: identity + active verdict in ONE state update and
  // ONE invalidation. Writing them separately would let the refetch burst
  // from the first write run against the other, still-stale field — on a
  // house A → house B walk that is the active dashboard's local URL sent on
  // house B's LAN with house A's key. EPHEMERAL.
  setNetworkObservation: (wifi: WifiIdentity | null, away: boolean) => void;
  // The home/away + "always remote" verdict that governs ONE instance's URL
  // choice. For an instance attached to the active dashboard this is the
  // active verdict (`networkAwayFromHome` + the workspace pin); for one that
  // only belongs to other dashboards it is judged against THOSE dashboards'
  // home networks using `currentWifi` (#418). Feeds getActiveUrl and the L/R
  // badge helpers so they can't drift.
  resolveInstanceNetwork: (instanceId: string) => InstanceNetworkVerdict;
  // Set by useNetworkAutoSwitch on every NetInfo change (and eagerly at start).
  // EPHEMERAL — never persisted.
  setIsOnWifi: (onWifi: boolean | null) => void;
  // Same source and lifetime; WiFi or wired Ethernet. The LAN guard's input.
  setIsOnLan: (onLan: boolean | null) => void;
  // Set by useNetworkAutoSwitch / evaluateHomeNetwork from lib/vpn.ts.
  // EPHEMERAL — never persisted.
  setIsVpnActive: (active: boolean) => void;
  setTreatVpnAsHome: (enabled: boolean) => void;
  addHomeNetwork: (network: Omit<HomeNetwork, "id">) => HomeNetwork;
  updateHomeNetwork: (id: string, patch: Partial<Omit<HomeNetwork, "id">>) => void;
  removeHomeNetwork: (id: string) => void;
  setHomeNetworks: (networks: HomeNetwork[]) => void;

  // Dashboards (v14+). Operate on the named dashboard list. Removing the last
  // dashboard is rejected by the action — every install always has at least
  // one dashboard so the screen never has nothing to render.
  addDashboard: (name: string) => Dashboard;
  // Deep-clone an existing dashboard: fresh dashboard id + fresh slot ids for
  // every widget (so the global slot-id uniqueness invariant holds), name
  // suffixed " copy" (deduped), all workspace fields preserved. Returns the new
  // dashboard, or null if the source id doesn't exist.
  duplicateDashboard: (dashboardId: string) => Dashboard | null;
  removeDashboard: (dashboardId: string) => void;
  renameDashboard: (dashboardId: string, name: string) => void;
  setActiveDashboard: (dashboardId: string) => void;
  // Switch the active workspace to the first dashboard that has `instanceId`
  // attached (auto-attach dashboards count). No-op when the active dashboard
  // already includes it or none does. Used by the notification tap handler so a
  // tapped alert lands on a workspace where its instance is actually present.
  activateDashboardForInstance: (instanceId: string) => void;
  moveDashboard: (dashboardId: string, direction: "up" | "down") => void;
  // v20: dashboard identity + workspace filter + bottom-tab pinning. All four
  // setters persist through persistDashboards().
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
  // v30: per-workspace Services-tab tile order. Pass an array to set a custom
  // order for this dashboard, or `undefined` to fall back to the global
  // `servicesOrder`. Mirrors the optional-field pattern of homeNetworkIds.
  setDashboardServicesOrder: (
    dashboardId: string,
    order: ServiceId[] | undefined,
  ) => void;
  // v37: per-workspace bottom-tab icon overrides (#195). Pass the full map of
  // overrides for this dashboard; entries matching the defaults should already
  // be absent (the editor stores only real overrides). An empty map drops the
  // key entirely so "no overrides" stays canonical.
  setDashboardTabIcons: (
    dashboardId: string,
    icons: Partial<Record<TabRouteId, DashboardIconName>>,
  ) => void;

  // Slots (v14+). Operate on the active dashboard's widget list. addWidget
  // returns the new slot so callers can reference it (e.g. open settings sheet).
  addWidget: (widgetId: WidgetId) => WidgetSlot | null;
  removeSlot: (slotId: string) => void;
  moveSlot: (slotId: string, direction: "up" | "down") => void;
  // Deep-copy a widget slot (with its settings) onto another dashboard, giving
  // it a fresh slot id. Used by the edit-mode "copy to dashboard" affordance.
  copySlotToDashboard: (slotId: string, targetDashboardId: string) => void;
  setSlotSettings: (slotId: string, settings: WidgetSlotSettings) => void;
  resetSlotSettings: (slotId: string) => void;

  setServicesOrder: (order: ServiceId[]) => void;
  setWolDevices: (devices: WakeOnLanDevice[]) => void;
  setShortcuts: (shortcuts: WebShortcut[]) => void;
  markSeerrHostsStale: (instanceId: string, hosts: string[]) => void;
  clearSeerrStaleHost: (instanceId: string, host: string) => void;
  forgetSeerrStaleHosts: (instanceId: string) => void;
  isSeerrHostStale: (instanceId: string, host: string) => boolean;
  setHapticsEnabled: (enabled: boolean) => void;
  setGlobalCustomHeaders: (headers: Record<string, string>) => void;
  setUiScale: (scale: UiScale) => void;
  setAppTheme: (theme: AppThemeId) => void;
  setWeekStart: (weekStart: WeekStart) => void;
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
  // v42: replace the muted-category list for one qBittorrent instance. An
  // empty list deletes the entry; an empty map is stored as undefined.
  setQbtMutedCategories: (instanceId: string, categories: string[]) => void;

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
  exportConfig: (
    passphrase: string,
    onStage?: (stage: ExportStage) => void,
    // Runs after the file is written and just before the share/app-switch,
    // while the app is still fully foregrounded. Use it for side effects that
    // must not race the foreground-resume transition (e.g. a biometric-gated
    // Keychain write — see #180). Keep it from blocking/aborting the share.
    onBeforeShare?: () => Promise<void>,
  ) => Promise<void>;
  importConfig: (
    requestPassphrase: () => Promise<string | null>,
    onStage?: (stage: ImportStage) => void,
  ) => Promise<boolean>;
  /**
   * Decrypt an export envelope obtained elsewhere (the backend backup slot,
   * Refs #385) and restore it. Same migration/validation/replace path as the
   * file import; the picker is the only thing it skips.
   */
  importConfigFromEnvelope: (
    envelope: unknown,
    passphrase: string,
    onStage?: (stage: ImportStage) => void,
  ) => Promise<void>;
  /** The restore half of importConfig: migrate, validate, full replace. */
  importConfigFromPayload: (raw: unknown, onStage?: (stage: ImportStage) => void) => Promise<void>;
}

type ConfigStore = ConfigState & ConfigActions;

// defaultServiceConfig / makeInstance / defaultInstances / defaultDashboards
// live in lib/config-defaults.ts (pure) so the backend's web editor can build
// a blank configuration with the same shapes.

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

// Same resolution as effectiveHomeNetworkIdSet but yielding the networks
// themselves, for SSID matching.
function effectiveHomeNetworksOf(
  dashboard: Dashboard | undefined,
  globalHomeNetworks: HomeNetwork[],
): HomeNetwork[] {
  const ids = effectiveHomeNetworkIdSet(dashboard, globalHomeNetworks);
  return globalHomeNetworks.filter((n) => ids.has(n.id));
}

// Whether a dashboard names an instance in its attachment list. The absent
// list (pre-v20 "everything is attached") deliberately returns false here: it
// is a display default, not a statement of which house the instance lives in
// (see resolveInstanceNetwork).
function dashboardExplicitlyAttaches(
  dashboard: Dashboard,
  instanceId: string,
): boolean {
  return dashboard.attachedInstances?.includes(instanceId) ?? false;
}

// A home-network edit (SSID/BSSID, add, remove) changes what every dashboard
// selecting it matches, and so the local/remote URL of the instances those
// dashboards own (#418) — with no network event to re-evaluate. The state
// patch for such an edit: the new list PLUS the active dashboard's away
// verdict re-checked against it, in the same transaction. Committing the list
// alone and letting useNetworkAutoSwitch re-evaluate later leaves a window
// where the flag still says "home" for a network that no longer exists in the
// list — and the invalidation that follows would refetch through the local
// URL inside that window (#418 review).
//
// The re-check only ever TIGHTENS (home → away). It never loosens away → home
// from the stored identity: `currentWifi` stops being refreshed while no home
// network is configured (useNetworkAutoSwitch bails), so by the time the user
// adds a network again the device may be on a different LAN with the old
// identity still cached. Clearing home is the evaluator's job — the edit
// re-runs it (the hook depends on homeNetworks) and it reads NetInfo fresh.
// For the same reason the identity is dropped when the list becomes empty.
function homeNetworksPatch(
  state: Pick<
    ConfigState,
    | "autoSwitchNetwork"
    | "demoMode"
    | "treatVpnAsHome"
    | "isVpnActive"
    | "currentWifi"
    | "networkAwayFromHome"
    | "dashboards"
    | "activeDashboardId"
  >,
  next: HomeNetwork[],
): Pick<ConfigState, "homeNetworks"> &
  Partial<Pick<ConfigState, "networkAwayFromHome" | "currentWifi">> {
  setJSON(STORAGE_KEYS.homeNetworks, next);
  const identity = next.length === 0 ? { currentWifi: null } : {};
  // Auto-switch off / demo: getActiveUrl ignores the flag and the evaluator
  // no-ops, so leave it untouched exactly as the evaluator would.
  if (!state.autoSwitchNetwork || state.demoMode) {
    return { homeNetworks: next, ...identity };
  }
  if (state.networkAwayFromHome) return { homeNetworks: next, ...identity };
  // Currently home: stay home only if the VPN opt-in still vouches for it
  // (#185, live via the liveness poll) or the network we matched is still in
  // the active dashboard's effective selection of the NEW list.
  if (state.treatVpnAsHome && state.isVpnActive) {
    return { homeNetworks: next, ...identity };
  }
  const active =
    state.dashboards.find((d) => d.id === state.activeDashboardId) ??
    state.dashboards[0];
  return {
    homeNetworks: next,
    ...identity,
    networkAwayFromHome: !matchesHomeNetwork(
      state.currentWifi,
      effectiveHomeNetworksOf(active, next),
    ),
  };
}

// After a home-network edit has landed atomically (homeNetworksPatch), refetch
// what was cached against the old URLs (#4). Rare, user-driven edits, so a
// blanket invalidation is fine.
function invalidateForHomeNetworkEdit(): void {
  void queryClient.invalidateQueries();
}

/** See ConfigActions.resolveInstanceNetwork. */
export interface InstanceNetworkVerdict {
  // Not on a home network the governing dashboard(s) trust → remote only.
  away: boolean;
  // The governing dashboard(s) selected no live home networks → always remote,
  // even with auto-switch off (mirrors workspaceForcesRemote for the active
  // dashboard).
  forcesRemote: boolean;
}

// Whether switching the active workspace from `oldDashboard` to `newDashboard`
// should reset networkAwayFromHome to the safe default (away → remote). The
// cached flag was computed against the OUTGOING dashboard's home networks; if
// the incoming dashboard might not trust the network we're currently home on, a
// stale `false` would briefly send the private local URL on a network the new
// workspace doesn't trust — the switch-race exposure window (#148 review Rec #8).
//
// Reached only while auto-switch is on and we're currently HOME (flag false), so
// the network we're on is in `oldSet`. The incoming set keeps us home iff it
// still contains every old id (a SUPERSET) — then the current network is
// guaranteed to be trusted and we must NOT flash remote (#14). Otherwise the
// network we're home on might be one the new workspace dropped, so we can't be
// sure → force away; useNetworkAutoSwitch re-confirms against the real SSID a
// tick later and clears the flag if we're actually still home.
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
  // Force away only when the new set is NOT a superset of the old one. If every
  // network the old workspace trusted is still trusted, the one we're home on is
  // among them, so we stay home — no needless remote flash on broaden/equal.
  for (const id of oldSet) if (!newSet.has(id)) return true;
  return false;
}

/**
 * Drop BSSID pins from imported home networks (#168). A pinned BSSID is the
 * access-point radio MAC the source device recorded; on the importing device it
 * often won't match — with mesh/multiple APs or 2.4-vs-5GHz the device can
 * associate with a different radio (different BSSID), and iOS frequently doesn't
 * surface a BSSID at all — and `isHomeNetwork` fails closed in those cases, so
 * the device is stuck "away" → remote-only even on the real home WiFi (the two
 * reports on #168). Stripping to SSID-only matching makes the transfer robust
 * cross-device; the user can re-pin locally if they want the rogue-AP guard.
 * The security invariant is intact — the SSID must still match before any local
 * URL is used.
 */
export function stripImportedBssids(networks: HomeNetwork[]): HomeNetwork[] {
  return networks.map((n) => (n.bssid ? { ...n, bssid: "" } : n));
}

/**
 * Repair dashboards' home-network selections after import (#168). A selection
 * that is a NON-EMPTY array but whose ids are ALL absent from the imported
 * global list is corruption — a clean export/import keeps the two consistent —
 * and it resolves to an empty effective set, which `getActiveUrl` treats as
 * "always remote", silently breaking local URLs with no way for the user to
 * recover. Revert those to `undefined` ("use all networks"). An explicit empty
 * `[]` is left untouched (that's the user's deliberate "always remote" choice,
 * not corruption), as are selections with at least one live id
 * (`resolveEffectiveHomeNetworks` already ignores the stale ones).
 */
export function repairOrphanedHomeNetworkSelection(
  dashboards: Dashboard[],
  homeNetworks: HomeNetwork[],
): Dashboard[] {
  const validIds = new Set(homeNetworks.map((n) => n.id));
  return dashboards.map((d) => {
    const ids = d.homeNetworkIds;
    if (!Array.isArray(ids) || ids.length === 0) return d;
    if (ids.some((id) => validIds.has(id))) return d;
    const { homeNetworkIds: _orphaned, ...rest } = d;
    return rest as Dashboard;
  });
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

// Demo mode is a curated showcase, so its unRAID instance is pre-paired with its
// Glances instance for disk I/O (#386) — the ids are generated fresh each time,
// so the link has to be made after both exist. In a real config this pairing is
// always the user's explicit choice; see components/settings/unraid-disk-io-card.tsx.
function pairDemoDiskIo(instances: Record<ServiceId, ServiceInstance[]>): void {
  const unraid = instances.unraid?.[0];
  const glances = instances.glances?.[0];
  if (unraid && glances) unraid.diskIoInstanceId = glances.id;
}

// Demo instances carry no API keys, so automatic detection (which matches
// keys) can never link them. Pin the demo Bazarr to the demo Radarr/Sonarr so
// the subtitle UI shows up in demo mode.
function pairDemoBazarrLinks(instances: Record<ServiceId, ServiceInstance[]>): void {
  const bazarr = instances.bazarr?.[0];
  if (!bazarr) return;
  const radarr = instances.radarr?.[0];
  const sonarr = instances.sonarr?.[0];
  if (radarr) bazarr.linkedRadarrInstanceId = radarr.id;
  if (sonarr) bazarr.linkedSonarrInstanceId = sonarr.id;
}

function makeDemoConfig(dashboards: Dashboard[], activeDashboardId: string) {
  const serviceInstances = {} as Record<ServiceId, ServiceInstance[]>;
  for (const id of SERVICE_IDS) {
    serviceInstances[id] = [{
      id: generateInstanceId(),
      ...defaultServiceConfig(id),
      enabled: true,
      localUrl: "http://demo.local",
      remoteUrl: "",
    }];
  }
  pairDemoDiskIo(serviceInstances);
  pairDemoBazarrLinks(serviceInstances);

  const demoDashboards = dashboards.map((dashboard) => ({
    ...dashboard,
    attachedInstances: undefined,
    activeInstance: undefined,
  }));
  return {
    dashboards: demoDashboards,
    serviceInstances,
    instanceSecrets: {},
    ...recomputeDerivedFromActive(demoDashboards, activeDashboardId, serviceInstances, {}),
  };
}

function persistDashboards(
  state: Pick<ConfigState, "demoMode">,
  dashboards: Dashboard[],
  activeDashboardId?: string,
): void {
  if (state.demoMode) return;
  if (activeDashboardId === undefined) {
    setJSON(STORAGE_KEYS.dashboards, dashboards);
  } else {
    setMany([
      [STORAGE_KEYS.dashboards, JSON.stringify(dashboards)],
      [STORAGE_KEYS.activeDashboardId, activeDashboardId],
    ]);
  }
}

// Finish real keychain edits before swapping in demo instances.
let pendingInstanceWrites = 0;
let configImportInProgress = false;

export const useConfigStore = create<ConfigStore>((set, get) => ({
  serviceInstances: initialInstances,
  instanceSecrets: {},
  activeInstance: initialActiveInstance,
  services: deriveLegacyServices(initialInstances, initialActiveInstance),
  secrets: emptyLegacySecrets(),
  autoSwitchNetwork: false,
  networkAwayFromHome: true,
  currentWifi: null,
  isOnWifi: null,
  isOnLan: null,
  isVpnActive: false,
  treatVpnAsHome: false,
  homeNetworks: [],
  servicesOrder: [],
  dashboards: initialDashboards,
  activeDashboardId: initialDashboards[0].id,
  wolDevices: [],
  shortcuts: [],
  seerrStaleHosts: {},
  hydrated: false,
  demoMode: false,
  hapticsEnabled: true,
  globalCustomHeaders: {},
  uiScale: DEFAULT_UI_SCALE,
  appTheme: DEFAULT_APP_THEME,
  weekStart: DEFAULT_WEEK_START,
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
    const treatVpnAsHome = getBoolean(STORAGE_KEYS.treatVpnAsHome);
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
          // v29: per-workspace home-network selection (#148). MUST be rehydrated
          // here too — the setter persists it into STORAGE_KEYS.dashboards, so
          // dropping it on cold start would silently revert a "remote-only" (or
          // subset) workspace to "all home networks", re-exposing the private
          // local URL + API key on networks it was configured not to trust.
          // Mirror coerceDashboard: dedupe, drop empties, cap; preserve an
          // explicit empty array ("no home network here → always remote").
          if (Array.isArray(d.homeNetworkIds)) {
            const seen = new Set<string>();
            const ids: string[] = [];
            for (const id of d.homeNetworkIds) {
              if (typeof id !== "string" || id.length === 0) continue;
              if (seen.has(id)) continue;
              seen.add(id);
              ids.push(id);
              if (ids.length >= MAX_HOME_NETWORKS) break;
            }
            dashboard.homeNetworkIds = ids;
          }
          // v30: per-workspace Services-tab order. Same forgiving coercion as
          // the global servicesOrder — dedupe + drop unknown ids; absence means
          // "use the global order".
          if (Array.isArray(d.servicesOrder)) {
            const seen = new Set<string>();
            const order: ServiceId[] = [];
            for (const sid of d.servicesOrder) {
              if (typeof sid !== "string") continue;
              if (!(SERVICE_IDS as readonly string[]).includes(sid)) continue;
              if (seen.has(sid)) continue;
              seen.add(sid);
              order.push(sid as ServiceId);
            }
            dashboard.servicesOrder = order;
          }
          // v37: per-workspace bottom-tab icon overrides (#195). Rehydrated
          // here like every other Dashboard field — dropping it on cold start
          // would silently reset custom tab icons. Unknown tab keys and
          // malformed values are dropped; icon-name validity is checked at
          // render time (resolveTabIcon falls back to the default).
          if (isPlainObject(d.tabIcons)) {
            const cleaned: Record<string, string> = {};
            for (const [tab, icon] of Object.entries(d.tabIcons)) {
              if (!(ALL_PICKABLE_TABS as readonly string[]).includes(tab)) continue;
              if (typeof icon !== "string" || icon.length === 0 || icon.length > 64) {
                continue;
              }
              cleaned[tab] = icon;
            }
            if (Object.keys(cleaned).length > 0) {
              dashboard.tabIcons = cleaned;
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
      // Atomic pair-write so a crash can't persist the dashboards list without
      // its matching activeDashboardId (or vice versa) and leave them desynced.
      setMany([
        [STORAGE_KEYS.dashboards, JSON.stringify(dashboards)],
        [STORAGE_KEYS.activeDashboardId, activeDashboardId],
      ]);
    }

    const servicesOrder = sanitizeServicesOrder(
      getJSON<unknown>(STORAGE_KEYS.servicesOrder),
    );

    const wolDevices = getJSON<WakeOnLanDevice[]>(STORAGE_KEYS.wolDevices) ?? [];
    const shortcuts = getJSON<WebShortcut[]>(STORAGE_KEYS.shortcuts) ?? [];
    const seerrStaleHosts =
      getJSON<Record<string, string[]>>(STORAGE_KEYS.seerrStaleHosts) ?? {};
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

    const storedAppTheme = getString(STORAGE_KEYS.appTheme);
    const appTheme: AppThemeId = isValidAppTheme(storedAppTheme)
      ? storedAppTheme
      : DEFAULT_APP_THEME;

    const storedWeekStart = getString(STORAGE_KEYS.weekStart);
    const weekStart: WeekStart = isValidWeekStart(storedWeekStart)
      ? storedWeekStart
      : DEFAULT_WEEK_START;

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

    const demoMode = getBoolean(STORAGE_KEYS.demoMode);
    const config = demoMode
      ? makeDemoConfig(dashboards, activeDashboardId)
      : {
          dashboards,
          serviceInstances: instances,
          instanceSecrets,
          ...recomputeDerivedFromActive(dashboards, activeDashboardId, instances, instanceSecrets),
        };

    set({
      ...config,
      autoSwitchNetwork,
      treatVpnAsHome,
      homeNetworks,
      servicesOrder,
      activeDashboardId,
      wolDevices,
      shortcuts,
      seerrStaleHosts,
      demoMode,
      hapticsEnabled,
      globalCustomHeaders,
      uiScale,
      appTheme,
      weekStart,
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
      if (!state.demoMode) setJSON(`${STORAGE_KEYS.services}.${id}`, list);
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
    if (configImportInProgress) throw new Error("Settings are being restored.");
    const { demoMode } = get();
    if (!get().serviceInstances[id]?.some((instance) => instance.id === instanceId)) return;
    // The cached HTTP Digest nonce is keyed by instance, so drop it with the
    // instance rather than leaving it in the map for the process lifetime.
    clearDigestSessions(instanceId);
    if (!demoMode) {
      // Same for Seerr's in-memory session entries and the persisted stale-host
      // list (#332). The server-side logout is the caller's job (seerrClearSession
      // runs before removal); this only stops a deleted id from lingering.
      forgetSeerrSession(instanceId);
      get().forgetSeerrStaleHosts(instanceId);
      // Drop this instance's remembered add-sheet defaults.
      useAddDefaultsStore.getState().prune(addDefaultsKey(id, instanceId));
      // Clear SecureStore entries for this instance before mutating state so a
      // crash mid-delete doesn't leave orphaned secrets behind.
      pendingInstanceWrites++;
      try {
        await deleteSecret(`${SECRET_PREFIX}.${instanceId}.apiKey`);
        await deleteSecret(`${SECRET_PREFIX}.${instanceId}.username`);
        await deleteSecret(`${SECRET_PREFIX}.${instanceId}.password`);
        await deleteSecret(`${SECRET_PREFIX}.${instanceId}.customHeaders`);
      } finally {
        pendingInstanceWrites--;
      }
    }

    set((state) => {
      if (state.demoMode !== demoMode) return state;
      const list = (state.serviceInstances[id] ?? []).filter((i) => i.id !== instanceId);
      const serviceInstances = { ...state.serviceInstances, [id]: list };
      const { [instanceId]: _removed, ...instanceSecrets } = state.instanceSecrets;
      if (!state.demoMode) setJSON(`${STORAGE_KEYS.services}.${id}`, list);

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
        persistDashboards(state, dashboards);
      }

      // v21: drop any per-instance notification overrides keyed to the
      // deleted instance so orphan keys don't accumulate in storage.
      // v42: same for the muted-category map.
      let notificationSettings = state.notificationSettings;
      if (notificationSettings.perInstance?.[instanceId] !== undefined) {
        const { [instanceId]: _drop, ...rest } = notificationSettings.perInstance;
        notificationSettings = {
          ...notificationSettings,
          perInstance: Object.keys(rest).length === 0 ? undefined : rest,
        };
      }
      if (notificationSettings.qbtMutedCategories?.[instanceId] !== undefined) {
        const { [instanceId]: _drop, ...rest } = notificationSettings.qbtMutedCategories;
        notificationSettings = {
          ...notificationSettings,
          qbtMutedCategories: Object.keys(rest).length === 0 ? undefined : rest,
        };
      }
      if (!state.demoMode && notificationSettings !== state.notificationSettings) {
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
      if (!state.demoMode) setJSON(`${STORAGE_KEYS.services}.${id}`, next);
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
        ("useRemote" in patch && patch.useRemote !== prevInst.useRemote) ||
        // Same for "Remote URL needs a VPN" (#394): it decides whether the
        // resolved URL is contacted at all, so a screen sitting on a
        // "Waiting for VPN" error must refetch when the flag is turned off.
        ("remoteRequiresVpn" in patch &&
          (patch.remoteRequiresVpn ?? false) !==
            (prevInst.remoteRequiresVpn ?? false));
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
      if (!state.demoMode) setJSON(`${STORAGE_KEYS.services}.${id}`, next);
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
      const dashboard = state.dashboards.find((d) => d.id === dashboardId);
      if (!dashboard) return state;
      // Reject a pin the resolver would silently ignore. deriveActiveInstance
      // only honors a pin that's enabled AND attached to this dashboard (or any
      // instance when the dashboard is auto-attach), so validating those same
      // conditions at write time keeps the persisted pin in lockstep with what
      // resolution returns — no dead cruft that survives export/import or
      // diverges from the rendered selection.
      if (instanceId !== null) {
        const inst = list.find((i) => i.id === instanceId);
        const isAttached =
          dashboard.attachedInstances === undefined ||
          dashboard.attachedInstances.includes(instanceId);
        if (!inst || !inst.enabled || !isAttached) {
          return state;
        }
      }

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
      persistDashboards(state, dashboards);

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
    if (configImportInProgress) throw new Error("Settings are being restored.");
    const { demoMode } = get();
    if (!demoMode) {
      pendingInstanceWrites++;
      try {
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
      } finally {
        pendingInstanceWrites--;
      }
    }
    set((state) => {
      if (state.demoMode !== demoMode) return state;
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
    // Bazarr's Radarr/Sonarr link detection matches on these API keys, which
    // stay out of its query key, so a Radarr/Sonarr save re-runs it too.
    const { serviceInstances } = get();
    const isArr = [
      ...(serviceInstances.radarr ?? []),
      ...(serviceInstances.sonarr ?? []),
    ].some((i) => i.id === instanceId);
    if (isArr) {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[2] === ARR_LINK_DETECTION,
      });
    }
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

  setCurrentWifi: (wifi) => {
    // No-op on NetInfo's repeats. A real change can flip the resolved URL of
    // instances attached to a non-active dashboard without touching the active
    // away flag (e.g. the active workspace is pinned "always remote"), so
    // invalidate for the same reason setNetworkAwayFromHome does.
    if (sameWifiIdentity(get().currentWifi, wifi)) return;
    set({ currentWifi: wifi });
    void queryClient.invalidateQueries();
  },

  setNetworkObservation: (wifi, away) => {
    const state = get();
    const wifiChanged = !sameWifiIdentity(state.currentWifi, wifi);
    const awayChanged = state.networkAwayFromHome !== away;
    if (!wifiChanged && !awayChanged) return;
    set({ currentWifi: wifi, networkAwayFromHome: away });
    // Same reasoning as setNetworkAwayFromHome (#4): resolved URLs flip with
    // either field and query keys don't encode them.
    void queryClient.invalidateQueries();
  },

  setIsOnWifi: (onWifi) => {
    // No-op when unchanged (NetInfo emits repeatedly). Display-only: the LAN
    // guard reads isOnLan, whose setter does the invalidation.
    if (get().isOnWifi === onWifi) return;
    set({ isOnWifi: onWifi });
  },

  setIsOnLan: (onLan) => {
    // No-op when unchanged (NetInfo emits repeatedly). Coming back onto a LAN
    // link re-enables LAN URLs; leaving it disables them. Invalidate so any
    // query that was short-circuited offline by the LAN guard (or was serving
    // LAN-fetched data) re-resolves against the new reality. The health query
    // also re-keys via its probe signature.
    if (get().isOnLan === onLan) return;
    set({ isOnLan: onLan });
    void queryClient.invalidateQueries();
  },

  setIsVpnActive: (active) => {
    // Same shape as setIsOnLan: a VPN coming up makes LAN URLs reachable
    // (the off-WiFi guard stands down); it dropping takes them away again.
    if (get().isVpnActive === active) return;
    set({ isVpnActive: active });
    void queryClient.invalidateQueries();
  },

  setTreatVpnAsHome: (enabled) => {
    setBoolean(STORAGE_KEYS.treatVpnAsHome, enabled);
    set({ treatVpnAsHome: enabled });
    // useNetworkAutoSwitch subscribes to this and re-evaluates home/away.
  },

  addHomeNetwork: (network) => {
    const created: HomeNetwork = {
      id: generateHomeNetworkId(),
      ssid: network.ssid.trim(),
      bssid: normalizeBssid(network.bssid),
    };
    set((state) => homeNetworksPatch(state, [...state.homeNetworks, created]));
    invalidateForHomeNetworkEdit();
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
      return homeNetworksPatch(state, next);
    });
    invalidateForHomeNetworkEdit();
  },

  removeHomeNetwork: (id) => {
    set((state) =>
      homeNetworksPatch(
        state,
        state.homeNetworks.filter((n) => n.id !== id),
      ),
    );
    invalidateForHomeNetworkEdit();
  },

  setHomeNetworks: (networks) => {
    set((state) => homeNetworksPatch(state, networks));
    invalidateForHomeNetworkEdit();
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
      persistDashboards(state, dashboards);
      return { dashboards };
    });
    return dashboard;
  },

  duplicateDashboard: (dashboardId) => {
    const src = get().dashboards.find((d) => d.id === dashboardId);
    if (!src) return null;
    // Unique " copy" name: "X copy", then "X copy 2", "X copy 3", … Names aren't
    // a key (ids are) so this is a soft nicety to keep the picker readable.
    const existing = new Set(get().dashboards.map((d) => d.name));
    let name = `${src.name} copy`;
    for (let n = 2; existing.has(name); n++) name = `${src.name} copy ${n}`;
    const clone: Dashboard = {
      ...src,
      id: generateInstanceId(),
      name,
      // Fresh slot id per widget: slot ids must be globally unique (the
      // slot-keyed settings store + query cache collide otherwise). Deep-copy
      // each slot's settings so tweaking one dashboard's widget can't mutate the
      // other through a shared object reference.
      widgets: src.widgets.map((w) => ({
        id: generateInstanceId(),
        widgetId: w.widgetId,
        ...(w.settings ? { settings: { ...w.settings } } : {}),
      })),
      // Clone the optional arrays/maps by value (truthy `[]` is preserved, e.g.
      // an "always remote" homeNetworkIds or an empty attachment set); undefined
      // stays undefined so an auto-attach source clones to auto-attach.
      ...(src.attachedInstances
        ? { attachedInstances: [...src.attachedInstances] }
        : {}),
      ...(src.pinnedTabs ? { pinnedTabs: [...src.pinnedTabs] } : {}),
      ...(src.activeInstance ? { activeInstance: { ...src.activeInstance } } : {}),
      ...(src.homeNetworkIds ? { homeNetworkIds: [...src.homeNetworkIds] } : {}),
      ...(src.servicesOrder ? { servicesOrder: [...src.servicesOrder] } : {}),
      ...(src.tabIcons ? { tabIcons: { ...src.tabIcons } } : {}),
    };
    set((state) => {
      const dashboards = [...state.dashboards, clone];
      persistDashboards(state, dashboards);
      return { dashboards };
    });
    return clone;
  },

  activateDashboardForInstance: (instanceId) => {
    const state = get();
    // Auto-attach dashboards (attachedInstances === undefined) include every
    // instance; explicit lists must contain the id.
    const attaches = (d: Dashboard) =>
      d.attachedInstances === undefined ||
      d.attachedInstances.includes(instanceId);
    const active = state.dashboards.find((d) => d.id === state.activeDashboardId);
    if (active && attaches(active)) return; // already visible on the active one
    const target = state.dashboards.find(attaches);
    if (target) get().setActiveDashboard(target.id);
  },

  removeDashboard: (dashboardId) => {
    let removed = false;
    set((state) => {
      // Refuse to delete the last dashboard — the screen always needs one.
      if (state.dashboards.length <= 1) return state;
      const dashboards = state.dashboards.filter((d) => d.id !== dashboardId);
      if (dashboards.length === state.dashboards.length) return state;
      removed = true;
      let activeDashboardId = state.activeDashboardId;
      const activeChanged = activeDashboardId === dashboardId;
      if (activeChanged) {
        activeDashboardId = dashboards[0].id;
      }
      persistDashboards(state, dashboards, activeChanged ? activeDashboardId : undefined);
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
        return {
          dashboards,
          activeDashboardId,
          ...derived,
          ...(forceAway ? { networkAwayFromHome: true } : {}),
        };
      }
      return { dashboards, activeDashboardId };
    });
    // Any real deletion can change routing: the inline away reset above
    // bypasses setNetworkAwayFromHome's invalidate (#4), and deleting a
    // NON-active dashboard can remove an instance's only explicit owner, which
    // re-routes it with no flag moving (#418). Refetch in both cases.
    if (removed) void queryClient.invalidateQueries();
  },

  renameDashboard: (dashboardId, name) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, name: name.trim() || d.name } : d,
      );
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  setActiveDashboard: (dashboardId) => {
    let forcedAway = false;
    set((state) => {
      if (!state.dashboards.some((d) => d.id === dashboardId)) return state;
      if (state.activeDashboardId === dashboardId) return state;
      if (!state.demoMode) setString(STORAGE_KEYS.activeDashboardId, dashboardId);
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
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  setDashboardIcon: (dashboardId, icon) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, icon } : d,
      );
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  setDashboardColor: (dashboardId, color) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) =>
        d.id === dashboardId ? { ...d, color } : d,
      );
      persistDashboards(state, dashboards);
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
      persistDashboards(state, dashboards);
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
    // Attachment is ownership for URL resolution (#418): claiming or releasing
    // an instance on ANY dashboard can flip which home networks judge it, and
    // with them its local/remote URL, without any network flag moving. Query
    // keys don't encode the URL (#4), so refetch.
    void queryClient.invalidateQueries();
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
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  setDashboardHomeNetworkIds: (dashboardId, ids) => {
    let forcedAway = false;
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
      persistDashboards(state, dashboards);
      // v29: editing the ACTIVE workspace's home-network set can shrink the
      // trusted set (e.g. narrow to a subset that excludes the current SSID, or
      // switch to "always remote"). The cached `networkAwayFromHome` flag was
      // computed against the OLD selection, so a stale `false` would keep
      // serving the private local URL on a network this workspace no longer
      // trusts — the in-place-edit analogue of the setActiveDashboard
      // switch-race (#148 Rec #8). Reset to the safe away default; the
      // useNetworkAutoSwitch effect re-confirms a tick later and clears it if
      // we're genuinely still home under the new selection.
      if (dashboardId === state.activeDashboardId) {
        const forceAway = switchInvalidatesAwayFlag(
          state,
          state.dashboards.find((d) => d.id === dashboardId),
          dashboards.find((d) => d.id === dashboardId),
        );
        if (forceAway) {
          forcedAway = true;
          return { dashboards, networkAwayFromHome: true };
        }
      }
      return { dashboards };
    });
    // The inline away reset bypasses setNetworkAwayFromHome's invalidate, so
    // refetch any local-resolved instance against the new (remote) URL (#4).
    // A NON-active dashboard's selection also governs its own instances'
    // URLs (#418) with no flag moving at all, so refetch for that too.
    if (forcedAway || dashboardId !== get().activeDashboardId) {
      void queryClient.invalidateQueries();
    }
  },

  setDashboardServicesOrder: (dashboardId, order) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) => {
        if (d.id !== dashboardId) return d;
        // `undefined` → drop the key so the workspace reuses the GLOBAL
        // servicesOrder (and any future default), like homeNetworkIds.
        if (order === undefined) {
          const { servicesOrder: _omit, ...rest } = d;
          return rest;
        }
        // Dedupe + drop unknown ids (forward-compat). Missing kinds fall in at
        // the end in canonical order at render time, so we don't pad here.
        const seen = new Set<string>();
        const sanitized: ServiceId[] = [];
        for (const id of order) {
          if (!(SERVICE_IDS as readonly string[]).includes(id)) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          sanitized.push(id);
        }
        return { ...d, servicesOrder: sanitized };
      });
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  setDashboardTabIcons: (dashboardId, icons) => {
    set((state) => {
      const dashboards = state.dashboards.map((d) => {
        if (d.id !== dashboardId) return d;
        // Drop unknown tab keys and empty values; the setter's type already
        // constrains icon names, but imports/drafts stay defensive.
        const sanitized: Record<string, string> = {};
        for (const [tab, icon] of Object.entries(icons)) {
          if (!(ALL_PICKABLE_TABS as readonly string[]).includes(tab)) continue;
          if (typeof icon !== "string" || icon.length === 0) continue;
          sanitized[tab] = icon;
        }
        // No overrides → drop the key so "all defaults" stays canonical,
        // like homeNetworkIds/servicesOrder do for `undefined`.
        if (Object.keys(sanitized).length === 0) {
          const { tabIcons: _omit, ...rest } = d;
          return rest;
        }
        return { ...d, tabIcons: sanitized };
      });
      persistDashboards(state, dashboards);
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
      persistDashboards(state, dashboards);
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
      persistDashboards(state, dashboards);
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
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  copySlotToDashboard: (slotId, targetDashboardId) => {
    set((state) => {
      // Slot ids are globally unique, so the first match across all dashboards
      // is the source slot.
      let source: WidgetSlot | undefined;
      for (const d of state.dashboards) {
        const hit = d.widgets.find((w) => w.id === slotId);
        if (hit) {
          source = hit;
          break;
        }
      }
      if (!source) return state;
      if (!state.dashboards.some((d) => d.id === targetDashboardId)) return state;
      // Fresh slot id keeps the uniqueness invariant; deep-copy settings so the
      // two placements stay independent.
      const copy: WidgetSlot = {
        id: generateInstanceId(),
        widgetId: source.widgetId,
        ...(source.settings ? { settings: { ...source.settings } } : {}),
      };
      const dashboards = state.dashboards.map((d) =>
        d.id === targetDashboardId
          ? { ...d, widgets: [...d.widgets, copy] }
          : d,
      );
      persistDashboards(state, dashboards);
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
      persistDashboards(state, dashboards);
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
      persistDashboards(state, dashboards);
      return { dashboards };
    });
  },

  markSeerrHostsStale: (instanceId, hosts) => {
    const current = new Set(get().seerrStaleHosts[instanceId] ?? []);
    for (const h of hosts) if (h) current.add(h);
    const next = { ...get().seerrStaleHosts, [instanceId]: [...current] };
    if (!get().demoMode) setJSON(STORAGE_KEYS.seerrStaleHosts, next);
    set({ seerrStaleHosts: next });
  },
  clearSeerrStaleHost: (instanceId, host) => {
    const current = get().seerrStaleHosts[instanceId];
    if (!current || !current.includes(host)) return;
    const remaining = current.filter((h) => h !== host);
    const { [instanceId]: _dropped, ...rest } = get().seerrStaleHosts;
    const next = remaining.length > 0 ? { ...rest, [instanceId]: remaining } : rest;
    if (!get().demoMode) setJSON(STORAGE_KEYS.seerrStaleHosts, next);
    set({ seerrStaleHosts: next });
  },
  forgetSeerrStaleHosts: (instanceId) => {
    if (!(instanceId in get().seerrStaleHosts)) return;
    const { [instanceId]: _dropped, ...next } = get().seerrStaleHosts;
    if (!get().demoMode) setJSON(STORAGE_KEYS.seerrStaleHosts, next);
    set({ seerrStaleHosts: next });
  },
  isSeerrHostStale: (instanceId, host) =>
    (get().seerrStaleHosts[instanceId] ?? []).includes(host),
  setWolDevices: (devices) => {
    setJSON(STORAGE_KEYS.wolDevices, devices);
    set({ wolDevices: devices });
  },
  setShortcuts: (shortcuts) => {
    setJSON(STORAGE_KEYS.shortcuts, shortcuts);
    set({ shortcuts });
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

  setAppTheme: (theme) => {
    if (!isValidAppTheme(theme)) return;
    setString(STORAGE_KEYS.appTheme, theme);
    set({ appTheme: theme });
  },

  setWeekStart: (weekStart) => {
    if (!isValidWeekStart(weekStart)) return;
    setString(STORAGE_KEYS.weekStart, weekStart);
    set({ weekStart });
  },

  setNotificationSetting: (key, value) => {
    const next = { ...get().notificationSettings, [key]: value };
    setJSON(STORAGE_KEYS.notificationSettings, next);
    set({ notificationSettings: next });
  },

  setInstanceNotificationOverride: (instanceId, category, value) => {
    if (get().demoMode) return;
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

  setQbtMutedCategories: (instanceId, categories) => {
    if (get().demoMode) return;
    const current = get().notificationSettings;
    const map = { ...(current.qbtMutedCategories ?? {}) };
    const deduped = [...new Set(categories)];
    if (deduped.length === 0) {
      delete map[instanceId];
    } else {
      map[instanceId] = deduped;
    }
    const next: NotificationSettings = {
      ...current,
      qbtMutedCategories: Object.keys(map).length === 0 ? undefined : map,
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
    // 2. A workspace that explicitly selected NO (live) home networks
    //    (homeNetworkIds: [] — or only stale ids) is "always remote". Honor that
    //    even when global auto-switch is off, so the per-workspace remote-only
    //    choice can't be silently overridden by the global toggle and re-expose
    //    the local URL (#148). `undefined` (auto-attach all networks) is NOT
    //    remote-only, so it falls through to the auto-switch/away logic below.
    //    The workspace consulted is the one that governs THIS instance: the
    //    active dashboard when the instance is attached to it, otherwise the
    //    dashboard(s) it belongs to (#418) — see resolveInstanceNetwork.
    const { away, forcesRemote } = state.resolveInstanceNetwork(inst.id);
    if (forcesRemote) return remote;
    // 3. Auto-switch off → user opted out of switching; use local (or remote if
    //    no local is configured).
    if (!state.autoSwitchNetwork) return local || remote;
    // 4. AWAY from a confirmed home network → REMOTE ONLY. We deliberately do
    //    NOT fall back to the private local URL on an untrusted network: a
    //    stranger's device at the same private address (e.g. 192.168.1.x on
    //    airport WiFi) would receive our API key. No remote configured → "" → the
    //    service is simply offline while away, which is the honest, safe result.
    //    `networkAwayFromHome` defaults to true, so this also holds during the
    //    brief cold-start window before evaluateHomeNetwork() confirms we're home.
    if (away) return remote;
    // 5. On a confirmed home network → local (or remote if no local configured).
    return local || remote;
  },

  resolveInstanceNetwork: (instanceId) => {
    const state = get();
    const active =
      state.dashboards.find((d) => d.id === state.activeDashboardId) ??
      state.dashboards[0];
    const activeVerdict: InstanceNetworkVerdict = {
      away: state.networkAwayFromHome,
      forcesRemote: workspaceForcesRemote(active, state.homeNetworks),
    };
    // Ownership is EXPLICIT attachment only. A dashboard that auto-attaches
    // (attachedInstances undefined, the pre-v20 / migrated default) shows every
    // instance but says nothing about which house an instance lives in, so it
    // must not override a dashboard that explicitly claims it: a long-time
    // upgrader's home dashboard is exactly such an auto-attach dashboard, and
    // the other house's instances still need to resolve remote there (#418).
    if (!active || dashboardExplicitlyAttaches(active, instanceId)) {
      return activeVerdict;
    }
    const owners = state.dashboards.filter(
      (d) => d.id !== active.id && dashboardExplicitlyAttaches(d, instanceId),
    );
    // No dashboard claims it explicitly (auto-attach everywhere, or an orphan):
    // the active verdict is the only context there is — unchanged behavior.
    if (owners.length === 0) return activeVerdict;
    const trusting = owners.filter(
      (d) => !workspaceForcesRemote(d, state.homeNetworks),
    );
    if (trusting.length === 0) return { away: true, forcesRemote: true };
    // Opt-in "VPN connected counts as home" (#185) is global, not per
    // dashboard — same precedence as evaluateHomeNetworkOnce.
    if (state.treatVpnAsHome && state.isVpnActive) {
      return { away: false, forcesRemote: false };
    }
    // Home for this instance iff the WiFi we're on is one of the networks an
    // owning dashboard trusts. `currentWifi` is null off WiFi / under a VPN /
    // before the first evaluation, which never matches → away → remote only.
    // Local is therefore still used ONLY on a confirmed home network, just the
    // right dashboard's notion of home.
    const home = trusting.some((d) =>
      matchesHomeNetwork(
        state.currentWifi,
        effectiveHomeNetworksOf(d, state.homeNetworks),
      ),
    );
    return { away: !home, forcesRemote: false };
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
    if (get().demoMode || pendingInstanceWrites > 0 || configImportInProgress) return;
    setBoolean(STORAGE_KEYS.demoMode, true);
    set((state) => ({
      demoMode: true,
      ...makeDemoConfig(state.dashboards, state.activeDashboardId),
    }));
    queryClient.clear();
  },

  disableDemoMode: async () => {
    deleteKey(STORAGE_KEYS.demoMode);
    queryClient.clear();
    await get().hydrate();
  },

  exportConfig: async (passphrase: string, onStage, onBeforeShare) => {
    if (get().demoMode) throw new Error("Turn off Demo Mode to export settings.");
    onStage?.("preparing");
    await yieldToPaint();
    if ((await requireDeviceAuth("Authenticate to export configuration")) === "cancelled") {
      return;
    }

    const payload = buildExportPayload();

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

    // Persist the user's "remember passphrase" choice now, while the app is
    // still fully foregrounded and we know the share is about to happen. The
    // Keychain write uses requireAuthentication, which fails during the
    // foreground-resume transition when it runs AFTER the share hands off to a
    // separate app like FileBrowser (#180). The file is already on disk, so the
    // export has materially succeeded. Best-effort — the caller handles errors
    // so a failed/declined remember-write cannot abort the share.
    await onBeforeShare?.();

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
      await get().importConfigFromEnvelope(raw, passphrase, onStage);
      return true;
    }

    await get().importConfigFromPayload(raw, onStage);
    return true;
  },

  importConfigFromEnvelope: async (envelope, passphrase, onStage) => {
    onStage?.("decrypting");
    await yieldToPaint();
    const decrypted = await decryptEnvelope(envelope, passphrase);
    let raw: unknown;
    try {
      raw = JSON.parse(decrypted);
    } catch {
      throw new Error("Decrypted content is not valid JSON");
    }
    await get().importConfigFromPayload(raw, onStage);
  },

  importConfigFromPayload: async (raw, onStage) => {
    if (get().demoMode) throw new Error("Turn off Demo Mode to import settings.");
    if (configImportInProgress || pendingInstanceWrites > 0) {
      throw new Error("Another settings change is in progress. Try again when it finishes.");
    }
    configImportInProgress = true;
    try {
      onStage?.("restoring");
      await yieldToPaint();
      await restoreConfig(validateExportPayload(migrateConfig(raw)));
    } finally {
      configImportInProgress = false;
    }
  },
}));

const INSTANCE_SECRET_FIELDS = ["apiKey", "username", "password", "customHeaders"] as const;

async function restoreConfig(payload: ExportPayload): Promise<void> {
  const previous = useConfigStore.getState();
  const previousIds = new Set(SERVICE_IDS.flatMap((kind) =>
    (previous.serviceInstances[kind] ?? []).map((instance) => instance.id),
  ));

  // Keep a blank entry for service kinds omitted from the backup.
  const serviceInstances = defaultInstances();
  const instanceSecrets = payload.secrets;
  const secretChanges: SecretChange[] = [];
  for (const kind of SERVICE_IDS) {
    const list = payload.services[kind];
    if (!list?.length) continue;
    serviceInstances[kind] = list;
    for (const { id } of list) {
      previousIds.delete(id);
      const secrets = instanceSecrets[id];
      for (const field of INSTANCE_SECRET_FIELDS) {
        const raw = secrets?.[field];
        const value = raw ? (typeof raw === "string" ? raw : JSON.stringify(raw)) : null;
        secretChanges.push([`${SECRET_PREFIX}.${id}.${field}`, value]);
      }
    }
  }

  // Source-device BSSIDs need to be re-confirmed on this device (#168).
  const homeNetworks = stripImportedBssids(payload.homeNetworks);
  const dashboards = repairOrphanedHomeNetworkSelection(payload.dashboards, homeNetworks);
  const activeDashboardId = payload.activeDashboardId;
  const notificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...payload.notificationSettings };
  const seerrStaleHosts: Record<string, string[]> = {};
  const next = {
    serviceInstances,
    instanceSecrets,
    ...recomputeDerivedFromActive(dashboards, activeDashboardId, serviceInstances, instanceSecrets),
    autoSwitchNetwork: payload.autoSwitchNetwork,
    treatVpnAsHome: payload.treatVpnAsHome ?? false,
    homeNetworks,
    servicesOrder: sanitizeServicesOrder(payload.servicesOrder),
    dashboards,
    activeDashboardId,
    // Confirm the network again before letting a service use its local URL.
    networkAwayFromHome: true,
    wolDevices: payload.wolDevices ?? [],
    shortcuts: payload.shortcuts ?? [],
    hapticsEnabled: payload.hapticsEnabled ?? true,
    globalCustomHeaders: payload.globalCustomHeaders ?? {},
    uiScale: payload.uiScale ?? DEFAULT_UI_SCALE,
    appTheme: payload.appTheme ?? DEFAULT_APP_THEME,
    weekStart: payload.weekStart ?? DEFAULT_WEEK_START,
    notificationSettings,
    seerrStaleHosts,
  };

  // Imported IDs may be reused with different credentials. Suspend new Seerr
  // logins until the old requests have drained and the new stale-host marks
  // are installed, so a late old response cannot overwrite the session cookie.
  const seerrIds = new Set([
    ...previous.serviceInstances.overseerr.map((instance) => instance.id),
    ...serviceInstances.overseerr.map((instance) => instance.id),
  ]);
  const seerrReleases = [...seerrIds].map(suspendSeerrLogins);
  try {
    for (const id of seerrIds) dropSeerrSession(id);
    await Promise.all([...seerrIds].map(drainSeerrLogins));
    for (const instance of serviceInstances.overseerr) {
      const hosts = [...new Set([instance.localUrl, instance.remoteUrl].map(seerrHostOf).filter(Boolean))];
      if (hosts.length > 0) seerrStaleHosts[instance.id] = hosts;
    }

    const backend = prepareBackendRestore(payload.backend);
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.autoSwitchNetwork]: next.autoSwitchNetwork,
      [STORAGE_KEYS.treatVpnAsHome]: next.treatVpnAsHome,
      [STORAGE_KEYS.homeNetworks]: homeNetworks,
      [STORAGE_KEYS.servicesOrder]: next.servicesOrder,
      [STORAGE_KEYS.dashboards]: dashboards,
      [STORAGE_KEYS.wolDevices]: next.wolDevices,
      [STORAGE_KEYS.shortcuts]: next.shortcuts,
      [STORAGE_KEYS.hapticsEnabled]: next.hapticsEnabled,
      [STORAGE_KEYS.globalCustomHeaders]: next.globalCustomHeaders,
      [STORAGE_KEYS.uiScale]: next.uiScale,
      [STORAGE_KEYS.notificationSettings]: notificationSettings,
      [STORAGE_KEYS.seerrStaleHosts]: seerrStaleHosts,
      [ACTIVE_INSTANCE_KEY]: null,
      [STORAGE_KEYS.dashboardWidgetsLegacy]: null,
      [STORAGE_KEYS.widgetSettingsLegacy]: null,
    };
    for (const kind of SERVICE_IDS) values[`${STORAGE_KEYS.services}.${kind}`] = serviceInstances[kind];
    const entries: [string, string][] = Object.entries(values).map(([key, value]) => [
      key, JSON.stringify(value),
    ]);
    entries.push(
      [STORAGE_KEYS.activeDashboardId, activeDashboardId],
      [STORAGE_KEYS.appTheme, next.appTheme],
      [STORAGE_KEYS.weekStart, next.weekStart],
    );
    if (backend.resetWebSlot) entries.push([STORAGE_KEYS.backendWebSlotAppliedRevision, ""]);

    await persistWithSecrets(
      [...secretChanges, ...backend.changes],
      () => persistMany(entries),
    );
    useConfigStore.setState(next);
    backend.apply();
  } finally {
    for (const release of seerrReleases) release();
  }

  // Superseded IDs have no references in the restored configuration. Delete
  // their credentials only after commit so a failed restore can still use them.
  const cleanup = await Promise.allSettled(
    [...previousIds].flatMap((id) => INSTANCE_SECRET_FIELDS.map(
      (field) => deleteSecret(`${SECRET_PREFIX}.${id}.${field}`),
    )),
  );
  if (cleanup.some((result) => result.status === "rejected")) {
    console.warn("Some credentials for removed service instances could not be cleared.");
  }
  // Instance IDs may survive a restore, so cached results may still use the
  // pre-restore credentials.
  queryClient.clear();
}

/**
 * The export payload as the file export writes it. Shared with the backend
 * backup upload (services/backend-backup.ts), which strips `backend` before
 * encrypting so a restored phone keeps its own pairing.
 */
export function buildExportPayload(): ExportPayload {
  if (useConfigStore.getState().demoMode) {
    throw new Error("Turn off Demo Mode to export settings.");
  }
  const {
    serviceInstances,
    instanceSecrets,
    autoSwitchNetwork,
    treatVpnAsHome,
    homeNetworks,
    servicesOrder,
    dashboards,
    activeDashboardId,
    wolDevices,
    shortcuts,
    hapticsEnabled,
    globalCustomHeaders,
    uiScale,
    appTheme,
    weekStart,
    notificationSettings: notifSettings,
  } = useConfigStore.getState();
  const { url, sharedSecret, deviceId, ignoreCertErrors } = useBackendStore.getState();

  return {
    version: CURRENT_CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    services: serviceInstances,
    secrets: instanceSecrets,
    // v22: activeInstance is now per-dashboard, serialized inside the
    // `dashboards` array — no top-level field.
    autoSwitchNetwork,
    treatVpnAsHome,
    homeNetworks,
    servicesOrder,
    dashboards,
    activeDashboardId,
    backend: { url, sharedSecret, deviceId, ignoreCertErrors },
    notificationSettings: notifSettings,
    wolDevices,
    shortcuts,
    hapticsEnabled,
    globalCustomHeaders,
    uiScale,
    appTheme,
    weekStart,
  };
}
