import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, toastError } from "@/components/ui/toast";
import {
  radarrImportFiles,
  resolveImportMode,
  sonarrImportFiles,
  toRadarrCandidates,
  toSonarrCandidates,
  type ArrImportMode,
  type FolderImportMode,
  type ManualImportCandidate,
  type ManualImportRow,
  type ManualImportService,
  type ManualImportSource,
} from "@/lib/manual-import";
import {
  getFolderImportCandidates as getRadarrFolderCandidates,
  getManualImportCandidates as getRadarrCandidates,
  getMovies,
  getQualityDefinitions as getRadarrQualityDefinitions,
  getRootFolders as getRadarrRootFolders,
  runManualImport as runRadarrManualImport,
} from "@/services/radarr-api";
import {
  getFolderImportCandidates as getSonarrFolderCandidates,
  getManualImportCandidates as getSonarrCandidates,
  getQualityDefinitions as getSonarrQualityDefinitions,
  getRootFolders as getSonarrRootFolders,
  getSeries,
  runManualImport as runSonarrManualImport,
} from "@/services/sonarr-api";
import { getArrFolderContents } from "@/services/arr-filesystem";
import {
  DISK_RESCAN_RECHECK_MS,
  normalizeFolderListing,
} from "@/lib/arr-filesystem";
import { scheduleGrabRecheck } from "@/lib/post-grab-refresh";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import type { ArrQualityDefinition } from "@/lib/types";

/** A Radarr/Sonarr root folder; both services return the same shape. */
export interface ArrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

/**
 * Data layer for the manual-import screen: the by-hand counterpart of the
 * one-tap force import in use-arr-queue-issues.ts (#306), and the review step
 * of importing from any folder on the *arr host (#470).
 *
 * Radarr and Sonarr expose the same endpoints with different payload shapes,
 * so the difference is confined to this table; every hook below is
 * service-agnostic. Normalization happens in the queryFn because nothing else
 * reads these keys (unlike the queue, whose cache entry is shared).
 */
const MANUAL_IMPORT: Record<
  ManualImportService,
  {
    displayName: string;
    /**
     * Cache key prefixes an import changes: the library tab, the title's own
     * page and its files. A folder import re-reads them once it has run.
     */
    importedKeys: readonly string[];
    fetchCandidates: (
      source: ManualImportSource,
      instanceId: string,
      signal?: AbortSignal,
    ) => Promise<ManualImportCandidate[]>;
    fetchQualities: (instanceId: string) => Promise<ArrQualityDefinition[]>;
    fetchRootFolders: (instanceId: string) => Promise<ArrRootFolder[]>;
    runImport: (
      rows: ManualImportRow[],
      source: ManualImportSource,
      instanceId: string,
      importMode: ArrImportMode,
    ) => Promise<void>;
  }
> = {
  radarr: {
    displayName: "Radarr",
    importedKeys: ["movies", "movie"],
    fetchCandidates: async (source, instanceId, signal) =>
      toRadarrCandidates(
        source.kind === "download"
          ? await getRadarrCandidates(source.downloadId, instanceId)
          : await getRadarrFolderCandidates(source.folder, instanceId, signal),
      ),
    fetchQualities: (instanceId) => getRadarrQualityDefinitions(instanceId),
    fetchRootFolders: (instanceId) => getRadarrRootFolders(instanceId),
    runImport: (rows, source, instanceId, importMode) =>
      runRadarrManualImport(
        radarrImportFiles(rows, downloadIdOf(source)),
        instanceId,
        importMode,
      ),
  },
  sonarr: {
    displayName: "Sonarr",
    // "series" also covers each series' own entry (prefix match).
    importedKeys: ["series", "episodes", "episodeFiles"],
    fetchCandidates: async (source, instanceId, signal) =>
      toSonarrCandidates(
        source.kind === "download"
          ? await getSonarrCandidates(source.downloadId, instanceId)
          : await getSonarrFolderCandidates(source.folder, instanceId, signal),
      ),
    fetchQualities: (instanceId) => getSonarrQualityDefinitions(instanceId),
    fetchRootFolders: (instanceId) => getSonarrRootFolders(instanceId),
    runImport: (rows, source, instanceId, importMode) =>
      runSonarrManualImport(
        sonarrImportFiles(rows, downloadIdOf(source)),
        instanceId,
        importMode,
      ),
  },
};

function downloadIdOf(source: ManualImportSource): string | undefined {
  return source.kind === "download" ? source.downloadId : undefined;
}

function sourceValue(source: ManualImportSource): string {
  return source.kind === "download" ? source.downloadId : source.folder;
}

export function manualImportServiceName(service: ManualImportService): string {
  return MANUAL_IMPORT[service].displayName;
}

/**
 * The files *arr found for one completed download or one folder, plus whatever
 * it managed to match them to. Not polled: the scan result only changes when
 * the user acts, and a refetch mid-mapping would fight the selections on
 * screen. A folder scan parses every file under it and can run for a minute on
 * a big folder, so a failure is shown rather than silently re-run twice.
 */
export function useManualImportCandidates(
  service: ManualImportService,
  source: ManualImportSource,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  const value = sourceValue(source);
  return useQuery({
    queryKey: [service, id, "manualimport", source.kind, value],
    queryFn: ({ signal }) =>
      MANUAL_IMPORT[service].fetchCandidates(source, id!, signal),
    enabled: enabled && !!id && !!value,
    gcTime: 0,
    ...(source.kind === "folder" ? { retry: false } : {}),
  });
}

