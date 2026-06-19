import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";
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
  CALENDAR_DEFAULT_SETTINGS,
  type CalendarSettingsValue,
} from "@/components/dashboard/widget-settings/calendar-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import {
  airDateKey,
  formatEpisodeCode,
  relativeDate,
  getDateOffset,
  localDateKey,
  releaseDateKey,
} from "@/lib/utils";
import {
  getCalendar as getSonarrCalendar,
  getQueue as getSonarrQueue,
} from "@/services/sonarr-api";
import {
  getCalendar as getRadarrCalendar,
  getQueue as getRadarrQueue,
} from "@/services/radarr-api";
import { CalendarEventRow } from "@/components/common/calendar-event-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import type { SonarrCalendarEntry, RadarrMovie } from "@/lib/types";

type CalendarItem =
  | {
      kind: "episode";
      date: string;
      entry: SonarrCalendarEntry;
      instanceId: string;
    }
  | { kind: "movie"; date: string; movie: RadarrMovie; instanceId: string };

function pickRadarrDate(
  movie: RadarrMovie,
  type: CalendarSettingsValue["radarrReleaseType"],
): string | null {
  const cinemas = movie.inCinemas;
  const digital = movie.digitalRelease;
  const physical = movie.physicalRelease;
  switch (type) {
    case "cinemas":
      return cinemas ?? null;
    case "digital":
      return digital ?? null;
    case "physical":
      return physical ?? null;
    case "any":
    default:
      // Match the Calendar tab's waterfall (digital → physical → cinemas)
      // so the same movie lands on the same day in both views. Picking the
      // earliest candidate diverged from the calendar and caused movies to
      // appear under different dates across the two surfaces.
      return digital ?? physical ?? cinemas ?? null;
  }
}

function isToday(dateString: string): boolean {
  return dateString === localDateKey();
}

