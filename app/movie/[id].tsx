import { useMemo, useState } from "react";
import { View, Text, ScrollView, Linking, Pressable } from "react-native";
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
  ChevronRight,
  FolderTree,
  History,
  Pencil,
  Plus,
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
import { Badge } from "@/components/ui/badge";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  useRadarrMovie,
  useRadarrMovies,
  useRadarrCollection,
  useRadarrQueue,
  useDeleteMovie,
  useToggleMovieMonitored,
  useRadarrQualityProfiles,
  useUpdateMovieFields,
  useRadarrRootFolders,
  useUpdateMovieRootFolder,
  useRadarrTags,
} from "@/hooks/use-radarr";
import { MovieOptionsSheet } from "@/components/radarr/movie-options-sheet";
import {
  AddMovieSheet,
  MIN_AVAILABILITY_OPTIONS,
} from "@/components/radarr/add-movie-sheet";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import { BAR_KIND_COLOR, radarrBarKind } from "@/lib/arr-poster-status";
import { getRadarrPoster } from "@/services/radarr-api";
import { useServiceImage } from "@/hooks/use-service-image";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  formatBytes,
  formatAudioChannels,
  formatResolution,
  formatRuntime,
} from "@/lib/utils";
import type {
  RadarrMovie,
  RadarrCollection,
  RadarrCollectionMovie,
  RadarrSearchResult,
} from "@/lib/types";

type DeleteMode = "keep" | "withFiles";

