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

// Jellyfin's "Recently Added" tab sorts on the same axes as Plex's, so reuse
// the type instead of forking a parallel one.
export type JellyfinRecentSortKey = PlexRecentSortKey;

// Overseerr's API only sorts DESC — asc options would be a lie. See
// services/overseerr-api.ts:getRequests for context.
export type RequestsSortKey = "created-desc" | "updated-desc";

export type DownloadsSortKey =
  | "progress-desc"
  | "progress-asc"
  | "name-asc"
  | "size-desc"
  | "added-desc";

// Interactive search results — same axes for Radarr and Sonarr; one shared
// preference is enough.
export type ReleasesSortKey =
  | "seeders-desc"
  | "size-asc"
  | "size-desc"
  | "age-asc"
  | "score-desc"
  | "title-asc";

interface SortPreferences {
  movies: MoviesSortKey;
  series: SeriesSortKey;
  plexRecent: PlexRecentSortKey;
  jellyfinRecent: JellyfinRecentSortKey;
  requests: RequestsSortKey;
  downloads: DownloadsSortKey;
  releases: ReleasesSortKey;
}

export const SORT_DEFAULTS: SortPreferences = {
  movies: "added-desc",
  series: "added-desc",
  plexRecent: "added-desc",
  jellyfinRecent: "added-desc",
  requests: "created-desc",
  downloads: "progress-desc",
  releases: "seeders-desc",
};

interface SortStore extends SortPreferences {
  hydrate: () => void;
  setMovies: (v: MoviesSortKey) => void;
  setSeries: (v: SeriesSortKey) => void;
  setPlexRecent: (v: PlexRecentSortKey) => void;
  setJellyfinRecent: (v: JellyfinRecentSortKey) => void;
  setRequests: (v: RequestsSortKey) => void;
  setDownloads: (v: DownloadsSortKey) => void;
  setReleases: (v: ReleasesSortKey) => void;
}

function snapshot(state: SortPreferences): SortPreferences {
  return {
    movies: state.movies,
    series: state.series,
    plexRecent: state.plexRecent,
    jellyfinRecent: state.jellyfinRecent,
    requests: state.requests,
    downloads: state.downloads,
    releases: state.releases,
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
  setJellyfinRecent: (jellyfinRecent) => {
    set({ jellyfinRecent });
    setJSON(STORAGE_KEY, snapshot({ ...get(), jellyfinRecent }));
  },
  setRequests: (requests) => {
    set({ requests });
    setJSON(STORAGE_KEY, snapshot({ ...get(), requests }));
  },
  setDownloads: (downloads) => {
    set({ downloads });
    setJSON(STORAGE_KEY, snapshot({ ...get(), downloads }));
  },
  setReleases: (releases) => {
    set({ releases });
    setJSON(STORAGE_KEY, snapshot({ ...get(), releases }));
  },
}));
