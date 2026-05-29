import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Search, AlertTriangle, X, Check } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ArrRelease, SonarrRelease } from "@/lib/types";
import { ReleaseListItem } from "@/components/common/release-list-item";
import { ReleaseDetailSheet } from "@/components/common/release-detail-sheet";
import { FilterChip } from "@/components/ui/filter-chip";
import { SortButton } from "@/components/ui/sort-button";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { getHttpErrorMessage } from "@/lib/http-client";
import { useDeferredBack } from "@/hooks/use-deferred-back";
import { useSortStore, type ReleasesSortKey } from "@/store/sort-store";

type Release = ArrRelease | SonarrRelease;

interface ReleasesPickerProps {
  service: "radarr" | "sonarr";
  query: UseQueryResult<Release[], Error>;
  instanceId?: string;
}

const SORT_LABELS: Record<ReleasesSortKey, string> = {
  "seeders-desc": "Seeders (high to low)",
  "size-desc": "Size (large to small)",
  "size-asc": "Size (small to large)",
  "age-asc": "Newest first",
  "score-desc": "Custom format score",
  "title-asc": "Title (A–Z)",
};

const SORT_OPTIONS: ReleasesSortKey[] = [
  "seeders-desc",
  "size-desc",
  "size-asc",
  "age-asc",
  "score-desc",
  "title-asc",
];

type ProtocolFilter = "all" | "torrent" | "usenet";

function sortReleases(list: Release[], key: ReleasesSortKey): Release[] {
  const copy = [...list];
  switch (key) {
    case "seeders-desc":
      copy.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
      break;
    case "size-desc":
      copy.sort((a, b) => b.size - a.size);
      break;
    case "size-asc":
      copy.sort((a, b) => a.size - b.size);
      break;
    case "age-asc":
      copy.sort((a, b) => a.age - b.age);
      break;
    case "score-desc":
      copy.sort(
        (a, b) => (b.customFormatScore ?? 0) - (a.customFormatScore ?? 0),
      );
      break;
    case "title-asc":
      copy.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }
  return copy;
}

interface ReleaseFlatListProps {
  data: Release[];
  onSelect: (r: Release) => void;
  isFetching: boolean;
  onRefresh: () => void;
  onClearFilters: () => void;
}

