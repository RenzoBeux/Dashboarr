import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  Pause,
  Play,
  CheckCircle,
  AlertTriangle,
  Download,
  Upload,
  CircleAlert,
} from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useTorrents, usePauseTorrent, useResumeTorrent } from "@/hooks/use-qbittorrent";
import { useTorrentPosterMap } from "@/hooks/use-torrent-poster-map";
import { lightHaptic } from "@/lib/haptics";
import { formatSpeed, formatEta } from "@/lib/utils";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  DOWNLOADS_DEFAULT_SETTINGS,
  type DownloadsSettingsValue,
  type DownloadsSortBy,
} from "@/components/dashboard/widget-settings/downloads-settings";
import { isTorrentPaused, type QBTorrent, type TorrentState } from "@/lib/types";
import type { QBTorrentFilter, GetTorrentsOptions } from "@/services/qbittorrent-api";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

type StateGroup = "downloading" | "seeding" | "paused" | "errored" | "other";

const ETA_UNKNOWN = 8640000;

function classifyState(state: TorrentState): StateGroup {
  if (state === "error" || state === "missingFiles") return "errored";
  if (isTorrentPaused(state)) return "paused";
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

function sortByToQB(sortBy: DownloadsSortBy): { sort: keyof QBTorrent; reverse: boolean } {
  switch (sortBy) {
    case "speed":
      return { sort: "dlspeed", reverse: true };
    case "progress":
      return { sort: "progress", reverse: true };
    case "eta":
      return { sort: "eta", reverse: false };
    case "added":
      return { sort: "added_on", reverse: true };
  }
}

function pickServerFilter(s: DownloadsSettingsValue): QBTorrentFilter | undefined {
  const flags: { flag: boolean; filter: QBTorrentFilter }[] = [
    { flag: s.showDownloading, filter: "downloading" },
    { flag: s.showSeeding, filter: "seeding" },
    { flag: s.showPaused, filter: "paused" },
    { flag: s.showErrored, filter: "errored" },
  ];
  const active = flags.filter((f) => f.flag);
  return active.length === 1 ? active[0].filter : undefined;
}

const DASHBOARD_FETCH_LIMIT = 100;

const STATE_BADGE: Record<
  StateGroup,
  { color: string; icon: typeof Download } | null
> = {
  downloading: { color: "rgba(59, 130, 246, 0.9)", icon: Download },
  seeding: { color: "rgba(34, 197, 94, 0.9)", icon: Upload },
  paused: { color: "rgba(245, 158, 11, 0.9)", icon: Pause },
  errored: { color: "rgba(239, 68, 68, 0.9)", icon: CircleAlert },
  other: null,
};

export function DownloadCard() {
  const { settings } = useWidgetSettings<DownloadsSettingsValue>(
    "downloads",
    DOWNLOADS_DEFAULT_SETTINGS,
  );
  const { sort, reverse } = sortByToQB(settings.sortBy);
  const queryOptions: GetTorrentsOptions = {
    filter: pickServerFilter(settings),
    sort,
    reverse,
    limit: DASHBOARD_FETCH_LIMIT,
  };
  const { data: torrents, isLoading, isError } = useTorrents(queryOptions);
  const posterMap = useTorrentPosterMap();
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
      <CardHeaderLink
        title="Downloads"
        onPress={() => router.push("/(tabs)/downloads")}
        trailing={
          filtered.length > 0 ? (
            <Text className="text-zinc-500 text-sm">{filtered.length}</Text>
          ) : null
        }
      />

      {allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All states hidden — enable one in the widget settings.
        </Text>
      ) : isLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle size={32} color="#f59e0b" />}
          title="Couldn't load downloads"
          message="Check qBittorrent is reachable and credentials are correct."
        />
      ) : displayTorrents.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} color="#71717a" />}
          title="Nothing to show"
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {displayTorrents.map((torrent) => (
            <TorrentTile
              key={torrent.hash}
              torrent={torrent}
              posterEntry={posterMap.get(torrent.hash.toLowerCase())}
            />
          ))}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/downloads")} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}

function TorrentTile({
  torrent,
  posterEntry,
}: {
  torrent: QBTorrent;
  posterEntry: ReturnType<typeof useTorrentPosterMap>["get"] extends (
    k: string,
  ) => infer R
    ? R
    : never;
}) {
  const router = useRouter();
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();

  const isDownloading =
    torrent.state.includes("DL") || torrent.state === "downloading";
  const isPaused = isTorrentPaused(torrent.state);
  const stateGroup = classifyState(torrent.state);
  const stateBadge = STATE_BADGE[stateGroup];

  const handleToggle = () => {
    lightHaptic();
    if (isPaused) {
      resumeMutation.mutate([torrent.hash]);
    } else {
      pauseMutation.mutate([torrent.hash]);
    }
  };

  const subtitle = isDownloading
    ? formatSpeed(torrent.dlspeed)
    : torrent.eta > 0 && torrent.eta < ETA_UNKNOWN
      ? `ETA ${formatEta(torrent.eta)}`
      : torrent.upspeed > 0
        ? `↑ ${formatSpeed(torrent.upspeed)}`
        : undefined;

  return (
    <MediaPosterTile
      posterUrl={posterEntry?.posterUrl ?? null}
      title={posterEntry?.title ?? torrent.name}
      subtitle={subtitle}
      cornerBadge={
        stateBadge
          ? { icon: stateBadge.icon, color: stateBadge.color }
          : undefined
      }
      bottomLeftBadge={{
        icon: isPaused ? Play : Pause,
        color: isPaused
          ? "rgba(59, 130, 246, 0.9)"
          : "rgba(245, 158, 11, 0.9)",
        onPress: handleToggle,
      }}
      bottomOverlay={<PosterProgressStrip progress={torrent.progress} />}
      mediaType={posterEntry?.mediaType}
      fallbackIcon={!posterEntry ? Download : undefined}
      onPress={() => router.push(`/torrent/${torrent.hash}`)}
    />
  );
}
