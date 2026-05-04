import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.sortPreferences";

export type MoviesSortKey =
  | "added-desc"
  | "title-asc"
  | "title-desc"
  | "year-desc"
  | "year-asc"
  | "size-desc";

export type SeriesSortKey = MoviesSortKey;

export type PlexRecentSortKey =
  | "added-desc"
  | "title-asc"
  | "title-desc"
  | "year-desc"
  | "year-asc";

export type RequestsSortKey =
  | "created-desc"
  | "created-asc"
  | "updated-desc"
  | "updated-asc";

export type DownloadsSortKey =
  | "progress-desc"
  | "progress-asc"
  | "name-asc"
  | "size-desc"
  | "added-desc";

interface SortPreferences {
  movies: MoviesSortKey;
  series: SeriesSortKey;
  plexRecent: PlexRecentSortKey;
  requests: RequestsSortKey;
  downloads: DownloadsSortKey;
}

export const SORT_DEFAULTS: SortPreferences = {
  movies: "added-desc",
  series: "added-desc",
  plexRecent: "added-desc",
  requests: "created-desc",
  downloads: "progress-desc",
};

interface SortStore extends SortPreferences {
  hydrate: () => void;
  setMovies: (v: MoviesSortKey) => void;
  setSeries: (v: SeriesSortKey) => void;
  setPlexRecent: (v: PlexRecentSortKey) => void;
  setRequests: (v: RequestsSortKey) => void;
  setDownloads: (v: DownloadsSortKey) => void;
}

function snapshot(state: SortPreferences): SortPreferences {
  return {
    movies: state.movies,
    series: state.series,
    plexRecent: state.plexRecent,
    requests: state.requests,
    downloads: state.downloads,
  };
}

export const useSortStore = create<SortStore>((set, get) => ({
  ...SORT_DEFAULTS,

  // Read persisted prefs from the storage cache. Must be called after
  // initStorage() (i.e., after useConfigStore.hydrate()). Safe to call
  // multiple times.
  hydrate: () => {
    const stored = getJSON<Partial<SortPreferences>>(STORAGE_KEY);
    if (stored) set({ ...SORT_DEFAULTS, ...stored });
  },

  setMovies: (movies) => {
    set({ movies });
    setJSON(STORAGE_KEY, snapshot({ ...get(), movies }));
  },
  setSeries: (series) => {
    set({ series });
    setJSON(STORAGE_KEY, snapshot({ ...get(), series }));
  },
  setPlexRecent: (plexRecent) => {
    set({ plexRecent });
    setJSON(STORAGE_KEY, snapshot({ ...get(), plexRecent }));
  },
  setRequests: (requests) => {
    set({ requests });
    setJSON(STORAGE_KEY, snapshot({ ...get(), requests }));
  },
  setDownloads: (downloads) => {
    set({ downloads });
    setJSON(STORAGE_KEY, snapshot({ ...get(), downloads }));
  },
}));
