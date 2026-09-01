import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import {
  FilterSortSheet,
  type SheetOption,
} from "@/components/common/filter-sort-sheet";
import { Nzbhydra2ApiGate } from "@/components/indexers/nzbhydra2-api-gate";
import {
  useNzbhydra2Caps,
  useNzbhydra2DownloadHistory,
  useNzbhydra2SearchHistory,
} from "@/hooks/use-nzbhydra2";
import {
  hydraDownloadStatusMeta,
  hydraSearchTypeIcon,
  hydraTimestampToIso,
  isStatsApiGated,
} from "@/lib/nzbhydra2-normalize";
import { HISTORY_TONE_COLOR } from "@/lib/arr-history";
import { formatTimeAgo } from "@/lib/utils";
import { lightHaptic } from "@/lib/haptics";
import type {
  Nzbhydra2DownloadHistoryRow,
  Nzbhydra2SearchHistoryRow,
} from "@/lib/types";

type HistoryTable = "searches" | "downloads";

type SortKey =
  | "time-desc"
  | "time-asc"
  // searches only
  | "query-asc"
  | "source-asc"
  // downloads only
  | "title-asc"
  | "status-asc"
  | "age-asc";

const TABLE_OPTIONS: SheetOption<HistoryTable>[] = [
  { key: "downloads", label: "Downloads" },
  { key: "searches", label: "Searches" },
];

const SORT_OPTIONS: Record<HistoryTable, SheetOption<SortKey>[]> = {
  searches: [
    { key: "time-desc", label: "Newest first" },
    { key: "time-asc", label: "Oldest first" },
    { key: "query-asc", label: "Query A→Z" },
    { key: "source-asc", label: "Source" },
  ],
  downloads: [
    { key: "time-desc", label: "Newest first" },
    { key: "time-asc", label: "Oldest first" },
    { key: "title-asc", label: "Title A→Z" },
    { key: "status-asc", label: "Status" },
    { key: "age-asc", label: "Release age" },
  ],
};

// Column names must be exactly the ones upstream whitelists: History.getHistory
// interpolates sortModel.column straight into native SQL, so anything else is a
// 500. See NZBHYDRA2_{SEARCH,DOWNLOAD}_SORT_COLUMNS in lib/nzbhydra2-normalize.
const SORT_MODEL: Record<SortKey, { column: string; descending: boolean }> = {
  "time-desc": { column: "time", descending: true },
  "time-asc": { column: "time", descending: false },
  "query-asc": { column: "query", descending: false },
  "source-asc": { column: "source", descending: false },
  "title-asc": { column: "title", descending: false },
  "status-asc": { column: "status", descending: false },
  "age-asc": { column: "age", descending: false },
};

/**
 * NZBHydra2's search and download history.
 *
 * Uses the canonical FilterSortButton + FilterSortSheet pair rather than a
 * third inline chip row, because this genuinely has both axes: the filter picks
 * which table to show, and the sort maps 1:1 onto the columns the two endpoints
 * natively sort by. A chip row would leave sorting with nowhere to live — the
 * exact split the sheet was introduced to replace (#58).
 *
 * Rows are bespoke rather than ArrHistoryList: that component IS a FlatList
 * with its own RefreshControl and flex-1 states, which can't nest inside
 * ScreenWrapper's scroll view, and ArrHistoryEntry is the *arr grab/import
 * vocabulary (eventType, qualityName, releaseGroup, languages) that NZBHydra2
 * shares no fields with. What IS shared is the tone palette, which both use.
 */
