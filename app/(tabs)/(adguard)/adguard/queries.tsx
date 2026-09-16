import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { ActionSheet } from "@/components/ui/action-sheet";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { QueryRow } from "@/components/adguard/query-row";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Spinner } from "@/components/ui/spinner";
import { TextInput } from "@/components/ui/text-input";
import { useActiveInstance } from "@/hooks/use-active-instance";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAdguardLiveQueryLog, useAdguardQueryLog } from "@/hooks/use-adguard";
import { classifyQueryReason } from "@/lib/adguard-normalize";
import type { AdguardQueryLogFilters, AdguardQueryLogItem } from "@/lib/types";

type Verdict = "all" | "blocked" | "rewritten" | "allowed";

const VERDICTS: { key: Verdict; label: string }[] = [
  { key: "all", label: "All" },
  { key: "blocked", label: "Blocked" },
  { key: "rewritten", label: "Rewritten" },
  { key: "allowed", label: "Allowed" },
];

/**
 * The live DNS query log.
 *
 * A pushed route rather than a card on the AdGuard Home tab, for three
 * reasons: ScreenWrapper is a KeyboardAwareScrollView, so a hundred rows
 * nested inside it would render unwindowed; the live poll should only run
 * while someone is looking at it, and a pushed route unmounts on back; and
 * the search field wants to own the top of a screen. Mirrors
 * app/(tabs)/(pihole)/pihole/queries.tsx.
 */
export default function AdguardQueriesScreen() {
  const { instances, activeId } = useActiveInstance("adguard");
  const activeName = instances.find((i) => i.id === activeId)?.name;

  const [verdict, setVerdict] = useState<Verdict>("all");
  const [search, setSearch] = useState("");
  const [sheetQuery, setSheetQuery] = useState<AdguardQueryLogItem | null>(null);
  const [atTop, setAtTop] = useState(true);

  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const filters: AdguardQueryLogFilters = useMemo(
    () => ({ search: debouncedSearch || undefined }),
    [debouncedSearch],
  );

  // Live only while the list is at the top: refetching an infinite query
  // re-fetches EVERY loaded page, so polling once the user has scrolled would
  // replace the content under their finger.
  const live = atTop;
  const liveQuery = useAdguardLiveQueryLog(filters, live);
  const log = useAdguardQueryLog(filters);

  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);
  const bottomPadding = useScreenBottomPadding();

  const rawRows: AdguardQueryLogItem[] = live
    ? (liveQuery.data?.data ?? [])
    : (log.data?.pages.flatMap((p) => p.data) ?? []);

  // AGH's `reason` filter accepts multiple FilteringReason values (repeated
  // `reason=` params — see queryLogParams), but the verdict chips here are a
  // coarse umbrella over several reasons each, so filtering stays
  // client-side on the loaded page. The caption below says so rather than
  // letting the counts be misread as server-wide.
  const rows = useMemo(() => {
    if (verdict === "all") return rawRows;
    return rawRows.filter((q) => classifyQueryReason(q.reason) === verdict);
  }, [rawRows, verdict]);

  const isInitialLoading = live
    ? liveQuery.isLoading && !liveQuery.data
    : log.isLoading && !log.data;

  const loadMore = () => {
    if (live) return;
    if (!log.hasNextPage || log.isFetchingNextPage) return;
    void log.fetchNextPage();
  };

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title="Query Log" />
      {instances.length > 1 && activeName ? (
        <Text className="text-zinc-500 text-xs -mt-2 mb-2">{activeName}</Text>
      ) : null}

      {/* Above the list, so the keyboard can never cover it. */}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search"
        autoCapitalize="none"
        autoCorrect={false}
        containerClassName="mb-2"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-3"
      >
        {VERDICTS.map((v) => (
          <FilterChip
            key={v.key}
            label={v.label}
            selected={verdict === v.key}
            onPress={() => setVerdict(v.key)}
          />
        ))}
      </ScrollView>

      <View className="flex-row items-center gap-2 mb-2">
        <View
          className={`w-1.5 h-1.5 rounded-full ${live ? "bg-success" : "bg-zinc-600"}`}
        />
        <Text className="text-zinc-500 text-xs">
          {live ? "Live" : "Paused — scroll to the top to resume"}
        </Text>
        {verdict !== "all" ? (
          <Text className="text-zinc-600 text-xs">
            · {rows.length} of {rawRows.length} loaded
          </Text>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(q) => `${q.time}-${q.question.name}`}
        renderItem={({ item }) => (
          <QueryRow query={item} onPress={() => setSheetQuery(item)} />
        )}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          isInitialLoading ? null : (
            <EmptyState
              title="No queries"
              message={
                debouncedSearch || verdict !== "all"
                  ? "Nothing matches these filters."
                  : "AdGuard Home has not logged any queries yet."
              }
            />
          )
        }
        ListFooterComponent={
          log.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <Spinner size={18} />
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onScroll={(e) => setAtTop(e.nativeEvent.contentOffset.y < 40)}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
          />
        }
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews
      />

      {/* Plain useState is fine here: nothing chains into another modal or
          into navigation, which is what would require useModalFlow. */}
      <ActionSheet
        visible={sheetQuery !== null}
        onClose={() => setSheetQuery(null)}
        title={sheetQuery?.question.name}
        subtitle={sheetQuery?.client_info?.name || sheetQuery?.client}
        actions={
          sheetQuery
            ? [
                {
                  label: "Filter by this domain",
                  onPress: () => setSearch(sheetQuery.question.name),
                },
              ]
            : []
        }
      />
    </ScreenWrapper>
  );
}
