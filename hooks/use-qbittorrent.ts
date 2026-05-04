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
} from "@/services/qbittorrent-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function useQBEnabled() {
  return useConfigStore((s) => s.services.qbittorrent.enabled);
}

export function useTransferInfo(enabled = true) {
  const serviceEnabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "transfer"],
    queryFn: getTransferInfo,
    refetchInterval: POLLING_INTERVALS.transferSpeed,
    enabled: serviceEnabled && enabled,
  });
}

export function useAllTorrents(
  filter?: "all" | "downloading" | "seeding" | "completed" | "paused" | "active" | "inactive" | "stalled",
  enabled = true,
) {
  const serviceEnabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "torrents", filter ?? "all"],
    queryFn: () => getTorrents(filter),
    refetchInterval: POLLING_INTERVALS.activeTorrents,
    enabled: serviceEnabled && enabled,
  });
}

export function useTorrentFiles(hash: string, enabled = true) {
  const serviceEnabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "files", hash],
    queryFn: () => getTorrentFiles(hash),
    enabled: serviceEnabled && enabled && !!hash,
  });
}

export function useTorrentTrackers(hash: string, enabled = true) {
  const serviceEnabled = useQBEnabled();
  return useQuery({
    queryKey: ["qbittorrent", "trackers", hash],
    queryFn: () => getTorrentTrackers(hash),
    enabled: serviceEnabled && enabled && !!hash,
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
