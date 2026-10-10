import { useSyncExternalStore } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  getActiveBazarrJobIds,
  getBazarrEnabledLanguages,
  getBazarrLanguageProfiles,
  getBazarrMovie,
  getBazarrSeriesEpisodes,
  getBazarrSeriesItem,
  getBazarrStatus,
  manualSearchSubtitles,
} from "@/services/bazarr-api";
import { createJobWatch, type JobWatch } from "@/lib/job-watch";
import { deriveBazarrCapabilities } from "@/lib/bazarr-capabilities";
import type { SubtitleTarget } from "@/lib/bazarr-subtitle-tools";

/**
 * Data and actions for Bazarr subtitles on the Radarr/Sonarr pages and the
 * Bazarr tab. Every hook takes the Bazarr instance explicitly (from
 * useLinkedBazarr), never the active one: the page decides which Bazarr serves
 * it, and a null id disables everything.
 */

export const bazarrKeys = {
  movie: (bazarrId: string, radarrId: number) =>
    ["bazarr", bazarrId, "movie", radarrId] as const,
  seriesItem: (bazarrId: string, seriesId: number) =>
    ["bazarr", bazarrId, "series-item", seriesId] as const,
  seriesEpisodes: (bazarrId: string, seriesId: number) =>
    ["bazarr", bazarrId, "series-episodes", seriesId] as const,
  status: (bazarrId: string) => ["bazarr", bazarrId, "status"] as const,
  profiles: (bazarrId: string) => ["bazarr", bazarrId, "profiles"] as const,
  languages: (bazarrId: string) => ["bazarr", bazarrId, "languages"] as const,
  manualSearch: (bazarrId: string, target: SubtitleTarget) =>
    [
      "bazarr",
      bazarrId,
      "manual-search",
      target.type === "movie" ? `m${target.radarrId}` : `e${target.episodeId}`,
    ] as const,
  // Lists an action can change: the wanted lists, history and the library.
  lists: (bazarrId: string) => [
    ["bazarr", bazarrId, "wanted"] as const,
    ["bazarr", bazarrId, "history"] as const,
    ["bazarr", bazarrId, "library"] as const,
  ],
};

/** Every query an action on this movie/episode can change. */
export function affectedKeys(bazarrId: string, target: SubtitleTarget): QueryKey[] {
  return [
    target.type === "movie"
      ? bazarrKeys.movie(bazarrId, target.radarrId)
      : bazarrKeys.seriesEpisodes(bazarrId, target.seriesId),
    ...(target.type === "episode" ? [bazarrKeys.seriesItem(bazarrId, target.seriesId)] : []),
    ...bazarrKeys.lists(bazarrId),
  ];
}

// --- Queries ---

export function useBazarrMovieSubtitles(bazarrId: string | null, radarrId: number) {
  return useQuery({
    queryKey: bazarrKeys.movie(bazarrId ?? "", radarrId),
    queryFn: () => getBazarrMovie(radarrId, bazarrId!),
    enabled: !!bazarrId && radarrId > 0,
  });
}

export function useBazarrSeriesItem(bazarrId: string | null, seriesId: number) {
  return useQuery({
    queryKey: bazarrKeys.seriesItem(bazarrId ?? "", seriesId),
    queryFn: () => getBazarrSeriesItem(seriesId, bazarrId!),
    enabled: !!bazarrId && seriesId > 0,
  });
}

export function useBazarrSeriesEpisodes(bazarrId: string | null, seriesId: number) {
  return useQuery({
    queryKey: bazarrKeys.seriesEpisodes(bazarrId ?? "", seriesId),
    queryFn: () => getBazarrSeriesEpisodes(seriesId, bazarrId!),
    enabled: !!bazarrId && seriesId > 0,
  });
}

