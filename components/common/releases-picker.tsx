import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Search, AlertTriangle, X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ArrRelease, SonarrRelease, ArrCustomFilter } from "@/lib/types";
import { ReleaseListItem } from "@/components/common/release-list-item";
import { ReleaseDetailSheet } from "@/components/common/release-detail-sheet";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import {
  FilterSortSheet,
  type SheetSection,
} from "@/components/common/filter-sort-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { lightHaptic } from "@/lib/haptics";
import { getHttpErrorMessage, isAbortError } from "@/lib/http-client";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { useSortStore, type ReleasesSortKey } from "@/store/sort-store";
import {
  useReleaseFilterStore,
  RELEASE_FILTER_DEFAULTS,
  type ProtocolFilter,
} from "@/store/releases-filter-store";
import { useArrCustomFilters } from "@/hooks/use-arr-custom-filters";
import { applyArrCustomFilter } from "@/lib/arr-custom-filters";

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

// Compact labels for the filter+sort pill summary; the sheet uses the full
// SORT_LABELS.
const SORT_SUMMARY: Record<ReleasesSortKey, string> = {
  "seeders-desc": "Seeders",
  "size-desc": "Largest",
  "size-asc": "Smallest",
  "age-asc": "Newest",
  "score-desc": "Score",
  "title-asc": "Title",
};

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
  // Unfiltered result count, so the empty state can tell "indexers returned 0"
  // apart from "filters hid everything" (only the latter offers Clear filters).
  totalCount: number;
  onSelect: (r: Release) => void;
  isFetching: boolean;
  onRefresh: () => void;
  onClearFilters: () => void;
}