export default function MovieDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const router = useRouter();
  const { data: movie, isLoading, error } = useRadarrMovie(Number(id), instanceId);
  const { data: queue } = useRadarrQueue(instanceId);
  const deleteMutation = useDeleteMovie(instanceId);
  const toggleMonitored = useToggleMovieMonitored(instanceId);
  const { data: qualityProfiles } = useRadarrQualityProfiles(instanceId);
  const updateFields = useUpdateMovieFields(instanceId);
  const { data: rootFolders } = useRadarrRootFolders(instanceId);
  const updateRootFolder = useUpdateMovieRootFolder(instanceId);
  const { data: tags } = useRadarrTags(instanceId);
  const [optionsVisible, setOptionsVisible] = useState(false);
  // Missing collection member being added. Plain useState, not a flow step:
  // AddMediaSheet is a pageSheet Modal without onClosed plumbing, and nothing
  // else is open when a poster tile is tapped (mirrors app/movie/search.tsx).
  const [collectionAddTarget, setCollectionAddTarget] =
    useState<RadarrSearchResult | null>(null);

  // All modal sequencing (sheet → confirm, sheet → sheet, confirm → pop) goes
  // through the flow — see hooks/use-modal-flow.ts.
  const flow = useModalFlow<{
    actions: void;
    quality: void;
    rootFolder: void;
    moveFiles: string; // payload: the picked root folder path
    confirmDelete: DeleteMode;
  }>();

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
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner error={error} title="Failed to load movie" className="mt-4" />
      </ScreenWrapper>
    );
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

  // A grab in flight wins over the downloaded/missing badge — mirrors the
  // poster grid's purple bar and Radarr's "downloading" state (issue #207).
  const isDownloading = (queue?.records ?? []).some(
    (r) => r.movieId === movie.id,
  );

  const qualityProfileName = qualityProfiles?.find(
    (p) => p.id === movie.qualityProfileId,
  )?.name;

  const tagLabels =
    movie.tags
      ?.map((tagId) => tags?.find((t) => t.id === tagId)?.label)
      .filter((label): label is string => !!label) ?? [];

  const handleToggleMonitor = () => {
    toggleMonitored.mutate({ movieId: movie.id, monitored: !movie.monitored });
  };

  const handleOpenImdb = () => {
    if (!movie.imdbId) return;
    Linking.openURL(`https://www.imdb.com/title/${movie.imdbId}`);
  };

  const confirmDelete = () => {
    const mode = flow.payload("confirmDelete");
    if (!mode) return;
    flow.close();
    deleteMutation.mutate(
      {
        id: movie.id,
        deleteFiles: mode === "withFiles",
        tmdbId: movie.tmdbId,
      },
      {
        // flow.back() pops only once the confirm has fully dismissed.
        onSuccess: () => flow.back(),
        onError: (err) => toastError("Failed to delete movie", err),
      },
    );
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
      loading: updateFields.isPending,
      onPress: () => flow.open("quality"),
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
      onPress: () => flow.open("actions"),
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
                label={
                  isDownloading
                    ? "Downloading"
                    : movie.hasFile
                      ? "Downloaded"
                      : "Missing"
                }
                variant={
                  isDownloading
                    ? "grabbing"
                    : movie.hasFile
                      ? "success"
                      : "missing"
                }
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

          <MovieFileBlock
            movie={movie}
            onPressRoot={
              rootFolders && rootFolders.length > 0
                ? () => flow.open("rootFolder")
                : undefined
            }
          />

          <OptionsBlock movie={movie} onPress={() => setOptionsVisible(true)} />

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

          <CollectionBlock
            movie={movie}
            instanceId={instanceId}
            onAddMissing={setCollectionAddTarget}
          />

          <ReleaseDatesBlock movie={movie} />
        </View>
      </ScreenWrapper>

      <ActionSheet
        {...flow.bind("actions")}
        title={movie.title}
        actions={[
          {
            label: "History",
            icon: <Icon icon={History} size={18} color="#a1a1aa" />,
            onPress: () =>
              flow.whenClear(() =>
                router.push(
                  instanceId
                    ? `/movie/history/${movie.id}?instanceId=${instanceId}`
                    : `/movie/history/${movie.id}`,
                ),
              ),
          },
          {
            label: "Delete Movie",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "keep"),
          },
          {
            label: "Delete Movie + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "withFiles"),
          },
        ]}
      />

      <ActionSheet
        {...flow.bind("quality")}
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
            updateFields.mutate({
              movieId: movie.id,
              fields: { qualityProfileId: p.id },
              errorLabel: "Failed to update quality profile",
            });
          },
        }))}
      />

      <MovieOptionsSheet
        visible={optionsVisible}
        onClose={() => setOptionsVisible(false)}
        movie={movie}
        instanceId={instanceId}
      />

      <AddMovieSheet
        result={collectionAddTarget}
        visible={collectionAddTarget !== null}
        onClose={() => setCollectionAddTarget(null)}
        instanceId={instanceId}
      />

      <ActionSheet
        {...flow.bind("rootFolder")}
        title="Root Folder"
        subtitle={movie.title}
        actions={(rootFolders ?? []).map((f) => ({
          label: `${f.path}  ·  ${formatBytes(f.freeSpace)} free`,
          icon: (
            <Icon
              icon={f.path === movie.rootFolderPath ? Check : Circle}
              size={18}
              color={f.path === movie.rootFolderPath ? "#60a5fa" : "#71717a"}
            />
          ),
          onPress: () => {
            if (f.path === movie.rootFolderPath) return;
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
                movieId: movie.id,
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
                movieId: movie.id,
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
            ? "Delete movie + files?"
            : "Delete movie?"
        }
        message={
          flow.payload("confirmDelete") === "withFiles"
            ? `Remove "${movie.title}" from Radarr and delete files from disk. This can't be undone.`
            : `Remove "${movie.title}" from Radarr. Files on disk will be kept.`
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

function MovieFileBlock({
  movie,
  onPressRoot,
}: {
  movie: RadarrMovie;
  onPressRoot?: () => void;
}) {
  const file = movie.hasFile ? movie.movieFile : undefined;
  const fileName = file?.relativePath?.split(/[/\\]/).pop() ?? movie.title;
  const info = file?.mediaInfo;
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
      <View className="rounded-2xl bg-surface border border-border overflow-hidden">
        {file ? (
          <View className="flex-row">
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
        ) : null}
        <View
          className={`p-4 gap-2.5 ${file ? "border-t border-border" : ""}`}
        >
          <AboutRow
            label="Root"
            value={movie.rootFolderPath}
            onPress={onPressRoot}
          />
          <AboutRow label="Added" value={formatReleaseDate(movie.added)} />
        </View>
      </View>
    </View>
  );
}

// Editable Radarr movie options (issue #216): minimum availability + path. The
// whole card is one tap target and opens the MovieOptionsSheet editor — mirrors
// Sonarr's OptionsBlock.
function OptionsBlock({
  movie,
  onPress,
}: {
  movie: RadarrMovie;
  onPress: () => void;
}) {
  const availabilityLabel =
    MIN_AVAILABILITY_OPTIONS.find((o) => o.value === movie.minimumAvailability)
      ?.label ??
    (movie.minimumAvailability ? capitalize(movie.minimumAvailability) : "—");
  return (
    <View className="mb-5">
      <SectionLabel>Options</SectionLabel>
      <Pressable
        onPress={onPress}
        className="rounded-2xl bg-surface border border-border p-4 flex-row items-center active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel="Edit movie options"
      >
        <View className="flex-1 gap-2.5">
          <OptionRow label="Availability" value={availabilityLabel} />
          {movie.path ? <OptionRow label="Path" value={movie.path} /> : null}
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
      <Text className="text-zinc-500 text-[0.65rem] uppercase font-semibold tracking-wider w-20">
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

// Horizontal poster row of the movie's TMDB collection (issue #244). Owned
// members show the standard status strip and navigate to their detail screen;
// missing members show a Plus badge and open the AddMovieSheet.
function CollectionBlock({
  movie,
  instanceId,
  onAddMissing,
}: {
  movie: RadarrMovie;
  instanceId?: string;
  onAddMissing: (result: RadarrSearchResult) => void;
}) {
  const router = useRouter();
  const collectionTmdbId = movie.collection?.tmdbId;
  const { data: collection, isLoading, error } = useRadarrCollection(
    collectionTmdbId,
    instanceId,
  );
  // Ownership + status color come from the live library, not the collection's
  // cached isExisting flags. The queue query shares the parent's cache entry.
  const { data: library } = useRadarrMovies(instanceId);
  const { data: queue } = useRadarrQueue(instanceId);

  const libraryByTmdbId = useMemo(
    () => new Map((library ?? []).map((m) => [m.tmdbId, m])),
    [library],
  );
  const downloadingIds = useMemo(
    () => new Set((queue?.records ?? []).map((r) => r.movieId)),
    [queue],
  );

  if (!collectionTmdbId) return null;
  // Supplementary content — hide quietly on error instead of a banner.
  if (error) return null;
  if (isLoading) {
    return (
      <View className="mb-5">
        <SectionLabel>{movie.collection?.title || "Collection"}</SectionLabel>
        <PosterSkeletonRow count={3} showSubtitle />
      </View>
    );
  }
  if (!collection || collection.movies.length < 2) return null;

  const members = [...collection.movies].sort(
    (a, b) => (a.year || 9999) - (b.year || 9999),
  );

  return (
    <View className="mb-5">
      <SectionLabel>{collection.title || "Collection"}</SectionLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
      >
        {members.map((cm) => {
          const owned = libraryByTmdbId.get(cm.tmdbId);
          const isCurrent = cm.tmdbId === movie.tmdbId;
          // isExisting is the fallback while the library query is loading, so
          // an owned movie never shows an Add affordance that would 400.
          const isOwned = !!owned || cm.isExisting;
          return (
            <MediaPosterTile
              key={cm.tmdbId}
              posterUrl={getRadarrPoster(cm.images)}
              title={cm.title}
              subtitle={cm.year ? String(cm.year) : undefined}
              fallbackIcon={Film}
              mediaType="movie"
              cornerBadge={
                isOwned
                  ? undefined
                  : { icon: Plus, color: BAR_KIND_COLOR.primary }
              }
              bottomOverlay={
                isOwned ? (
                  <PosterProgressStrip
                    progress={1}
                    color={
                      owned
                        ? BAR_KIND_COLOR[
                            radarrBarKind(owned, downloadingIds.has(owned.id))
                          ]
                        : BAR_KIND_COLOR.default
                    }
                  />
                ) : undefined
              }
              onPress={
                isCurrent
                  ? undefined
                  : owned
                    ? () =>
                        router.push(
                          instanceId
                            ? `/movie/${owned.id}?instanceId=${instanceId}`
                            : `/movie/${owned.id}`,
                        )
                    : isOwned
                      ? undefined
                      : () => onAddMissing(toSearchResult(cm, collection))
              }
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

// AddMovieSheet only reads tmdbId/title/year/overview/images; ratings and
// runtime just satisfy the RadarrSearchResult shape. Filling `collection`
// makes the sheet's "Part of …" meta line show here too.
function toSearchResult(
  cm: RadarrCollectionMovie,
  collection: RadarrCollection,
): RadarrSearchResult {
  return {
    tmdbId: cm.tmdbId,
    title: cm.title,
    year: cm.year,
    overview: cm.overview ?? "",
    images: cm.images,
    ratings: { votes: 0, value: 0 },
    runtime: cm.runtime ?? 0,
    collection: { title: collection.title, tmdbId: collection.tmdbId },
  };
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
      {onPress ? (
        <Icon icon={ChevronRight} size={14} color="#71717a" />
      ) : null}
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
