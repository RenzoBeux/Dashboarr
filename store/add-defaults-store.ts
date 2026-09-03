import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.lastUsedAdd";

// The add sheet (components/common/add-media-sheet.tsx) resets its Quality
// Profile, Root Folder, Tags and "Start Search on Add" every time it opens, so
// anyone who adds with the same choices re-picks them every time (#341). This
// remembers the last config used to add, per instance, and preselects it next
// time, the way Radarr's own web UI defaults its add dialog to your last
// configuration.
//
// Kept out of the exported config: it is a local convenience, not settings
// worth backing up. Keyed per `${serviceId}:${instanceId}` (like
// releases-filter-store's saved filters) because a profile id or a root-folder
// path is per-instance (Radarr #3 is not Sonarr #3).

export interface LastUsedAdd {
  qualityProfileId?: number;
  rootFolderPath?: string;
  tags?: number[];
  searchOnAdd?: boolean;
}

interface AddDefaultsStore {
  lastUsed: Record<string, LastUsedAdd>;
  hydrate: () => void;
  /** Remember the config just used to add for one `${serviceId}:${instanceId}` key. */
  remember: (key: string, config: LastUsedAdd) => void;
}

/** Cache key for one service instance's last-used add config. */
export function addDefaultsKey(serviceId: string, instanceId: string): string {
  return `${serviceId}:${instanceId}`;
}

export const useAddDefaultsStore = create<AddDefaultsStore>((set, get) => ({
  lastUsed: {},

  // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
  // be called after that; safe to call multiple times.
  hydrate: () => {
    const stored = getJSON<Record<string, LastUsedAdd>>(STORAGE_KEY);
    if (stored) set({ lastUsed: stored });
  },

  remember: (key, config) => {
    const lastUsed = { ...get().lastUsed, [key]: config };
    set({ lastUsed });
    setJSON(STORAGE_KEY, lastUsed);
  },
}));
