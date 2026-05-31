import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getRtorrentGlobalStats,
  setRtorrentGlobalLimits,
} from "@/services/rtorrent-api";

// Shared rtorrent query/mutation hooks. Kept in their own module (not the
// adapter) so the speed-limits sheet can import them without a cycle through
// lib/torrent-adapters/rtorrent.ts (which imports the sheet's control).

export function useRtorrentGlobalStats(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("rtorrent", instanceId);
  return useQuery({
    queryKey: ["rtorrent", id, "globalStats"],
    queryFn: () => getRtorrentGlobalStats(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: enabled && !!id,
  });
}

// The adapter surface is bytes/s (qBittorrent parity); rtorrent's setters are
// KiB/s, so convert here.
export function useSetRtorrentGlobalLimits(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("rtorrent", instanceId);
  return useMutation({
    mutationFn: (limits: { dl?: number; up?: number }) =>
      setRtorrentGlobalLimits(
        {
          dlKib: limits.dl !== undefined ? Math.round(limits.dl / 1024) : undefined,
          upKib: limits.up !== undefined ? Math.round(limits.up / 1024) : undefined,
        },
        id ?? undefined,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["rtorrent", id, "globalStats"] }),
  });
}