/**
 * The instance's quality list, for files *arr parsed no quality off. Rarely
 * needed, so it is only fetched when the screen actually asks (`enabled`).
 */
export function useArrQualityDefinitions(
  service: ManualImportService,
  enabled: boolean,
  instanceId?: string,
) {
  const { instanceId: id, enabled: serviceEnabled } = useInstanceTarget(
    service,
    instanceId,
  );
  return useQuery({
    queryKey: [service, id, "qualitydefinition"],
    queryFn: () => MANUAL_IMPORT[service].fetchQualities(id!),
    enabled: enabled && serviceEnabled && !!id,
    staleTime: 60 * 60 * 1000,
  });
}

/** One pickable destination: a Sonarr series or a Radarr movie. */
export interface ManualImportLibraryEntry {
  id: number;
  title: string;
  year?: number;
}

/**
 * The library the destination picker chooses from. Keyed and fetched exactly
 * like useSonarrSeries / useRadarrMovies, so it shares their cache entry rather
 * than issuing a second request; the query for the other service stays
 * disabled, so opening this screen never pulls a library it will not show.
 */
export function useManualImportLibrary(
  service: ManualImportService,
  instanceId?: string,
): { entries: ManualImportLibraryEntry[]; isLoading: boolean } {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);

  const series = useQuery({
    queryKey: ["sonarr", id, "series"],
    queryFn: () => getSeries(id!),
    enabled: enabled && !!id && service === "sonarr",
  });
  const movies = useQuery({
    queryKey: ["radarr", id, "movies"],
    queryFn: () => getMovies(id!),
    enabled: enabled && !!id && service === "radarr",
  });

  const active = service === "sonarr" ? series : movies;

  const entries = useMemo<ManualImportLibraryEntry[]>(
    () =>
      (active.data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        year: item.year,
      })),
    [active.data],
  );

  return { entries, isLoading: active.isLoading };
}

/**
 * Sends the mapped files as a ManualImport command. Success only means *arr
 * accepted the command — the import itself runs async on the server, so the
 * toast says "started" and the invalidated queue refetch is what clears the
 * stuck grab.
 *
 * `importMode` is required for a folder source and ignored for a download
 * (see resolveImportMode), so a folder import can never fall back to "auto".
 */
export function useRunManualImport(
  service: ManualImportService,
  source: ManualImportSource,
  instanceId?: string,
) {
  const { instanceId: id } = useInstanceTarget(service, instanceId);
  const queryClient = useQueryClient();
  const { displayName, importedKeys } = MANUAL_IMPORT[service];

  return useMutation({
    mutationFn: async ({
      rows,
      importMode,
    }: {
      rows: ManualImportRow[];
      importMode?: FolderImportMode;
    }) => {
      const mode = resolveImportMode(source, importMode);
      await MANUAL_IMPORT[service].runImport(rows, source, id!, mode);
      return mode;
    },
    onSuccess: (mode) => {
      if (source.kind === "folder") {
        toast(
          `Import started, ${displayName} is ${mode === "move" ? "moving" : "copying"} the files`,
        );
      } else {
        toast(`Import started, ${displayName} is processing it`);
      }
      if (!id) return;
      queryClient.invalidateQueries({ queryKey: [service, id, "queue"] });
      if (source.kind === "download") {
        // Prefix match — the imported media leaves wanted/missing too.
        queryClient.invalidateQueries({ queryKey: [service, id, "wanted"] });
        return;
      }
      // A move empties the folder the browser behind this screen lists.
      queryClient.invalidateQueries({ queryKey: [service, id, "filesystem"] });
      // The command only queues the import, and a folder has no queue item
      // whose completion would refresh the library, so re-read it on the
      // same burst Rescan uses (replacing any burst already running).
      scheduleGrabRecheck(
        `${service}:${id}:folder-import`,
        () => {
          for (const key of [...importedKeys, "wanted"]) {
            queryClient.invalidateQueries({ queryKey: [service, id, key] });
          }
        },
        DISK_RESCAN_RECHECK_MS,
      );
    },
    onError: (err) => toastError("Manual import failed", err),
  });
}

/**
 * The instance's root folders, the folder browser's starting points. Same key
 * and fetcher as useRadarrRootFolders / useSonarrRootFolders, so the entry is
 * shared with the movie and series pages.
 */
export function useArrRootFolders(
  service: ManualImportService,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  return useQuery({
    queryKey: [service, id, "rootFolders"],
    queryFn: () => MANUAL_IMPORT[service].fetchRootFolders(id!),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

/**
 * One folder on the *arr host, for the "Import from folder" browser (#470).
 * `path === null` is the browser's start view (root folders), which needs no
 * request; `""` is the server root. Not polled: a folder only changes when the
 * user copies something in, and pull-to-refresh covers that.
 */
export function useArrFolderListing(
  service: ManualImportService,
  path: string | null,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  return useQuery({
    queryKey: [service, id, "filesystem", path],
    queryFn: async ({ signal }) =>
      normalizeFolderListing(
        await getArrFolderContents(service, path ?? "", id!, signal),
      ),
    enabled: enabled && !!id && path !== null,
  });
}
