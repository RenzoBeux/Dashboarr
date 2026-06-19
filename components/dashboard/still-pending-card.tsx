import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Hourglass, Search } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfigStore } from "@/store/config-store";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  STILL_PENDING_DEFAULT_SETTINGS,
  type StillPendingSettingsValue,
} from "@/components/dashboard/widget-settings/still-pending-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import {
  airDateKey,
  formatEpisodeCode,
  relativeDate,
  getDateOffset,
  localDateKey,
} from "@/lib/utils";
import {
  getWantedMissing as getSonarrWantedMissing,
  getQueue as getSonarrQueue,
} from "@/services/sonarr-api";
import {
  getAllWantedMissing as getRadarrWantedMissing,
  getQueue as getRadarrQueue,
} from "@/services/radarr-api";
import { radarrReleaseTime } from "@/lib/radarr-release-date";
import { useSearchForMovie } from "@/hooks/use-radarr";
import { useSearchForEpisodes } from "@/hooks/use-sonarr";
import { CalendarEventRow } from "@/components/common/calendar-event-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import {
  radarrBarKind,
  sonarrEpisodeBarKind,
  BAR_KIND_COLOR,
} from "@/lib/arr-poster-status";
import type { SonarrEpisode, RadarrMovie } from "@/lib/types";

type PendingItem =
  | { kind: "episode"; date: string; entry: SonarrEpisode; instanceId: string }
  | { kind: "movie"; date: string; movie: RadarrMovie; instanceId: string };

