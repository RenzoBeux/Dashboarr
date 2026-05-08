import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Captions } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getWantedMovies, getWantedEpisodes } from "@/services/bazarr-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useBazarrPosters } from "@/hooks/use-bazarr-posters";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  BAZARR_WANTED_DEFAULT_SETTINGS,
  type BazarrWantedSettingsValue,
} from "@/components/dashboard/widget-settings/bazarr-wanted-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

interface PreviewItem {
  key: string;
  title: string;
  subtitle: string;
  languages: string;
  mediaType: "movie" | "tv";
}

const MAX_PREVIEW = 5;

export function BazarrWantedCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<BazarrWantedSettingsValue>(
    slotId,
    BAZARR_WANTED_DEFAULT_SETTINGS,
  );
  const allInstances = useEnabledInstances("bazarr");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);
  const router = useRouter();

  const movieQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["bazarr", inst.id, "wanted", "movies"] as const,
      queryFn: () => getWantedMovies(0, 50, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });
  const episodeQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["bazarr", inst.id, "wanted", "episodes"] as const,
      queryFn: () => getWantedEpisodes(0, 50, inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  // Initial-load gate only — see lib/multi-instance-query.ts. We OR the
  // movies/episodes streams: if either has produced data we can render the
  // preview. A failing instance just contributes nothing to the totals.
  const movieState = aggregateMultiInstanceState(movieQueries);
  const episodeState = aggregateMultiInstanceState(episodeQueries);
  const isInitialLoading =
    !movieState.hasAnyData &&
    !episodeState.hasAnyData &&
    (movieState.isInitialLoading || episodeState.isInitialLoading);
  const totalMissing =
    movieQueries.reduce((acc, q) => acc + (q.data?.total ?? 0), 0) +
    episodeQueries.reduce((acc, q) => acc + (q.data?.total ?? 0), 0);

  const movieList = movieQueries
    .flatMap((q) => q.data?.data ?? [])
    .slice(0, 3);
  const episodeList = episodeQueries
    .flatMap((q) => q.data?.data ?? [])
    .slice(0, 3);
  const posterMap = useBazarrPosters(movieList, episodeList);

  const previewItems: PreviewItem[] = [];
  for (const movie of movieList) {
    previewItems.push({
      key: `movie-${movie.radarrId}`,
      title: movie.title,
      subtitle: "Movie",
      languages:
        movie.missing_subtitles?.map((s) => s.code2).join(", ") || "—",
      mediaType: "movie",
    });
  }
  for (const episode of episodeList) {
    previewItems.push({
      key: `episode-${episode.sonarrEpisodeId}`,
      title: episode.seriesTitle,
      subtitle: `${episode.episode_number} — ${episode.episodeTitle}`,
      languages:
        episode.missing_subtitles?.map((s) => s.code2).join(", ") || "—",
      mediaType: "tv",
    });
  }

  const display = previewItems.slice(0, MAX_PREVIEW);
  const hasMore = totalMissing > display.length;

  return (
    <Card>
      <CardHeaderLink
        title="Bazarr Subtitles"
        onPress={() => router.push("/(tabs)/bazarr")}
        trailing={
          totalMissing > 0 ? (
            <Badge label="Missing" variant="missing" count={totalMissing} />
          ) : null
        }
      />

      {instances.length === 0 ? (
        <EmptyState compact title="No Bazarr instances enabled" />
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={3} />
      ) : display.length === 0 ? (
        <EmptyState compact title="All subtitles in place" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((item) => {
            const entry = posterMap.get(item.key);
            return (
              <MediaPosterTile
                key={item.key}
                posterUrl={entry?.posterUrl ?? null}
                title={entry?.title ?? item.title}
                subtitle={item.subtitle}
                cornerBadge={{
                  icon: Captions,
                  color: "rgba(168, 85, 247, 0.9)",
                }}
                bottomOverlay={
                  <View className="bg-black/60 px-1.5 py-0.5">
                    <Text
                      className="text-white text-xs font-semibold"
                      numberOfLines={1}
                    >
                      {item.languages}
                    </Text>
                  </View>
                }
                mediaType={item.mediaType}
                onPress={() => router.push("/(tabs)/bazarr")}
              />
            );
          })}
          {hasMore && (
            <ViewAllTile onPress={() => router.push("/(tabs)/bazarr")} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}
