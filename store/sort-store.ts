import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.sortPreferences";

export type MoviesSortKey =
  | "added-desc"
  | "title-asc"
  | "title-desc"
  | "year-desc"
  | "year-asc"
  | "release-desc"
  | "release-asc"
  | "size-desc"
  | "duration-desc"
  | "duration-asc"
  | "next-airing-asc";

// Sonarr's runtime is per-episode, not per-series, so duration isn't a
// meaningful series sort axis.
export type SeriesSortKey = Exclude<MoviesSortKey, "duration-desc" | "duration-asc">;

// Lidarr artists have no release year / next-airing axis, so they sort on a
// narrower set than movies/series.
export type ArtistsSortKey =
  | "added-desc"
  | "title-asc"
  | "title-desc"
  | "size-desc";

// Bindery authors sort SERVER-side: the stored key is passed straight through
// as ?sort=, so every value here must be one the server whitelists (see
// internal/db/authors.go authorSortOrder). An unrecognised value is silently
// ignored upstream and falls back to A-Z, which would look like a broken
// control. "az"/"za" order by sort name ("Weir, Andy"); "name-az"/"name-za"
// order by display name ("Andy Weir"). There is no size axis: Bindery tracks
// no per-author disk usage.
export type BinderyAuthorsSortKey =
  | "az"
  | "za"
  | "name-az"
  | "name-za"
  | "recent"
  | "books-desc"
  | "books-asc"
  | "rating-desc";

export type PlexRecentSortKey =
  | "added-desc"
  | "title-asc"
  | "title-desc"
  | "year-desc"
  | "year-asc";

// Jellyfin's "Recently Added" tab sorts on the same axes as Plex's, so reuse
// the type instead of forking a parallel one. Emby shares it too.
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
  music: ArtistsSortKey;
  books: BinderyAuthorsSortKey;
  plexRecent: PlexRecentSortKey;
  jellyfinRecent: JellyfinRecentSortKey;
  embyRecent: JellyfinRecentSortKey;
  requests: RequestsSortKey;
  downloads: DownloadsSortKey;
  releases: ReleasesSortKey;
}

export const SORT_DEFAULTS: SortPreferences = {
  movies: "added-desc",
  series: "added-desc",
  music: "added-desc",
  books: "az",
  plexRecent: "added-desc",
  jellyfinRecent: "added-desc",
  embyRecent: "added-desc",
  requests: "created-desc",
  downloads: "progress-desc",
  releases: "seeders-desc",
};

interface SortStore extends SortPreferences {
  hydrate: () => void;
  setMovies: (v: MoviesSortKey) => void;
  setSeries: (v: SeriesSortKey) => void;
  setMusic: (v: ArtistsSortKey) => void;
  setBooks: (v: BinderyAuthorsSortKey) => void;
  setPlexRecent: (v: PlexRecentSortKey) => void;
  setJellyfinRecent: (v: JellyfinRecentSortKey) => void;
  setEmbyRecent: (v: JellyfinRecentSortKey) => void;
  setRequests: (v: RequestsSortKey) => void;
  setDownloads: (v: DownloadsSortKey) => void;
  setReleases: (v: ReleasesSortKey) => void;
}

function snapshot(state: SortPreferences): SortPreferences {
  return {
    movies: state.movies,
    series: state.series,
    music: state.music,
    books: state.books,
    plexRecent: state.plexRecent,
    jellyfinRecent: state.jellyfinRecent,
    embyRecent: state.embyRecent,
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
  setMusic: (music) => {
    set({ music });
    setJSON(STORAGE_KEY, snapshot({ ...get(), music }));
  },
  setBooks: (books) => {
    set({ books });
    setJSON(STORAGE_KEY, snapshot({ ...get(), books }));
  },
  setPlexRecent: (plexRecent) => {
    set({ plexRecent });
    setJSON(STORAGE_KEY, snapshot({ ...get(), plexRecent }));
  },
  setJellyfinRecent: (jellyfinRecent) => {
    set({ jellyfinRecent });
    setJSON(STORAGE_KEY, snapshot({ ...get(), jellyfinRecent }));
  },
  setEmbyRecent: (embyRecent) => {
    set({ embyRecent });
    setJSON(STORAGE_KEY, snapshot({ ...get(), embyRecent }));
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
