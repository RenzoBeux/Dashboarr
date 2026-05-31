import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import {
  Pause,
  Play,
  AlertTriangle,
  Download,
  Upload,
  CircleAlert,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useTorrentPosterMap } from "@/hooks/use-torrent-poster-map";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { lightHaptic } from "@/lib/haptics";
import { formatSpeed, formatEta } from "@/lib/utils";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  DOWNLOADS_DEFAULT_SETTINGS,
  type DownloadsSettingsValue,
  type DownloadsSortBy,
} from "@/components/dashboard/widget-settings/downloads-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { isTorrentPaused, type QBTorrent, type TorrentState } from "@/lib/types";
import {
  getTorrents,
  type QBTorrentFilter,
  type GetTorrentsOptions,
} from "@/services/qbittorrent-api";
import { getRtorrentTorrents } from "@/services/rtorrent-api";
import { qbittorrentTorrentAdapter } from "@/lib/torrent-adapters/qbittorrent";
import { rtorrentTorrentAdapter } from "@/lib/torrent-adapters/rtorrent";
import type { TorrentStatus, UnifiedTorrent } from "@/lib/torrent-adapter";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

type StateGroup = "downloading" | "seeding" | "paused" | "errored" | "other";

const ETA_UNKNOWN = 8640000;

// Source-agnostic display row. Each client computes its own `group` with its
// native classifier (so qBittorrent's exact grouping is preserved) and the rest
// of the card operates uniformly on these rows.
interface DownloadRow {
  serviceId: "qbittorrent" | "rtorrent";
  instanceId: string;
  hash: string;
  name: string;
  progress: number;
  dlSpeed: number;
  upSpeed: number;
  eta: number;
  addedOn: number;
  isPaused: boolean;
  group: StateGroup;
  canDrillIn: boolean;
}

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

// rtorrent normalized status → display group. Transitional states (stalled /
// checking / queued) split on completeness the same way qBittorrent's DL/UP
// suffixes do.
function classifyRtStatus(status: TorrentStatus, progress: number): StateGroup {
  switch (status) {
    case "errored":
      return "errored";
    case "paused":
      return "paused";
    case "seeding":
      return "seeding";
    case "downloading":
      return "downloading";
    case "stalled":
    case "checking":
    case "queued":
      return progress >= 1 ? "seeding" : "downloading";
    case "other":
      return "other";
  }
}

function qbRow(t: QBTorrent, instanceId: string): DownloadRow {
  return {
    serviceId: "qbittorrent",
    instanceId,
    hash: t.hash,
    name: t.name,
    progress: t.progress,
    dlSpeed: t.dlspeed,
    upSpeed: t.upspeed,
    eta: t.eta,
    addedOn: t.added_on,
    isPaused: isTorrentPaused(t.state),
    group: classifyState(t.state),
    canDrillIn: true,
  };
}

function rtRow(t: UnifiedTorrent, instanceId: string): DownloadRow {
  return {
    serviceId: "rtorrent",
    instanceId,
    hash: t.hash,
    name: t.name,
    progress: t.progress,
    dlSpeed: t.dlSpeed,
    upSpeed: t.upSpeed,
    eta: t.eta,
    addedOn: t.addedOn,
    isPaused: t.status === "paused",
    group: classifyRtStatus(t.status, t.progress),
    canDrillIn: false,
  };
}

