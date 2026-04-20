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
} from "@/lib/constants";
import { CURRENT_CONFIG_VERSION, migrateConfig } from "@/store/config-migrations";
import { validateExportPayload } from "@/store/config-schema";
import {
  decryptEnvelope,
  encryptJsonString,
  isEncryptedEnvelope,
} from "@/lib/config-crypto";
import { useBackendStore } from "@/store/backend-store";
import { useNotificationStore } from "@/store/notifications-store";
import type { NotificationSettings } from "@/store/notifications-store";
import type { ServiceId, WidgetId } from "@/lib/constants";

export interface WakeOnLanDevice {
  id: string;
  name: string;
  mac: string;
  broadcastAddress?: string;
  port?: number;
}

export interface ServiceConfig {
  enabled: boolean;
  name: string;
  localUrl: string;
  remoteUrl: string;
  useRemote: boolean;
}

export interface ServiceSecrets {
  apiKey?: string;
  username?: string;
  password?: string;
}

interface ConfigState {
  services: Record<ServiceId, ServiceConfig>;
  secrets: Record<ServiceId, ServiceSecrets>;
  autoSwitchNetwork: boolean;
  homeSSID: string;
  dashboardWidgets: WidgetId[];
  wolDevices: WakeOnLanDevice[];
  hydrated: boolean;
}

export interface ExportPayload {
  version: number;
  exportedAt: string;
  services: Record<ServiceId, ServiceConfig>;
  secrets: Record<ServiceId, ServiceSecrets>;
  autoSwitchNetwork: boolean;
  homeSSID: string;
  dashboardWidgets: WidgetId[];
  // v2
  backend?: { url: string | null; sharedSecret: string | null; deviceId: string | null };
  notificationSettings?: NotificationSettings;
  // v4
  wolDevices?: WakeOnLanDevice[];
}

export type ExportStage = "preparing" | "encrypting" | "finalizing";
export type ImportStage = "decrypting" | "restoring";

// Macrotask yield so React can paint the new stage before the next CPU-bound
// step hogs the JS thread (pbkdf2 in particular only yields microtasks).
const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

interface ConfigActions {
  hydrate: () => Promise<void>;
  updateService: (id: ServiceId, config: Partial<ServiceConfig>) => void;
  toggleService: (id: ServiceId) => void;
  updateSecrets: (id: ServiceId, secrets: Partial<ServiceSecrets>) => Promise<void>;
  setAutoSwitch: (enabled: boolean) => void;
  setHomeSSID: (ssid: string) => void;
  setDashboardWidgets: (widgets: WidgetId[]) => void;
  addWidget: (id: WidgetId) => void;
  removeWidget: (id: WidgetId) => void;
  moveWidget: (id: WidgetId, direction: "up" | "down") => void;
  setWolDevices: (devices: WakeOnLanDevice[]) => void;
  getActiveUrl: (id: ServiceId) => string;
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

function defaultServices(): Record<ServiceId, ServiceConfig> {
  const services = {} as Record<ServiceId, ServiceConfig>;
  for (const id of SERVICE_IDS) {
    services[id] = defaultServiceConfig(id);
  }
  return services;
}

function emptySecrets(): Record<ServiceId, ServiceSecrets> {
  const secrets = {} as Record<ServiceId, ServiceSecrets>;
  for (const id of SERVICE_IDS) {
    secrets[id] = {};
  }
  return secrets;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  services: defaultServices(),
  secrets: emptySecrets(),
  autoSwitchNetwork: false,
  homeSSID: "",
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
  wolDevices: [],
  hydrated: false,

  hydrate: async () => {
    // Populate in-memory cache from AsyncStorage
    await initStorage();

    // Load service configs
    const services = { ...defaultServices() };
    for (const id of SERVICE_IDS) {
      const stored = getJSON<ServiceConfig>(`${STORAGE_KEYS.services}.${id}`);
      if (stored) {
        services[id] = { ...defaultServiceConfig(id), ...stored };
      }
    }

    // Load secrets from SecureStore
    const secrets = { ...emptySecrets() };
    for (const id of SERVICE_IDS) {
      const apiKey = await getSecret(`${SECRET_PREFIX}.${id}.apiKey`);
      const username = await getSecret(`${SECRET_PREFIX}.${id}.username`);
      const password = await getSecret(`${SECRET_PREFIX}.${id}.password`);
      secrets[id] = {
        ...(apiKey ? { apiKey } : {}),
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
      };
    }

    const autoSwitchNetwork = getBoolean(STORAGE_KEYS.autoSwitchNetwork);
    const homeSSID = getString(STORAGE_KEYS.homeSSID) ?? "";

    // Prefer the new key. If absent, fall back to the legacy dashboardOrder key
    // (one-time local migration for users upgrading from pre-widget builds).
    let dashboardWidgets = getJSON<WidgetId[]>(STORAGE_KEYS.dashboardWidgets);
    if (!dashboardWidgets) {
      const legacy = getJSON<WidgetId[]>(STORAGE_KEYS.dashboardOrderLegacy);
      if (legacy && legacy.length > 0) {
        dashboardWidgets = legacy;
        setJSON(STORAGE_KEYS.dashboardWidgets, legacy);
        deleteKey(STORAGE_KEYS.dashboardOrderLegacy);
      } else {
        dashboardWidgets = DEFAULT_DASHBOARD_WIDGETS;
      }
    }

    const wolDevices = getJSON<WakeOnLanDevice[]>(STORAGE_KEYS.wolDevices) ?? [];

    set({ services, secrets, autoSwitchNetwork, homeSSID, dashboardWidgets, wolDevices, hydrated: true });
  },

  updateService: (id, config) => {
    set((state) => {
      const updated = { ...state.services[id], ...config };
      const services = { ...state.services, [id]: updated };
      setJSON(`${STORAGE_KEYS.services}.${id}`, updated);
      return { services };
    });
  },

  toggleService: (id) => {
    const current = get().services[id];
    get().updateService(id, { enabled: !current.enabled });
  },

  updateSecrets: async (id, newSecrets) => {
    for (const [key, value] of Object.entries(newSecrets)) {
      if (value) {
        await setSecret(`${SECRET_PREFIX}.${id}.${key}`, value);
      } else {
        await deleteSecret(`${SECRET_PREFIX}.${id}.${key}`);
      }
    }
    set((state) => {
      const updated = { ...state.secrets[id], ...newSecrets };
      return { secrets: { ...state.secrets, [id]: updated } };
    });
  },

  setAutoSwitch: (enabled) => {
    setBoolean(STORAGE_KEYS.autoSwitchNetwork, enabled);
    set({ autoSwitchNetwork: enabled });
  },

  setHomeSSID: (ssid) => {
    setString(STORAGE_KEYS.homeSSID, ssid);
    set({ homeSSID: ssid });
  },

  setDashboardWidgets: (widgets) => {
    setJSON(STORAGE_KEYS.dashboardWidgets, widgets);
    set({ dashboardWidgets: widgets });
  },

  addWidget: (id) => {
    const { dashboardWidgets } = get();
    if (dashboardWidgets.includes(id)) return;
    const next = [...dashboardWidgets, id];
    setJSON(STORAGE_KEYS.dashboardWidgets, next);
    set({ dashboardWidgets: next });
  },

  removeWidget: (id) => {
    const { dashboardWidgets } = get();
    if (!dashboardWidgets.includes(id)) return;
    const next = dashboardWidgets.filter((w) => w !== id);
    setJSON(STORAGE_KEYS.dashboardWidgets, next);
    set({ dashboardWidgets: next });
  },

  moveWidget: (id, direction) => {
    const { dashboardWidgets } = get();
    const index = dashboardWidgets.indexOf(id);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= dashboardWidgets.length) return;
    const next = [...dashboardWidgets];
    [next[index], next[target]] = [next[target], next[index]];
    setJSON(STORAGE_KEYS.dashboardWidgets, next);
    set({ dashboardWidgets: next });
  },

