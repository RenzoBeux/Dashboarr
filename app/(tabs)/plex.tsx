import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
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
  Clock,
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
  type PlexRecentSortKey,
} from "@/store/sort-store";
import {
  usePlexLibraries,
  usePlexRecentlyAdded,
  usePlexOnDeck,
  usePlexSessions,
} from "@/hooks/use-plex";
import { getPlexImageUrl } from "@/services/plex-api";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useUiScale } from "@/hooks/use-ui-scale";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { truncateText } from "@/lib/utils";
import type { PlexSession, PlexMediaItem, PlexLibrary } from "@/lib/types";

type Tab = "playing" | "recent" | "ondeck" | "libraries";

const RECENT_SORT_OPTIONS: { key: PlexRecentSortKey; label: string }[] = [
  { key: "added-desc", label: "Recently Added" },
  { key: "title-asc", label: "Title: A → Z" },
  { key: "title-desc", label: "Title: Z → A" },
  { key: "year-desc", label: "Year: Newest First" },
  { key: "year-asc", label: "Year: Oldest First" },
];

function recentTitle(item: PlexMediaItem): string {
  return item.grandparentTitle || item.parentTitle || item.title;
}

function compareRecent(
  a: PlexMediaItem,
  b: PlexMediaItem,
  sort: PlexRecentSortKey,
): number {
  switch (sort) {
    case "added-desc":
      return (b.addedAt ?? 0) - (a.addedAt ?? 0);
    case "title-asc":
      return recentTitle(a).localeCompare(recentTitle(b));
    case "title-desc":
      return recentTitle(b).localeCompare(recentTitle(a));
    case "year-desc":
      return (b.year ?? 0) - (a.year ?? 0);
    case "year-asc":
      return (a.year ?? 0) - (b.year ?? 0);
  }
}

export default function PlexScreen() {
  const [tab, setTab] = useState<Tab>("playing");
  const recentSort = useSortStore((s) => s.plexRecent);
  const setRecentSort = useSortStore((s) => s.setPlexRecent);
  const [recentSortOpen, setRecentSortOpen] = useState(false);
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["plex"]]);
  const bottomPadding = useScreenBottomPadding();
  const uiScale = useUiScale();

  const plexHealth = healthData?.find((s) => s.id === "plex");

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
      <ServiceHeader name="Plex" online={plexHealth?.online} serviceId="plex" />

      <View className="flex-row items-center gap-2 mb-4">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="flex-1"
        >
          {(["playing", "recent", "ondeck", "libraries"] as Tab[]).map((t) => (
            <FilterChip
              key={t}
              label={t === "playing" ? "Now Playing" : t === "ondeck" ? "On Deck" : t.charAt(0).toUpperCase() + t.slice(1)}
              selected={tab === t}
              onPress={() => setTab(t)}
            />
          ))}
        </ScrollView>
        {tab === "recent" && (
          <SortButton
            onPress={() => setRecentSortOpen(true)}
            active={recentSort !== SORT_DEFAULTS.plexRecent}
          />
        )}
      </View>
    </>
  );

  return (
    <ScreenWrapper scrollable={false}>
      {tab === "recent" && (
        <RecentlyAdded
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
          {tab === "playing" && <NowPlaying />}
          {tab === "ondeck" && <OnDeck />}
          {tab === "libraries" && <Libraries />}
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

function NowPlaying() {
  const { data: sessions, isLoading } = usePlexSessions();

  if (isLoading) return <SkeletonCardContent rows={2} />;
  if (!sessions?.length) {
    return (
      <EmptyState
        icon={<Icon icon={Play} size={32} color="#71717a" />}
        title="Nothing playing"
        message="No active Plex streams"
      />
    );
  }

  return (
    <View className="gap-3">
      {sessions.map((session) => (
        <SessionCard key={session.sessionKey} session={session} />
      ))}
    </View>
  );
}

function SessionCard({ session }: { session: PlexSession }) {
  const progress = session.duration > 0 ? session.viewOffset / session.duration : 0;
  const isPaused = session.Player.state === "paused";
  const isBuffering = session.Player.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  const title =
    session.type === "episode"
      ? `${session.grandparentTitle} — ${session.title}`
      : session.title;

  const thumbUrl = getPlexImageUrl(
    session.grandparentThumb || session.thumb,
    80,
    120,
  );

  const transcodeLabel =
    session.TranscodeSession?.videoDecision === "direct play"
      ? "Direct Play"
      : session.TranscodeSession?.videoDecision === "copy"
        ? "Direct Stream"
        : session.TranscodeSession
          ? "Transcode"
          : "Direct Play";

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
          <Badge label={transcodeLabel} variant={transcodeLabel === "Direct Play" ? "success" : "warning"} />
        </View>
        <Text className="text-zinc-500 text-xs mt-1">
          {session.User.title} · {session.Player.title} · {session.Player.platform}
        </Text>
      </View>
    </Card>
  );
}

function RecentlyAdded({
  sort,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  sort: PlexRecentSortKey;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: StyleProp<ViewStyle>;
}) {
  const { data: items, isLoading } = usePlexRecentlyAdded();
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
      keyExtractor={(item) => item.ratingKey}
      renderItem={({ item }) => <MediaPoster item={item} />}
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

function OnDeck() {
  const { data: items, isLoading } = usePlexOnDeck();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (!items?.length) {
    return <EmptyState title="Nothing on deck" />;
  }

  return (
    <View className="gap-2">
      {items.map((item) => {
        const thumbUrl = getPlexImageUrl(
          item.grandparentThumb || item.parentThumb || item.thumb,
          80,
          120,
        );
        const title =
          item.type === "episode"
            ? `${item.grandparentTitle} — ${item.title}`
            : item.title;

        return (
          <Card key={item.ratingKey} className="flex-row gap-3">
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
              {item.parentTitle && (
                <Text className="text-zinc-500 text-xs">{item.parentTitle}</Text>
              )}
              {item.year && (
                <Text className="text-zinc-600 text-xs">{item.year}</Text>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

function Libraries() {
  const { data: libraries, isLoading, error } = usePlexLibraries();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load libraries" />;
  }
  if (!libraries?.length) {
    return <EmptyState title="No libraries found" />;
  }

  const iconForType = (type: string) => {
    switch (type) {
      case "movie": return "film";
      case "show": return "tv";
      default: return "library";
    }
  };

  return (
    <View className="gap-2">
      {libraries.map((lib) => (
        <Card key={lib.key} className="flex-row items-center gap-3">
          <View className="bg-surface-light rounded-xl p-2.5">
            <Icon icon={Library} size={20} color="#a1a1aa" />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-200 text-sm font-medium">{lib.title}</Text>
            <Text className="text-zinc-500 text-xs capitalize">{lib.type}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

function MediaPoster({ item }: { item: PlexMediaItem }) {
  const thumbUrl = getPlexImageUrl(
    item.grandparentThumb || item.parentThumb || item.thumb,
    200,
    300,
  );
  const title =
    item.type === "episode"
      ? item.grandparentTitle || item.title
      : item.title;
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
