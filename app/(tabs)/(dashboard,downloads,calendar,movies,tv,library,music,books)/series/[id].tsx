import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  ChevronRight,
  Check,
  Search,
  Trash2,
  Bookmark,
  MoreHorizontal,
  Award,
  Tv,
  Film,
  Circle,
  FolderTree,
  Pencil,
  Captions,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { toastError } from "@/components/ui/toast";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { MediaDetailHero } from "@/components/common/media-detail-hero";
import { MediaDetailSkeleton } from "@/components/common/media-detail-skeleton";
import {
  MediaActionBar,
  type MediaActionItem,
} from "@/components/common/media-action-bar";
import { MediaStatsStrip } from "@/components/common/media-stats-strip";
import { ExpandableText } from "@/components/common/expandable-text";
import { RequestedByBlock } from "@/components/overseerr/requested-by-block";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  useSonarrSeriesById,
  useSonarrEpisodes,
  useSonarrEpisodeFiles,
  useSonarrQueue,
  useSearchForSeries,
  useToggleSeriesMonitored,
  useDeleteSeries,
  useSonarrQualityProfiles,
  useUpdateSeriesFields,
  useSonarrRootFolders,
  useUpdateSeriesRootFolder,
  useSonarrTags,
} from "@/hooks/use-sonarr";
import { SERIES_TYPE_OPTIONS } from "@/components/sonarr/add-series-sheet";
import { SeriesOptionsSheet } from "@/components/sonarr/series-options-sheet";
import { formatBytes } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import { imdbTitleUrl, openExternalUrl } from "@/lib/external-links";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { BAR_KIND_COLOR } from "@/lib/arr-poster-status";
import type { SonarrEpisodeFile, SonarrSeries } from "@/lib/types";
import { SectionLabel } from "@/components/ui/section-label";
import { SeasonAccordion } from "@/components/sonarr/season-accordion";
import { useSeriesSubtitles } from "@/components/subtitles/use-series-subtitles";
import { SubtitlesSectionLabel } from "@/components/subtitles/subtitles-card";

type DeleteMode = "keep" | "withFiles";