  setWolDevices: (devices) => {
    setJSON(STORAGE_KEYS.wolDevices, devices);
    set({ wolDevices: devices });
  },

  getActiveUrl: (id) => {
    const service = get().services[id];
    return service.useRemote ? service.remoteUrl : service.localUrl;
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

    const { services, secrets, autoSwitchNetwork, homeSSID, dashboardWidgets, wolDevices } = get();
    const { url, sharedSecret, deviceId } = useBackendStore.getState();
    const { hydrated: _nh, hydrate: _nhyd, setSetting: _ns, ...notifSettings } =
      useNotificationStore.getState();

    const payload: ExportPayload = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      services,
      secrets,
      autoSwitchNetwork,
      homeSSID,
      dashboardWidgets,
      backend: { url, sharedSecret, deviceId },
      notificationSettings: notifSettings,
      wolDevices,
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
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
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

    // Merge imported services over defaults so missing services get defaults
    const mergedServices = defaultServices();
    for (const id of SERVICE_IDS) {
      if (payload.services[id]) {
        mergedServices[id] = { ...defaultServiceConfig(id), ...payload.services[id] };
        setJSON(`${STORAGE_KEYS.services}.${id}`, mergedServices[id]);
      }
    }

    // Restore secrets
    const mergedSecrets = emptySecrets();
    for (const id of SERVICE_IDS) {
      const s = payload.secrets?.[id];
      if (!s) continue;
      mergedSecrets[id] = s;
      if (s.apiKey) await setSecret(`${SECRET_PREFIX}.${id}.apiKey`, s.apiKey);
      if (s.username) await setSecret(`${SECRET_PREFIX}.${id}.username`, s.username);
      if (s.password) await setSecret(`${SECRET_PREFIX}.${id}.password`, s.password);
    }

    // Restore app settings
    setBoolean(STORAGE_KEYS.autoSwitchNetwork, payload.autoSwitchNetwork ?? false);
    setString(STORAGE_KEYS.homeSSID, payload.homeSSID ?? "");
    if (payload.dashboardWidgets) {
      setJSON(STORAGE_KEYS.dashboardWidgets, payload.dashboardWidgets);
    }
    setJSON(STORAGE_KEYS.wolDevices, payload.wolDevices ?? []);

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

    // Reload everything into the store
    set({
      services: mergedServices,
      secrets: mergedSecrets,
      autoSwitchNetwork: payload.autoSwitchNetwork ?? false,
      homeSSID: payload.homeSSID ?? "",
      dashboardWidgets: payload.dashboardWidgets ?? DEFAULT_DASHBOARD_WIDGETS,
      wolDevices: payload.wolDevices ?? [],
    });

    return true;
  },
}));
