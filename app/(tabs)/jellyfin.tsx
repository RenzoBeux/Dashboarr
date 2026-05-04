import { useState } from "react";
import { View, Text, Image, ScrollView } from "react-native";
import {
  Play,
  Pause,
  Loader,
  Library,
  Tv,
  ArrowUpDown,
  Check,
} from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { SortButton } from "@/components/ui/sort-button";
import {
  useSortStore,
  SORT_DEFAULTS,
  type JellyfinRecentSortKey,
} from "@/store/sort-store";
import {
  useJellyfinLibraries,
  useJellyfinRecentlyAdded,
  useJellyfinResumeItems,
  useJellyfinSessions,
} from "@/hooks/use-jellyfin";
import { getJellyfinImageUrl, isJellyfinTranscoding, ticksToMs } from "@/services/jellyfin-api";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { truncateText } from "@/lib/utils";
import type { JellyfinItem, JellyfinLibrary, JellyfinSession } from "@/lib/types";

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

export default function JellyfinScreen() {
  const [tab, setTab] = useState<Tab>("playing");
  const recentSort = useSortStore((s) => s.jellyfinRecent);
  const setRecentSort = useSortStore((s) => s.setJellyfinRecent);
  const [recentSortOpen, setRecentSortOpen] = useState(false);
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["jellyfin"]]);

  const jellyfinHealth = healthData?.find((s) => s.id === "jellyfin");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Jellyfin" online={jellyfinHealth?.online} />

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

      {tab === "playing" && <NowPlaying />}
      {tab === "recent" && <RecentlyAdded sort={recentSort} />}
      {tab === "resume" && <ContinueWatching />}
      {tab === "libraries" && <Libraries />}

      <ActionSheet
        visible={recentSortOpen}
        onClose={() => setRecentSortOpen(false)}
        title="Sort recently added"
        actions={RECENT_SORT_OPTIONS.map<ActionSheetAction>((opt) => ({
          label: opt.label,
          icon:
            recentSort === opt.key ? (
              <Check size={18} color="#3b82f6" />
            ) : (
              <ArrowUpDown size={18} color="#71717a" />
            ),
          onPress: () => setRecentSort(opt.key),
        }))}
      />
    </ScreenWrapper>
  );
}

function NowPlaying() {
  const { data: sessions, isLoading } = useJellyfinSessions();

  if (isLoading) return <SkeletonCardContent rows={2} />;
  if (!sessions?.length) {
    return (
      <EmptyState
        icon={<Play size={32} color="#71717a" />}
        title="Nothing playing"
        message="No active Jellyfin streams"
      />
    );
  }

  return (
    <View className="gap-3">
      {sessions.map((session) => (
        <SessionCard key={session.Id} session={session} />
      ))}
    </View>
  );
}

function SessionCard({ session }: { session: JellyfinSession }) {
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

  const thumbUrl = getJellyfinImageUrl(item, "Primary", 80, 120);

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
          resizeMode="cover"
        />
      ) : (
        <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
          <Play size={18} color="#71717a" />
        </View>
      )}
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5 mb-1">
          <StateIcon size={14} color={stateColor} />
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

function RecentlyAdded({ sort }: { sort: JellyfinRecentSortKey }) {
  const { data: items, isLoading } = useJellyfinRecentlyAdded();

  if (isLoading) {
    return (
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} className="w-[30%]">
            <Skeleton width="100%" height={150} borderRadius={12} />
            <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
          </View>
        ))}
      </View>
    );
  }
  if (!items?.length) {
    return <EmptyState title="Nothing recently added" />;
  }

  const sorted = [...items].sort((a, b) => compareRecent(a, b, sort));

  return (
    <View className="flex-row flex-wrap gap-3">
      {sorted.map((item) => (
        <MediaPoster key={item.Id} item={item} />
      ))}
    </View>
  );
}

function ContinueWatching() {
  const { data: items, isLoading } = useJellyfinResumeItems();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (!items?.length) {
    return <EmptyState title="Nothing to resume" />;
  }

  return (
    <View className="gap-2">
      {items.map((item) => {
        const thumbUrl = getJellyfinImageUrl(item, "Primary", 80, 120);
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
                resizeMode="cover"
              />
            ) : (
              <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
                <Tv size={18} color="#71717a" />
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

function Libraries() {
  const { data: libraries, isLoading } = useJellyfinLibraries();

  if (isLoading) return <SkeletonCardContent rows={3} />;
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
        <Library size={20} color="#a1a1aa" />
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

function MediaPoster({ item }: { item: JellyfinItem }) {
  const thumbUrl = getJellyfinImageUrl(item, "Primary", 200, 300);
  const title =
    item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name;

  return (
    <View className="w-[30%]">
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Play size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-xs mt-1" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
