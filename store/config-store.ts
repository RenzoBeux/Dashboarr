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
import {
  CURRENT_CONFIG_VERSION,
  migrateConfig,
  migrateSlotSettingsBindings,
} from "@/store/config-migrations";
import { validateExportPayload } from "@/store/config-schema";
import {
  decryptEnvelope,
  encryptJsonString,
  isEncryptedEnvelope,
} from "@/lib/config-crypto";
import { useBackendStore } from "@/store/backend-store";
import { useNotificationStore } from "@/store/notifications-store";
import { queryClient } from "@/lib/query-client";
import type { NotificationSettings } from "@/store/notifications-store";
import type { ServiceId, WidgetId } from "@/lib/constants";
import { normalizeBssid } from "@/lib/wifi";
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
export interface Dashboard {
  id: string;
  name: string;
  widgets: WidgetSlot[];
}

// Legacy widget-settings shape carried by v13 exports. v13→v14 migration folds
// these into per-slot settings on the auto-built Default dashboard. We still
// export the type so the v14 export migration can reference it.
export type WidgetSettingsMap = Partial<Record<WidgetId, Record<string, unknown>>>;

interface ConfigState {
  // Authoritative multi-instance state (v13+). One array of ServiceInstance
  // entries per kind; each carries its own UUID, URLs, and enabled flag.
  serviceInstances: Record<ServiceId, ServiceInstance[]>;
  // Secrets keyed by instance UUID, not ServiceId. One row per ServiceInstance.id.
  instanceSecrets: Record<string, ServiceSecrets>;
  // Currently-selected instance per service kind. Persisted across restarts so
  // the per-service tab remembers the user's pick. Null means no instances
  // configured.
  activeInstance: Record<ServiceId, string | null>;

  // Legacy single-instance views of the active instance, keyed by ServiceId.
  // Computed from serviceInstances + instanceSecrets + activeInstance after
  // every mutation so existing consumers that read state.services[id] /
  // state.secrets[id] keep working until they're migrated to be instance-aware
  // in later steps.
  services: Record<ServiceId, ServiceConfig>;
  secrets: Record<ServiceId, ServiceSecrets>;

  autoSwitchNetwork: boolean;
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
}

export interface ExportPayload {
  version: number;
  exportedAt: string;
  // v13: array of ServiceInstance per kind, each carrying a UUID id.
  services: Record<ServiceId, ServiceInstance[]>;
  // v13: keyed by instance UUID, not ServiceId.
  secrets: Record<string, ServiceSecrets>;
  // v13: currently-active instance UUID per kind.
  activeInstance: Record<ServiceId, string | null>;
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
    const activeId = activeInstance[id] ?? list[0]?.id ?? null;
    const inst = activeId ? list.find((i) => i.id === activeId) : list[0];
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
    const activeId = activeInstance[id] ?? list[0]?.id ?? null;
    if (activeId && instanceSecrets[activeId]) {
      out[id] = instanceSecrets[activeId];
    }
  }
  return out;
}

// Build the auto-created Default dashboard for a fresh install. Each entry in
// DEFAULT_DASHBOARD_WIDGETS becomes a slot with a generated UUID and no
// per-slot settings (widgets fall back to their registry-declared defaults).
function defaultDashboards(): Dashboard[] {
  return [
    {
      id: generateInstanceId(),
      name: DEFAULT_DASHBOARD_NAME,
      widgets: DEFAULT_DASHBOARD_WIDGETS.map((widgetId) => ({
        id: generateInstanceId(),
        widgetId,
      })),
    },
  ];
}

