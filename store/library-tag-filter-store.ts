import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.libraryTagFilters";

// Tag filters for the Radarr/Sonarr/Lidarr poster grids (issue #343).
//
// Persisted, unlike the monitored/status filters that sit in useState: a tag
// filter is a durable "this is how I browse my library" preference rather than
// a per-visit one, which is what the issue asks for.
//
// Keyed per `${service}:${instanceId}`, exactly like releases-filter-store's
// savedFilters and for the same reason: *arr tag ids are per-instance
// auto-increment integers, so Radarr's #3 is an unrelated tag to Sonarr's #3
// (and to a second Radarr's #3). One global list would filter the wrong things
// the moment the user switches instances. Ids are re-resolved against the
// freshly-fetched tag list at render (see lib/library-tags.ts resolveTagIds),
// so a tag deleted upstream just drops out instead of emptying the grid.
interface LibraryTagFilterPrefs {
  /**
   * Selected tag ids per `${service}:${instanceId}` key, stored ascending. A
   * missing key means no tag filter for that instance — the overwhelmingly
   * common case, so the map stays tiny.
   */
  tagFilters: Record<string, number[]>;
}

export const LIBRARY_TAG_FILTER_DEFAULTS: LibraryTagFilterPrefs = {
  tagFilters: {},
};

interface LibraryTagFilterStore extends LibraryTagFilterPrefs {
  hydrate: () => void;
  /**
   * Replace one instance's selection. An empty array deletes the key, so the
   * persisted map never accumulates `{"radarr:uuid": []}` tombstones.
   */
  setTags: (key: string, ids: number[]) => void;
  /**
   * Toggle one id against `base` — the caller's already-resolved selection, so
   * ids whose tag was deleted upstream get pruned on the next interaction
   * rather than by a background write (which would wipe a real selection
   * whenever the instance was briefly unreachable).
   */
  toggleTag: (key: string, id: number, base: number[]) => void;
}

function snapshot(state: LibraryTagFilterPrefs): LibraryTagFilterPrefs {
  return { tagFilters: state.tagFilters };
}

export const useLibraryTagFilterStore = create<LibraryTagFilterStore>(
  (set, get) => ({
    ...LIBRARY_TAG_FILTER_DEFAULTS,

    // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
    // be called after that; safe to call multiple times.
    hydrate: () => {
      const stored = getJSON<Partial<LibraryTagFilterPrefs>>(STORAGE_KEY);
      if (stored) set({ ...LIBRARY_TAG_FILTER_DEFAULTS, ...stored });
    },

    setTags: (key, ids) => {
      const tagFilters = { ...get().tagFilters };
      // Sorted, so the persisted blob is canonical regardless of the order the
      // user tapped the rows.
      if (ids.length === 0) delete tagFilters[key];
      else tagFilters[key] = [...ids].sort((a, b) => a - b);
      set({ tagFilters });
      setJSON(STORAGE_KEY, snapshot({ ...get(), tagFilters }));
    },

    toggleTag: (key, id, base) => {
      const next = base.includes(id)
        ? base.filter((x) => x !== id)
        : [...base, id];
      get().setTags(key, next);
    },
  }),
);
