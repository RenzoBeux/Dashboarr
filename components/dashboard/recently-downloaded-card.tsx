import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ServiceLogo } from "@/components/ui/service-logo";
import { getHistory as getRadarrHistory, getRadarrPoster } from "@/services/radarr-api";
import { getHistory as getSonarrHistory, getSonarrPoster } from "@/services/sonarr-api";
import { useConfigStore } from "@/store/config-store";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import { formatEpisodeCode, relativeDate } from "@/lib/utils";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import {
  RECENTLY_DOWNLOADED_DEFAULT_SETTINGS,
  type RecentlyDownloadedSettingsValue,
} from "@/components/dashboard/widget-settings/recently-downloaded-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import type {
  RadarrHistoryRecord,
  SonarrHistoryRecord,
} from "@/lib/types";

// One imported entry from either Sonarr or Radarr, tagged with its source
// instance so the per-tile router push targets the right id space (movie /
// series ids aren't globally unique across instances of the same kind).
type RecentItem =
  | {
      kind: "episode";
      record: SonarrHistoryRecord;
      instanceId: string;
      // Pulled out for sorting — `date` is optional on the record type.
      date: string;
    }
  | {
      kind: "movie";
      record: RadarrHistoryRecord;
      instanceId: string;
      date: string;
    };

// Radarr/Sonarr expose the import event under this name. Grab events fire too,
// but the issue asks for "recently downloaded" — only completed imports count.
const IMPORT_EVENT = "downloadFolderImported";

export function RecentlyDownloadedCard({ slotId }: WidgetComponentProps) {
  const router = useRouter();
  const { settings } = useWidgetSettings<RecentlyDownloadedSettingsValue>(
    slotId,
    RECENTLY_DOWNLOADED_DEFAULT_SETTINGS,
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

  // Fan history across each resolved instance. Query keys match the watchers
  // in use-notification-watchers.tsx so we share the same cached page instead
  // of issuing a second request per instance.
  const sonarrQueries = useQueries({
    queries: showSonarr
      ? sonarrInstances.map((inst) => ({
          queryKey: ["sonarr", inst.id, "history"] as const,
          queryFn: () => getSonarrHistory(1, 50, inst.id),
          refetchInterval: POLLING_INTERVALS.queue,
        }))
      : [],
  });
  const radarrQueries = useQueries({
    queries: showRadarr
      ? radarrInstances.map((inst) => ({
          queryKey: ["radarr", inst.id, "history"] as const,
          queryFn: () => getRadarrHistory(1, 50, inst.id),
          refetchInterval: POLLING_INTERVALS.queue,
        }))
      : [],
  });

  // Initial-load gate per kind — see lib/multi-instance-query.ts. The skeleton
  // shows only while we're truly cold across both kinds; a single failing
  // instance just contributes nothing to the merged list instead of flickering
  // the card every refetch tick.
  const sonarrState = aggregateMultiInstanceState(sonarrQueries);
  const radarrState = aggregateMultiInstanceState(radarrQueries);
  const isLoading =
    (showSonarr && !sonarrState.hasAnyData && sonarrState.isInitialLoading) ||
    (showRadarr && !radarrState.hasAnyData && radarrState.isInitialLoading);

  const items: RecentItem[] = [];
  if (showSonarr) {
    sonarrQueries.forEach((q, i) => {
      const instanceId = sonarrInstances[i]?.id;
      if (!instanceId) return;
      for (const r of q.data?.records ?? []) {
        if (r.eventType !== IMPORT_EVENT || !r.date) continue;
        items.push({ kind: "episode", record: r, instanceId, date: r.date });
      }
    });
  }
  if (showRadarr) {
    radarrQueries.forEach((q, i) => {
      const instanceId = radarrInstances[i]?.id;
      if (!instanceId) return;
      for (const r of q.data?.records ?? []) {
        if (r.eventType !== IMPORT_EVENT || !r.date) continue;
        items.push({ kind: "movie", record: r, instanceId, date: r.date });
      }
    });
  }

  // Sort descending by import timestamp so the freshest download is leftmost.
  items.sort((a, b) => b.date.localeCompare(a.date));
  const display = items.slice(0, settings.maxItems);

  const noSources = !showSonarr && !showRadarr;
  const noServicesEnabled = !sonarrEnabled && !radarrEnabled;
  // The combined now-playing card uses a logo badge only when more than one
  // kind is active — same here, so a single-source feed isn't cluttered.
  const showSourceBadge = showSonarr && showRadarr;

  // The no-sources misconfiguration hint stays visible so the user can find
  // their way back to the widget settings.
  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: !noSources && display.length === 0,
    isLoading,
  });

  return (
    <Card>
      <CardHeaderLink
        title="Recently Downloaded"
        // No single destination covers both — drop the user on the dashboard
        // tab they're already on by leaving onPress undefined when both
        // sources are active; otherwise route to the obvious one.
        onPress={
          showRadarr && !showSonarr
            ? () => router.push("/(tabs)/movies")
            : !showRadarr && showSonarr
              ? () => router.push("/(tabs)/tv")
              : undefined
        }
      />

      {noSources ? (
        <EmptyState
          compact
          title="No download sources"
          message={
            noServicesEnabled
              ? "Configure Sonarr or Radarr in app settings."
              : "Enable Sonarr or Radarr in the widget settings."
          }
        />
      ) : isLoading ? (
        <PosterSkeletonRow count={4} showSubtitle />
      ) : display.length === 0 ? (
        <EmptyState compact title="Nothing imported recently" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map((item) =>
            item.kind === "episode" ? (
              <EpisodeTile
                key={`ep-${item.instanceId}-${item.record.id}`}
                item={item}
                showSourceBadge={showSourceBadge}
                onPress={() => {
                  const seriesId =
                    item.record.seriesId ?? item.record.series?.id;
                  if (!seriesId) return;
                  router.push(
                    `/series/${seriesId}?instanceId=${item.instanceId}`,
                  );
                }}
              />
            ) : (
              <MovieTile
                key={`mv-${item.instanceId}-${item.record.id}`}
                item={item}
                showSourceBadge={showSourceBadge}
                onPress={() => {
                  const movieId = item.record.movieId ?? item.record.movie?.id;
                  if (!movieId) return;
                  router.push(
                    `/movie/${movieId}?instanceId=${item.instanceId}`,
                  );
                }}
              />
            ),
          )}
        </ScrollView>
      )}
    </Card>
  );
}

