import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSonarrCalendar } from "@/hooks/use-sonarr";
import { useRadarrCalendar } from "@/hooks/use-radarr";
import { useConfigStore } from "@/store/config-store";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  CALENDAR_DEFAULT_SETTINGS,
  type CalendarSettingsValue,
} from "@/components/dashboard/widget-settings/calendar-settings";
import { formatEpisodeCode, relativeDate } from "@/lib/utils";
import { getSonarrPoster, getSonarrFanart } from "@/services/sonarr-api";
import { getRadarrPoster, getRadarrFanart } from "@/services/radarr-api";
import {
  MediaBackdropRow,
  BACKDROP_ROW_HEIGHT,
} from "@/components/dashboard/media-backdrop-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import type { SonarrCalendarEntry, RadarrMovie } from "@/lib/types";

type CalendarItem =
  | { kind: "episode"; date: string; entry: SonarrCalendarEntry }
  | { kind: "movie"; date: string; movie: RadarrMovie };

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
    default: {
      const candidates = [cinemas, digital, physical].filter(
        (d): d is string => typeof d === "string" && d.length > 0,
      );
      if (candidates.length === 0) return null;
      candidates.sort();
      return candidates[0];
    }
  }
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

function isToday(dateString: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateString === today;
}

export function CalendarCard() {
  const router = useRouter();
  const { settings } = useWidgetSettings<CalendarSettingsValue>(
    "calendar",
    CALENDAR_DEFAULT_SETTINGS,
  );
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr.enabled);
  const radarrEnabled = useConfigStore((s) => s.services.radarr.enabled);

  const showSonarr = settings.includeSonarr && sonarrEnabled;
  const showRadarr = settings.includeRadarr && radarrEnabled;

  const { data: episodes, isLoading: episodesLoading } = useSonarrCalendar(
    settings.daysAhead,
  );
  const { data: movies, isLoading: moviesLoading } = useRadarrCalendar(
    settings.daysAhead,
  );

  const isLoading =
    (showSonarr && episodesLoading) || (showRadarr && moviesLoading);

  const todayIso = new Date().toISOString().split("T")[0];
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + settings.daysAhead);
  const horizonIso = horizon.toISOString().split("T")[0];

  const items: CalendarItem[] = [];
  if (showSonarr && episodes) {
    for (const ep of episodes) {
      const date = isoDate(ep.airDate);
      if (date < todayIso || date > horizonIso) continue;
      items.push({ kind: "episode", date, entry: ep });
    }
  }
  if (showRadarr && movies) {
    for (const movie of movies) {
      const raw = pickRadarrDate(movie, settings.radarrReleaseType);
      if (!raw) continue;
      const date = isoDate(raw);
      if (date < todayIso || date > horizonIso) continue;
      items.push({ kind: "movie", date, movie });
    }
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
          icon={<Icon icon={CalendarDays} size={32} color="#71717a" />}
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
                      key={`ep-${item.entry.id}`}
                      entry={item.entry}
                      onPress={() =>
                        router.push(`/series/${item.entry.seriesId}`)
                      }
                    />
                  ) : (
                    <MovieRow
                      key={`mv-${item.movie.id}`}
                      movie={item.movie}
                      onPress={() => router.push(`/movie/${item.movie.id}`)}
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
              <Skeleton
                key={rowIdx}
                height={BACKDROP_ROW_HEIGHT}
                borderRadius={12}
              />
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

function StatusDot({ hasFile }: { hasFile: boolean }) {
  return (
    <View
      className="w-2 h-2 rounded-full"
      style={{ backgroundColor: hasFile ? "#22c55e" : "#52525b" }}
    />
  );
}

function EpisodeRow({
  entry,
  onPress,
}: {
  entry: SonarrCalendarEntry;
  onPress: () => void;
}) {
  return (
    <MediaBackdropRow
      posterUrl={getSonarrPoster(entry.series.images)}
      backdropUrl={getSonarrFanart(entry.series.images)}
      title={entry.series.title}
      subtitle={`${formatEpisodeCode(entry.seasonNumber, entry.episodeNumber)} — ${entry.title}`}
      rightAccessory={<StatusDot hasFile={entry.hasFile} />}
      mediaType="tv"
      onPress={onPress}
    />
  );
}

function MovieRow({
  movie,
  onPress,
}: {
  movie: RadarrMovie;
  onPress: () => void;
}) {
  return (
    <MediaBackdropRow
      posterUrl={getRadarrPoster(movie.images)}
      backdropUrl={getRadarrFanart(movie.images)}
      title={movie.title}
      subtitle={movie.year ? `${movie.year} • Movie` : "Movie"}
      rightAccessory={<StatusDot hasFile={movie.hasFile} />}
      mediaType="movie"
      onPress={onPress}
    />
  );
}
