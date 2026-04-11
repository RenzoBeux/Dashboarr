import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";
import { STORAGE_KEYS } from "@/lib/constants";

export interface NotificationSettings {
  enabled: boolean;
  torrentCompleted: boolean;
  radarrDownloaded: boolean;
  sonarrDownloaded: boolean;
  serviceOffline: boolean;
  overseerrNewRequest: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  torrentCompleted: true,
  radarrDownloaded: true,
  sonarrDownloaded: true,
  serviceOffline: true,
  overseerrNewRequest: true,
};

interface NotificationStore extends NotificationSettings {
  hydrated: boolean;
  hydrate: () => void;
  setSetting: <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
  ) => void;
}

function persist(state: NotificationSettings) {
  setJSON(STORAGE_KEYS.notificationSettings, state);
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: () => {
    const stored = getJSON<NotificationSettings>(STORAGE_KEYS.notificationSettings);
    set({ ...DEFAULT_SETTINGS, ...(stored ?? {}), hydrated: true });
  },

  setSetting: (key, value) => {
    set({ [key]: value } as Partial<NotificationStore>);
    const { hydrated, hydrate, setSetting, ...settings } = get();
    persist({ ...settings, [key]: value });
  },
}));