export function useBazarrLanguageProfiles(bazarrId: string | null) {
  return useQuery({
    queryKey: bazarrKeys.profiles(bazarrId ?? ""),
    queryFn: () => getBazarrLanguageProfiles(bazarrId!),
    enabled: !!bazarrId,
    staleTime: 10 * 60_000,
  });
}

export function useBazarrEnabledLanguages(bazarrId: string | null) {
  return useQuery({
    queryKey: bazarrKeys.languages(bazarrId ?? ""),
    queryFn: () => getBazarrEnabledLanguages(bazarrId!),
    enabled: !!bazarrId,
    staleTime: 30 * 60_000,
  });
}

/** Version-gated features of this Bazarr; all false until the version is known. */
export function useBazarrCapabilities(bazarrId: string | null) {
  const { data } = useQuery({
    queryKey: bazarrKeys.status(bazarrId ?? ""),
    queryFn: () => getBazarrStatus(bazarrId!),
    enabled: !!bazarrId,
    staleTime: 60 * 60_000,
  });
  return deriveBazarrCapabilities(data?.bazarr_version);
}

/**
 * Manual search results. Slow (every provider, synchronously), so it runs
 * only while the results screen is mounted, never retries on its own, and
 * hands TanStack's abort signal to the request so leaving the screen or
 * restarting cancels it.
 */
export function useBazarrManualSearch(bazarrId: string | null, target: SubtitleTarget) {
  return useQuery({
    queryKey: bazarrKeys.manualSearch(bazarrId ?? "", target),
    queryFn: ({ signal }) => manualSearchSubtitles(target, bazarrId!, signal),
    enabled: !!bazarrId,
    retry: false,
    staleTime: 60_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// --- Background-job tracking ---

// One watcher per Bazarr instance, outliving the screen that started it, so a
// search started on a movie page still refreshes the library after navigating.
const watches = new Map<string, { watch: JobWatch<QueryKey>; active: boolean }>();
const listeners = new Set<() => void>();

function watchFor(queryClient: QueryClient, bazarrId: string) {
  let entry = watches.get(bazarrId);
  if (!entry) {
    const created = {
      active: false,
      watch: createJobWatch<QueryKey>({
        fetchActiveJobIds: () => getActiveBazarrJobIds(bazarrId),
        refresh: (keys) => {
          for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
        },
        onActiveChange: (active) => {
          created.active = active;
          listeners.forEach((l) => l());
        },
      }),
    };
    entry = created;
    watches.set(bazarrId, entry);
  }
  return entry;
}

/** Start tracking Bazarr's job queue after an action on `target`. */
export function useTrackBazarrJobs(bazarrId: string | null) {
  const queryClient = useQueryClient();
  return (target: SubtitleTarget | null, extraKeys: QueryKey[] = []) => {
    if (!bazarrId) return;
    const keys = [...(target ? affectedKeys(bazarrId, target) : bazarrKeys.lists(bazarrId)), ...extraKeys];
    watchFor(queryClient, bazarrId).watch.track(keys);
  };
}

/** True while this Bazarr still has background work the app is waiting on. */
export function useBazarrJobsActive(bazarrId: string | null): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => (bazarrId ? (watches.get(bazarrId)?.active ?? false) : false),
  );
}

/**
 * A Bazarr subtitle action: runs `fn`, then refreshes the item it touched
 * (`targetOf(args)`) and the lists once Bazarr's background job finishes.
 * Toasts stay with the caller, which knows what to say.
 */
export function useBazarrSubtitleMutation<TArgs>(
  bazarrId: string | null,
  fn: (args: TArgs, bazarrId: string) => Promise<void>,
  targetOf: (args: TArgs) => SubtitleTarget | null,
) {
  const track = useTrackBazarrJobs(bazarrId);
  return useMutation({
    mutationFn: (args: TArgs) => {
      if (!bazarrId) throw new Error("No Bazarr instance is linked");
      return fn(args, bazarrId);
    },
    onSuccess: (_data, args) => track(targetOf(args)),
  });
}
