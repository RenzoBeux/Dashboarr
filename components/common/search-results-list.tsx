import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  type ListRenderItem,
} from "react-native";
import { Search, AlertTriangle } from "lucide-react-native";
import type { UseQueryResult } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  SearchingIndicator,
  SearchElapsed,
} from "@/components/ui/searching-indicator";
import { lightHaptic } from "@/lib/haptics";
import { getHttpErrorMessage, isAbortError } from "@/lib/http-client";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeColor } from "@/hooks/use-theme-color";

export interface SearchResultsLabels {
  // Title of the searching state ("Searching indexers…").
  searching: string;
  // Shown under `searching` ("This can take up to a minute.").
  searchingHint: string;
  // Replaces the hint from 30s on, alongside a Restart button.
  longSearchingHint: string;
  // Error copy when the request hit its own timeout.
  timedOut: string;
  // The search returned nothing at all.
  emptyTitle: string;
  emptyMessage: string;
  // Results came back but the active filters hide all of them.
  filteredEmptyTitle: string;
  // "result" → "N results"; defaults to "result".
  noun?: string;
}

/**
 * The shell of a slow, user-triggered search screen: the "N of M results ·
 * 2m ago" status row, an animated searching state with a counter that
 * turns into a "still searching" hint and Restart button, the abort-vs-HTTP
 * error state, and a tuned FlatList whose empty state stays pull-to-retry.
 *
 * Domain logic (filtering, sorting, the row and detail components) stays with
 * the caller, which passes the already filtered + sorted `items`. Used by the
 * *arr interactive release search and the Bazarr manual subtitle search.
 *
 * The query's queryFn must consume TanStack's abort `signal`: Restart relies on
 * refetch() cancelling the in-flight request (cancelRefetch defaults true),
 * the in-app recovery for a hung search (#290).
 */
export function SearchResultsList<T>({
  query,
  items,
  keyOf,
  renderItem,
  labels,
  filterSort,
  banner,
  onClearFilters,
}: {
  query: UseQueryResult<T[], Error>;
  items: T[];
  keyOf: (item: T) => string;
  // Keep its identity stable (useCallback): rows re-render at 1Hz off the
  // elapsed ticker while fetching otherwise.
  renderItem: ListRenderItem<T>;
  labels: SearchResultsLabels;
  // Filter/sort pill, shown once there are results.
  filterSort?: React.ReactNode;
  // Notice between the pill and the list.
  banner?: React.ReactNode;
  onClearFilters: () => void;
}) {
  const tc = useThemeColor();
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = query;
  const noun = labels.noun ?? "result";

  // Loading-time progression: the searching state (with a m:ss counter) from
  // the start, then a "still searching" hint and Restart past 30s.
  // searchEpoch bumps on a manual restart so the ticker resets even though
  // isFetching never flips across the cancel-and-refetch.
  const [elapsed, setElapsed] = useState(0);
  const [searchEpoch, setSearchEpoch] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!isLoading && !isFetching) return;
    const start = Date.now();
    // Re-aim each tick at the next whole second: RN reschedules setInterval
    // from when it actually fired, so it drifts late and the visible m:ss
    // counter would skip a number about once a minute.
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const ms = Date.now() - start;
      setElapsed(Math.floor(ms / 1000));
      id = setTimeout(tick, 1000 - (ms % 1000));
    };
    id = setTimeout(tick, 1000);
    return () => clearTimeout(id);
  }, [isLoading, isFetching, searchEpoch]);

  // "Tick" so the relative-time string in the status row stays fresh once
  // results are in.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  // No isFetching guard: with the queryFn consuming the abort signal, v5's
  // refetch (cancelRefetch defaults true) aborts an in-flight search and starts
  // a fresh one.
  const handleRefresh = useCallback(() => {
    lightHaptic();
    // Reset here, not just in the ticker effect: that runs after paint, so the
    // restarted search would flash the old m:ss count for a frame.
    setElapsed(0);
    setSearchEpoch((e) => e + 1);
    refetch();
  }, [refetch]);

  const isSearching = (isLoading || isFetching) && !data;
  const showLongSearchingHint = isSearching && elapsed >= 30;

  return (
    <View className="flex-1">
      {/* Status row */}
      <View className="flex-row items-center justify-between px-1 mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          {data ? (
            <>
              <Text className="text-zinc-300 text-sm font-medium">
                {items.length}
                {items.length !== data.length ? ` of ${data.length}` : ""}{" "}
                {noun}
                {data.length === 1 ? "" : "s"}
              </Text>
              {dataUpdatedAt > 0 && (
                <Text className="text-zinc-500 text-xs">
                  · {formatRelative(dataUpdatedAt)}
                </Text>
              )}
              {isFetching && (
                <ActivityIndicator size="small" color={tc("#3b82f6")} />
              )}
            </>
          ) : null}
        </View>
      </View>

      {data && data.length > 0 && filterSort ? (
        <View className="mb-3">{filterSort}</View>
      ) : null}

      {banner}

      {isSearching ? (
        <View className="flex-1">
          <EmptyState
            icon={<SearchingIndicator />}
            iconClassName="mt-5 mb-8"
            title={labels.searching}
            message={
              showLongSearchingHint
                ? labels.longSearchingHint
                : labels.searchingHint
            }
            action={
              <View className="items-center gap-4">
                <SearchElapsed seconds={elapsed} />
                {showLongSearchingHint ? (
                  <Button
                    label="Restart search"
                    variant="outline"
                    onPress={handleRefresh}
                  />
                ) : null}
              </View>
            }
          />
        </View>
      ) : isError ? (
        <EmptyState
          icon={<Icon icon={AlertTriangle} size={28} color="#ef4444" />}
          title="Search failed"
          message={
            // A TanStack-initiated cancel reverts the query instead of erroring,
            // so an AbortError landing here is always the fetch timeout.
            isAbortError(error)
              ? labels.timedOut
              : (getHttpErrorMessage(error) ??
                error?.message ??
                "Unknown error")
          }
          action={<Button label="Retry" onPress={handleRefresh} />}
        />
      ) : (
        // The 0-results case routes through the FlatList too (via
        // ListEmptyComponent) so the RefreshControl is present and pull-to-retry
        // works — a bare EmptyState isn't scrollable, so there was nothing to
        // pull (#209).
        <ResultsFlatList
          data={items}
          totalCount={data?.length ?? 0}
          keyOf={keyOf}
          renderItem={renderItem}
          isFetching={isFetching && !!data}
          onRefresh={handleRefresh}
          onClearFilters={onClearFilters}
          labels={labels}
        />
      )}
    </View>
  );
}

