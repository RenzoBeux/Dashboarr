import { Disc3 } from "lucide-react-native";
import { getQueue, getWantedMissing, getLidarrAlbumCover } from "@/services/lidarr-api";
import type { LidarrQueue, LidarrWantedMissing } from "@/lib/types";
import type { ArrQueueAdapter } from "@/lib/arr-queue-adapter";

export const lidarrArrQueueAdapter: ArrQueueAdapter = {
  serviceId: "lidarr",
  displayName: "Lidarr",
  listRoute: "/(tabs)/music",
  emptyQueueLabel: "No albums in queue",
  badgeColor: "rgba(168, 85, 247, 0.9)",
  fallbackIcon: Disc3,

  queueQueryKey: (instanceId) => ["lidarr", instanceId, "queue"] as const,
  wantedQueryKey: (instanceId) => ["lidarr", instanceId, "wanted"] as const,

  // Same key + args as useLidarrQueue, so the widget shares its cache entry.
  fetchQueue: (instanceId) => getQueue(1, 20, instanceId),

  toItems: (data, instanceId) =>
    ((data as LidarrQueue).records ?? []).map((item) => ({
      id: item.id,
      posterUrl: getLidarrAlbumCover(item.album?.images),
      title: item.album?.title || item.title,
      // Prefer the artist name; fall back to the ETA when it's unknown.
      subtitle:
        item.artist?.artistName ??
        (item.timeleft ? `ETA ${item.timeleft}` : undefined),
      qualityLabel: item.quality.quality.name,
      progress: item.size > 0 ? (item.size - item.sizeleft) / item.size : 0,
      // Album ids aren't globally unique across instances, so the detail link
      // carries the source instance id.
      detailPath: item.albumId
        ? `/album/${item.albumId}?instanceId=${instanceId}`
        : null,
    })),

  fetchWanted: (instanceId) => getWantedMissing(1, 1, instanceId),
  wantedCount: (data) => (data as LidarrWantedMissing).totalRecords ?? 0,
};