function ReleaseFlatList({
  data,
  totalCount,
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
        // Rendered inside the FlatList (not as a bare View) so its
        // RefreshControl + iOS bounce stay attached — that's what makes the
        // "Pull to retry" affordance below actually work when 0 results come
        // back (#209).
        <View className="mt-4">
          {totalCount === 0 ? (
            // size 28 keeps this consistent with the "Searching…"/"Search
            // failed" states it transitions between; the filters-hid variant
            // below stays at 24.
            <EmptyState
              icon={<Icon icon={Search} size={28} color="#71717a" />}
              title="No releases found"
              message="Indexers returned 0 results. Pull to retry or check Prowlarr."
            />
          ) : (
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
          )}
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
  const flow = useModalFlow<{ detail: Release }>();
  // Stable identity is load-bearing: ReleaseListItem's memo comparator checks
  // onSelect by reference, and rows re-render at 1Hz off the elapsed ticker
  // while fetching — an inline closure here would defeat every row bail-out.
  const handleSelect = useCallback(
    (r: Release) => flow.open("detail", r),
    [flow],
  );
  const sortKey = useSortStore((s) => s.releases);
  const setSortKey = useSortStore((s) => s.setReleases);

  // Filters persist across searches (#198) so they don't reset every time the
  // picker remounts. Quality persists by NAME (stable cross-search), protocol
  // and the rejected toggle are stable preferences too. The saved *arr filter
  // persists as well, but keyed per service+instance (instanceKey below) — its
  // id is a per-instance auto-increment integer, so a global id could apply the
  // wrong server-side filter across services/instances.
  const prefHideRejected = useReleaseFilterStore((s) => s.hideRejected);
  const setPrefHideRejected = useReleaseFilterStore((s) => s.setHideRejected);
  const protocolFilter = useReleaseFilterStore((s) => s.protocol);
  const setProtocolFilter = useReleaseFilterStore((s) => s.setProtocol);
  const qualityFilter = useReleaseFilterStore((s) => s.quality);
  const setQualityFilter = useReleaseFilterStore((s) => s.setQuality);
  const savedFilters = useReleaseFilterStore((s) => s.savedFilters);
  const setSavedFilter = useReleaseFilterStore((s) => s.setSavedFilter);
  const resetFilters = useReleaseFilterStore((s) => s.reset);

  // Per-instance key for the saved-filter selection. `instanceId` is undefined
  // for single-instance setups, so fall back to a stable "default" bucket.
  const instanceKey = `${service}:${instanceId ?? "default"}`;
  const selectedFilterId = savedFilters[instanceKey] ?? null;

  const [autoFlippedRejected, setAutoFlippedRejected] = useState(false);
  const [filterSortOpen, setFilterSortOpen] = useState(false);

  // Effective rejected state: the saved preference, transiently overridden by a
  // one-shot auto-flip when every result was rejected (below). The auto-flip is
  // never written back to the store, so it can't corrupt the saved preference.
  const hideRejected = prefHideRejected && !autoFlippedRejected;

  // Saved interactive-search filters configured in the *arr web UI. Only the
  // "releases" section is relevant here; the control is hidden when there are
  // none. Selection is resolved by id at render (against the freshly-fetched
  // list) so a persisted id whose filter was deleted/renamed in *arr just
  // clears instead of pointing at the wrong one.
  const customFiltersQuery = useArrCustomFilters(service, instanceId);
  const releaseFilters = useMemo(
    () => (customFiltersQuery.data ?? []).filter((f) => f.type === "releases"),
    [customFiltersQuery.data],
  );
  const selectedFilter = useMemo<ArrCustomFilter | null>(
    () => releaseFilters.find((f) => f.id === selectedFilterId) ?? null,
    [releaseFilters, selectedFilterId],
  );

  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    query;

  // Loading-time progression: skeletons until 8s, then contextual empty state
  // with a "this can take up to a minute" hint, then a "still searching" hint
  // past 30s.
  // searchEpoch bumps on a manual restart so the ticker resets even though
  // isFetching never flips across the cancel-and-refetch.
  const [elapsed, setElapsed] = useState(0);
  const [searchEpoch, setSearchEpoch] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!isLoading && !isFetching) return;
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isLoading, isFetching, searchEpoch]);

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
    if (Array.isArray(data)) data.forEach((r) => set.add(r.protocol));
    return set;
  }, [data]);

  const qualityNames = useMemo(() => {
    const map = new Map<string, number>();
    if (Array.isArray(data))
      data.forEach((r) => {
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
    if (!Array.isArray(data)) return [];
    let out = data;
    if (hideRejected) out = out.filter((r) => !r.rejected);
    if (protocolFilter !== "all")
      out = out.filter((r) => r.protocol === protocolFilter);
    if (qualityFilter)
      out = out.filter((r) => r.quality?.quality?.name === qualityFilter);
    // Apply the saved *arr filter last (and before sorting) so it AND-combines
    // with the quick chips, matching how the *arr web UI stacks them.
    if (selectedFilter) out = applyArrCustomFilter(out, selectedFilter);
    return sortReleases(out, sortKey);
  }, [data, hideRejected, protocolFilter, qualityFilter, selectedFilter, sortKey]);

  // If every result was rejected and the user has hideRejected on, auto-flip
  // it once so they aren't staring at an empty list. Track that we did this
  // so we don't fight the user if they re-enable it.
  const flippedOnceRef = useRef(false);
  useEffect(() => {
    if (
      !flippedOnceRef.current &&
      prefHideRejected &&
      Array.isArray(data) &&
      data.length > 0 &&
      data.every((r) => r.rejected)
    ) {
      flippedOnceRef.current = true;
      // Transient override only — never written back to the store, so the
      // saved "Accepted only" preference survives for the next search.
      setAutoFlippedRejected(true);
    }
  }, [data, prefHideRejected]);

  // No isFetching guard: with the queryFn consuming the abort signal, v5's
  // refetch (cancelRefetch defaults true) aborts an in-flight search and starts
  // a fresh one — the in-app recovery for a hung search (#290).
  function handleRefresh() {
    lightHaptic();
    setSearchEpoch((e) => e + 1);
    refetch();
  }

  function handleClearFilters() {
    lightHaptic();
    // Reset the persisted quick filters to their defaults (not "show
    // everything"), so clearing doesn't permanently flip the saved Show pref or
    // leave the filter pill stuck highlighted. The saved *arr filter is cleared
    // for this instance only — other instances keep their selection.
    resetFilters();
    setAutoFlippedRejected(false);
    setSavedFilter(instanceKey, null);
  }

  // Pill summary + highlight. Leads with the saved filter (the headline) when
  // one is active, otherwise the rejection state; the dot/highlight signals any
  // additional protocol/quality filtering.
  const filterSortActive =
    hideRejected !== RELEASE_FILTER_DEFAULTS.hideRejected ||
    protocolFilter !== RELEASE_FILTER_DEFAULTS.protocol ||
    qualityFilter !== RELEASE_FILTER_DEFAULTS.quality ||
    selectedFilter !== null ||
    sortKey !== "seeders-desc";
  const filterSummary = selectedFilter
    ? selectedFilter.label
    : hideRejected
      ? "Accepted only"
      : "All releases";
  const summary = `${filterSummary} · ${SORT_SUMMARY[sortKey]}`;

  // Extra single-select sections shown beneath Show/Sort in the sheet, each
  // conditional on the result set (protocol only when both appear, quality only
  // when there's more than one, saved filters only when the server has any). The
  // sheet auto-adds a search box to long sections (e.g. many qualities/filters).
  const extraSections: SheetSection[] = [];
  if (releaseFilters.length > 0) {
    extraSections.push({
      label: "Saved filters",
      options: [
        { key: "none", label: "All releases" },
        ...releaseFilters.map((f) => ({ key: String(f.id), label: f.label })),
      ],
      // Drive the radio off the resolved filter, not the raw persisted id, so a
      // selection whose filter was deleted in *arr falls back to "All releases".
      value: selectedFilter ? String(selectedFilter.id) : "none",
      onChange: (k) =>
        setSavedFilter(instanceKey, k === "none" ? null : Number(k)),
    });
  }
  if (protocols.size > 1) {
    extraSections.push({
      label: "Protocol",
      options: [
        { key: "all", label: "All" },
        { key: "torrent", label: "Torrent" },
        { key: "usenet", label: "Usenet" },
      ],
      value: protocolFilter,
      onChange: (k) => setProtocolFilter(k as ProtocolFilter),
    });
  }
  if (qualityNames.length > 1) {
    extraSections.push({
      label: "Quality",
      options: [
        { key: "all", label: "All qualities" },
        ...qualityNames.map((n) => ({ key: n, label: n })),
      ],
      value: qualityFilter ?? "all",
      onChange: (k) => setQualityFilter(k === "all" ? null : k),
    });
  }

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

      {/* Filter + sort */}
      {data && data.length > 0 && (
        <View className="mb-3">
          <FilterSortButton
            summary={summary}
            active={filterSortActive}
            onPress={() => {
              lightHaptic();
              setFilterSortOpen(true);
            }}
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
              action={
                showLongSearchingHint ? (
                  <Button
                    label="Restart search"
                    variant="outline"
                    onPress={handleRefresh}
                  />
                ) : undefined
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
          message={
            // A TanStack-initiated cancel reverts the query instead of erroring,
            // so an AbortError landing here is always the fetch timeout.
            isAbortError(error)
              ? "Search timed out. Indexers may be slow or unreachable. Try again."
              : (getHttpErrorMessage(error) ?? error?.message ?? "Unknown error")
          }
          action={<Button label="Retry" onPress={handleRefresh} />}
        />
      ) : (
        // The 0-results case routes through the FlatList too (via
        // ListEmptyComponent) so the RefreshControl is present and pull-to-retry
        // works — a bare EmptyState isn't scrollable, so there was nothing to
        // pull (#209).
        <ReleaseFlatList
          data={filtered}
          totalCount={data?.length ?? 0}
          onSelect={handleSelect}
          isFetching={isFetching && !!data}
          onRefresh={handleRefresh}
          onClearFilters={handleClearFilters}
        />
      )}

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort releases"
        filterLabel="Show"
        filterOptions={[
          { key: "hide", label: "Accepted only" },
          { key: "all", label: "All releases" },
        ]}
        filterValue={hideRejected ? "hide" : "all"}
        onFilterChange={(v) => {
          setPrefHideRejected(v === "hide");
          setAutoFlippedRejected(false);
        }}
        extraSections={extraSections}
        sortOptions={SORT_OPTIONS.map((key) => ({
          key,
          label: SORT_LABELS[key],
        }))}
        sortValue={sortKey}
        onSortChange={setSortKey}
      />

      <ReleaseDetailSheet
        release={flow.isOpen("detail") ? (flow.payload("detail") ?? null) : null}
        service={service}
        instanceId={instanceId}
        onClose={flow.close}
        onClosed={flow.onClosed}
      />
    </View>
  );
}
