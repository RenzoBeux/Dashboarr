import { create } from "zustand";
import {
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
} from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

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
  hydrated: boolean;
}

interface ConfigActions {
  hydrate: () => Promise<void>;
  updateService: (id: ServiceId, config: Partial<ServiceConfig>) => void;
  toggleService: (id: ServiceId) => void;
  updateSecrets: (id: ServiceId, secrets: Partial<ServiceSecrets>) => Promise<void>;
  setAutoSwitch: (enabled: boolean) => void;
  setHomeSSID: (ssid: string) => void;
  getActiveUrl: (id: ServiceId) => string;
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
  hydrated: false,

  hydrate: async () => {
    // Load service configs from MMKV
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

    set({ services, secrets, autoSwitchNetwork, homeSSID, hydrated: true });
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

  getActiveUrl: (id) => {
    const service = get().services[id];
    return service.useRemote ? service.remoteUrl : service.localUrl;
  },
}));