function ReleaseFlatList({
  data,
  onSelect,
  isFetching,
  onRefresh,
  onClearFilters,
}: ReleaseFlatListProps) {
  // Row heights vary (rejected releases add a third text line), so we don't
  // pass getItemLayout — a wrong estimate makes FlatList compute incorrect
  // scroll offsets and the list jumps around. We also leave
  // removeClippedSubviews off because on Android it causes mount/unmount
  // churn that shows up as scroll jank.
  const renderItem = useCallback(
    ({ item, index }: { item: Release; index: number }) => (
      <ReleaseListItem release={item} index={index} onSelect={onSelect} />
    ),
    [onSelect],
  );

  const keyExtractor = useCallback((r: Release) => r.guid, []);

  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={12}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={80}
      windowSize={7}
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={onRefresh}
          tintColor="#3b82f6"
          colors={["#3b82f6"]}
          progressBackgroundColor="#18181b"
        />
      }
      ListEmptyComponent={
        <View className="mt-4">
          <EmptyState
            icon={<Icon icon={Search} size={24} color="#71717a" />}
            title="No releases match filters"
            action={
              <Button
                label="Clear filters"
                variant="outline"
                onPress={onClearFilters}
              />
            }
          />
        </View>
      }
    />
  );
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function ReleasesPicker({
  service,
  query,
  instanceId,
}: ReleasesPickerProps) {
  const deferredBack = useDeferredBack();
  const sortKey = useSortStore((s) => s.releases);
  const setSortKey = useSortStore((s) => s.setReleases);

  const [hideRejected, setHideRejected] = useState(true);
  const [autoFlippedRejected, setAutoFlippedRejected] = useState(false);
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<string | null>(null);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Release | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    query;

  // Loading-time progression: skeletons until 8s, then contextual empty state
  // with a "this can take up to a minute" hint, then a "still searching" hint
  // past 30s.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isLoading && !isFetching) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isLoading, isFetching]);

  // "Tick" so the relative-time string in the status bar stays fresh once
  // results are in.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  const protocols = useMemo(() => {
    const set = new Set<string>();
    data?.forEach((r) => set.add(r.protocol));
    return set;
  }, [data]);

  const qualityNames = useMemo(() => {
    const map = new Map<string, number>();
    data?.forEach((r) => {
      const name = r.quality?.quality?.name;
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    // Show only names with at least one entry; sort by count desc.
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let out = data;
    if (hideRejected) out = out.filter((r) => !r.rejected);
    if (protocolFilter !== "all")
      out = out.filter((r) => r.protocol === protocolFilter);
    if (qualityFilter)
      out = out.filter((r) => r.quality?.quality?.name === qualityFilter);
    return sortReleases(out, sortKey);
  }, [data, hideRejected, protocolFilter, qualityFilter, sortKey]);

  // If every result was rejected and the user has hideRejected on, auto-flip
  // it once so they aren't staring at an empty list. Track that we did this
  // so we don't fight the user if they re-enable it.
  const flippedOnceRef = useRef(false);
  useEffect(() => {
    if (
      !flippedOnceRef.current &&
      hideRejected &&
      data &&
      data.length > 0 &&
      data.every((r) => r.rejected)
    ) {
      flippedOnceRef.current = true;
      setHideRejected(false);
      setAutoFlippedRejected(true);
    }
  }, [data, hideRejected]);

  function handleRefresh() {
    if (isFetching) return;
    lightHaptic();
    refetch();
  }

  function handleClearFilters() {
    lightHaptic();
    setHideRejected(false);
    setProtocolFilter("all");
    setQualityFilter(null);
  }

  const sortActions: ActionSheetAction[] = SORT_OPTIONS.map((key) => ({
    label: SORT_LABELS[key],
    icon:
      sortKey === key ? (
        <Icon icon={Check} size={16} color="#3b82f6" />
      ) : (
        <View className="w-[1.15rem] h-[1.15rem]" />
      ),
    onPress: () => setSortKey(key),
  }));

  const showSkeleton = (isLoading || isFetching) && !data;
  const showSearchingMessage = showSkeleton && elapsed >= 8;
  const showLongSearchingHint = showSkeleton && elapsed >= 30;

  return (
    <View className="flex-1">
      {/* Status row */}
      <View className="flex-row items-center justify-between px-1 mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          {data ? (
            <>
              <Text className="text-zinc-300 text-sm font-medium">
                {filtered.length}
                {filtered.length !== data.length ? ` of ${data.length}` : ""}{" "}
                result{data.length === 1 ? "" : "s"}
              </Text>
              {dataUpdatedAt > 0 && (
                <Text className="text-zinc-500 text-xs">
                  · {formatRelative(dataUpdatedAt)}
                </Text>
              )}
              {isFetching && (
                <ActivityIndicator size="small" color="#3b82f6" />
              )}
            </>
          ) : (
            <Text className="text-zinc-500 text-sm">
              {showSearchingMessage ? "Searching indexers…" : ""}
            </Text>
          )}
        </View>
      </View>

      {/* Filter + sort row */}
      {data && data.length > 0 && (
        <View className="flex-row items-center mb-3 gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 pr-2"
            className="flex-1"
          >
            <FilterChip
              label={hideRejected ? "Hide rejected" : "All releases"}
              selected={hideRejected}
              onPress={() => {
                lightHaptic();
                setHideRejected((v) => !v);
                setAutoFlippedRejected(false);
              }}
            />
            {protocols.size > 1 && (
              <>
                <FilterChip
                  label="Torrent"
                  selected={protocolFilter === "torrent"}
                  onPress={() => {
                    lightHaptic();
                    setProtocolFilter((v) =>
                      v === "torrent" ? "all" : "torrent",
                    );
                  }}
                />
                <FilterChip
                  label="Usenet"
                  selected={protocolFilter === "usenet"}
                  onPress={() => {
                    lightHaptic();
                    setProtocolFilter((v) =>
                      v === "usenet" ? "all" : "usenet",
                    );
                  }}
                />
              </>
            )}
            {qualityNames.length > 1 &&
              qualityNames.slice(0, 6).map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  selected={qualityFilter === name}
                  onPress={() => {
                    lightHaptic();
                    setQualityFilter((v) => (v === name ? null : name));
                  }}
                />
              ))}
          </ScrollView>
          <SortButton
            onPress={() => {
              lightHaptic();
              setSortSheetOpen(true);
            }}
            active={sortKey !== "seeders-desc"}
          />
        </View>
      )}

      {/* Auto-flip notice */}
      {autoFlippedRejected && (
        <View className="bg-amber-950/60 border border-amber-900/60 rounded-xl px-3 py-2 mb-3 flex-row items-center justify-between">
          <Text className="text-amber-100 text-xs flex-1 leading-4">
            All releases were rejected — showing them so you can review.
          </Text>
          <Pressable
            onPress={() => setAutoFlippedRejected(false)}
            hitSlop={8}
            className="ml-2"
          >
            <Icon icon={X} size={14} color="#fde68a" />
          </Pressable>
        </View>
      )}

      {/* Body */}
      {showSkeleton ? (
        <View className="flex-1">
          {showSearchingMessage ? (
            <EmptyState
              icon={<Icon icon={Search} size={28} color="#71717a" />}
              title="Searching indexers…"
              message={
                showLongSearchingHint
                  ? "Still searching. Some indexers are slower than others."
                  : "This can take up to a minute."
              }
            />
          ) : (
            <View className="gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={88} borderRadius={16} />
              ))}
            </View>
          )}
        </View>
      ) : isError ? (
        <EmptyState
          icon={<Icon icon={AlertTriangle} size={28} color="#ef4444" />}
          title="Search failed"
          message={getHttpErrorMessage(error) ?? error?.message ?? "Unknown error"}
          action={<Button label="Retry" onPress={handleRefresh} />}
        />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Search} size={28} color="#71717a" />}
          title="No releases found"
          message="Indexers returned 0 results. Pull to retry or check Prowlarr."
        />
      ) : (
        <ReleaseFlatList
          data={filtered}
          onSelect={setSelected}
          isFetching={isFetching && !!data}
          onRefresh={handleRefresh}
          onClearFilters={handleClearFilters}
        />
      )}

      <ActionSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort releases"
        actions={sortActions}
      />

      <ReleaseDetailSheet
        release={selected}
        service={service}
        instanceId={instanceId}
        onClose={() => setSelected(null)}
        onGrabbed={() => {
          // After a grab succeeds, pop back to the detail screen so the user
          // sees their queue update in context — but only once the sheet has
          // fully dismissed (navigating mid-dismiss hangs iOS/Fabric). Replaces
          // a fixed setTimeout guess with the sheet's real onClosed signal.
          deferredBack.arm();
          deferredBack.back();
        }}
        onClosed={deferredBack.onClosed}
      />
    </View>
  );
}
