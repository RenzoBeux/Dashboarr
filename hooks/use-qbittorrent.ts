import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransferInfo,
  getTorrents,
  getTorrentFiles,
  getTorrentTrackers,
  pauseTorrents,
  resumeTorrents,
  deleteTorrents,
  addTorrentMagnet,
  setDownloadLimit,
  setUploadLimit,
  getSpeedLimitsMode,
  toggleSpeedLimitsMode,
  getSpeedPreferences,
  setAltSpeedLimits,
} from "@/services/qbittorrent-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useQBEnabled() {
  return useConfigStore((s) => s.services.qbittorrent.enabled);
}

export function useTransferInfo() {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "transfer"],
    queryFn: getTransferInfo,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled,
  });
}

export function useAllTorrents(
  filter?: "all" | "downloading" | "seeding" | "completed" | "paused" | "active" | "inactive" | "stalled",
) {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "torrents", filter ?? "all"],
    queryFn: () => getTorrents(filter),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled,
  });
}

export function useTorrentFiles(hash: string) {
  return useQuery({
    queryKey: ["qbittorrent", "files", hash],
    queryFn: () => getTorrentFiles(hash),
    enabled: !!hash,
  });
}

export function useTorrentTrackers(hash: string) {
  return useQuery({
    queryKey: ["qbittorrent", "trackers", hash],
    queryFn: () => getTorrentTrackers(hash),
    enabled: !!hash,
  });
}

export function usePauseTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hashes: string[]) => pauseTorrents(hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

export function useResumeTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hashes: string[]) => resumeTorrents(hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

export function useDeleteTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      hashes,
      deleteFiles = false,
    }: {
      hashes: string[];
      deleteFiles?: boolean;
    }) => deleteTorrents(hashes, deleteFiles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

export function useAddTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (magnetUri: string) => addTorrentMagnet(magnetUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "torrents"] });
    },
  });
}

// --- Speed Limits ---

export function useSpeedLimitsMode() {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "speedLimitsMode"],
    queryFn: getSpeedLimitsMode,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled,
  });
}

export function useToggleSpeedLimitsMode() {
  const queryClient = useQueryClient();
  const key = ["qbittorrent", "speedLimitsMode"];
  return useMutation({
    mutationFn: toggleSpeedLimitsMode,
    // Flip the switch immediately so the UI reflects the tap; revert on error.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData<boolean>(key, !(prev ?? false));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData<boolean>(key, ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    },
  });
}

export function useSpeedPreferences() {
  const enabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "speedPreferences"],
    queryFn: getSpeedPreferences,
    enabled,
  });
}

export function useSetGlobalSpeedLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    // Limits are bytes/s; 0 = unlimited.
    mutationFn: async (limits: { dl?: number; up?: number }) => {
      if (limits.dl !== undefined) await setDownloadLimit(limits.dl);
      if (limits.up !== undefined) await setUploadLimit(limits.up);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "speedPreferences"] });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    },
  });
}

export function useSetAltSpeedLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    // Limits are bytes/s; 0 = unlimited.
    mutationFn: (limits: { dl?: number; up?: number }) => setAltSpeedLimits(limits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "speedPreferences"] });
      queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    },
  });
}
