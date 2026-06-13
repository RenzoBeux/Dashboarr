import { View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronRight,
  Check,
  Search,
  Trash2,
  Bookmark,
  MoreHorizontal,
  Award,
  Mic2,
  Disc3,
  Circle,
  FolderTree,
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
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  useLidarrArtist,
  useLidarrAlbums,
  useToggleArtistMonitored,
  useToggleAlbumMonitored,
  useSearchArtist,
  useSearchAlbums,
  useDeleteArtist,
  useLidarrQualityProfiles,
  useUpdateArtistQualityProfile,
  useLidarrRootFolders,
  useUpdateArtistRootFolder,
} from "@/hooks/use-lidarr";
import { useServiceImage } from "@/hooks/use-service-image";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { getLidarrAlbumCover } from "@/services/lidarr-api";
import { formatBytes } from "@/lib/utils";
import type { LidarrArtist, LidarrAlbum } from "@/lib/types";

type DeleteMode = "keep" | "withFiles";

export default function ArtistDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const { data: artist, isLoading, error } = useLidarrArtist(Number(id), instanceId);
  const { data: albums } = useLidarrAlbums(Number(id), instanceId);
  const toggleArtist = useToggleArtistMonitored(instanceId);
  const searchArtist = useSearchArtist(instanceId);
  const deleteArtist = useDeleteArtist(instanceId);
  const { data: qualityProfiles } = useLidarrQualityProfiles(instanceId);
  const updateProfile = useUpdateArtistQualityProfile(instanceId);
  const { data: rootFolders } = useLidarrRootFolders(instanceId);
  const updateRootFolder = useUpdateArtistRootFolder(instanceId);

  // All modal sequencing (sheet → confirm, sheet → sheet, confirm → pop) goes
  // through the flow — see hooks/use-modal-flow.ts.
  const flow = useModalFlow<{
    actions: void;
    quality: void;
    rootFolder: void;
    moveFiles: string; // payload: the picked root folder path
    confirmDelete: DeleteMode;
  }>();

  const poster = artist?.images.find((i) => i.coverType === "poster");
  const fanart = artist?.images.find((i) => i.coverType === "fanart");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "lidarr");
  const { src: fanartUrl, onError: onFanartError } = useServiceImage(fanart, "lidarr");

  if (isLoading) {
    return <MediaDetailSkeleton showSeasonList />;
  }
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner error={error} title="Failed to load artist" className="mt-4" />
      </ScreenWrapper>
    );
  }
  if (!artist) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <Text className="text-zinc-400 text-center mt-10">Artist not found</Text>
      </ScreenWrapper>
    );
  }

  const qualityProfileName = qualityProfiles?.find(
    (p) => p.id === artist.qualityProfileId,
  )?.name;

  const handleToggleMonitor = () => {
    toggleArtist.mutate({ artistId: artist.id, monitored: !artist.monitored });
  };

  const confirmDelete = () => {
    const mode = flow.payload("confirmDelete");
    if (!mode) return;
    flow.close();
    deleteArtist.mutate(
      { id: artist.id, deleteFiles: mode === "withFiles" },
      {
        // flow.back() pops only once the confirm has fully dismissed.
        onSuccess: () => flow.back(),
        onError: (err) => toastError("Failed to delete artist", err),
      },
    );
  };

  const actions: MediaActionItem[] = [
    {
      key: "monitor",
      icon: Bookmark,
      label: artist.monitored ? "Monitored" : "Monitor",
      active: artist.monitored,
      loading: toggleArtist.isPending,
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
      loading: searchArtist.isPending,
      onPress: () => searchArtist.mutate(artist.id),
    },
    {
      key: "more",
      icon: MoreHorizontal,
      label: "More",
      onPress: () => flow.open("actions"),
    },
  ];

  const stats = buildArtistStats(artist);

  return (
    <>
      <ScreenWrapper edgeToEdge>
        <MediaDetailHero
          backdropUrl={fanartUrl}
          posterUrl={posterUrl}
          onBackdropError={onFanartError}
          onPosterError={onPosterError}
          title={artist.artistName}
          metaLine={buildArtistMeta(artist)}
          ratings={artist.ratings}
          posterFallbackIcon={Mic2}
          badges={
            artist.disambiguation ? (
              <Badge label={artist.disambiguation} variant="default" />
            ) : null
          }
        />

        <View className="px-4 mt-6">
          <MediaActionBar actions={actions} className="mb-4" />

          <MediaStatsStrip stats={stats} className="mb-5" />

          <TrackProgressBlock artist={artist} />

          <AboutBlock
            artist={artist}
            onPressRoot={
              rootFolders && rootFolders.length > 0
                ? () => flow.open("rootFolder")
                : undefined
            }
          />

          {artist.overview ? (
            <View className="mb-5">
              <SectionLabel>Overview</SectionLabel>
              <ExpandableText text={artist.overview} numberOfLines={4} />
            </View>
          ) : null}

          {artist.genres && artist.genres.length > 0 ? (
            <View className="mb-5">
              <SectionLabel>Genres</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {artist.genres.map((g) => (
                  <Badge key={g} label={g} variant="default" />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View className="mb-2">
            <SectionLabel>Albums</SectionLabel>
            <View className="gap-2">
              {(albums ?? [])
                .slice()
                .sort((a, b) => releaseTime(b) - releaseTime(a))
                .map((album) => (
                  <AlbumRow
                    key={album.id}
                    album={album}
                    instanceId={instanceId}
                  />
                ))}
            </View>
          </View>
        </View>
      </ScreenWrapper>

      <ActionSheet
        {...flow.bind("actions")}
        title={artist.artistName}
        actions={[
          {
            label: "Delete Artist",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "keep"),
          },
          {
            label: "Delete Artist + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "withFiles"),
          },
        ]}
      />

      <ActionSheet
        {...flow.bind("quality")}
        title="Quality Profile"
        subtitle={artist.artistName}
        actions={(qualityProfiles ?? []).map((p) => ({
          label: p.name,
          icon: (
            <Icon
              icon={p.id === artist.qualityProfileId ? Check : Circle}
              size={18}
              color={p.id === artist.qualityProfileId ? "#60a5fa" : "#71717a"}
            />
          ),
          onPress: () => {
            if (p.id === artist.qualityProfileId) return;
            updateProfile.mutate({ artistId: artist.id, qualityProfileId: p.id });
          },
        }))}
      />

      <ActionSheet
        {...flow.bind("rootFolder")}
        title="Root Folder"
        subtitle={artist.artistName}
        actions={(rootFolders ?? []).map((f) => ({
          label: `${f.path}  ·  ${formatBytes(f.freeSpace)} free`,
          icon: (
            <Icon
              icon={f.path === artist.rootFolderPath ? Check : Circle}
              size={18}
              color={f.path === artist.rootFolderPath ? "#60a5fa" : "#71717a"}
            />
          ),
          onPress: () => {
            if (f.path === artist.rootFolderPath) return;
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
                artistId: artist.id,
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
                artistId: artist.id,
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
            ? "Delete artist + files?"
            : "Delete artist?"
        }
        message={
          flow.payload("confirmDelete") === "withFiles"
            ? `Remove "${artist.artistName}" from Lidarr and delete all files from disk. This can't be undone.`
            : `Remove "${artist.artistName}" from Lidarr. Files on disk will be kept.`
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

function releaseTime(album: LidarrAlbum): number {
  return album.releaseDate ? new Date(album.releaseDate).getTime() : 0;
}

function buildArtistMeta(artist: LidarrArtist): string {
  const parts: string[] = [];
  if (artist.artistType) parts.push(artist.artistType);
  if (artist.status) parts.push(capitalize(artist.status));
  return parts.join(" · ");
}

function buildArtistStats(artist: LidarrArtist) {
  const stats = artist.statistics;
  const have = stats?.trackFileCount ?? 0;
  const total = stats?.totalTrackCount ?? stats?.trackCount ?? 0;
  return [
    { label: "Status", value: capitalize(artist.status) },
    { label: "Albums", value: stats?.albumCount != null ? String(stats.albumCount) : "—" },
    { label: "Tracks", value: total > 0 ? `${have}/${total}` : "—" },
    { label: "Size", value: stats?.sizeOnDisk ? formatBytes(stats.sizeOnDisk) : "—" },
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

function TrackProgressBlock({ artist }: { artist: LidarrArtist }) {
  const have = artist.statistics?.trackFileCount ?? 0;
  const total = artist.statistics?.totalTrackCount ?? artist.statistics?.trackCount ?? 0;
  if (!total) return null;
  const ratio = total > 0 ? have / total : 0;
  const missing = total - have;
  const allDownloaded = missing === 0;
  return (
    <View className="mb-5">
      <SectionLabel>Progress</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border overflow-hidden flex-row">
        <View className={`w-1 ${allDownloaded ? "bg-success" : "bg-primary"}`} />
        <View className="flex-1 p-4">
          <View className="flex-row items-end justify-between mb-2.5">
            <Text className="text-zinc-100 text-2xl font-bold">
              {have}
              <Text className="text-zinc-500 text-base font-medium"> / {total}</Text>
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
            className={`text-xs mt-2.5 ${allDownloaded ? "text-success" : "text-zinc-500"}`}
          >
            {allDownloaded
              ? "All tracks downloaded"
              : `${missing} track${missing !== 1 ? "s" : ""} missing`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function AboutBlock({
  artist,
  onPressRoot,
}: {
  artist: LidarrArtist;
  onPressRoot?: () => void;
}) {
  return (
    <View className="mb-5">
      <SectionLabel>About</SectionLabel>
      <View className="rounded-2xl bg-surface border border-border p-4 gap-2.5">
        {artist.rootFolderPath ? (
          <AboutRow label="Root" value={artist.rootFolderPath} onPress={onPressRoot} />
        ) : null}
        <AboutRow label="Added" value={formatReleaseDate(artist.added)} />
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

function AlbumRow({
  album,
  instanceId,
}: {
  album: LidarrAlbum;
  instanceId?: string;
}) {
  const router = useRouter();
  const toggleAlbum = useToggleAlbumMonitored(instanceId);
  const searchAlbum = useSearchAlbums(instanceId);
  const cover = album.images.find((i) => i.coverType === "cover");
  const { src: coverUrl, onError } = useServiceImage(cover, "lidarr");

  const stats = album.statistics;
  const have = stats?.trackFileCount ?? 0;
  const total = stats?.trackCount ?? 0;
  const ratio = total > 0 ? have / total : 0;
  const year = album.releaseDate ? new Date(album.releaseDate).getFullYear() : null;

  return (
    <Card
      onPress={() =>
        router.push(
          instanceId ? `/album/${album.id}?instanceId=${instanceId}` : `/album/${album.id}`,
        )
      }
    >
      <View className="flex-row items-center gap-3">
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            className="w-12 h-12 rounded-md bg-surface-light"
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={coverUrl}
            onError={onError}
          />
        ) : (
          <View className="w-12 h-12 rounded-md bg-surface-light items-center justify-center">
            <Icon icon={Disc3} size={20} color="#71717a" />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {album.title}
          </Text>
          <Text className="text-zinc-500 text-xs">
            {[album.albumType, year ? String(year) : null].filter(Boolean).join(" · ")}
          </Text>
          {total > 0 ? <ProgressBar progress={ratio} className="mt-1.5" /> : null}
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() =>
              toggleAlbum.mutate({
                albumId: album.id,
                artistId: album.artistId,
                monitored: !album.monitored,
              })
            }
            disabled={toggleAlbum.isPending}
            className={`p-2 active:opacity-70 ${toggleAlbum.isPending ? "opacity-50" : ""}`}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              album.monitored ? "Monitored — tap to unmonitor" : "Not monitored — tap to monitor"
            }
          >
            <Icon
              icon={Bookmark}
              size={18}
              color={album.monitored ? "#3b82f6" : "#52525b"}
              fill={album.monitored ? "#3b82f6" : "transparent"}
            />
          </Pressable>
          <Pressable
            onPress={() => searchAlbum.mutate([album.id])}
            hitSlop={8}
            className="p-2 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Search for album"
          >
            <Icon icon={Search} size={16} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}
