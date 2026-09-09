import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Search, Bookmark, Disc3, Mic2 } from "lucide-react-native";
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
import { Badge } from "@/components/ui/badge";
import {
  useLidarrAlbum,
  useLidarrTracks,
  useLidarrQueue,
  useToggleAlbumMonitored,
  useSearchAlbums,
} from "@/hooks/use-lidarr";
import { useServiceImage } from "@/hooks/use-service-image";
import { getLidarrArtistFanart } from "@/services/lidarr-api";
import { formatBytes } from "@/lib/utils";
import {
  downloadIndicator,
  DOWNLOAD_INDICATOR_COLOR,
} from "@/lib/arr-poster-status";
import type { LidarrAlbum, LidarrTrack } from "@/lib/types";

export default function AlbumDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const router = useRouter();
  const { data: album, isLoading, error } = useLidarrAlbum(Number(id), instanceId);
  const { data: tracks } = useLidarrTracks(Number(id), instanceId);
  const { data: queue } = useLidarrQueue(instanceId);
  const toggleAlbum = useToggleAlbumMonitored(instanceId);
  const searchAlbum = useSearchAlbums(instanceId);

  const cover = album?.images.find((i) => i.coverType === "cover");
  const { src: coverUrl, onError: onCoverError } = useServiceImage(cover, "lidarr");
  const fanartUrl = getLidarrArtistFanart(album?.artist?.images);

  if (isLoading) {
    return <MediaDetailSkeleton />;
  }
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner error={error} title="Failed to load album" className="mt-4" />
      </ScreenWrapper>
    );
  }
  if (!album) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <Text className="text-zinc-400 text-center mt-10">Album not found</Text>
      </ScreenWrapper>
    );
  }

  const stats = album.statistics;
  const hasFiles = (stats?.trackFileCount ?? 0) > 0;
  // Lidarr queues a whole album/release, not individual tracks, so a queued
  // album turns every still-missing track purple (issue #207).
  const albumDownloading = (queue?.records ?? []).some(
    (r) => r.albumId === album.id,
  );

  const actions: MediaActionItem[] = [
    {
      key: "monitor",
      icon: Bookmark,
      label: album.monitored ? "Monitored" : "Monitor",
      active: album.monitored,
      loading: toggleAlbum.isPending,
      onPress: () =>
        toggleAlbum.mutate({
          albumId: album.id,
          artistId: album.artistId,
          monitored: !album.monitored,
        }),
    },
    {
      key: "search",
      icon: Search,
      label: "Search",
      loading: searchAlbum.isPending,
      onPress: () => searchAlbum.mutate([album.id]),
    },
    {
      key: "artist",
      icon: Mic2,
      label: "Artist",
      onPress: () =>
        router.push(
          instanceId
            ? `/artist/${album.artistId}?instanceId=${instanceId}`
            : `/artist/${album.artistId}`,
        ),
    },
  ];

  return (
    <ScreenWrapper edgeToEdge>
      <MediaDetailHero
        backdropUrl={fanartUrl}
        posterUrl={coverUrl}
        onPosterError={onCoverError}
        title={album.title}
        metaLine={buildAlbumMeta(album)}
        ratings={album.ratings}
        posterFallbackIcon={Disc3}
        badges={
          <>
            <Badge
              label={
                albumDownloading
                  ? "Downloading"
                  : hasFiles
                    ? "Downloaded"
                    : "Missing"
              }
              variant={
                albumDownloading
                  ? "grabbing"
                  : hasFiles
                    ? "success"
                    : "missing"
              }
            />
            {album.albumType ? <Badge label={album.albumType} variant="default" /> : null}
          </>
        }
      />

      <View className="px-4 mt-6">
        <MediaActionBar actions={actions} className="mb-4" />

        <MediaStatsStrip stats={buildAlbumStats(album)} className="mb-5" />

        {album.overview ? (
          <View className="mb-5">
            <SectionLabel>Overview</SectionLabel>
            <ExpandableText text={album.overview} numberOfLines={4} />
          </View>
        ) : null}

        {album.genres && album.genres.length > 0 ? (
          <View className="mb-5">
            <SectionLabel>Genres</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {album.genres.map((g) => (
                <Badge key={g} label={g} variant="default" />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {tracks && tracks.length > 0 ? (
          <View className="mb-2">
            <SectionLabel>Tracks</SectionLabel>
            <View className="rounded-2xl bg-surface border border-border overflow-hidden">
              {tracks
                .slice()
                .sort((a, b) => trackOrder(a) - trackOrder(b))
                .map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    albumDownloading={albumDownloading}
                  />
                ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

function trackOrder(track: LidarrTrack): number {
  if (typeof track.absoluteTrackNumber === "number") return track.absoluteTrackNumber;
  const n = Number(track.trackNumber);
  return Number.isFinite(n) ? n : 0;
}

function buildAlbumMeta(album: LidarrAlbum): string {
  const parts: string[] = [];
  if (album.artist?.artistName) parts.push(album.artist.artistName);
  if (album.releaseDate) {
    const y = new Date(album.releaseDate).getFullYear();
    if (Number.isFinite(y)) parts.push(String(y));
  }
  return parts.join(" · ");
}

function buildAlbumStats(album: LidarrAlbum) {
  const stats = album.statistics;
  const have = stats?.trackFileCount ?? 0;
  const total = stats?.trackCount ?? 0;
  return [
    { label: "Type", value: album.albumType || "—" },
    { label: "Tracks", value: total > 0 ? `${have}/${total}` : "—" },
    { label: "Size", value: stats?.sizeOnDisk ? formatBytes(stats.sizeOnDisk) : "—" },
    { label: "Released", value: formatReleaseDate(album.releaseDate) },
  ];
}

function formatReleaseDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTrackDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1">
      {children}
    </Text>
  );
}

function TrackRow({
  track,
  albumDownloading,
}: {
  track: LidarrTrack;
  albumDownloading: boolean;
}) {
  const duration = formatTrackDuration(track.duration);
  // A downloaded track stays green even while the album re-grabs; only the
  // still-missing tracks read purple.
  const indicator = downloadIndicator(
    track.hasFile,
    albumDownloading && !track.hasFile,
  );
  return (
    <View className="flex-row items-center px-4 py-2.5 border-b border-border/30 last:border-b-0">
      <View
        className="w-1.5 h-6 rounded-full mr-3"
        style={{ backgroundColor: DOWNLOAD_INDICATOR_COLOR[indicator] }}
      />
      <Text className="text-zinc-500 text-xs w-6">{track.trackNumber ?? ""}</Text>
      <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
        {track.title}
      </Text>
      {duration ? <Text className="text-zinc-500 text-xs ml-2">{duration}</Text> : null}
    </View>
  );
}
