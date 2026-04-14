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
} from "@/store/storage";
import {
  SERVICE_IDS,
  SERVICE_DEFAULTS,
  STORAGE_KEYS,
  SECRET_PREFIX,
  DEFAULT_DASHBOARD_ORDER,
} from "@/lib/constants";
import { CURRENT_CONFIG_VERSION, migrateConfig } from "@/store/config-migrations";
import { useBackendStore } from "@/store/backend-store";
import { useNotificationStore } from "@/store/notifications-store";
import type { NotificationSettings } from "@/store/notifications-store";
import type { ServiceId, DashboardCardId } from "@/lib/constants";

export interface WakeOnLanConfig {
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
  dashboardOrder: DashboardCardId[];
  wakeOnLan: WakeOnLanConfig | null;
  hydrated: boolean;
}

export interface ExportPayload {
  version: number;
  exportedAt: string;
  services: Record<ServiceId, ServiceConfig>;
  secrets: Record<ServiceId, ServiceSecrets>;
  autoSwitchNetwork: boolean;
  homeSSID: string;
  dashboardOrder: DashboardCardId[];
  // v2
  backend?: { url: string | null; sharedSecret: string | null; deviceId: string | null };
  notificationSettings?: NotificationSettings;
  // v3
  wakeOnLan?: WakeOnLanConfig | null;
}

interface ConfigActions {
  hydrate: () => Promise<void>;
  updateService: (id: ServiceId, config: Partial<ServiceConfig>) => void;
  toggleService: (id: ServiceId) => void;
  updateSecrets: (id: ServiceId, secrets: Partial<ServiceSecrets>) => Promise<void>;
  setAutoSwitch: (enabled: boolean) => void;
  setHomeSSID: (ssid: string) => void;
  setDashboardOrder: (order: DashboardCardId[]) => void;
  setWakeOnLan: (config: WakeOnLanConfig | null) => void;
  getActiveUrl: (id: ServiceId) => string;
  exportConfig: () => Promise<void>;
  importConfig: () => Promise<boolean>;
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
  dashboardOrder: DEFAULT_DASHBOARD_ORDER,
  wakeOnLan: null,
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
    const storedOrder = getJSON<DashboardCardId[]>(STORAGE_KEYS.dashboardOrder);
    const dashboardOrder = storedOrder ?? DEFAULT_DASHBOARD_ORDER;
    const wakeOnLan = getJSON<WakeOnLanConfig>(STORAGE_KEYS.wakeOnLan) ?? null;

    set({ services, secrets, autoSwitchNetwork, homeSSID, dashboardOrder, wakeOnLan, hydrated: true });
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

  setDashboardOrder: (order) => {
    setJSON(STORAGE_KEYS.dashboardOrder, order);
    set({ dashboardOrder: order });
  },

  setWakeOnLan: (config) => {
    if (config) {
      setJSON(STORAGE_KEYS.wakeOnLan, config);
    } else {
      setJSON(STORAGE_KEYS.wakeOnLan, null);
    }
    set({ wakeOnLan: config });
  },

  getActiveUrl: (id) => {
    const service = get().services[id];
    return service.useRemote ? service.remoteUrl : service.localUrl;
  },

  exportConfig: async () => {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to export configuration",
      fallbackLabel: "Use passcode",
    });
    if (!auth.success) {
      throw new Error("Authentication required to export");
    }

    const { services, secrets, autoSwitchNetwork, homeSSID, dashboardOrder, wakeOnLan } = get();
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
      dashboardOrder,
      backend: { url, sharedSecret, deviceId },
      notificationSettings: notifSettings,
      wakeOnLan,
    };

    const file = new File(Paths.cache, "dashboarr-config.json");
    file.create({ overwrite: true });
    file.write(JSON.stringify(payload, null, 2));
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Export Dashboarr Config",
      UTI: "public.json",
    });
  },

  importConfig: async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return false;

    const pickedFile = new File(result.assets[0].uri);
    const content = await pickedFile.text();
    const raw = JSON.parse(content);
    const payload = migrateConfig(raw);

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
    if (payload.dashboardOrder) {
      setJSON(STORAGE_KEYS.dashboardOrder, payload.dashboardOrder);
    }
    setJSON(STORAGE_KEYS.wakeOnLan, payload.wakeOnLan ?? null);

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
      dashboardOrder: payload.dashboardOrder ?? DEFAULT_DASHBOARD_ORDER,
      wakeOnLan: payload.wakeOnLan ?? null,
    });

    return true;
  },
}));
