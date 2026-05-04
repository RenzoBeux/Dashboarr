import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRtTransferInfo,
  getRtTorrents,
  getRtTorrentFiles,
  getRtTorrentTrackers,
  pauseRtTorrents,
  resumeRtTorrents,
  deleteRtTorrents,
  addRtTorrentMagnet,
} from "@/services/rtorrent-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useRTEnabled() {
  return useConfigStore((s) => s.services.rtorrent.enabled);
}

export function useRTTransferInfo(enabled = true) {
  const serviceEnabled = useRTEnabled();
  return useQuery({
    queryKey: ["rtorrent", "transfer"],
    queryFn: getRtTransferInfo,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: serviceEnabled && enabled,
  });
}

export function useAllRTTorrents(
  filter?: "all" | "downloading" | "seeding" | "completed" | "paused",
  enabled = true,
) {
  const serviceEnabled = useRTEnabled();
  return useQuery({
    queryKey: ["rtorrent", "torrents", filter ?? "all"],
    queryFn: () => getRtTorrents(filter),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: serviceEnabled && enabled,
  });
}

export function useRTTorrentFiles(hash: string, enabled = true) {
  const serviceEnabled = useRTEnabled();
  return useQuery({
    queryKey: ["rtorrent", "files", hash],
    queryFn: () => getRtTorrentFiles(hash),
    enabled: serviceEnabled && enabled && !!hash,
  });
}

export function useRTTorrentTrackers(hash: string, enabled = true) {
  const serviceEnabled = useRTEnabled();
  return useQuery({
    queryKey: ["rtorrent", "trackers", hash],
    queryFn: () => getRtTorrentTrackers(hash),
    enabled: serviceEnabled && enabled && !!hash,
  });
}

export function usePauseRTTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hashes: string[]) => pauseRtTorrents(hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtorrent", "torrents"] });
    },
  });
}

export function useResumeRTTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hashes: string[]) => resumeRtTorrents(hashes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtorrent", "torrents"] });
    },
  });
}

export function useDeleteRTTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      hashes,
      deleteFiles = false,
      basePaths,
    }: {
      hashes: string[];
      deleteFiles?: boolean;
      basePaths?: string[];
    }) => deleteRtTorrents(hashes, deleteFiles, basePaths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtorrent", "torrents"] });
    },
  });
}

export function useAddRTTorrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (magnetUri: string) => addRtTorrentMagnet(magnetUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtorrent", "torrents"] });
    },
  });
}
