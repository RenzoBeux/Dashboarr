import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.releaseFilters";

// Quick interactive-search release filters. Persisted so they survive the
// picker remounting on every new search (issue #198) — the sort key already
// persists via sort-store, which is why sort stuck but these didn't. Shared
// across Radarr and Sonarr (one global blob), matching how the `releases`
// sort key is already shared.
//
// Notably NOT persisted: the saved *arr custom filter selection. Its id is a
// per-instance auto-increment integer (Radarr #3 ≠ Sonarr #3), so a global id
// would risk applying the wrong server-side filter; it stays per-search.
export type ProtocolFilter = "all" | "torrent" | "usenet";

interface ReleaseFilterPrefs {
  /** Hide rejected releases ("Accepted only"). */
  hideRejected: boolean;
  protocol: ProtocolFilter;
  /** Quality NAME (e.g. "WEBDL-1080p"), not an id — names are stable across
   *  searches, unlike *arr filter ids. null = all qualities. */
  quality: string | null;
}

export const RELEASE_FILTER_DEFAULTS: ReleaseFilterPrefs = {
  hideRejected: true,
  protocol: "all",
  quality: null,
};

interface ReleaseFilterStore extends ReleaseFilterPrefs {
  hydrate: () => void;
  setHideRejected: (v: boolean) => void;
  setProtocol: (v: ProtocolFilter) => void;
  setQuality: (v: string | null) => void;
  /** Reset every filter to its default (the "Clear filters" path). */
  reset: () => void;
}

function snapshot(state: ReleaseFilterPrefs): ReleaseFilterPrefs {
  return {
    hideRejected: state.hideRejected,
    protocol: state.protocol,
    quality: state.quality,
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
  reset: () => {
    set(RELEASE_FILTER_DEFAULTS);
    setJSON(STORAGE_KEY, snapshot(RELEASE_FILTER_DEFAULTS));
  },
}));