export default function SeriesDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const {
    data: series,
    isLoading,
    error,
  } = useSonarrSeriesById(Number(id), instanceId);
  const { data: episodes } = useSonarrEpisodes(Number(id), instanceId);
  const { data: episodeFiles } = useSonarrEpisodeFiles(Number(id), instanceId);
  const { data: queue } = useSonarrQueue(instanceId);
  const toggleSeries = useToggleSeriesMonitored(instanceId);
  const searchSeries = useSearchForSeries(instanceId);
  const deleteSeries = useDeleteSeries(instanceId);
  const { data: qualityProfiles } = useSonarrQualityProfiles(instanceId);
  const updateProfile = useUpdateSeriesFields(instanceId);
  const { data: rootFolders } = useSonarrRootFolders(instanceId);
  const updateRootFolder = useUpdateSeriesRootFolder(instanceId);
  const { data: tags } = useSonarrTags(instanceId);

  const [optionsVisible, setOptionsVisible] = useState(false);

  // All modal sequencing (sheet → confirm, sheet → sheet, confirm → pop) goes
  // through the flow — see hooks/use-modal-flow.ts.
  const flow = useModalFlow<{
    actions: void;
    quality: void;
    rootFolder: void;
    moveFiles: string; // payload: the picked root folder path
    confirmDelete: DeleteMode;
    seriesSearch: void;
  }>();

  const episodeFileMap = useMemo(() => {
    const map = new Map<number, SonarrEpisodeFile>();
    episodeFiles?.forEach((f) => map.set(f.id, f));
    return map;
  }, [episodeFiles]);

  // Bazarr subtitles, when a Bazarr instance serves this Sonarr; renders
  // nothing otherwise.
  const subtitles = useSeriesSubtitles({
    instanceId,
    series,
    episodes,
    episodeFileMap,
  });

  // Episodes currently grabbing/downloading, so the per-episode spine, the
  // season bars and the series Progress block can read purple — mirroring the
  // poster grid (issue #207). The queue is the shared global query (≤20 records,
  // same cache the TV list uses); episode ids are unique so the per-episode
  // lookup is exact, and the series-level flag filters by seriesId.
  const downloadingEpisodeIds = useMemo(
    () => new Set((queue?.records ?? []).map((r) => r.episodeId)),
    [queue],
  );
  const seriesDownloading = useMemo(
    () => (queue?.records ?? []).some((r) => r.seriesId === Number(id)),
    [queue, id],
  );

  const poster = series?.images.find((i) => i.coverType === "poster");
  const fanart = series?.images.find((i) => i.coverType === "fanart");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(
    poster,
    "sonarr",
  );
  const { src: fanartUrl, onError: onFanartError } = useServiceImage(
    fanart,
    "sonarr",
  );

  if (isLoading) {
    return <MediaDetailSkeleton showSeasonList />;
  }
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner
          error={error}
          title="Failed to load series"
          className="mt-4"
        />
      </ScreenWrapper>
    );
  }
  if (!series) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <Text className="text-zinc-400 text-center mt-10">
          Series not found
        </Text>
      </ScreenWrapper>
    );
  }

  const seasonCount =
    series.statistics?.seasonCount ??
    series.seasons.filter((s) => s.seasonNumber > 0).length ??
    0;

  const qualityProfileName = qualityProfiles?.find(
    (p) => p.id === series.qualityProfileId,
  )?.name;

  const tagLabels =
    series.tags
      ?.map((tagId) => tags?.find((t) => t.id === tagId)?.label)
      .filter((label): label is string => !!label) ?? [];

  const imdbUrl = imdbTitleUrl(series.imdbId);

  const handleToggleMonitor = () => {
    toggleSeries.mutate({ seriesId: series.id, monitored: !series.monitored });
  };

  const confirmDelete = () => {
    const mode = flow.payload("confirmDelete");
    if (!mode) return;
    flow.close();
    deleteSeries.mutate(
      {
        id: series.id,
        deleteFiles: mode === "withFiles",
      },
      {
        // flow.back() pops only once the confirm has fully dismissed.
        onSuccess: () => flow.back(),
        onError: (err) => toastError("Failed to delete show", err),
      },
    );
  };

  const actions: MediaActionItem[] = [
    {
      key: "monitor",
      icon: Bookmark,
      label: series.monitored ? "Monitored" : "Monitor",
      active: series.monitored,
      loading: toggleSeries.isPending,
      onPress: handleToggleMonitor,
    },
    {
      key: "quality",
      icon: Award,
      label: qualityProfileName ?? "Quality",
      loading: updateProfile.isPending,
      onPress: () => flow.open("quality"),
      disabled: !qualityProfiles || qualityProfiles.length === 0,
    },
    {
      key: "search",
      icon: Search,
      label: "Search",
      loading: searchSeries.isPending,
      onPress: () => flow.open("seriesSearch"),
    },
    ...(imdbUrl
      ? [
          {
            key: "imdb",
            icon: Film,
            label: "IMDb",
            onPress: () => openExternalUrl(imdbUrl),
          },
        ]
      : []),
    {
      key: "more",
      icon: MoreHorizontal,
      label: "More",
      onPress: () => flow.open("actions"),
    },
  ];

  const stats = buildSeriesStats(series);

  return (
    <>
      <ScreenWrapper edgeToEdge>
        <MediaDetailHero
          backdropUrl={fanartUrl}
          posterUrl={posterUrl}
          onBackdropError={onFanartError}
          onPosterError={onPosterError}
          title={series.title}
          metaLine={buildSeriesMeta(series)}
          ratings={series.ratings}
          posterFallbackIcon={Tv}
          badges={
            <>
              <Badge
                label={`${seasonCount} Season${seasonCount !== 1 ? "s" : ""}`}
                variant="default"
              />
              {series.certification ? (
                <Badge label={series.certification} variant="default" />
              ) : null}
            </>
          }
        />

        <View className="px-4 mt-6">
          <MediaActionBar actions={actions} className="mb-4" />

          <MediaStatsStrip stats={stats} className="mb-5" />

          <RequestedByBlock tmdbId={series.tmdbId} mediaType="tv" />

          <EpisodeProgressBlock
            series={series}
            downloading={seriesDownloading}
          />

          <AboutBlock
            series={series}
            onPressRoot={
              rootFolders && rootFolders.length > 0
                ? () => flow.open("rootFolder")
                : undefined
            }
          />

          <OptionsBlock
            series={series}
            onPress={() => setOptionsVisible(true)}
          />

          {series.overview ? (
            <View className="mb-5">
              <SectionLabel>Overview</SectionLabel>
              <ExpandableText text={series.overview} numberOfLines={4} />
            </View>
          ) : null}

          {series.genres && series.genres.length > 0 ? (
            <View className="mb-5">
              <SectionLabel>Genres</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {series.genres.map((g) => (
                  <Badge key={g} label={g} variant="default" />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {tagLabels.length > 0 ? (
            <View className="mb-5">
              <SectionLabel>Tags</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {tagLabels.map((label) => (
                  <Badge key={label} label={label} variant="info" />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {subtitles.coverageCard && subtitles.bazarrId ? (
            <View className="mb-5">
              <SubtitlesSectionLabel bazarrId={subtitles.bazarrId} />
              {subtitles.coverageCard}
            </View>
          ) : null}

          <View className="mb-2">
            <SectionLabel>Seasons</SectionLabel>
            <View className="gap-2">
              {series.seasons
                .sort((a, b) => b.seasonNumber - a.seasonNumber)
                .map((season) => (
                  <SeasonAccordion
                    key={season.seasonNumber}
                    seriesId={series.id}
                    instanceId={instanceId}
                    season={season}
                    episodes={episodes?.filter(
                      (ep) => ep.seasonNumber === season.seasonNumber,
                    )}
                    episodeFileMap={episodeFileMap}
                    downloadingEpisodeIds={downloadingEpisodeIds}
                    episodeLanguages={subtitles.episodeLanguages}
                    subtitleGaps={subtitles.gapsBySeason.get(season.seasonNumber) ?? 0}
                    onOpenSubtitles={subtitles.linked ? subtitles.openEpisode : undefined}
                    onSearchMissingSubtitles={
                      subtitles.linked
                        ? () => subtitles.onSearchSeason(season.seasonNumber)
                        : undefined
                    }
                  />
                ))}
            </View>
          </View>
        </View>
      </ScreenWrapper>

      <ActionSheet
        {...flow.bind("actions")}
        title={series.title}
        actions={[
          ...(subtitles.linked
            ? [
                {
                  label: "Search missing subtitles",
                  subtitle:
                    subtitles.seriesGaps > 0
                      ? `${subtitles.seriesGaps} episode${subtitles.seriesGaps === 1 ? "" : "s"} missing a language`
                      : "Nothing missing",
                  icon: <Icon icon={Captions} size={18} color="#a1a1aa" />,
                  disabled: subtitles.seriesGaps === 0,
                  onPress: subtitles.onSearchSeries,
                },
              ]
            : []),
          {
            label: "Delete Show",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "keep"),
          },
          {
            label: "Delete Show + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "withFiles"),
          },
        ]}
      />

      <ActionSheet
        {...flow.bind("quality")}
        title="Quality Profile"
        subtitle={series.title}
        actions={(qualityProfiles ?? []).map((p) => ({
          label: p.name,
          icon: (
            <Icon
              icon={p.id === series.qualityProfileId ? Check : Circle}
              size={18}
              color={p.id === series.qualityProfileId ? "#60a5fa" : "#71717a"}
            />
          ),
          onPress: () => {
            if (p.id === series.qualityProfileId) return;
            updateProfile.mutate({
              seriesId: series.id,
              fields: { qualityProfileId: p.id },
              errorLabel: "Failed to update quality profile",
            });
          },
        }))}
      />

      <SeriesOptionsSheet
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        series={series}
        instanceId={instanceId}
      />

      <ActionSheet
        {...flow.bind("rootFolder")}
        title="Root Folder"
        subtitle={series.title}
        actions={(rootFolders ?? []).map((f) => ({
          label: `${f.path}  ·  ${formatBytes(f.freeSpace)} free`,
          icon: (
            <Icon
              icon={f.path === series.rootFolderPath ? Check : Circle}
              size={18}
              color={f.path === series.rootFolderPath ? "#60a5fa" : "#71717a"}
            />
          ),
          onPress: () => {
            if (f.path === series.rootFolderPath) return;
            flow.open("moveFiles", f.path);
          },
        }))}
      />

      <ActionSheet
        {...flow.bind("moveFiles")}
        title="Move existing files?"
        subtitle={flow.payload("moveFiles") ?? ""}
        actions={[
          {
            label: "Move existing files",
            icon: <Icon icon={FolderTree} size={18} color="#60a5fa" />,
            onPress: () => {
              const path = flow.payload("moveFiles");
              if (!path) return;
              updateRootFolder.mutate({
                seriesId: series.id,
                rootFolderPath: path,
                moveFiles: true,
              });
            },
          },
          {
            label: "Keep files in place",
            icon: <Icon icon={Circle} size={18} color="#71717a" />,
            onPress: () => {
              const path = flow.payload("moveFiles");
              if (!path) return;
              updateRootFolder.mutate({
                seriesId: series.id,
                rootFolderPath: path,
                moveFiles: false,
              });
            },
          },
        ]}
      />

      <ConfirmModal
        {...flow.bind("confirmDelete")}
        title={
          flow.payload("confirmDelete") === "withFiles"
            ? "Delete show + files?"
            : "Delete show?"
        }
        message={
          flow.payload("confirmDelete") === "withFiles"
            ? `Remove "${series.title}" from Sonarr and delete all episode files from disk. This can't be undone.`
            : `Remove "${series.title}" from Sonarr. Files on disk will be kept.`
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={
          flow.payload("confirmDelete") === "withFiles"
            ? "Delete + Files"
            : "Delete"
        }
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        {...flow.bind("seriesSearch")}
        title="Search for releases?"
        message={`Sonarr will search your indexers for all monitored episodes of "${series.title}" and automatically download the best matches.`}
        icon={Search}
        confirmLabel="Search"
        onConfirm={() => {
          searchSeries.mutate(series.id);
          flow.close();
        }}
      />

      {subtitles.modals}
    </>
  );
}

function buildSeriesMeta(series: SonarrSeries): string {
  const parts: string[] = [];
  if (series.year) parts.push(String(series.year));
  if (series.network) parts.push(series.network);
  return parts.join(" · ");
}

function buildSeriesStats(series: SonarrSeries) {
  const have = series.episodeFileCount;
  const total = series.totalEpisodeCount;
  const sizeOnDisk = series.statistics?.sizeOnDisk ?? series.sizeOnDisk;
  const firstAiredYear = series.firstAired
    ? new Date(series.firstAired).getFullYear()
    : null;
  return [
    { label: "Status", value: capitalize(series.status) },
    { label: "Episodes", value: total > 0 ? `${have}/${total}` : "—" },
    { label: "Size", value: sizeOnDisk > 0 ? formatBytes(sizeOnDisk) : "—" },
    { label: "Aired", value: firstAiredYear ? String(firstAiredYear) : "—" },
  ];
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatReleaseDate(iso?: string): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function EpisodeProgressBlock({
  series,
  downloading,
}: {
  series: SonarrSeries;
  downloading: boolean;
}) {
  const have = series.episodeFileCount;
  const total = series.totalEpisodeCount;
  if (!total) return null;
  const ratio = total > 0 ? have / total : 0;
  const missing = total - have;
  const allDownloaded = missing === 0;
  // Purple wins while a grab is in flight, exactly like the poster bar; the
  // proportional fill still tracks downloaded/total so progress stays readable.
  // Inline hex (not Tailwind classes) so the status color can't be dropped by
  // the build and stays in lockstep with every other indicator (issue #207).
  const accent = downloading
    ? BAR_KIND_COLOR.purple
    : allDownloaded
      ? BAR_KIND_COLOR.success
      : BAR_KIND_COLOR.primary;
  return (
    <View className="mb-5">
      <SectionLabel>Progress</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border overflow-hidden flex-row">
        <View className="w-1" style={{ backgroundColor: accent }} />
        <View className="flex-1 p-4">
          <View className="flex-row items-end justify-between mb-2.5">
            <Text className="text-zinc-100 text-2xl font-bold">
              {have}
              <Text className="text-zinc-500 text-base font-medium">
                {" "}
                / {total}
              </Text>
            </Text>
            <Text
              className="text-sm font-semibold"
              style={{ color: accent }}
            >
              {Math.round(ratio * 100)}%
            </Text>
          </View>
          <ProgressBar progress={ratio} fillColor={accent} />
          <Text
            className="text-xs mt-2.5"
            style={{
              color: downloading || allDownloaded ? accent : "#71717a",
            }}
          >
            {downloading
              ? "Downloading…"
              : allDownloaded
                ? "All episodes downloaded"
                : `${missing} episode${missing !== 1 ? "s" : ""} missing`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function AboutBlock({
  series,
  onPressRoot,
}: {
  series: SonarrSeries;
  onPressRoot?: () => void;
}) {
  return (
    <View className="mb-5">
      <SectionLabel>About</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border p-4 gap-2.5">
        {series.firstAired ? (
          <AboutRow
            label="First"
            value={formatReleaseDate(series.firstAired)}
          />
        ) : null}
        <AboutRow
          label="Root"
          value={series.rootFolderPath}
          onPress={onPressRoot}
        />
        <AboutRow label="Added" value={formatReleaseDate(series.added)} />
      </View>
    </View>
  );
}

function AboutRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text className="text-zinc-500 text-[0.65rem] uppercase font-semibold tracking-wider w-14">
        {label}
      </Text>
      <Text
        className="text-zinc-300 text-xs flex-1 ml-2"
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
      {onPress ? <Icon icon={ChevronRight} size={14} color="#71717a" /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-row items-center active:opacity-60"
        hitSlop={6}
      >
        {content}
      </Pressable>
    );
  }

  return <View className="flex-row items-center">{content}</View>;
}

// Sonarr series options (issue #184): series type, season folders,
// monitor-new-seasons. The whole card is one tap target — small per-row
// targets are fiddly on phones — and opens the SeriesOptionsSheet editor.
function OptionsBlock({
  series,
  onPress,
}: {
  series: SonarrSeries;
  onPress: () => void;
}) {
  const typeLabel =
    SERIES_TYPE_OPTIONS.find((o) => o.value === series.seriesType)?.label ??
    capitalize(series.seriesType);
  return (
    <View className="mb-5">
      <SectionLabel>Options</SectionLabel>
      <Pressable
        onPress={onPress}
        className="rounded-2xl bg-surface border border-border p-4 flex-row items-center active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel="Edit series options"
      >
        <View className="flex-1 gap-2.5">
          <OptionRow label="Series Type" value={typeLabel} />
          <OptionRow
            label="Season Folders"
            value={series.seasonFolder ? "Yes" : "No"}
          />
          {/* "Monitor New Seasons" only exists on Sonarr v4+ — hide otherwise. */}
          {series.monitorNewItems != null ? (
            <OptionRow
              label="Monitor New Seasons"
              value={series.monitorNewItems === "all" ? "All Seasons" : "None"}
            />
          ) : null}
        </View>
        <View className="ml-3 w-9 h-9 rounded-full bg-surface-light items-center justify-center">
          <Icon icon={Pencil} size={16} color="#a1a1aa" />
        </View>
      </Pressable>
    </View>
  );
}

function OptionRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center">
      <Text className="text-zinc-500 text-[0.65rem] uppercase font-semibold tracking-wider flex-1">
        {label}
      </Text>
      <Text className="text-zinc-300 text-xs ml-2">{value}</Text>
    </View>
  );
}