function ResultsFlatList<T>({
  data,
  totalCount,
  keyOf,
  renderItem,
  isFetching,
  onRefresh,
  onClearFilters,
  labels,
}: {
  data: T[];
  // Unfiltered result count, so the empty state can tell "the search returned
  // 0" apart from "filters hid everything" (only the latter offers Clear filters).
  totalCount: number;
  keyOf: (item: T) => string;
  renderItem: ListRenderItem<T>;
  isFetching: boolean;
  onRefresh: () => void;
  onClearFilters: () => void;
  labels: SearchResultsLabels;
}) {
  const theme = useAppTheme();
  const tc = useThemeColor();
  // Row heights vary, so we don't pass getItemLayout — a wrong estimate makes
  // FlatList compute incorrect scroll offsets and the list jumps around. We
  // also leave removeClippedSubviews off because on Android it causes
  // mount/unmount churn that shows up as scroll jank.
  return (
    <FlatList
      data={data}
      keyExtractor={keyOf}
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
          tintColor={tc("#3b82f6")}
          colors={[tc("#3b82f6")]}
          progressBackgroundColor={theme.surface}
        />
      }
      ListEmptyComponent={
        // Rendered inside the FlatList (not as a bare View) so its
        // RefreshControl + iOS bounce stay attached — that's what makes the
        // "Pull to retry" affordance actually work when 0 results come back.
        <View className="mt-4">
          {totalCount === 0 ? (
            // size 28 keeps this consistent with the "Searching…"/"Search
            // failed" states it transitions between; the filters-hid variant
            // below stays at 24.
            <EmptyState
              icon={<Icon icon={Search} size={28} color="#71717a" />}
              title={labels.emptyTitle}
              message={labels.emptyMessage}
            />
          ) : (
            <EmptyState
              icon={<Icon icon={Search} size={24} color="#71717a" />}
              title={labels.filteredEmptyTitle}
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