export function CalendarCard({ slotId }: WidgetComponentProps) {
  const router = useRouter();
  const { settings } = useWidgetSettings<CalendarSettingsValue>(
    slotId,
    CALENDAR_DEFAULT_SETTINGS,
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

  // Fan out the calendar fetch across each resolved instance per kind. The
  // instance id is folded into the query key so two Sonarrs don't trample
  // each other's cached calendar.
  // Padded ±1 day so boundary episodes whose UTC day differs from the local
  // day survive the server-side range filter; the [todayIso, horizonIso]
  // client filter below keeps the display window exact.
  const start = getDateOffset(-1);
  const end = getDateOffset(settings.daysAhead + 1);
  const sonarrQueries = useQueries({
    queries: showSonarr
      ? sonarrInstances.map((inst) => ({
          queryKey: ["sonarr", inst.id, "calendar", settings.daysAhead] as const,
          queryFn: () => getSonarrCalendar(start, end, {}, inst.id),
          refetchInterval: POLLING_INTERVALS.calendar,
        }))
      : [],
  });
  const radarrQueries = useQueries({
    queries: showRadarr
      ? radarrInstances.map((inst) => ({
          queryKey: ["radarr", inst.id, "calendar", settings.daysAhead] as const,
          queryFn: () => getRadarrCalendar(start, end, {}, inst.id),
          refetchInterval: POLLING_INTERVALS.calendar,
        }))
      : [],
  });

  // Download queues per instance, so a release already grabbing reads purple —
  // same indicator as the poster grid, detail screens and Calendar tab (#207).
  // Shares the ["sonarr"/"radarr", id, "queue"] cache the rest of the app polls.
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
  // instance just contributes nothing to the merged calendar instead of
  // flickering the card every refetch tick.
  const sonarrState = aggregateMultiInstanceState(sonarrQueries);
  const radarrState = aggregateMultiInstanceState(radarrQueries);
  const isLoading =
    (showSonarr && !sonarrState.hasAnyData && sonarrState.isInitialLoading) ||
    (showRadarr && !radarrState.hasAnyData && radarrState.isInitialLoading);

  const todayIso = localDateKey();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + settings.daysAhead);
  const horizonIso = localDateKey(horizon);

  const items: CalendarItem[] = [];
  if (showSonarr) {
    sonarrQueries.forEach((q, i) => {
      const instanceId = sonarrInstances[i]?.id;
      if (!instanceId) return;
      for (const ep of q.data ?? []) {
        const date = airDateKey(ep);
        if (!date || date < todayIso || date > horizonIso) continue;
        // No air-time filter: the Calendar tab shows every episode that
        // airs on a given day regardless of clock, and this widget must
        // stay in lockstep with it (otherwise "Today" disappears from the
        // dashboard the moment a show's primetime slot passes while the
        // calendar still lists it).
        items.push({ kind: "episode", date, entry: ep, instanceId });
      }
    });
  }
  if (showRadarr) {
    radarrQueries.forEach((q, i) => {
      const instanceId = radarrInstances[i]?.id;
      if (!instanceId) return;
      for (const movie of q.data ?? []) {
        const date = releaseDateKey(
          pickRadarrDate(movie, settings.radarrReleaseType),
        );
        if (!date || date < todayIso || date > horizonIso) continue;
        items.push({ kind: "movie", date, movie, instanceId });
      }
    });
  }

  const grouped = groupByDate(items);

  const noSources = !showSonarr && !showRadarr;
  const noServicesEnabled = !sonarrEnabled && !radarrEnabled;

  const headerCount = items.length;
  const headerNoun = headerCount === 1 ? "release" : "releases";

  return (
    <Card>
      <CardHeaderLink
        title="Releasing Soon"
        onPress={() => router.push("/(tabs)/calendar")}
        trailing={
          !noSources && headerCount > 0 ? (
            <Text className="text-zinc-500 text-sm">
              {headerCount} {headerNoun}
            </Text>
          ) : null
        }
      />

      {noSources ? (
        <EmptyState
          icon={<Icon icon={CalendarDays} size={32} color="#71717a" />}
          title="No calendar sources"
          message={
            noServicesEnabled
              ? "Configure Sonarr or Radarr in app settings to populate the calendar."
              : "Enable Sonarr or Radarr in the widget settings."
          }
        />
      ) : isLoading ? (
        <CalendarSkeleton />
      ) : grouped.length === 0 ? (
        <EmptyState
          compact
          title={`Nothing in the next ${settings.daysAhead} days`}
        />
      ) : (
        <View className="gap-4">
          {grouped.map(({ date, entries }) => (
            <View key={date} className="gap-2">
              <Text
                className={`text-xs font-semibold ${
                  isToday(date) ? "text-primary" : "text-zinc-500"
                }`}
              >
                {relativeDate(date)}
              </Text>
              <View className="gap-2">
                {entries.map((item) =>
                  item.kind === "episode" ? (
                    <EpisodeRow
                      key={`ep-${item.instanceId}-${item.entry.id}`}
                      entry={item.entry}
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
                    <MovieRow
                      key={`mv-${item.instanceId}-${item.movie.id}`}
                      movie={item.movie}
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

function CalendarSkeleton() {
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
  items: CalendarItem[],
): { date: string; entries: CalendarItem[] }[] {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = groups.get(item.date);
    if (list) list.push(item);
    else groups.set(item.date, [item]);
  }

  return Array.from(groups.entries())
    .map(([date, entries]) => ({
      date,
      entries: entries.sort((a, b) => titleOf(a).localeCompare(titleOf(b))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function titleOf(item: CalendarItem): string {
  return item.kind === "episode" ? item.entry.series.title : item.movie.title;
}

function EpisodeRow({
  entry,
  downloading,
  onPress,
}: {
  entry: SonarrCalendarEntry;
  downloading: boolean;
  onPress: () => void;
}) {
  return (
    <CalendarEventRow
      images={entry.series.images}
      service="sonarr"
      title={entry.series.title}
      subtitle={`${formatEpisodeCode(entry.seasonNumber, entry.episodeNumber)} — ${entry.title}`}
      hasFile={entry.hasFile}
      downloading={downloading}
      onPress={onPress}
    />
  );
}

function MovieRow({
  movie,
  downloading,
  onPress,
}: {
  movie: RadarrMovie;
  downloading: boolean;
  onPress: () => void;
}) {
  return (
    <CalendarEventRow
      images={movie.images}
      service="radarr"
      title={movie.title}
      subtitle={movie.year ? `${movie.year} • Movie` : "Movie"}
      hasFile={movie.hasFile}
      downloading={downloading}
      onPress={onPress}
    />
  );
}