// Convert a flat legacy widget id list + per-WidgetId settings map into a
// single Dashboard with one slot per widget. Used by both hydrate and the
// v13→v14 export migration so the two paths produce identical shapes.
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
        // rename in here so users coming from v13 land on the new shape in a
        // single hydrate pass.
        slot.settings = migrateSlotSettingsBindings({ ...settings });
      }
      return slot;
    }),
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

    // Active instance per kind: prefer stored value, fall back to the first
    // instance for that kind (matches the v12 single-instance behavior).
    const storedActive = getJSON<Record<string, unknown>>(ACTIVE_INSTANCE_KEY) ?? {};
    const activeInstance = {} as Record<ServiceId, string | null>;
    let activeChanged = false;
    for (const id of SERVICE_IDS) {
      const raw = storedActive[id];
      const list = instances[id];
      if (typeof raw === "string" && list.some((i) => i.id === raw)) {
        activeInstance[id] = raw;
      } else {
        activeInstance[id] = list[0]?.id ?? null;
        activeChanged = true;
      }
    }
    if (activeChanged) {
      setJSON(ACTIVE_INSTANCE_KEY, activeInstance);
    }

    const autoSwitchNetwork = getBoolean(STORAGE_KEYS.autoSwitchNetwork);

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
              // Apply the v14→v15 binding-field rename to locally-persisted
              // dashboards too — without this, an upgrading user's stored
              // `instanceId` keys would never get rewritten unless they
              // re-imported their config.
              const migrated = migrateSlotSettingsBindings(
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
          dashboards.push({ id: d.id, name: d.name, widgets });
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
        activeInstance[id] = demoInst.id;
      }
    }

    const secrets = deriveLegacySecrets(instances, instanceSecrets, activeInstance);
    const services = deriveLegacyServices(instances, activeInstance);

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
      hydrated: true,
    });
  },

  // --- Multi-instance actions ---

  addInstance: (id, init) => {
    const inst = makeInstance(id, init);
    set((state) => {
      const list = [...(state.serviceInstances[id] ?? []), inst];
      const serviceInstances = { ...state.serviceInstances, [id]: list };
      // First instance for this kind also becomes the active selection.
      const nextActive = state.activeInstance[id] ?? inst.id;
      const activeInstance = { ...state.activeInstance, [id]: nextActive };
      setJSON(`${STORAGE_KEYS.services}.${id}`, list);
      if (nextActive !== state.activeInstance[id]) {
        setJSON(ACTIVE_INSTANCE_KEY, activeInstance);
      }
      const services = deriveLegacyServices(serviceInstances, activeInstance);
      const secrets = deriveLegacySecrets(
        serviceInstances,
        state.instanceSecrets,
        activeInstance,
      );
      return { serviceInstances, activeInstance, services, secrets };
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
      const activeInstance = { ...state.activeInstance };
      if (activeInstance[id] === instanceId) {
        activeInstance[id] = list[0]?.id ?? null;
      }
      setJSON(`${STORAGE_KEYS.services}.${id}`, list);
      setJSON(ACTIVE_INSTANCE_KEY, activeInstance);
      const services = deriveLegacyServices(serviceInstances, activeInstance);
      const secrets = deriveLegacySecrets(
        serviceInstances,
        instanceSecrets,
        activeInstance,
      );
      return { serviceInstances, instanceSecrets, activeInstance, services, secrets };
    });
  },

  updateInstance: (id, instanceId, patch) => {
    set((state) => {
      const list = state.serviceInstances[id] ?? [];
      const idx = list.findIndex((i) => i.id === instanceId);
      if (idx === -1) return state;
      const next = [...list];
      next[idx] = { ...next[idx], ...patch, id: next[idx].id };
      const serviceInstances = { ...state.serviceInstances, [id]: next };
      setJSON(`${STORAGE_KEYS.services}.${id}`, next);
      const services = deriveLegacyServices(serviceInstances, state.activeInstance);
      const secrets = deriveLegacySecrets(
        serviceInstances,
        state.instanceSecrets,
        state.activeInstance,
      );
      return { serviceInstances, services, secrets };
    });
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
    set((state) => {
      const list = state.serviceInstances[id] ?? [];
      // Reject ids that don't refer to an existing instance — keeps state
      // consistent if a stale UUID slips through (e.g. from a prop).
      if (instanceId !== null && !list.some((i) => i.id === instanceId)) {
        return state;
      }
      const activeInstance = { ...state.activeInstance, [id]: instanceId };
      setJSON(ACTIVE_INSTANCE_KEY, activeInstance);
      const services = deriveLegacyServices(state.serviceInstances, activeInstance);
      const secrets = deriveLegacySecrets(
        state.serviceInstances,
        state.instanceSecrets,
        activeInstance,
      );
      return { activeInstance, services, secrets };
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
    const dashboard: Dashboard = {
      id: generateInstanceId(),
      name: name.trim() || DEFAULT_DASHBOARD_NAME,
      widgets: [],
    };
    set((state) => {
      const dashboards = [...state.dashboards, dashboard];
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards };
    });
    return dashboard;
  },

  removeDashboard: (dashboardId) => {
    set((state) => {
      // Refuse to delete the last dashboard — the screen always needs one.
      if (state.dashboards.length <= 1) return state;
      const dashboards = state.dashboards.filter((d) => d.id !== dashboardId);
      if (dashboards.length === state.dashboards.length) return state;
      let activeDashboardId = state.activeDashboardId;
      if (activeDashboardId === dashboardId) {
        activeDashboardId = dashboards[0].id;
        setString(STORAGE_KEYS.activeDashboardId, activeDashboardId);
      }
      setJSON(STORAGE_KEYS.dashboards, dashboards);
      return { dashboards, activeDashboardId };
    });
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
    set((state) => {
      if (!state.dashboards.some((d) => d.id === dashboardId)) return state;
      setString(STORAGE_KEYS.activeDashboardId, dashboardId);
      return { activeDashboardId: dashboardId };
    });
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

  // --- Lookup helpers ---

  getInstance: (id, instanceId) => {
    return get().serviceInstances[id]?.find((i) => i.id === instanceId);
  },

  getActiveInstanceId: (id) => {
    const state = get();
    return state.activeInstance[id] ?? state.serviceInstances[id]?.[0]?.id ?? null;
  },

  getEnabledInstances: (id) => {
    return (get().serviceInstances[id] ?? []).filter((i) => i.enabled);
  },

  getMergedHeaders: (id, instanceId) => {
    const state = get();
    const targetId =
      instanceId ?? state.activeInstance[id] ?? state.serviceInstances[id]?.[0]?.id;
    const perInstance = targetId
      ? state.instanceSecrets[targetId]?.customHeaders
      : undefined;
    return { ...state.globalCustomHeaders, ...(perInstance ?? {}) };
  },

  getActiveUrl: (id, instanceId) => {
    const state = get();
    const list = state.serviceInstances[id] ?? [];
    const targetId = instanceId ?? state.activeInstance[id] ?? list[0]?.id;
    const inst = list.find((i) => i.id === targetId);
    if (!inst) return "";
    return inst.useRemote ? inst.remoteUrl : inst.localUrl;
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
    const demoActive = {} as Record<ServiceId, string | null>;
    for (const id of SERVICE_IDS) {
      const inst: ServiceInstance = {
        id: generateInstanceId(),
        ...defaultServiceConfig(id),
        enabled: true,
        localUrl: "http://demo.local",
        remoteUrl: "",
      };
      demoInstances[id] = [inst];
      demoActive[id] = inst.id;
    }
    const secrets = deriveLegacySecrets(demoInstances, {}, demoActive);
    const services = deriveLegacyServices(demoInstances, demoActive);
    set({
      demoMode: true,
      serviceInstances: demoInstances,
      instanceSecrets: {},
      activeInstance: demoActive,
      services,
      secrets,
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
      activeInstance,
      autoSwitchNetwork,
      homeNetworks,
      servicesOrder,
      dashboards,
      activeDashboardId,
      wolDevices,
      hapticsEnabled,
      globalCustomHeaders,
      uiScale,
    } = get();
    const { url, sharedSecret, deviceId } = useBackendStore.getState();
    const { hydrated: _nh, hydrate: _nhyd, setSetting: _ns, ...notifSettings } =
      useNotificationStore.getState();

    const payload: ExportPayload = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      services: serviceInstances,
      secrets: instanceSecrets,
      activeInstance,
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

    // Restore active instance per kind, validating every UUID still exists in
    // the merged services list.
    const mergedActiveInstance = {} as Record<ServiceId, string | null>;
    for (const id of SERVICE_IDS) {
      const list = mergedInstances[id];
      const stored = payload.activeInstance?.[id] ?? null;
      if (typeof stored === "string" && list.some((i) => i.id === stored)) {
        mergedActiveInstance[id] = stored;
      } else {
        mergedActiveInstance[id] = list[0]?.id ?? null;
      }
    }
    setJSON(ACTIVE_INSTANCE_KEY, mergedActiveInstance);

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

    // Restore notification settings (v2+)
    if (payload.notificationSettings) {
      setJSON(STORAGE_KEYS.notificationSettings, payload.notificationSettings);
      useNotificationStore.getState().hydrate();
    }

    const derivedSecrets = deriveLegacySecrets(
      mergedInstances,
      mergedSecrets,
      mergedActiveInstance,
    );
    const derivedServices = deriveLegacyServices(mergedInstances, mergedActiveInstance);

    // Reload everything into the store
    set({
      serviceInstances: mergedInstances,
      instanceSecrets: mergedSecrets,
      activeInstance: mergedActiveInstance,
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
    });

    return true;
  },
}));
