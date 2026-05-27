import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import {
  Play,
  Pause,
  Loader,
  Library,
  Tv,
  ArrowUpDown,
  Check,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { SortButton } from "@/components/ui/sort-button";
import {
  useSortStore,
  SORT_DEFAULTS,
  type JellyfinRecentSortKey,
} from "@/store/sort-store";
import { createMediaServerHooks, type MediaServerHooks } from "@/hooks/use-media-server";
import { getJellyfinImageUrl, isJellyfinTranscoding, ticksToMs } from "@/services/jellyfin-api";
import { getMediaServerConfig, type MediaServerId } from "@/lib/media-server-config";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useUiScale } from "@/hooks/use-ui-scale";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { truncateText } from "@/lib/utils";
import type { JellyfinItem, JellyfinLibrary, JellyfinSession } from "@/lib/types";

// One hook set per media-server kind, stamped once at module scope. Selecting
// from this map by serviceId (which is fixed per mounted screen) keeps hook
// calls unconditional and Rules-of-Hooks-safe. Keys are identical to the
// use-jellyfin.ts / use-emby.ts instantiations, so React Query shares caches.
const HOOKS: Record<MediaServerId, MediaServerHooks> = {
  jellyfin: createMediaServerHooks("jellyfin"),
  emby: createMediaServerHooks("emby"),
};

type Tab = "playing" | "recent" | "resume" | "libraries";

const RECENT_SORT_OPTIONS: { key: JellyfinRecentSortKey; label: string }[] = [
  { key: "added-desc", label: "Recently Added" },
  { key: "title-asc", label: "Title: A → Z" },
  { key: "title-desc", label: "Title: Z → A" },
  { key: "year-desc", label: "Year: Newest First" },
  { key: "year-asc", label: "Year: Oldest First" },
];

function recentTitle(item: JellyfinItem): string {
  return item.SeriesName || item.Name;
}

