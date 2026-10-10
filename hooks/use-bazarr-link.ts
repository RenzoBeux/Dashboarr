import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useConfigStore, type ServiceInstance } from "@/store/config-store";
import {
  useEnabledInstances,
  useInstanceTarget,
} from "@/hooks/use-instance-target";
import { useAttachedEnabledInstances } from "@/hooks/use-workspace-instances";
import { detectArrLinks, type ArrLinkDetection } from "@/services/bazarr-api";
import {
  bazarrForArr,
  linkField,
  resolveLinkState,
  type ArrCandidate,
  type ArrKind,
  type BazarrLinkEntry,
  type LinkState,
} from "@/lib/bazarr-link";

/**
 * React glue for the Bazarr → Radarr/Sonarr link (model: lib/bazarr-link.ts).
 *
 * Detection reads Bazarr's settings once per Bazarr instance and caches the
 * derived result for the session (it only changes when someone reconfigures
 * Bazarr; "Detect again" in settings refetches). It only runs for Bazarr
 * instances in automatic mode, so a link the user set never costs a request.
 */

const DETECTION_GC_MS = 30 * 60_000;

export function arrLinkDetectionKey(bazarrId: string, fingerprint: string) {
  return ["bazarr", bazarrId, "arr-link-detection", fingerprint] as const;
}

/** Every enabled Radarr and Sonarr instance, with its API key, for matching. */
function readArrCandidates(): Record<ArrKind, ArrCandidate[]> {
  const s = useConfigStore.getState();
  const toCandidates = (kind: ArrKind): ArrCandidate[] =>
    (s.serviceInstances[kind] ?? [])
      .filter((i) => i.enabled)
      .map((i) => ({
        id: i.id,
        apiKey: s.instanceSecrets[i.id]?.apiKey,
        localUrl: i.localUrl,
        remoteUrl: i.remoteUrl,
      }));
  return { radarr: toCandidates("radarr"), sonarr: toCandidates("sonarr") };
}

// Ids and whether each has a key, never the keys: the query key ends up in the
// cache and devtools. A new or removed arr instance re-runs detection, and so
// does a key saved after the instance was enabled (the editor's Enabled switch
// writes before Save); a changed API key is picked up by "Detect again".
function useCandidateFingerprint(): string {
  const radarr = useEnabledInstances("radarr");
  const sonarr = useEnabledInstances("sonarr");
  const keyed = useConfigStore(
    useShallow((s) =>
      [...radarr, ...sonarr].map((i) => !!s.instanceSecrets[i.id]?.apiKey?.trim()),
    ),
  );
  return useMemo(
    () =>
      [...radarr, ...sonarr].map((i, n) => `${i.id}${keyed[n] ? "" : ":nokey"}`).join(","),
    [radarr, sonarr, keyed],
  );
}

function detectionQuery(bazarrId: string, fingerprint: string, enabled: boolean) {
  return {
    queryKey: arrLinkDetectionKey(bazarrId, fingerprint),
    queryFn: () => detectArrLinks(readArrCandidates(), bazarrId),
    enabled,
    staleTime: Infinity,
    gcTime: DETECTION_GC_MS,
    retry: 1,
  };
}

/**
 * The effective link state of each of `bazarrs` for one arr kind.
 * `needsDetection(bazarrId)` decides per Bazarr whether its automatic-mode
 * detection may run.
 */
function useLinkEntries(
  kind: ArrKind,
  bazarrs: readonly ServiceInstance[],
  needsDetection: (bazarrId: string) => boolean,
): { entries: BazarrLinkEntry[]; detections: (ArrLinkDetection | undefined)[] } {
  const arrs = useEnabledInstances(kind);
  const fingerprint = useCandidateFingerprint();
  const field = linkField(kind);

  const results = useQueries({
    queries: bazarrs.map((b) =>
      detectionQuery(
        b.id,
        fingerprint,
        // With no Radarr/Sonarr here there is nothing to match against, so
        // don't fetch Bazarr's whole settings document for nothing.
        arrs.length > 0 && b[field] === undefined && needsDetection(b.id),
      ),
    ),
  });

  const arrIds = useMemo(() => new Set(arrs.map((a) => a.id)), [arrs]);
  const detections = results.map((r) => r.data);
  const entries = bazarrs.map((b, i) => ({
    bazarrId: b.id,
    state: resolveLinkState(
      b[field],
      detections[i]?.[kind].instanceId,
      arrIds,
    ),
  }));
  return { entries, detections };
}

