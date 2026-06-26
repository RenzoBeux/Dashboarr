import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.releaseFilters";

// Quick interactive-search release filters. Persisted so they survive the
// picker remounting on every new search (issue #198) — the sort key already
// persists via sort-store, which is why sort stuck but these didn't. The
// hideRejected/protocol/quality prefs are shared across Radarr and Sonarr (one
// global blob), matching how the `releases` sort key is already shared.
//
// The saved *arr custom-filter selection is ALSO persisted (#198) — it was the
// last thing still resetting every search. Its id is a per-instance
// auto-increment integer (Radarr #3 ≠ Sonarr #3), so it's keyed per
// `${service}:${instanceId}` rather than stored as one global id; the picker
// re-resolves the id against the freshly-fetched filter list, so a filter
// deleted in *arr just clears instead of pointing at the wrong one.
export type ProtocolFilter = "all" | "torrent" | "usenet";

interface ReleaseFilterPrefs {
  /** Hide rejected releases ("Accepted only"). */
  hideRejected: boolean;
  protocol: ProtocolFilter;
  /** Quality NAME (e.g. "WEBDL-1080p"), not an id — names are stable across
   *  searches, unlike *arr filter ids. null = all qualities. */
  quality: string | null;
  /** Selected saved *arr custom-filter id per `${service}:${instanceId}` key.
   *  A missing key = no saved filter selected for that instance. */
  savedFilters: Record<string, number>;
}

export const RELEASE_FILTER_DEFAULTS: ReleaseFilterPrefs = {
  hideRejected: true,
  protocol: "all",
  quality: null,
  savedFilters: {},
};

interface ReleaseFilterStore extends ReleaseFilterPrefs {
  hydrate: () => void;
  setHideRejected: (v: boolean) => void;
  setProtocol: (v: ProtocolFilter) => void;
  setQuality: (v: string | null) => void;
  /** Select (or clear, with null) the saved *arr filter for one instance key. */
  setSavedFilter: (key: string, id: number | null) => void;
  /** Reset the quick filters to their defaults (the "Clear filters" path).
   *  Leaves saved-filter selections alone — the picker clears the current
   *  instance's selection separately, so other instances keep theirs. */
  reset: () => void;
}

function snapshot(state: ReleaseFilterPrefs): ReleaseFilterPrefs {
  return {
    hideRejected: state.hideRejected,
    protocol: state.protocol,
    quality: state.quality,
    savedFilters: state.savedFilters,
  };
}

export const useReleaseFilterStore = create<ReleaseFilterStore>((set, get) => ({
  ...RELEASE_FILTER_DEFAULTS,

  // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
  // be called after that; safe to call multiple times.
  hydrate: () => {
    const stored = getJSON<Partial<ReleaseFilterPrefs>>(STORAGE_KEY);
    if (stored) set({ ...RELEASE_FILTER_DEFAULTS, ...stored });
  },

  setHideRejected: (hideRejected) => {
    set({ hideRejected });
    setJSON(STORAGE_KEY, snapshot({ ...get(), hideRejected }));
  },
  setProtocol: (protocol) => {
    set({ protocol });
    setJSON(STORAGE_KEY, snapshot({ ...get(), protocol }));
  },
  setQuality: (quality) => {
    set({ quality });
    setJSON(STORAGE_KEY, snapshot({ ...get(), quality }));
  },
  setSavedFilter: (key, id) => {
    const savedFilters = { ...get().savedFilters };
    if (id === null) delete savedFilters[key];
    else savedFilters[key] = id;
    set({ savedFilters });
    setJSON(STORAGE_KEY, snapshot({ ...get(), savedFilters }));
  },
  reset: () => {
    // Preserve saved-filter selections — "Clear filters" only resets the quick
    // chips; the picker clears the current instance's saved filter on its own.
    const next = { ...RELEASE_FILTER_DEFAULTS, savedFilters: get().savedFilters };
    set(next);
    setJSON(STORAGE_KEY, snapshot(next));
  },
}));
