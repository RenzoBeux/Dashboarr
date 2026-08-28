import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getDelugeGlobalStats,
  getDelugeSpeedLimits,
  getDelugeTorrent,
  getDelugeTorrents,
  reannounceDelugeTorrents,
  setDelugeShareLimits,
  setDelugeSpeedLimits,
  type DelugeSpeedLimits,
} from "@/services/deluge-api";

// Shared Deluge query/mutation hooks. Kept in their own module (not the
// adapter) so the speed-limits sheet/control and the detail screen can import
// them without a cycle through lib/torrent-adapters/deluge.ts (which imports
// the speed-limits control). Mirrors hooks/use-transmission.ts.

// Completion notifications don't need 5s precision, so the watcher polls slower
// than the live downloads screen. When that screen is also open it observes the
// same query key at activeTorrents (5s) and React Query uses the shorter of the
// two intervals, so the cadence only drops to 15s once the screen is closed.
const NOTIFICATION_WATCHER_INTERVAL_MS = 15000;

// Invalidate the torrents list/watcher (["deluge", id, "torrents", …]) and any
// open detail query (["deluge", id, "torrent", hash]) after a mutation. Leaves
// the speed-limit and globalStats caches alone: a pause/resume/delete/add/
// share-limit/reannounce never changes the global config, and globalStats
// refreshes on its own transferSpeed poll.
export function invalidateDelugeTorrents(
  queryClient: QueryClient,
  id: string | null | undefined,
) {
  queryClient.invalidateQueries({ queryKey: ["deluge", id, "torrents"] });
  queryClient.invalidateQueries({ queryKey: ["deluge", id, "torrent"] });
}

export function useDelugeGlobalStats(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("deluge", instanceId);
  return useQuery({
    queryKey: ["deluge", id, "globalStats"],
    queryFn: () => getDelugeGlobalStats(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: enabled && !!id,
  });
}

export function useDelugeSpeedLimits(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("deluge", instanceId);
  return useQuery({
    queryKey: ["deluge", id, "speedLimits"],
    queryFn: () => getDelugeSpeedLimits(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useSetDelugeSpeedLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("deluge", instanceId);
  return useMutation({
    mutationFn: (update: Partial<DelugeSpeedLimits>) =>
      setDelugeSpeedLimits(update, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deluge", id, "speedLimits"] });
      queryClient.invalidateQueries({ queryKey: ["deluge", id, "globalStats"] });
    },
  });
}

export function useDelugeTorrent(hash: string, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("deluge", instanceId);
  return useQuery({
    queryKey: ["deluge", id, "torrent", hash],
    queryFn: () => getDelugeTorrent(hash, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: enabled && !!id && !!hash,
  });
}

export function useSetDelugeShareLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("deluge", instanceId);
  return useMutation({
    mutationFn: (vars: {
      hashes: string[];
      stopAtRatio: boolean;
      stopRatio?: number;
      removeAtRatio: boolean;
    }) => setDelugeShareLimits(vars.hashes, vars, id ?? undefined),
    onSuccess: () => invalidateDelugeTorrents(queryClient, id),
  });
}

export function useReannounceDelugeTorrent(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("deluge", instanceId);
  return useMutation({
    mutationFn: (hashes: string[]) => reannounceDelugeTorrents(hashes, id ?? undefined),
    onSuccess: () => invalidateDelugeTorrents(queryClient, id),
  });
}

// Full library poll used by the completion watcher. Shares the adapter's
// torrents query key so the downloads screen and the watcher dedupe into one
// fetch; gated by `active` so it costs nothing at rest. Deluge's
// core.get_torrents_status has no server-side status filter we rely on, so this
// always fetches the whole library — the slow watcher cadence keeps that cheap
// when the downloads screen is closed.
export function useDelugeTorrentsForWatcher(active: boolean, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("deluge", instanceId);
  return useQuery({
    queryKey: ["deluge", id, "torrents", "all"],
    queryFn: () => getDelugeTorrents(id ?? undefined),
    refetchInterval: NOTIFICATION_WATCHER_INTERVAL_MS,
    enabled: active && enabled && !!id,
  });
}