// The calendar widget owns today and the future; this widget lists what's
// strictly overdue, so by default an item never appears on both cards. The
// "Include today" setting opts into already-aired/released same-day items at
// the cost of them showing on both cards.
export function StillPendingCard({ slotId }: WidgetComponentProps) {
  const router = useRouter();
  const { settings } = useWidgetSettings<StillPendingSettingsValue>(
    slotId,
    STILL_PENDING_DEFAULT_SETTINGS,
  );
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);

  const showSonarr = settings.includeSonarr && sonarrEnabled;
  const showRadarr = settings.includeRadarr && radarrEnabled;

  const sonarrInstances = useWorkspaceScopedInstances(
    "sonarr",
    settings.sonarrInstanceIds,
  );
  const radarrInstances = useWorkspaceScopedInstances(
    "radarr",
    settings.radarrInstanceIds,
  );

  const sonarrQueries = useQueries({
    queries: showSonarr
      ? sonarrInstances.map((inst) => ({
          queryKey: ["sonarr", inst.id, "wanted", "recent"] as const,
          queryFn: () => getSonarrWantedMissing(1, 100, inst.id),
          refetchInterval: POLLING_INTERVALS.calendar,
        }))
      : [],
  });
  // Same key as the Movies Wanted tab's useWantedMissing so the dashboard and
  // the tab share one cache entry instead of double-fetching the full walk.
  const radarrQueries = useQueries({
    queries: showRadarr
      ? radarrInstances.map((inst) => ({
          queryKey: ["radarr", inst.id, "wanted", "all"] as const,
          queryFn: () => getRadarrWantedMissing(inst.id),
          refetchInterval: POLLING_INTERVALS.calendar,
        }))
      : [],
  });

  // Download queues per instance: an overdue item that's already grabbing reads
  // purple instead of the neutral "pending" spine — same indicator as the rest
  // of the app (issue #207). Shares the ["sonarr"/"radarr", id, "queue"] cache.
  const sonarrQueueQueries = useQueries({
    queries: showSonarr
      ? sonarrInstances.map((inst) => ({
          queryKey: ["sonarr", inst.id, "queue"] as const,
          queryFn: () => getSonarrQueue(1, 20, true, true, inst.id),
          refetchInterval: POLLING_INTERVALS.queue,
        }))
      : [],
  });
  const radarrQueueQueries = useQueries({
    queries: showRadarr
      ? radarrInstances.map((inst) => ({
          queryKey: ["radarr", inst.id, "queue"] as const,
          queryFn: () => getRadarrQueue(1, 20, true, inst.id),
          refetchInterval: POLLING_INTERVALS.queue,
        }))
      : [],
  });

  // Keyed by `instanceId:episodeId` / `instanceId:movieId` (ids aren't unique
  // across instances).
  const downloadingKeys = new Set<string>();
  sonarrQueueQueries.forEach((q, i) => {
    const instanceId = sonarrInstances[i]?.id;
    if (!instanceId) return;
    for (const r of q.data?.records ?? [])
      downloadingKeys.add(`${instanceId}:${r.episodeId}`);
  });
  radarrQueueQueries.forEach((q, i) => {
    const instanceId = radarrInstances[i]?.id;
    if (!instanceId) return;
    for (const r of q.data?.records ?? [])
      downloadingKeys.add(`${instanceId}:${r.movieId}`);
  });

  // Initial-load gate per kind — see lib/multi-instance-query.ts. The skeleton
  // shows only while we're truly cold across both kinds; a single failing
  // instance just contributes nothing to the merged list.
  const sonarrState = aggregateMultiInstanceState(sonarrQueries);
  const radarrState = aggregateMultiInstanceState(radarrQueries);
  const isLoading =
    (showSonarr && !sonarrState.hasAnyData && sonarrState.isInitialLoading) ||
    (showRadarr && !radarrState.hasAnyData && radarrState.isInitialLoading);

  const todayIso = localDateKey();
  const cutoffIso = getDateOffset(-settings.lookbackDays);

  const items: PendingItem[] = [];
  if (showSonarr) {
    sonarrQueries.forEach((q, i) => {
      const instanceId = sonarrInstances[i]?.id;
      if (!instanceId) return;
      for (const ep of q.data?.records ?? []) {
        // monitored=true is requested server-side; the client check is a
        // cheap guard. Undated episodes (unaired specials) are skipped.
        if (ep.hasFile || !ep.monitored || !ep.series) continue;
        const date = airDateKey(ep);
        if (!date || date < cutoffIso || date > todayIso) continue;
        if (date === todayIso) {
          if (!settings.includeToday) continue;
          // Today is hour-granular: only count an episode once its air time
          // has actually passed, so a primetime slot isn't "overdue" at 9am.
          const airedAt = ep.airDateUtc ? new Date(ep.airDateUtc).getTime() : null;
          if (airedAt === null || !Number.isFinite(airedAt) || airedAt > Date.now())
            continue;
        }
        items.push({ kind: "episode", date, entry: ep, instanceId });
      }
    });
  }
  if (showRadarr) {
    radarrQueries.forEach((q, i) => {
      const instanceId = radarrInstances[i]?.id;
      if (!instanceId) return;
      for (const movie of q.data?.records ?? []) {
        // wanted/missing records are monitored + missing by contract; the
        // effective release date replicates Radarr's own computation (#135).
        const t = radarrReleaseTime(movie);
        if (t === null) continue;
        const date = localDateKey(new Date(t));
        if (date < cutoffIso || date > todayIso) continue;
        // Movie release dates are day-granular — no air time to wait for, so
        // a today-dated movie is included outright when the toggle is on.
        if (date === todayIso && !settings.includeToday) continue;
        items.push({ kind: "movie", date, movie, instanceId });
      }
    });
  }

  // Newest-due first; alphabetical within a day. Slice after merging so the
  // cap applies across both services, then group the visible slice by day.
  items.sort(
    (a, b) => b.date.localeCompare(a.date) || titleOf(a).localeCompare(titleOf(b)),
  );
  const totalCount = items.length;
  const grouped = groupByDate(items.slice(0, settings.maxItems));

  const noSources = !showSonarr && !showRadarr;
  const noServicesEnabled = !sonarrEnabled && !radarrEnabled;

  return (
    <Card>
      <CardHeaderLink
        title="Still Pending"
        trailing={
          !noSources && totalCount > 0 ? (
            <Text className="text-zinc-500 text-sm">
              {totalCount} overdue
            </Text>
          ) : null
        }
      />

      {noSources ? (
        <EmptyState
          icon={<Icon icon={Hourglass} size={32} color="#71717a" />}
          title="No pending sources"
          message={
            noServicesEnabled
              ? "Configure Sonarr or Radarr in app settings to track overdue releases."
              : "Enable Sonarr or Radarr in the widget settings."
          }
        />
      ) : isLoading ? (
        <StillPendingSkeleton />
      ) : grouped.length === 0 ? (
        <EmptyState
          compact
          title={`Nothing overdue in the last ${settings.lookbackDays} days`}
        />
      ) : (
        <View className="gap-4">
          {grouped.map(({ date, entries }) => (
            <View key={date} className="gap-2">
              <Text
                className={`text-xs font-semibold ${
                  date === todayIso ? "text-primary" : "text-zinc-500"
                }`}
              >
                {relativeDate(date)}
              </Text>
              <View className="gap-2">
                {entries.map((item) =>
                  item.kind === "episode" ? (
                    <PendingEpisodeRow
                      key={`ep-${item.instanceId}-${item.entry.id}`}
                      entry={item.entry}
                      instanceId={item.instanceId}
                      downloading={downloadingKeys.has(
                        `${item.instanceId}:${item.entry.id}`,
                      )}
                      onPress={() =>
                        router.push(
                          `/series/${item.entry.seriesId}?instanceId=${item.instanceId}`,
                        )
                      }
                    />
                  ) : (
                    <PendingMovieRow
                      key={`mv-${item.instanceId}-${item.movie.id}`}
                      movie={item.movie}
                      instanceId={item.instanceId}
                      downloading={downloadingKeys.has(
                        `${item.instanceId}:${item.movie.id}`,
                      )}
                      onPress={() =>
                        router.push(
                          `/movie/${item.movie.id}?instanceId=${item.instanceId}`,
                        )
                      }
                    />
                  ),
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function StillPendingSkeleton() {
  return (
    <View className="gap-4">
      {Array.from({ length: 2 }).map((_, groupIdx) => (
        <View key={groupIdx} className="gap-2">
          <Skeleton width={80} height={12} borderRadius={4} />
          <View className="gap-2">
            {Array.from({ length: 2 }).map((_, rowIdx) => (
              <Skeleton key={rowIdx} width="100%" height={72} borderRadius={12} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function groupByDate(
  items: PendingItem[],
): { date: string; entries: PendingItem[] }[] {
  // Items arrive sorted date-descending, so Map insertion order already
  // yields newest-due groups first.
  const groups = new Map<string, PendingItem[]>();
  for (const item of items) {
    const list = groups.get(item.date);
    if (list) list.push(item);
    else groups.set(item.date, [item]);
  }
  return Array.from(groups.entries()).map(([date, entries]) => ({
    date,
    entries,
  }));
}

function titleOf(item: PendingItem): string {
  return item.kind === "episode"
    ? (item.entry.series?.title ?? "")
    : item.movie.title;
}

// Per-row search mutations are owned by the row components so each row scopes
// its command to the instance it came from (download-card TorrentTile pattern).
function PendingEpisodeRow({
  entry,
  instanceId,
  downloading,
  onPress,
}: {
  entry: SonarrEpisode;
  instanceId: string;
  downloading: boolean;
  onPress: () => void;
}) {
  const search = useSearchForEpisodes(instanceId);
  return (
    <CalendarEventRow
      images={entry.series?.images ?? []}
      service="sonarr"
      title={entry.series?.title ?? "Unknown series"}
      subtitle={`${formatEpisodeCode(entry.seasonNumber, entry.episodeNumber)} — ${entry.title}`}
      hasFile={false}
      downloading={downloading}
      barColor={BAR_KIND_COLOR[sonarrEpisodeBarKind(entry, downloading)]}
      onPress={onPress}
      action={{
        icon: Search,
        onPress: () => search.mutate([entry.id]),
        loading: search.isPending,
      }}
    />
  );
}

function PendingMovieRow({
  movie,
  instanceId,
  downloading,
  onPress,
}: {
  movie: RadarrMovie;
  instanceId: string;
  downloading: boolean;
  onPress: () => void;
}) {
  const search = useSearchForMovie(instanceId);
  return (
    <CalendarEventRow
      images={movie.images}
      service="radarr"
      title={movie.title}
      subtitle={movie.year ? `${movie.year} • Movie` : "Movie"}
      hasFile={false}
      downloading={downloading}
      barColor={BAR_KIND_COLOR[radarrBarKind(movie, downloading)]}
      onPress={onPress}
      action={{
        icon: Search,
        onPress: () => search.mutate(movie.id),
        loading: search.isPending,
      }}
    />
  );
}
