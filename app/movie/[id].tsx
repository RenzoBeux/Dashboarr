import { useState } from "react";
import { View, Text, ScrollView, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Trash2,
  Search,
  Bookmark,
  MoreHorizontal,
  Award,
  Film,
  Circle,
  Check,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { MediaDetailHero } from "@/components/common/media-detail-hero";
import { MediaDetailSkeleton } from "@/components/common/media-detail-skeleton";
import {
  MediaActionBar,
  type MediaActionItem,
} from "@/components/common/media-action-bar";
import { MediaStatsStrip } from "@/components/common/media-stats-strip";
import { ExpandableText } from "@/components/common/expandable-text";
import { Badge } from "@/components/ui/badge";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  useRadarrMovie,
  useDeleteMovie,
  useToggleMovieMonitored,
  useRadarrQualityProfiles,
  useUpdateMovieQualityProfile,
} from "@/hooks/use-radarr";
import { useServiceImage } from "@/hooks/use-service-image";
import {
  formatBytes,
  formatAudioChannels,
  formatResolution,
} from "@/lib/utils";
import type { RadarrMovie } from "@/lib/types";

type DeleteMode = "keep" | "withFiles" | null;

export default function MovieDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const router = useRouter();
  const { data: movie, isLoading } = useRadarrMovie(Number(id), instanceId);
  const deleteMutation = useDeleteMovie(instanceId);
  const toggleMonitored = useToggleMovieMonitored(instanceId);
  const { data: qualityProfiles } = useRadarrQualityProfiles(instanceId);
  const updateProfile = useUpdateMovieQualityProfile(instanceId);

  const [actionsVisible, setActionsVisible] = useState(false);
  const [qualityVisible, setQualityVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteMode>(null);

  const poster = movie?.images.find((i) => i.coverType === "poster");
  const fanart = movie?.images.find((i) => i.coverType === "fanart");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(
    poster,
    "radarr",
  );
  const { src: fanartUrl, onError: onFanartError } = useServiceImage(
    fanart,
    "radarr",
  );

  if (isLoading) {
    return <MediaDetailSkeleton />;
  }
  if (!movie) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <Text className="text-zinc-400 text-center mt-10">
          Movie not found
        </Text>
      </ScreenWrapper>
    );
  }

  const qualityProfileName = qualityProfiles?.find(
    (p) => p.id === movie.qualityProfileId,
  )?.name;

  const handleToggleMonitor = () => {
    toggleMonitored.mutate({ movieId: movie.id, monitored: !movie.monitored });
  };

  const handleOpenImdb = () => {
    if (!movie.imdbId) return;
    Linking.openURL(`https://www.imdb.com/title/${movie.imdbId}`);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(
      {
        id: movie.id,
        deleteFiles: pendingDelete === "withFiles",
        tmdbId: movie.tmdbId,
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
      label: movie.monitored ? "Monitored" : "Monitor",
      active: movie.monitored,
      loading: toggleMonitored.isPending,
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
            ? `/movie/releases/${movie.id}?instanceId=${instanceId}`
            : `/movie/releases/${movie.id}`,
        ),
    },
    ...(movie.imdbId
      ? [
          {
            key: "imdb",
            icon: Film,
            label: "IMDb",
            onPress: handleOpenImdb,
          },
        ]
      : []),
    {
      key: "more",
      icon: MoreHorizontal,
      label: "More",
      onPress: () => setActionsVisible(true),
    },
  ];

  const stats = buildMovieStats(movie);

  return (
    <>
      <ScreenWrapper edgeToEdge>
        <MediaDetailHero
          backdropUrl={fanartUrl}
          posterUrl={posterUrl}
          onBackdropError={onFanartError}
          onPosterError={onPosterError}
          title={movie.title}
          metaLine={buildMovieMeta(movie)}
          ratings={movie.ratings}
          posterFallbackIcon={Film}
          badges={
            <>
              <Badge
                label={movie.hasFile ? "Downloaded" : "Missing"}
                variant={movie.hasFile ? "success" : "missing"}
              />
              {movie.certification ? (
                <Badge label={movie.certification} variant="default" />
              ) : null}
            </>
          }
        />

        <View className="px-4 mt-6">
          <MediaActionBar actions={actions} className="mb-4" />

          <MediaStatsStrip stats={stats} className="mb-5" />

          <MovieFileBlock movie={movie} />

          {movie.overview ? (
            <View className="mb-5">
              <SectionLabel>Overview</SectionLabel>
              <ExpandableText text={movie.overview} numberOfLines={4} />
            </View>
          ) : null}

          {movie.genres && movie.genres.length > 0 ? (
            <View className="mb-5">
              <SectionLabel>Genres</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {movie.genres.map((g) => (
                  <Badge key={g} label={g} variant="default" />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <ReleaseDatesBlock movie={movie} />

          <AboutBlock movie={movie} />
        </View>
      </ScreenWrapper>

      <ActionSheet
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        title={movie.title}
        actions={[
          {
            label: "Delete Movie",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => setPendingDelete("keep"),
          },
          {
            label: "Delete Movie + Files",
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
        subtitle={movie.title}
        actions={(qualityProfiles ?? []).map((p) => ({
          label: p.name,
          icon: (
            <Icon
              icon={p.id === movie.qualityProfileId ? Check : Circle}
              size={18}
              color={p.id === movie.qualityProfileId ? "#60a5fa" : "#71717a"}
            />
          ),
          onPress: () => {
            if (p.id === movie.qualityProfileId) return;
            updateProfile.mutate({
              movieId: movie.id,
              qualityProfileId: p.id,
            });
          },
        }))}
      />

      <ConfirmModal
        visible={pendingDelete !== null}
        title={
          pendingDelete === "withFiles"
            ? "Delete movie + files?"
            : "Delete movie?"
        }
        message={
          pendingDelete === "withFiles"
            ? `Remove "${movie.title}" from Radarr and delete files from disk. This can't be undone.`
            : `Remove "${movie.title}" from Radarr. Files on disk will be kept.`
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

function buildMovieMeta(movie: RadarrMovie): string {
  const parts: string[] = [];
  if (movie.year) parts.push(String(movie.year));
  if (movie.runtime) parts.push(formatRuntime(movie.runtime));
  return parts.join(" · ");
}

function buildMovieStats(movie: RadarrMovie) {
  return [
    { label: "Status", value: capitalize(movie.status) },
    { label: "Studio", value: movie.studio || "—" },
    { label: "Size", value: movie.hasFile ? formatBytes(movie.sizeOnDisk) : "—" },
  ];
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

function MovieFileBlock({ movie }: { movie: RadarrMovie }) {
  if (!movie.hasFile || !movie.movieFile) return null;
  const file = movie.movieFile;
  const fileName = file.relativePath?.split(/[/\\]/).pop() ?? movie.title;
  const info = file.mediaInfo;
  const techParts: string[] = [];
  if (info) {
    techParts.push(formatResolution(info.resolution));
    techParts.push(info.videoCodec);
    const dr = info.videoDynamicRangeType || info.videoDynamicRange;
    if (dr) techParts.push(dr);
    techParts.push(
      `${info.audioCodec} ${formatAudioChannels(info.audioChannels)}`,
    );
  }
  return (
    <View className="mb-5">
      <SectionLabel>File</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border overflow-hidden flex-row">
        <View className="w-1 bg-success" />
        <View className="flex-1 p-4">
          <View className="flex-row items-start justify-between gap-2 mb-2">
            <Text
              className="text-zinc-100 text-sm font-medium flex-1"
              numberOfLines={2}
            >
              {fileName}
            </Text>
            <View className="bg-primary/15 border border-primary/30 rounded-md px-2 py-1">
              <Text className="text-primary text-[0.65rem] font-bold uppercase tracking-wide">
                {file.quality.quality.name}
              </Text>
            </View>
          </View>
          {techParts.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5 mt-1">
              {techParts.map((part) => (
                <View
                  key={part}
                  className="bg-zinc-800 rounded px-2 py-0.5 border border-border/40"
                >
                  <Text className="text-zinc-300 text-[0.65rem] font-semibold uppercase tracking-wide">
                    {part}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text className="text-yellow-500 text-xs font-semibold mt-2">
            {formatBytes(file.size)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ReleaseDatesBlock({ movie }: { movie: RadarrMovie }) {
  const items = [
    { label: "Cinemas", date: movie.inCinemas },
    { label: "Digital", date: movie.digitalRelease },
    { label: "Physical", date: movie.physicalRelease },
  ].filter((item) => item.date);
  if (items.length === 0) return null;
  return (
    <View className="mb-5">
      <SectionLabel>Release</SectionLabel>
      <View className="flex-row rounded-2xl bg-surface border border-border py-3">
        {items.map((item, i) => (
          <View
            key={item.label}
            className={`flex-1 px-3 ${
              i > 0 ? "border-l border-border/60" : ""
            }`}
          >
            <Text
              className="text-zinc-500 text-[0.65rem] uppercase font-semibold tracking-wider"
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <Text
              className="text-yellow-500 text-xs font-semibold mt-1"
              numberOfLines={1}
            >
              {formatReleaseDate(item.date)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AboutBlock({ movie }: { movie: RadarrMovie }) {
  return (
    <View className="mb-5">
      <SectionLabel>About</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border p-4 gap-2.5">
        <AboutRow label="Root" value={movie.rootFolderPath} />
        <AboutRow label="Added" value={formatReleaseDate(movie.added)} />
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