function addedAtMs(item: JellyfinItem): number {
  if (item.DateCreated) {
    const t = Date.parse(item.DateCreated);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function compareRecent(
  a: JellyfinItem,
  b: JellyfinItem,
  sort: JellyfinRecentSortKey,
): number {
  switch (sort) {
    case "added-desc":
      return addedAtMs(b) - addedAtMs(a);
    case "title-asc":
      return recentTitle(a).localeCompare(recentTitle(b));
    case "title-desc":
      return recentTitle(b).localeCompare(recentTitle(a));
    case "year-desc":
      return (b.ProductionYear ?? 0) - (a.ProductionYear ?? 0);
    case "year-asc":
      return (a.ProductionYear ?? 0) - (b.ProductionYear ?? 0);
  }
}

// Shared screen for Jellyfin and Emby — they expose the same API, so one screen
// renders both, parameterized by serviceId. See lib/media-server-config.ts.
export function MediaServerScreen({ serviceId }: { serviceId: MediaServerId }) {
  const { displayName } = getMediaServerConfig(serviceId);
  const [tab, setTab] = useState<Tab>("playing");

  // Sort preference is per-kind so the two tabs keep independent state.
  const jellyfinSort = useSortStore((s) => s.jellyfinRecent);
  const embySort = useSortStore((s) => s.embyRecent);
  const setJellyfinSort = useSortStore((s) => s.setJellyfinRecent);
  const setEmbySort = useSortStore((s) => s.setEmbyRecent);
  const recentSort = serviceId === "emby" ? embySort : jellyfinSort;
  const setRecentSort = serviceId === "emby" ? setEmbySort : setJellyfinSort;

  const [recentSortOpen, setRecentSortOpen] = useState(false);
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([[serviceId]]);
  const bottomPadding = useScreenBottomPadding();
  const uiScale = useUiScale();

  const health = healthData?.find((s) => s.id === serviceId);

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
      <ServiceHeader name={displayName} online={health?.online} serviceId={serviceId} />

      <View className="flex-row items-center gap-2 mb-4">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="flex-1"
        >
          {(["playing", "recent", "resume", "libraries"] as Tab[]).map((t) => (
            <FilterChip
              key={t}
              label={
                t === "playing"
                  ? "Now Playing"
                  : t === "resume"
                    ? "Continue Watching"
                    : t.charAt(0).toUpperCase() + t.slice(1)
              }
              selected={tab === t}
              onPress={() => setTab(t)}
            />
          ))}
        </ScrollView>
        {tab === "recent" && (
          <SortButton
            onPress={() => setRecentSortOpen(true)}
            active={recentSort !== SORT_DEFAULTS.jellyfinRecent}
          />
        )}
      </View>
    </>
  );

  return (
    <ScreenWrapper scrollable={false}>
      {tab === "recent" && (
        <RecentlyAdded
          serviceId={serviceId}
          sort={recentSort}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab !== "recent" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={contentContainerStyle}
          refreshControl={refreshCtl}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {tab === "playing" && <NowPlaying serviceId={serviceId} displayName={displayName} />}
          {tab === "resume" && <ContinueWatching serviceId={serviceId} />}
          {tab === "libraries" && <Libraries serviceId={serviceId} />}
        </ScrollView>
      )}

      <ActionSheet
        visible={recentSortOpen}
        onClose={() => setRecentSortOpen(false)}
        title="Sort recently added"
        actions={RECENT_SORT_OPTIONS.map<ActionSheetAction>((opt) => ({
          label: opt.label,
          icon:
            recentSort === opt.key ? (
              <Icon icon={Check} size={18} color="#3b82f6" />
            ) : (
              <Icon icon={ArrowUpDown} size={18} color="#71717a" />
            ),
          onPress: () => setRecentSort(opt.key),
        }))}
      />
    </ScreenWrapper>
  );
}

function NowPlaying({ serviceId, displayName }: { serviceId: MediaServerId; displayName: string }) {
  const { data: sessions, isLoading } = HOOKS[serviceId].useSessions();

  if (isLoading) return <SkeletonCardContent rows={2} />;
  if (!sessions?.length) {
    return (
      <EmptyState
        icon={<Icon icon={Play} size={32} color="#71717a" />}
        title="Nothing playing"
        message={`No active ${displayName} streams`}
      />
    );
  }

  return (
    <View className="gap-3">
      {sessions.map((session) => (
        <SessionCard key={session.Id} session={session} serviceId={serviceId} />
      ))}
    </View>
  );
}

function SessionCard({ session, serviceId }: { session: JellyfinSession; serviceId: MediaServerId }) {
  const item = session.NowPlayingItem;
  const durationMs = ticksToMs(item?.RunTimeTicks);
  const positionMs = ticksToMs(session.PlayState?.PositionTicks);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  const isPaused = !!session.PlayState?.IsPaused;
  const transcoding = isJellyfinTranscoding(session);
  const StateIcon = isPaused ? Pause : transcoding ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : transcoding ? "#f59e0b" : "#22c55e";

  const title =
    item?.Type === "Episode" && item.SeriesName
      ? `${item.SeriesName} — ${item.Name}`
      : (item?.Name ?? "Unknown");

  const thumbUrl = getJellyfinImageUrl(item, "Primary", 80, 120, undefined, serviceId);

  const playMethod = session.PlayState?.PlayMethod ?? "DirectPlay";
  const transcodeLabel =
    playMethod === "DirectPlay"
      ? "Direct Play"
      : playMethod === "DirectStream"
        ? "Direct Stream"
        : "Transcode";

  return (
    <Card className="flex-row gap-3">
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          className="w-14 h-20 rounded-lg bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={thumbUrl}
        />
      ) : (
        <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
          <Icon icon={Play} size={18} color="#71717a" />
        </View>
      )}
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Icon icon={StateIcon} size={14} color={stateColor} />
          <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
            {truncateText(title, 30)}
          </Text>
        </View>
        <ProgressBar progress={progress} className="mb-1.5" />
        <View className="flex-row items-center gap-2">
          <Badge
            label={transcodeLabel}
            variant={transcodeLabel === "Direct Play" ? "success" : "warning"}
          />
        </View>
        <Text className="text-zinc-500 text-xs mt-1">
          {[session.UserName, session.Client, session.DeviceName]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
    </Card>
  );
}