function compareRows(a: DownloadRow, b: DownloadRow, sortBy: DownloadsSortBy): number {
  switch (sortBy) {
    case "speed":
      return b.dlSpeed + b.upSpeed - (a.dlSpeed + a.upSpeed);
    case "progress":
      return b.progress - a.progress;
    case "eta": {
      const ae = !a.eta || a.eta >= ETA_UNKNOWN || a.eta < 0 ? Number.POSITIVE_INFINITY : a.eta;
      const be = !b.eta || b.eta >= ETA_UNKNOWN || b.eta < 0 ? Number.POSITIVE_INFINITY : b.eta;
      return ae - be;
    }
    case "added":
      return b.addedOn - a.addedOn;
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

export function DownloadCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<DownloadsSettingsValue>(
    slotId,
    DOWNLOADS_DEFAULT_SETTINGS,
  );
  const { sort, reverse } = sortByToQB(settings.sortBy);
  const queryOptions: GetTorrentsOptions = {
    filter: pickServerFilter(settings),
    sort,
    reverse,
    limit: DASHBOARD_FETCH_LIMIT,
  };
  // Aggregate across all enabled qBittorrent instances when bound to "all";
  // narrow to the bound subset otherwise. Each instance keeps its own cache
  // slot via the [serviceId, instanceId, …] queryKey shape.
  const allQbInstances = useEnabledInstances("qbittorrent");
  const qbInstances = resolveBoundInstances(settings.instanceIds, allQbInstances);
  // rtorrent has no per-widget instance binding yet (phase 2) — include every
  // enabled rtorrent instance, fetched in full (rtorrent returns the whole
  // library in one call) and classified/sorted/capped client-side below.
  const rtInstances = useEnabledInstances("rtorrent");

  const qbQueries = useQueries({
    queries: qbInstances.map((inst) => ({
      queryKey: ["qbittorrent", inst.id, "torrents", "list", queryOptions] as const,
      queryFn: () => getTorrents(queryOptions, inst.id),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: true,
    })),
  });
  const rtQueries = useQueries({
    queries: rtInstances.map((inst) => ({
      queryKey: ["rtorrent", inst.id, "torrents", "all"] as const,
      queryFn: () => getRtorrentTorrents(inst.id),
      refetchInterval: POLLING_INTERVALS.activeTorrents,
      enabled: true,
    })),
  });
  const posterMap = useTorrentPosterMap();
  const router = useRouter();

  const allowedGroups = new Set<StateGroup>();
  if (settings.showDownloading) allowedGroups.add("downloading");
  if (settings.showSeeding) allowedGroups.add("seeding");
  if (settings.showPaused) allowedGroups.add("paused");
  if (settings.showErrored) allowedGroups.add("errored");

  // Skeleton only when no instance has produced data yet; once any instance is
  // back, render whatever we have so a single failing client doesn't flicker
  // the card every refetch tick. See lib/multi-instance-query.ts.
  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState([
    ...qbQueries,
    ...rtQueries,
  ]);

  const totalInstances = qbInstances.length + rtInstances.length;

  // Tag each torrent with its source so per-tile actions hit the right client.
  const rows: DownloadRow[] = [
    ...qbQueries.flatMap((q, i) =>
      (q.data ?? []).map((t) => qbRow(t, qbInstances[i].id)),
    ),
    ...rtQueries.flatMap((q, i) =>
      (q.data ?? []).map((t) => rtRow(t, rtInstances[i].id)),
    ),
  ];

  const filtered = rows
    .filter((row) => allowedGroups.has(row.group))
    .sort((a, b) => compareRows(a, b, settings.sortBy));

  const displayTorrents = filtered.slice(0, settings.maxItems);
  const hasMore = filtered.length > settings.maxItems;
  const allHidden = allowedGroups.size === 0;
  const showMultiInstanceLabel = totalInstances > 1;

  return (
    <Card>
      <CardHeaderLink
        title="Downloads"
        onPress={() => router.push("/(tabs)/downloads")}
        trailing={
          filtered.length > 0 ? (
            <Text className="text-zinc-500 text-sm">
              {filtered.length}
              {showMultiInstanceLabel ? ` · ${totalInstances}` : ""}
            </Text>
          ) : null
        }
      />

      {totalInstances === 0 ? (
        <EmptyState compact title="No torrent clients enabled" />
      ) : allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All states hidden — enable one in the widget settings.
        </Text>
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : isAllErrored ? (
        <EmptyState
          icon={<Icon icon={AlertTriangle} size={32} color="#f59e0b" />}
          title="Couldn't load downloads"
          message="Check your torrent client is reachable and credentials are correct."
        />
      ) : displayTorrents.length === 0 ? (
        <EmptyState compact title="Nothing to show" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {displayTorrents.map((row) => (
            <TorrentTile
              key={`${row.serviceId}:${row.instanceId}:${row.hash}`}
              row={row}
              posterEntry={posterMap.get(row.hash.toLowerCase())}
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
  row,
  posterEntry,
}: {
  row: DownloadRow;
  posterEntry: ReturnType<typeof useTorrentPosterMap>["get"] extends (
    k: string,
  ) => infer R
    ? R
    : never;
}) {
  const router = useRouter();
  // serviceId is fixed per tile (the row key includes it), so the adapter ref —
  // and thus its hooks — stays stable across this tile's renders.
  const adapter =
    row.serviceId === "rtorrent" ? rtorrentTorrentAdapter : qbittorrentTorrentAdapter;
  // Mutations are scoped to the source instance so a Pause tap on a tile from
  // instance A doesn't pause a same-hash torrent on instance B.
  const pauseMutation = adapter.usePauseTorrent(row.instanceId);
  const resumeMutation = adapter.useResumeTorrent(row.instanceId);

  const stateBadge = STATE_BADGE[row.group];

  const handleToggle = () => {
    lightHaptic();
    if (row.isPaused) {
      resumeMutation.mutate([row.hash]);
    } else {
      pauseMutation.mutate([row.hash]);
    }
  };

  const subtitle =
    row.group === "downloading"
      ? formatSpeed(row.dlSpeed)
      : row.eta > 0 && row.eta < ETA_UNKNOWN
        ? `ETA ${formatEta(row.eta)}`
        : row.upSpeed > 0
          ? `↑ ${formatSpeed(row.upSpeed)}`
          : undefined;

  return (
    <MediaPosterTile
      posterUrl={posterEntry?.posterUrl ?? null}
      title={posterEntry?.title ?? row.name}
      subtitle={subtitle}
      cornerBadge={
        stateBadge
          ? { icon: stateBadge.icon, color: stateBadge.color }
          : undefined
      }
      bottomLeftBadge={{
        icon: row.isPaused ? Play : Pause,
        color: row.isPaused
          ? "rgba(59, 130, 246, 0.9)"
          : "rgba(245, 158, 11, 0.9)",
        onPress: handleToggle,
      }}
      bottomOverlay={<PosterProgressStrip progress={row.progress} />}
      mediaType={posterEntry?.mediaType}
      fallbackIcon={!posterEntry ? Download : undefined}
      onPress={row.canDrillIn ? () => router.push(`/torrent/${row.hash}`) : undefined}
    />
  );
}
