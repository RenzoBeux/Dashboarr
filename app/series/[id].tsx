import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Search,
  Trash2,
  Bookmark,
  MoreHorizontal,
  Award,
  Tv,
  Circle,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  useSonarrSeriesById,
  useSonarrEpisodes,
  useSonarrEpisodeFiles,
  useToggleEpisodeMonitored,
  useToggleSeriesMonitored,
  useDeleteSeries,
  useSonarrQualityProfiles,
  useUpdateSeriesQualityProfile,
} from "@/hooks/use-sonarr";
import {
  formatEpisodeCode,
  formatBytes,
  formatAudioChannels,
  formatResolution,
} from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import type {
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrSeason,
  SonarrSeries,
} from "@/lib/types";

type DeleteMode = "keep" | "withFiles" | null;

export default function SeriesDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const router = useRouter();
  const { data: series, isLoading, error } = useSonarrSeriesById(Number(id), instanceId);
  const { data: episodes } = useSonarrEpisodes(Number(id), instanceId);
  const { data: episodeFiles } = useSonarrEpisodeFiles(Number(id), instanceId);
  const toggleSeries = useToggleSeriesMonitored(instanceId);
  const deleteSeries = useDeleteSeries(instanceId);
  const { data: qualityProfiles } = useSonarrQualityProfiles(instanceId);
  const updateProfile = useUpdateSeriesQualityProfile(instanceId);

  const [actionsVisible, setActionsVisible] = useState(false);
  const [qualityVisible, setQualityVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteMode>(null);

  const episodeFileMap = useMemo(() => {
    const map = new Map<number, SonarrEpisodeFile>();
    episodeFiles?.forEach((f) => map.set(f.id, f));
    return map;
  }, [episodeFiles]);

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
        <ErrorBanner error={error} title="Failed to load series" className="mt-4" />
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

  const handleToggleMonitor = () => {
    toggleSeries.mutate({ seriesId: series.id, monitored: !series.monitored });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteSeries.mutate(
      {
        id: series.id,
        deleteFiles: pendingDelete === "withFiles",
      },
      {
        onSuccess: () => router.back(),
      },
    );
    setPendingDelete(null);
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
      onPress: () => setQualityVisible(true),
      disabled: !qualityProfiles || qualityProfiles.length === 0,
    },
    {
      key: "search",
      icon: Search,
      label: "Search",
      onPress: () =>
        router.push(
          instanceId
            ? `/series/releases/${series.id}?instanceId=${instanceId}`
            : `/series/releases/${series.id}`,
        ),
    },
    {
      key: "more",
      icon: MoreHorizontal,
      label: "More",
      onPress: () => setActionsVisible(true),
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

          <EpisodeProgressBlock series={series} />

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

          <AboutBlock series={series} />

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
                  />
                ))}
            </View>
          </View>
        </View>
      </ScreenWrapper>

      <ActionSheet
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        title={series.title}
        actions={[
          {
            label: "Delete Show",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => setPendingDelete("keep"),
          },
          {
            label: "Delete Show + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => setPendingDelete("withFiles"),
          },
        ]}
      />

      <ActionSheet
        visible={qualityVisible}
        onClose={() => setQualityVisible(false)}
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
              qualityProfileId: p.id,
            });
          },
        }))}
      />

      <ConfirmModal
        visible={pendingDelete !== null}
        title={
          pendingDelete === "withFiles"
            ? "Delete show + files?"
            : "Delete show?"
        }
        message={
          pendingDelete === "withFiles"
            ? `Remove "${series.title}" from Sonarr and delete all episode files from disk. This can't be undone.`
            : `Remove "${series.title}" from Sonarr. Files on disk will be kept.`
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={
          pendingDelete === "withFiles" ? "Delete + Files" : "Delete"
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1">
      {children}
    </Text>
  );
}

