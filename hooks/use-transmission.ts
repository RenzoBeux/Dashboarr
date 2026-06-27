import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getTransmissionGlobalStats,
  getTransmissionSession,
  getTransmissionTorrent,
  getTransmissionTorrents,
  reannounceTransmissionTorrents,
  setTransmissionSession,
  setTransmissionShareLimits,
  type TransmissionSessionUpdate,
} from "@/services/transmission-api";

// Shared Transmission query/mutation hooks. Kept in their own module (not the
// adapter) so the speed-limits sheet/control and the detail screen can import
// them without a cycle through lib/torrent-adapters/transmission.ts (which
// imports the speed-limits control).

// Completion notifications don't need 5s precision, so the watcher polls slower
// than the live downloads screen. When that screen is also open it observes the
// same query key at activeTorrents (5s) and React Query uses the shorter of the
// two intervals, so the cadence only drops to 15s once the screen is closed —
// cutting per-poll bandwidth on large libraries with no regression while open.
const NOTIFICATION_WATCHER_INTERVAL_MS = 15000;

// Invalidate the torrents list/watcher (["transmission", id, "torrents", …])
// and any open detail query (["transmission", id, "torrent", hash]) after a
// mutation. Deliberately leaves the static `session`/`globalStats` caches
// untouched: a pause/resume/delete/add/share-limit/reannounce never changes
// session prefs, and globalStats refreshes on its own transferSpeed poll.
// Mirrors qBittorrent's torrents-scoped invalidation, adjusted for
// Transmission's separate singular detail key.
export function invalidateTransmissionTorrents(
  queryClient: QueryClient,
  id: string | null | undefined,
) {
  queryClient.invalidateQueries({ queryKey: ["transmission", id, "torrents"] });
  queryClient.invalidateQueries({ queryKey: ["transmission", id, "torrent"] });
}

export function useTransmissionGlobalStats(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("transmission", instanceId);
  return useQuery({
    queryKey: ["transmission", id, "globalStats"],
    queryFn: () => getTransmissionGlobalStats(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: enabled && !!id,
  });
}

export function useTransmissionSession(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("transmission", instanceId);
  return useQuery({
    queryKey: ["transmission", id, "session"],
    queryFn: () => getTransmissionSession(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useSetTransmissionSession(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("transmission", instanceId);
  return useMutation({
    mutationFn: (update: TransmissionSessionUpdate) =>
      setTransmissionSession(update, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transmission", id, "session"] });
      queryClient.invalidateQueries({ queryKey: ["transmission", id, "globalStats"] });
    },
  });
}

export function useTransmissionTorrent(hash: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("transmission", instanceId);
  return useQuery({
    queryKey: ["transmission", id, "torrent", hash],
    queryFn: () => getTransmissionTorrent(hash, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id && !!hash,
  });
}

export function useSetTransmissionShareLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("transmission", instanceId);
  return useMutation({
    mutationFn: (vars: {
      hashes: string[];
      ratioMode: number;
      ratioLimit?: number;
      idleMode: number;
      idleLimit?: number;
    }) => setTransmissionShareLimits(vars.hashes, vars, id ?? undefined),
    onSuccess: () => invalidateTransmissionTorrents(queryClient, id),
  });
}

export function useReannounceTransmissionTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("transmission", instanceId);
  return useMutation({
    mutationFn: (hashes: string[]) =>
      reannounceTransmissionTorrents(hashes, id ?? undefined),
    onSuccess: () => invalidateTransmissionTorrents(queryClient, id),
  });
}

// Full library poll used by the completion watcher. Shares the adapter's
// torrents query key so the downloads screen and the watcher dedupe into one
// fetch; gated by `active` so it costs nothing at rest. Transmission's
// torrent-get has no server-side status filter, so this always fetches the
// whole library — the slow watcher cadence keeps that cheap when the downloads
// screen is closed (see NOTIFICATION_WATCHER_INTERVAL_MS).
export function useTransmissionTorrentsForWatcher(active: boolean, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("transmission", instanceId);
  return useQuery({
    queryKey: ["transmission", id, "torrents", "all"],
    queryFn: () => getTransmissionTorrents(id ?? undefined),
    refetchInterval: NOTIFICATION_WATCHER_INTERVAL_MS,
    enabled: active && enabled && !!id,
  });
}
