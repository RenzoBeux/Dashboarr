import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Pause, Play, CheckCircle } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useAllTorrents, usePauseTorrent, useResumeTorrent } from "@/hooks/use-qbittorrent";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { formatSpeed, formatEta, truncateText } from "@/lib/utils";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  DOWNLOADS_DEFAULT_SETTINGS,
  type DownloadsSettingsValue,
  type DownloadsSortBy,
} from "@/components/dashboard/widget-settings/downloads-settings";
import type { QBTorrent, TorrentState } from "@/lib/types";

type StateGroup = "downloading" | "seeding" | "paused" | "errored" | "other";

// qBittorrent uses 8640000 (100 days) as a sentinel for "unknown ETA". Treat
// that and anything larger as missing so it sorts to the end.
const ETA_UNKNOWN = 8640000;

function classifyState(state: TorrentState): StateGroup {
  if (state === "error" || state === "missingFiles") return "errored";
  if (state === "pausedDL" || state === "pausedUP") return "paused";
  if (
    state === "downloading" ||
    state === "metaDL" ||
    state === "stalledDL" ||
    state === "queuedDL" ||
    state === "forcedDL" ||
    state === "checkingDL" ||
    state === "allocating"
  ) {
    return "downloading";
  }
  if (
    state === "uploading" ||
    state === "stalledUP" ||
    state === "queuedUP" ||
    state === "forcedUP" ||
    state === "checkingUP"
  ) {
    return "seeding";
  }
  return "other";
}

function compareTorrents(a: QBTorrent, b: QBTorrent, sortBy: DownloadsSortBy): number {
  switch (sortBy) {
    case "speed": {
      // Combined throughput so a busy seeder ranks alongside a fast downloader.
      const aSpeed = a.dlspeed + a.upspeed;
      const bSpeed = b.dlspeed + b.upspeed;
      return bSpeed - aSpeed;
    }
    case "progress":
      return b.progress - a.progress;
    case "eta": {
      const aEta = !a.eta || a.eta >= ETA_UNKNOWN ? Number.POSITIVE_INFINITY : a.eta;
      const bEta = !b.eta || b.eta >= ETA_UNKNOWN ? Number.POSITIVE_INFINITY : b.eta;
      return aEta - bEta;
    }
    case "added":
      return b.added_on - a.added_on;
  }
}

export function DownloadCard() {
  const { settings } = useWidgetSettings<DownloadsSettingsValue>(
    "downloads",
    DOWNLOADS_DEFAULT_SETTINGS,
  );
  const { data: torrents, isLoading } = useAllTorrents();
  const router = useRouter();

  const allowedGroups = new Set<StateGroup>();
  if (settings.showDownloading) allowedGroups.add("downloading");
  if (settings.showSeeding) allowedGroups.add("seeding");
  if (settings.showPaused) allowedGroups.add("paused");
  if (settings.showErrored) allowedGroups.add("errored");

  const filtered = (torrents ?? [])
    .filter((t) => allowedGroups.has(classifyState(t.state)))
    .sort((a, b) => compareTorrents(a, b, settings.sortBy));

  const displayTorrents = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;
  const allHidden = allowedGroups.size === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Downloads</CardTitle>
        {filtered.length > 0 && (
          <Text className="text-zinc-500 text-sm">{filtered.length}</Text>
        )}
      </CardHeader>

      {allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All states hidden — enable one in the widget settings.
        </Text>
      ) : isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : displayTorrents.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} color="#71717a" />}
          title="Nothing to show"
        />
      ) : (
        <View className="gap-3">
          {displayTorrents.map((torrent) => (
            <TorrentRow
              key={torrent.hash}
              torrent={torrent}
              onPress={() => router.push(`/torrent/${torrent.hash}`)}
            />
          ))}
          {hasMore && (
            <Pressable
              onPress={() => router.push("/(tabs)/downloads")}
              className="active:opacity-70"
            >
              <Text className="text-primary text-sm text-center font-medium">
                View All →
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

function TorrentRow({
  torrent,
  onPress,
}: {
  torrent: QBTorrent;
  onPress: () => void;
}) {
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();

  const isDownloading = torrent.state.includes("DL") || torrent.state === "downloading";
  const isPaused = torrent.state.includes("paused");

  const handleToggle = () => {
    lightHaptic();
    if (isPaused) {
      resumeMutation.mutate([torrent.hash]);
    } else {
      pauseMutation.mutate([torrent.hash]);
    }
  };

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm" numberOfLines={1}>
            {truncateText(torrent.name, 40)}
          </Text>
          <ProgressBar progress={torrent.progress} showLabel className="mt-1.5" />
          <View className="flex-row gap-3 mt-1">
            {isDownloading && (
              <Text className="text-zinc-500 text-xs">
                ↓ {formatSpeed(torrent.dlspeed)}
              </Text>
            )}
            {torrent.upspeed > 0 && (
              <Text className="text-zinc-500 text-xs">
                ↑ {formatSpeed(torrent.upspeed)}
              </Text>
            )}
            {torrent.eta > 0 && torrent.eta < ETA_UNKNOWN && (
              <Text className="text-zinc-500 text-xs">
                ETA {formatEta(torrent.eta)}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={handleToggle}
          className="p-2 active:opacity-70"
          hitSlop={8}
        >
          {isPaused ? (
            <Play size={20} color="#3b82f6" />
          ) : (
            <Pause size={20} color="#f59e0b" />
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}