function RecentlyAdded({
  serviceId,
  sort,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  serviceId: MediaServerId;
  sort: JellyfinRecentSortKey;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const { data: items, isLoading } = HOOKS[serviceId].useRecentlyAdded();
  const { width: cellWidth, columns, gap } = usePosterCellLayout();

  const sorted = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => compareRecent(a, b, sort));
  }, [items, sort]);

  const emptyState = useMemo(() => {
    if (isLoading) {
      return (
        <View className="flex-row flex-wrap" style={{ gap }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ width: cellWidth }}>
              <Skeleton width="100%" height={150} borderRadius={12} />
              <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
            </View>
          ))}
        </View>
      );
    }
    return <EmptyState title="Nothing recently added" />;
  }, [isLoading, cellWidth, gap]);

  return (
    <FlatList
      // numColumns cannot change at runtime without a remount.
      key={columns}
      data={sorted}
      keyExtractor={(item) => item.Id}
      renderItem={({ item }) => <MediaPoster item={item} serviceId={serviceId} />}
      numColumns={columns}
      columnWrapperStyle={{ gap, marginBottom: gap }}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={emptyState}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={5}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

function ContinueWatching({ serviceId }: { serviceId: MediaServerId }) {
  const { data: items, isLoading } = HOOKS[serviceId].useResumeItems();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (!items?.length) {
    return <EmptyState title="Nothing to resume" />;
  }

  return (
    <View className="gap-2">
      {items.map((item) => {
        const thumbUrl = getJellyfinImageUrl(item, "Primary", 80, 120, undefined, serviceId);
        const title =
          item.Type === "Episode" && item.SeriesName
            ? `${item.SeriesName} — ${item.Name}`
            : item.Name;
        const durationMs = ticksToMs(item.RunTimeTicks);
        const positionMs = ticksToMs(item.UserData?.PlaybackPositionTicks);
        const progress =
          item.UserData?.PlayedPercentage != null
            ? item.UserData.PlayedPercentage / 100
            : durationMs > 0
              ? positionMs / durationMs
              : 0;

        return (
          <Card key={item.Id} className="flex-row gap-3">
            {thumbUrl ? (
              <Image
                source={{ uri: thumbUrl }}
                className="w-14 h-20 rounded-lg bg-surface-light"
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                recyclingKey={thumbUrl}
              />
            ) : (
              <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
                <Icon icon={Tv} size={18} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                {title}
              </Text>
              {item.Type === "Episode" && item.ParentIndexNumber != null && item.IndexNumber != null && (
                <Text className="text-zinc-500 text-xs">
                  S{item.ParentIndexNumber} · E{item.IndexNumber}
                </Text>
              )}
              {item.ProductionYear && (
                <Text className="text-zinc-600 text-xs">{item.ProductionYear}</Text>
              )}
              <ProgressBar progress={progress} className="mt-1.5" />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

function Libraries({ serviceId }: { serviceId: MediaServerId }) {
  const { data: libraries, isLoading, error } = HOOKS[serviceId].useLibraries();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load libraries" />;
  }
  if (!libraries?.length) {
    return <EmptyState title="No libraries found" />;
  }

  return (
    <View className="gap-2">
      {libraries.map((lib) => (
        <LibraryRow key={lib.Id} lib={lib} />
      ))}
    </View>
  );
}

function LibraryRow({ lib }: { lib: JellyfinLibrary }) {
  return (
    <Card className="flex-row items-center gap-3">
      <View className="bg-surface-light rounded-xl p-2.5">
        <Icon icon={Library} size={20} color="#a1a1aa" />
      </View>
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm font-medium">{lib.Name}</Text>
        {lib.CollectionType && (
          <Text className="text-zinc-500 text-xs capitalize">{lib.CollectionType}</Text>
        )}
      </View>
    </Card>
  );
}

function MediaPoster({ item, serviceId }: { item: JellyfinItem; serviceId: MediaServerId }) {
  const thumbUrl = getJellyfinImageUrl(item, "Primary", 200, 300, undefined, serviceId);
  const title =
    item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name;
  const { width: cellWidth } = usePosterCellLayout();

  return (
    <View style={{ width: cellWidth }}>
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={thumbUrl}
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Icon icon={Play} size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-sm mt-1" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