function EpisodeTile({
  item,
  showSourceBadge,
  onPress,
}: {
  item: Extract<RecentItem, { kind: "episode" }>;
  showSourceBadge: boolean;
  onPress: () => void;
}) {
  const { record } = item;
  const title = record.series?.title ?? record.sourceTitle ?? "Episode";
  const code =
    record.episode &&
    formatEpisodeCode(
      record.episode.seasonNumber ?? 0,
      record.episode.episodeNumber ?? 0,
    );
  // "S02E04 · Today" — relativeDate keeps it human ("Today"/"Yesterday"/short
  // weekday) and fits inside the single-line subtitle slot.
  const subtitle = [code, relativeDate(item.date)].filter(Boolean).join(" · ");
  return (
    <MediaPosterTile
      posterUrl={getSonarrPoster(record.series?.images)}
      title={title}
      subtitle={subtitle}
      mediaType="tv"
      topLeftBadge={
        showSourceBadge ? <ServiceLogo id="sonarr" size={14} /> : undefined
      }
      onPress={onPress}
    />
  );
}

function MovieTile({
  item,
  showSourceBadge,
  onPress,
}: {
  item: Extract<RecentItem, { kind: "movie" }>;
  showSourceBadge: boolean;
  onPress: () => void;
}) {
  const { record } = item;
  const title = record.movie?.title ?? record.sourceTitle ?? "Movie";
  const year = record.movie?.year ? String(record.movie.year) : null;
  const subtitle = [year, relativeDate(item.date)].filter(Boolean).join(" · ");
  return (
    <MediaPosterTile
      posterUrl={getRadarrPoster(record.movie?.images)}
      title={title}
      subtitle={subtitle}
      mediaType="movie"
      topLeftBadge={
        showSourceBadge ? <ServiceLogo id="radarr" size={14} /> : undefined
      }
      onPress={onPress}
    />
  );
}
