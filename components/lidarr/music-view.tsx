import { memo, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";
import { useRouter } from "expo-router";
import { Search, Disc3, Mic2, Eye, EyeOff, Trash2, Info, ScanSearch } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  MonitoredLibraryGrid,
  MONITOR_FILTER_OPTIONS,
  type MonitorFilter,
} from "@/components/common/monitored-library-grid";
import { useSortStore, SORT_DEFAULTS, type ArtistsSortKey } from "@/store/sort-store";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import {
  useLidarrArtists,
  useLidarrQueue,
  useLidarrWantedMissing,
  useSearchArtist,
  useSearchAlbums,
  useSearchAllMissingAlbums,
  useToggleArtistMonitored,
  useToggleAlbumMonitored,
  useDeleteArtist,
} from "@/hooks/use-lidarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useUiScale } from "@/hooks/use-ui-scale";
import { mediumHaptic } from "@/lib/haptics";
import {
  BAR_KIND_COLOR,
  cornerColorFor,
  lidarrArtistBarKind,
  lidarrAlbumBarKind,
} from "@/lib/arr-poster-status";
import type { LidarrArtist, LidarrAlbum, LidarrQueueItem } from "@/lib/types";

// MonitoredLibraryGrid keys on `title`; Lidarr artists use `artistName`, so we
// project a `title` field on before handing them to the grid.
type ArtistItem = LidarrArtist & { title: string };

type Tab = "library" | "queue" | "wanted";

const SORT_OPTIONS: { key: ArtistsSortKey; label: string }[] = [
  { key: "added-desc", label: "Recently Added" },
  { key: "title-asc", label: "Name: A → Z" },
  { key: "title-desc", label: "Name: Z → A" },
  { key: "size-desc", label: "Size: Largest First" },
];

function compareArtists(a: ArtistItem, b: ArtistItem, sort: ArtistsSortKey): number {
  switch (sort) {
    case "added-desc":
      return new Date(b.added).getTime() - new Date(a.added).getTime();
    case "title-asc":
      return (a.sortName || a.title).localeCompare(b.sortName || b.title);
    case "title-desc":
      return (b.sortName || b.title).localeCompare(a.sortName || a.title);
    case "size-desc":
      return (b.statistics?.sizeOnDisk ?? 0) - (a.statistics?.sizeOnDisk ?? 0);
  }
}

// Wanted albums are always shown newest-release-first; the grid still needs a
// comparator, so this one ignores the (fixed) sort key.
function compareAlbumsByRelease(a: LidarrAlbum, b: LidarrAlbum): number {
  const at = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
  const bt = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
  return bt - at;
}

function albumYear(album: LidarrAlbum): string {
  if (!album.releaseDate) return album.artist?.artistName ?? "";
  const y = new Date(album.releaseDate).getFullYear();
  return Number.isFinite(y) ? String(y) : album.artist?.artistName ?? "";
}