function EpisodeProgressBlock({ series }: { series: SonarrSeries }) {
  const have = series.episodeFileCount;
  const total = series.totalEpisodeCount;
  if (!total) return null;
  const ratio = total > 0 ? have / total : 0;
  const missing = total - have;
  const allDownloaded = missing === 0;
  return (
    <View className="mb-5">
      <SectionLabel>Progress</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border overflow-hidden flex-row">
        <View
          className={`w-1 ${allDownloaded ? "bg-success" : "bg-primary"}`}
        />
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
              className={`text-sm font-semibold ${
                allDownloaded ? "text-success" : "text-primary"
              }`}
            >
              {Math.round(ratio * 100)}%
            </Text>
          </View>
          <ProgressBar
            progress={ratio}
            color={allDownloaded ? "bg-success" : "bg-primary"}
          />
          <Text
            className={`text-xs mt-2.5 ${
              allDownloaded ? "text-success" : "text-zinc-500"
            }`}
          >
            {allDownloaded
              ? "All episodes downloaded"
              : `${missing} episode${missing !== 1 ? "s" : ""} missing`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function AboutBlock({ series }: { series: SonarrSeries }) {
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
        <AboutRow label="Root" value={series.rootFolderPath} />
        <AboutRow label="Added" value={formatReleaseDate(series.added)} />
      </View>
    </View>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center">
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
    </View>
  );
}

function SeasonAccordion({
  seriesId,
  instanceId,
  season,
  episodes,
  episodeFileMap,
}: {
  seriesId: number;
  instanceId?: string;
  season: SonarrSeason;
  episodes?: SonarrEpisode[];
  episodeFileMap: Map<number, SonarrEpisodeFile>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const stats = season.statistics;
  const progress = stats ? stats.percentOfEpisodes / 100 : 0;

  const releasesQuery = `seasonNumber=${season.seasonNumber}${
    instanceId ? `&instanceId=${instanceId}` : ""
  }`;

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setExpanded(!expanded)}
          hitSlop={4}
          className="flex-row items-center gap-2 flex-1 active:opacity-70"
        >
          {expanded ? (
            <Icon icon={ChevronDown} size={16} color="#71717a" />
          ) : (
            <Icon icon={ChevronRight} size={16} color="#71717a" />
          )}
          <Text className="text-zinc-200 text-sm font-medium">
            {season.seasonNumber === 0
              ? "Specials"
              : `Season ${season.seasonNumber}`}
          </Text>
        </Pressable>
        <View className="flex-row items-center gap-3">
          {stats && (
            <Text className="text-zinc-500 text-xs">
              {stats.episodeFileCount}/{stats.episodeCount}
            </Text>
          )}
          <Pressable
            onPress={() =>
              router.push(`/series/releases/${seriesId}?${releasesQuery}`)
            }
            hitSlop={8}
            className="p-1 active:opacity-70"
          >
            <Icon icon={Search} size={14} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>

      {stats && <ProgressBar progress={progress} className="mt-2" />}

      {expanded && episodes && (
        <View className="mt-3 gap-1">
          {episodes
            .sort((a, b) => a.episodeNumber - b.episodeNumber)
            .map((ep) => (
              <EpisodeRow
                key={ep.id}
                seriesId={seriesId}
                instanceId={instanceId}
                episode={ep}
                episodeFile={
                  ep.episodeFileId
                    ? episodeFileMap.get(ep.episodeFileId)
                    : undefined
                }
              />
            ))}
        </View>
      )}
    </Card>
  );
}

function EpisodeRow({
  seriesId,
  instanceId,
  episode,
  episodeFile,
}: {
  seriesId: number;
  instanceId?: string;
  episode: SonarrEpisode;
  episodeFile?: SonarrEpisodeFile;
}) {
  const router = useRouter();
  const toggleMonitored = useToggleEpisodeMonitored(instanceId);
  const mediaInfo = episodeFile?.mediaInfo;

  return (
    <View className="flex-row items-center py-1.5 border-b border-border/30">
      <View
        className={`w-1.5 h-6 rounded-full mr-2 ${
          episode.hasFile ? "bg-success" : "bg-zinc-600"
        }`}
      />
      <View className="flex-1">
        <Text className="text-zinc-300 text-xs" numberOfLines={1}>
          {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} —{" "}
          {episode.title}
        </Text>
        {mediaInfo ? (
          <Text className="text-zinc-600 text-xs">
            {formatResolution(mediaInfo.resolution)} · {mediaInfo.videoCodec} ·{" "}
            {mediaInfo.audioCodec} {formatAudioChannels(mediaInfo.audioChannels)}
            {mediaInfo.videoDynamicRangeType
              ? ` · ${mediaInfo.videoDynamicRangeType}`
              : ""}
          </Text>
        ) : episode.airDate ? (
          <Text className="text-zinc-600 text-xs">{episode.airDate}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={() =>
          router.push(
            `/series/releases/${seriesId}?episodeId=${episode.id}${
              instanceId ? `&instanceId=${instanceId}` : ""
            }`,
          )
        }
        hitSlop={6}
        className="p-1 active:opacity-70 mr-1"
      >
        <Icon icon={Search} size={12} color="#a1a1aa" />
      </Pressable>
      <Pressable
        onPress={() =>
          toggleMonitored.mutate({
            episodeId: episode.id,
            monitored: !episode.monitored,
          })
        }
        disabled={toggleMonitored.isPending}
        className={`p-1 active:opacity-70 ${toggleMonitored.isPending ? "opacity-50" : ""}`}
        hitSlop={6}
      >
        {episode.monitored ? (
          <Icon icon={Check} size={14} color="#3b82f6" />
        ) : (
          <Icon icon={X} size={14} color="#71717a" />
        )}
      </Pressable>
    </View>
  );
}