/**
 * The Bazarr instance that manages subtitles for a Radarr/Sonarr instance
 * (the active one when `arrInstanceId` is omitted), or null — in which case
 * no subtitle UI is shown.
 */
export function useLinkedBazarr(
  kind: ArrKind,
  arrInstanceId?: string,
): { bazarrId: string | null; how: LinkState["how"] | null } {
  const { instanceId: arrId } = useInstanceTarget(kind, arrInstanceId);
  const field = linkField(kind);
  const bazarrs = useAttachedEnabledInstances("bazarr");
  // A link the user set answers without asking any Bazarr.
  const manualOwner = arrId
    ? (bazarrs.find((b) => b[field] === arrId)?.id ?? null)
    : null;
  const { entries } = useLinkEntries(kind, bazarrs, () => !!arrId && !manualOwner);
  const bazarrId = bazarrForArr(arrId, entries);
  const how = entries.find((e) => e.bazarrId === bazarrId)?.state.how ?? null;
  return { bazarrId, how };
}

/**
 * Every enabled Bazarr instance's link for one kind — for the settings card's
 * "Linked to …" hints and the dashboard posters. Not limited to the workspace:
 * the settings card edits any instance, and a widget can be bound to a Bazarr
 * the dashboard doesn't attach. Detects wherever automatic, or only for the
 * Bazarrs in `detectFor` when given (the widget needs just the ones it shows).
 */
export function useBazarrLinkEntries(
  kind: ArrKind,
  detectFor?: ReadonlySet<string>,
): BazarrLinkEntry[] {
  const bazarrs = useEnabledInstances("bazarr");
  return useLinkEntries(kind, bazarrs, (id) => !detectFor || detectFor.has(id)).entries;
}

/** The Radarr/Sonarr instance a Bazarr instance is linked to, or null. */
export function useLinkedArrInstance(
  bazarrId: string | null | undefined,
  kind: ArrKind,
): string | null {
  const bazarrs = useEnabledInstances("bazarr");
  const { entries } = useLinkEntries(kind, bazarrs, (id) => id === bazarrId);
  return entries.find((e) => e.bazarrId === bazarrId)?.state.arrId ?? null;
}

/**
 * Link state + detection detail for one Bazarr instance, for the settings
 * card: both kinds, the addresses Bazarr reports, and a way to re-detect.
 */
export function useBazarrLinkStatus(bazarrId: string) {
  const fingerprint = useCandidateFingerprint();
  const queryClient = useQueryClient();
  const instance = useConfigStore((s) =>
    (s.serviceInstances.bazarr ?? []).find((b) => b.id === bazarrId),
  );
  const radarrs = useEnabledInstances("radarr");
  const sonarrs = useEnabledInstances("sonarr");

  // Always detect here, even with links set by hand: the card shows what
  // Bazarr itself is configured against next to the user's choice.
  const [detection] = useQueries({
    queries: [detectionQuery(bazarrId, fingerprint, !!instance?.enabled)],
  });

  const state = (kind: ArrKind) =>
    resolveLinkState(
      instance?.[linkField(kind)],
      detection.data?.[kind].instanceId,
      new Set((kind === "radarr" ? radarrs : sonarrs).map((a) => a.id)),
    );

  return {
    radarr: state("radarr"),
    sonarr: state("sonarr"),
    detection: detection.data,
    detecting: detection.isFetching,
    detectError: detection.error,
    // Re-reads Bazarr's settings and resolves with the fresh result.
    redetect: (): Promise<ArrLinkDetection> =>
      queryClient.fetchQuery({
        ...detectionQuery(bazarrId, fingerprint, true),
        staleTime: 0,
      }),
  };
}
