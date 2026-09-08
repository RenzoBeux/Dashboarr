import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, toastError } from "@/components/ui/toast";
import {
  radarrImportFiles,
  sonarrImportFiles,
  toRadarrCandidates,
  toSonarrCandidates,
  type ManualImportCandidate,
  type ManualImportRow,
  type ManualImportService,
} from "@/lib/manual-import";
import {
  getManualImportCandidates as getRadarrCandidates,
  getMovies,
  getQualityDefinitions as getRadarrQualityDefinitions,
  runManualImport as runRadarrManualImport,
} from "@/services/radarr-api";
import {
  getManualImportCandidates as getSonarrCandidates,
  getQualityDefinitions as getSonarrQualityDefinitions,
  getSeries,
  runManualImport as runSonarrManualImport,
} from "@/services/sonarr-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import type { ArrQualityDefinition } from "@/lib/types";

/**
 * Data layer for the manual-import screen (#306) — the by-hand counterpart of
 * the one-tap force import in use-arr-queue-issues.ts.
 *
 * Radarr and Sonarr expose the same three endpoints with different payload
 * shapes, so the difference is confined to this table; every hook below is
 * service-agnostic. Normalization happens in the queryFn because nothing else
 * reads these keys (unlike the queue, whose cache entry is shared).
 */
const MANUAL_IMPORT: Record<
  ManualImportService,
  {
    displayName: string;
    fetchCandidates: (
      downloadId: string,
      instanceId: string,
    ) => Promise<ManualImportCandidate[]>;
    fetchQualities: (instanceId: string) => Promise<ArrQualityDefinition[]>;
    runImport: (
      rows: ManualImportRow[],
      downloadId: string,
      instanceId: string,
    ) => Promise<void>;
  }
> = {
  radarr: {
    displayName: "Radarr",
    fetchCandidates: async (downloadId, instanceId) =>
      toRadarrCandidates(await getRadarrCandidates(downloadId, instanceId)),
    fetchQualities: (instanceId) => getRadarrQualityDefinitions(instanceId),
    runImport: (rows, downloadId, instanceId) =>
      runRadarrManualImport(radarrImportFiles(rows, downloadId), instanceId),
  },
  sonarr: {
    displayName: "Sonarr",
    fetchCandidates: async (downloadId, instanceId) =>
      toSonarrCandidates(await getSonarrCandidates(downloadId, instanceId)),
    fetchQualities: (instanceId) => getSonarrQualityDefinitions(instanceId),
    runImport: (rows, downloadId, instanceId) =>
      runSonarrManualImport(sonarrImportFiles(rows, downloadId), instanceId),
  },
};

export function manualImportServiceName(service: ManualImportService): string {
  return MANUAL_IMPORT[service].displayName;
}

/**
 * The files *arr found for one completed download, plus whatever it managed to
 * match them to. Not polled: the scan result only changes when the user acts,
 * and a refetch mid-mapping would fight the selections on screen.
 */
export function useManualImportCandidates(
  service: ManualImportService,
  downloadId: string,
  instanceId?: string,
) {
  const { instanceId: id, enabled } = useInstanceTarget(service, instanceId);
  return useQuery({
    queryKey: [service, id, "manualimport", downloadId],
    queryFn: () => MANUAL_IMPORT[service].fetchCandidates(downloadId, id!),
    enabled: enabled && !!id && !!downloadId,
    gcTime: 0,
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
    queryKey: ["radarr", id, "movie"],
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
 */
export function useRunManualImport(
  service: ManualImportService,
  downloadId: string,
  instanceId?: string,
) {
  const { instanceId: id } = useInstanceTarget(service, instanceId);
  const queryClient = useQueryClient();
  const displayName = MANUAL_IMPORT[service].displayName;

  return useMutation({
    mutationFn: (rows: ManualImportRow[]) =>
      MANUAL_IMPORT[service].runImport(rows, downloadId, id!),
    onSuccess: () => {
      toast(`Import started, ${displayName} is processing it`);
      if (!id) return;
      queryClient.invalidateQueries({ queryKey: [service, id, "queue"] });
      // Prefix match — the imported media leaves wanted/missing too.
      queryClient.invalidateQueries({ queryKey: [service, id, "wanted"] });
    },
    onError: (err) => toastError("Manual import failed", err),
  });
}
