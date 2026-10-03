import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActionSheet } from "@/components/ui/action-sheet";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { StatusTableRow } from "@/components/tdarr/status-table-row";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast, toastError } from "@/components/ui/toast";
import { useTdarrBulkUpdateFiles, useTdarrStatistics, useTdarrStatusTable } from "@/hooks/use-tdarr";
import { useThemeColor } from "@/hooks/use-theme-color";
import { lightHaptic } from "@/lib/haptics";
import { fileBaseName } from "@/lib/tdarr-format";
import { TDARR_TABLES, getTableDef, rowActions, tableCount } from "@/lib/tdarr-tables";
import type { TdarrRowAction } from "@/lib/tdarr-tables";
import type { TdarrStatusTableId, TdarrStatusTableRow } from "@/lib/types";

const rowName = (r: TdarrStatusTableRow) =>
  r.fileNameWithoutExtension || fileBaseName(r.file) || r._id;

/**
 * One Tdarr status table. A pushed route because ScreenWrapper is a
 * KeyboardAwareScrollView and a long list nested in it would render unwindowed.
 */
export default function TdarrQueueScreen() {
  const { table } = useLocalSearchParams<{ table: string }>();
  const def = getTableDef(table ?? "");
  if (!def) {
    return (
      <ScreenWrapper scrollable={false}>
        <BackHeader title="Tdarr" />
        <EmptyState title="Unknown table" />
      </ScreenWrapper>
    );
  }
  return <QueueList tableId={def.id} label={def.label} />;
}

function QueueList({ tableId, label }: { tableId: TdarrStatusTableId; label: string }) {
  const router = useRouter();
  const tc = useThemeColor();
  const bottomPadding = useScreenBottomPadding();
  const { refreshing, onRefresh } = usePullToRefresh([["tdarr"]]);
  const stats = useTdarrStatistics().data?.[0];
  const query = useTdarrStatusTable(tableId);
  const [sheetRow, setSheetRow] = useState<TdarrStatusTableRow | null>(null);
  const rows = query.data?.pages.flatMap((p) => p.array) ?? [];

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={label} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r._id}
        renderItem={({ item }) => (
          <StatusTableRow row={item} table={tableId} onPress={() => setSheetRow(item)} />
        )}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="mb-3"
          >
            {TDARR_TABLES.map((t) => (
              <FilterChip
                key={t.id}
                label={`${t.shortLabel} ${tableCount(stats, t.id) ?? ""}`.trim()}
                selected={t.id === tableId}
                onPress={() => router.setParams({ table: t.id })}
              />
            ))}
          </ScrollView>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <SkeletonCardContent rows={4} />
          ) : (
            <EmptyState title="Nothing here" />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <Spinner size={18} />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tc("#a1a1aa")}
            colors={[tc("#a1a1aa")]}
          />
        }
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        initialNumToRender={20}
        windowSize={7}
      />
      <RowActionSheet tableId={tableId} row={sheetRow} onClose={() => setSheetRow(null)} />
    </ScreenWrapper>
  );
}

/** Single-row actions. Plain state is fine: nothing chains into another modal. */
function RowActionSheet({
  tableId, row, onClose,
}: { tableId: TdarrStatusTableId; row: TdarrStatusTableRow | null; onClose: () => void }) {
  const bulk = useTdarrBulkUpdateFiles();
  const run = (a: TdarrRowAction) => {
    if (!row) return;
    lightHaptic();
    const name = rowName(row);
    bulk.mutate(
      { fileIds: [row._id], updatedObj: a.updatedObj },
      {
        onSuccess: () => toast(`${a.label}: ${name}`, "success"),
        onError: (e) => toastError(`${a.label} failed`, e),
      },
    );
  };
  return (
    <ActionSheet
      visible={row !== null}
      onClose={onClose}
      title={row ? rowName(row) : undefined}
      actions={rowActions(tableId).map((a) => ({ label: a.label, onPress: () => run(a) }))}
    />
  );
}