export function Nzbhydra2History() {
  const [table, setTable] = useState<HistoryTable>("downloads");
  const [sort, setSort] = useState<SortKey>("time-desc");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Flipping the table can strand the sort on a column the other table has no
  // idea about (Release age → Searches). Snap back at render time rather than
  // syncing state in an effect — the same trick the Indexers screen uses for
  // its sub-tab chips, and it can't produce a frame with an invalid request.
  const sortOptions = SORT_OPTIONS[table];
  const activeSort: SortKey = sortOptions.some((o) => o.key === sort)
    ? sort
    : "time-desc";
  const sortModel = SORT_MODEL[activeSort];

  // Both hooks always mount (rules of hooks); only the selected one is enabled,
  // so switching back is instant off the other's cache.
  const searches = useNzbhydra2SearchHistory(sortModel, table === "searches");
  const downloads = useNzbhydra2DownloadHistory(sortModel, table === "downloads");
  const caps = useNzbhydra2Caps();

  // The status fields are identical across both infinite queries, so the union
  // is fine here; only the ROWS need narrowing.
  const state = table === "searches" ? searches : downloads;

  const tableLabel = TABLE_OPTIONS.find((t) => t.key === table)!.label;
  const sortLabel = sortOptions.find((o) => o.key === activeSort)!.label;

  const searchRows = searches.data?.pages.flatMap((p) => p.content) ?? [];
  const downloadRows = downloads.data?.pages.flatMap((p) => p.content) ?? [];
  const isEmpty =
    table === "searches" ? searchRows.length === 0 : downloadRows.length === 0;

  return (
    <View>
      <View className="mb-4">
        <FilterSortButton
          summary={`${tableLabel} · ${sortLabel}`}
          onPress={() => {
            lightHaptic();
            setSheetOpen(true);
          }}
          active={table !== "downloads" || activeSort !== "time-desc"}
        />
      </View>

      {state.isLoading ? (
        <SkeletonCardContent rows={5} />
      ) : state.error ? (
        isStatsApiGated(state.error) && caps.isSuccess ? (
          <Nzbhydra2ApiGate subject="history" />
        ) : (
          <ErrorBanner error={state.error} title="Failed to load history" />
        )
      ) : isEmpty ? (
        <EmptyState title={`No ${tableLabel.toLowerCase()} recorded yet`} />
      ) : (
        <View className="gap-2">
          {table === "searches"
            ? searchRows.map((row) => <SearchRow key={row.id} row={row} />)
            : downloadRows.map((row) => <DownloadRow key={row.id} row={row} />)}
        </View>
      )}

      {state.hasNextPage && (
        <Pressable
          onPress={() => {
            lightHaptic();
            state.fetchNextPage();
          }}
          disabled={state.isFetchingNextPage}
          className="items-center py-3 active:opacity-70"
        >
          {state.isFetchingNextPage ? (
            <Spinner size={18} />
          ) : (
            <Text className="text-primary text-sm font-medium">Load more</Text>
          )}
        </Pressable>
      )}

      <FilterSortSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter & sort history"
        filterLabel="Show"
        filterOptions={TABLE_OPTIONS}
        filterValue={table}
        onFilterChange={setTable}
        sortOptions={sortOptions}
        sortValue={activeSort}
        onSortChange={setSort}
      />
    </View>
  );
}

// A tone-coloured left edge borrowed from ArrHistoryList's visual language,
// wrapped around a compact row rather than a Card so a long list stays dense.
function HistoryRow({
  tone,
  icon,
  label,
  when,
  title,
  meta,
  error,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  when?: string;
  title: string;
  meta?: string;
  error?: string | null;
}) {
  return (
    <View className="rounded-2xl bg-surface border border-border overflow-hidden">
      <View className="flex-row">
        <View className="w-1" style={{ backgroundColor: tone }} />
        <View className="flex-1 p-3">
          <View className="flex-row items-center justify-between gap-2 mb-1.5">
            <View className="flex-row items-center gap-1.5 flex-1">
              {icon}
              <Text
                className="text-xs font-bold uppercase tracking-wide flex-1"
                style={{ color: tone }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {when ? (
              <Text className="text-zinc-500 text-xs">{formatTimeAgo(when)}</Text>
            ) : null}
          </View>
          <Text
            className="text-zinc-100 text-sm font-medium leading-5"
            numberOfLines={2}
          >
            {title}
          </Text>
          {meta ? (
            <Text className="text-zinc-400 text-xs mt-1.5" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {error ? (
            <Text className="text-danger text-xs mt-1.5 leading-4" numberOfLines={2}>
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function DownloadRow({ row }: { row: Nzbhydra2DownloadHistoryRow }) {
  const status = hydraDownloadStatusMeta(String(row.status));
  const tone = HISTORY_TONE_COLOR[status.tone];
  const meta = [
    row.searchResult?.indexer?.name,
    row.searchResult?.downloadType,
    row.age != null ? `${row.age}d old` : undefined,
    row.accessSource,
  ]
    .filter(Boolean)
    .join("   ·   ");

  return (
    <HistoryRow
      tone={tone}
      icon={<Icon icon={status.icon} size={14} color={tone} />}
      label={status.label}
      when={hydraTimestampToIso(row.time)}
      // The release row can outlive the search result it came from.
      title={row.searchResult?.title ?? "(release no longer in the database)"}
      meta={meta || undefined}
      error={row.error}
    />
  );
}

function SearchRow({ row }: { row: Nzbhydra2SearchHistoryRow }) {
  const tone = HISTORY_TONE_COLOR.info;
  const TypeIcon = hydraSearchTypeIcon(String(row.searchType));
  const meta = [row.categoryName, row.source, row.username]
    .filter(Boolean)
    .join("   ·   ");

  return (
    <HistoryRow
      tone={tone}
      icon={<Icon icon={TypeIcon} size={14} color={tone} />}
      label={String(row.searchType || "SEARCH").toLowerCase()}
      when={hydraTimestampToIso(row.time)}
      // An API search by media id carries no query text at all.
      title={row.query || row.title || "(no query)"}
      meta={meta || undefined}
    />
  );
}