// Lidarr (Music) library/queue/wanted view. Extracted into a component so it can
// render standalone in the Music tab. `embedded` drops the screen chrome so a
// future combined pager could host it. Mirrors MoviesView.
export const MusicView = memo(function MusicView({
  topSlot,
  embedded = false,
}: {
  topSlot?: React.ReactNode;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("monitored");
  const sort = useSortStore((s) => s.music);
  const setSort = useSortStore((s) => s.setMusic);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const [sheetArtist, setSheetArtist] = useState<ArtistItem | null>(null);
  const [sheetAlbum, setSheetAlbum] = useState<LidarrAlbum | null>(null);
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["lidarr"]]);
  const bottomPadding = useScreenBottomPadding();
  const uiScale = useUiScale();

  const searchArtistMutation = useSearchArtist();
  const searchAlbumsMutation = useSearchAlbums();
  const searchMissing = useSearchAllMissingAlbums();
  const toggleArtist = useToggleArtistMonitored();
  const toggleAlbum = useToggleAlbumMonitored();
  const deleteMutation = useDeleteArtist();
  const [missingConfirmOpen, setMissingConfirmOpen] = useState(false);

  const lidarrHealth = healthData?.find((s) => s.id === "lidarr");

  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    title: string;
    withFiles: boolean;
  } | null>(null);
  // Set from the actions sheet, promoted to the confirm modal only after the
  // sheet has fully closed — never stack two native modals on iOS.
  const deleteIntent = useRef<{
    id: number;
    title: string;
    withFiles: boolean;
  } | null>(null);

  const artistActions: ActionSheetAction[] = useMemo(() => {
    if (!sheetArtist) return [];
    const artist = sheetArtist;
    return [
      {
        label: "Search",
        icon: <Icon icon={Search} size={18} color="#a1a1aa" />,
        onPress: () => searchArtistMutation.mutate(artist.id),
      },
      {
        label: artist.monitored ? "Unmonitor" : "Monitor",
        icon: artist.monitored ? (
          <Icon icon={EyeOff} size={18} color="#a1a1aa" />
        ) : (
          <Icon icon={Eye} size={18} color="#a1a1aa" />
        ),
        onPress: () =>
          toggleArtist.mutate({ artistId: artist.id, monitored: !artist.monitored }),
      },
      {
        label: "Open Details",
        icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
        onPress: () => router.push(`/artist/${artist.id}`),
      },
      {
        label: "Delete",
        icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
        variant: "danger",
        onPress: () => {
          deleteIntent.current = { id: artist.id, title: artist.title, withFiles: false };
        },
      },
      {
        label: "Delete + Files",
        icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
        variant: "danger",
        onPress: () => {
          deleteIntent.current = { id: artist.id, title: artist.title, withFiles: true };
        },
      },
    ];
  }, [sheetArtist, searchArtistMutation, toggleArtist, router]);

  const albumActions: ActionSheetAction[] = useMemo(() => {
    if (!sheetAlbum) return [];
    const album = sheetAlbum;
    return [
      {
        label: "Search",
        icon: <Icon icon={Search} size={18} color="#a1a1aa" />,
        onPress: () => searchAlbumsMutation.mutate([album.id]),
      },
      {
        label: album.monitored ? "Unmonitor" : "Monitor",
        icon: album.monitored ? (
          <Icon icon={EyeOff} size={18} color="#a1a1aa" />
        ) : (
          <Icon icon={Eye} size={18} color="#a1a1aa" />
        ),
        onPress: () =>
          toggleAlbum.mutate({
            albumId: album.id,
            artistId: album.artistId,
            monitored: !album.monitored,
          }),
      },
      {
        label: "Open Details",
        icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
        onPress: () => router.push(`/album/${album.id}`),
      },
    ];
  }, [sheetAlbum, searchAlbumsMutation, toggleAlbum, router]);

  const openArtistSheet = (artist: ArtistItem) => {
    mediumHaptic();
    setSheetArtist(artist);
  };
  const openAlbumSheet = (album: LidarrAlbum) => {
    mediumHaptic();
    setSheetAlbum(album);
  };

  const handleSearchMissing = () => {
    mediumHaptic();
    setMissingConfirmOpen(true);
  };

  // Horizontal padding comes from ScreenWrapper's px-4; only vertical padding
  // here. pt = 0.5rem, matched at runtime so accessibility scale applies.
  const contentContainerStyle = {
    paddingTop: 7 * uiScale,
    paddingBottom: bottomPadding,
  };

  const refreshCtl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="#3b82f6"
      colors={["#3b82f6"]}
      progressBackgroundColor="#18181b"
    />
  );

  const header = (
    <>
      {topSlot}
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="Music" online={lidarrHealth?.online} serviceId="lidarr" />
        <View className="flex-row items-center">
          {tab === "wanted" && (
            <Pressable
              onPress={handleSearchMissing}
              disabled={searchMissing.isPending}
              className="p-2 active:opacity-70"
              accessibilityLabel="Search all missing albums"
            >
              <Icon icon={ScanSearch} size={ICON.LG} color="#a1a1aa" />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/artist/search")}
            className="p-2 active:opacity-70"
            accessibilityLabel="Add artist"
          >
            <Icon icon={Search} size={ICON.LG} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {(["library", "queue", "wanted"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </ScrollView>

      {tab === "library" && (
        <View className="mb-4">
          <FilterSortButton
            summary={`${MONITOR_FILTER_OPTIONS.find((f) => f.value === monitorFilter)?.label ?? ""} · ${SORT_OPTIONS.find((o) => o.key === sort)?.label ?? ""}`}
            onPress={() => setFilterSortOpen(true)}
            active={monitorFilter !== "monitored" || sort !== SORT_DEFAULTS.music}
          />
        </View>
      )}
    </>
  );

  const body = (
    <>
      {tab === "library" && (
        <ArtistLibrary
          monitorFilter={monitorFilter}
          sort={sort}
          onLongPress={openArtistSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "wanted" && (
        <AlbumWanted
          onLongPress={openAlbumSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "queue" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={contentContainerStyle}
          refreshControl={refreshCtl}
          showsVerticalScrollIndicator={false}
        >
          {header}
          <AlbumQueue />
        </ScrollView>
      )}

      <ActionSheet
        visible={sheetArtist !== null}
        onClose={() => setSheetArtist(null)}
        onClosed={() => {
          if (deleteIntent.current) {
            setPendingDelete(deleteIntent.current);
            deleteIntent.current = null;
          }
        }}
        title={sheetArtist?.title}
        actions={artistActions}
      />

      <ActionSheet
        visible={sheetAlbum !== null}
        onClose={() => setSheetAlbum(null)}
        title={sheetAlbum?.title}
        subtitle={sheetAlbum?.artist?.artistName}
        actions={albumActions}
      />

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort artists"
        filterOptions={MONITOR_FILTER_OPTIONS.map((f) => ({
          key: f.value,
          label: f.label,
        }))}
        filterValue={monitorFilter}
        onFilterChange={setMonitorFilter}
        sortOptions={SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        sortValue={sort}
        onSortChange={setSort}
      />

      <ConfirmModal
        visible={missingConfirmOpen}
        title="Search Missing Albums"
        message="Lidarr will search every monitored missing album in your library. This can queue a lot of grabs at once."
        icon={ScanSearch}
        confirmLabel="Search"
        onConfirm={() => {
          setMissingConfirmOpen(false);
          searchMissing.mutate();
        }}
        onCancel={() => setMissingConfirmOpen(false)}
      />

      <ConfirmModal
        visible={pendingDelete !== null}
        title={pendingDelete?.withFiles ? "Delete artist + files?" : "Delete artist?"}
        message={
          pendingDelete
            ? pendingDelete.withFiles
              ? `Remove "${pendingDelete.title}" from Lidarr and delete files from disk. This can't be undone.`
              : `Remove "${pendingDelete.title}" from Lidarr. Files on disk will be kept.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={pendingDelete?.withFiles ? "Delete + Files" : "Delete"}
        onConfirm={() => {
          if (pendingDelete) {
            deleteMutation.mutate({
              id: pendingDelete.id,
              deleteFiles: pendingDelete.withFiles,
            });
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );

  return embedded ? (
    <View className="flex-1 px-4">{body}</View>
  ) : (
    <ScreenWrapper scrollable={false}>{body}</ScreenWrapper>
  );
});

function ArtistLibrary({
  monitorFilter,
  sort,
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  monitorFilter: MonitorFilter;
  sort: ArtistsSortKey;
  onLongPress: (artist: ArtistItem) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<typeof MonitoredLibraryGrid>["contentContainerStyle"];
}) {
  const { data: artists, isLoading, error } = useLidarrArtists();
  const { data: queue } = useLidarrQueue();
  const router = useRouter();

  const downloading = useMemo(
    () =>
      new Set(
        (queue?.records ?? [])
          .map((r) => r.artistId)
          .filter((x): x is number => typeof x === "number"),
      ),
    [queue],
  );

  const items: ArtistItem[] = useMemo(
    () => (artists ?? []).map((a) => ({ ...a, title: a.artistName })),
    [artists],
  );

  return (
    <MonitoredLibraryGrid
      data={items}
      isLoading={isLoading}
      error={error}
      monitorFilter={monitorFilter}
      sort={sort}
      compare={compareArtists}
      serviceId="lidarr"
      placeholderIcon={Mic2}
      nounPlural="artists"
      renderFooter={(a) => {
        const count = a.statistics?.albumCount ?? 0;
        return `${count} album${count === 1 ? "" : "s"}`;
      }}
      posterStatus={(a) => ({
        barColor: BAR_KIND_COLOR[lidarrArtistBarKind(a, downloading.has(a.id))],
        cornerColor: cornerColorFor(a.status),
      })}
      onItemPress={(a) => router.push(`/artist/${a.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={listHeader}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

function AlbumQueue() {
  const { data: queue, isLoading, error } = useLidarrQueue();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load queue" />;
  }
  if (!queue?.records.length) {
    return <EmptyState title="Queue empty" message="No albums downloading" />;
  }

  return (
    <View className="gap-2">
      {queue.records.map((item: LidarrQueueItem) => (
        <Card
          key={item.id}
          onPress={() => item.albumId && router.push(`/album/${item.albumId}`)}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
              {item.album?.title || item.title}
            </Text>
            <Badge label={item.quality.quality.name} />
          </View>
          {item.artist?.artistName ? (
            <Text className="text-zinc-500 text-xs mt-1" numberOfLines={1}>
              {item.artist.artistName}
            </Text>
          ) : null}
          {item.timeleft && (
            <Text className="text-zinc-500 text-xs mt-1">ETA {item.timeleft}</Text>
          )}
        </Card>
      ))}
    </View>
  );
}

function AlbumWanted({
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  onLongPress: (album: LidarrAlbum) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<
    typeof MonitoredLibraryGrid
  >["contentContainerStyle"];
}) {
  const { data: wanted, isLoading, error } = useLidarrWantedMissing();
  const { data: queue } = useLidarrQueue();
  const router = useRouter();

  const downloading = useMemo(
    () =>
      new Set(
        (queue?.records ?? [])
          .map((r) => r.albumId)
          .filter((x): x is number => typeof x === "number"),
      ),
    [queue],
  );

  const count = wanted?.totalRecords ?? 0;
  const header = (
    <>
      {listHeader}
      {!isLoading && (
        <View className="mb-4">
          <Text className="text-zinc-400 text-sm">
            {count} missing {count === 1 ? "album" : "albums"}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <MonitoredLibraryGrid
      data={wanted?.records}
      isLoading={isLoading}
      error={error}
      monitorFilter="all"
      sort="release-desc"
      compare={compareAlbumsByRelease}
      serviceId="lidarr"
      posterCoverType="cover"
      placeholderIcon={Disc3}
      nounPlural="missing albums"
      renderFooter={(album) => albumYear(album)}
      posterStatus={(album) => ({
        barColor: BAR_KIND_COLOR[lidarrAlbumBarKind(album, downloading.has(album.id))],
        cornerColor: null,
      })}
      onItemPress={(album) => router.push(`/album/${album.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={header}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
