import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MoreHorizontal } from "lucide-react-native";
import { ActionSheet } from "@/components/ui/action-sheet";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { StatusTableRow } from "@/components/tdarr/status-table-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast, toastError } from "@/components/ui/toast";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useTdarrBulkUpdateFiles, useTdarrSetAllStatus, useTdarrStatistics, useTdarrStatusTable,
} from "@/hooks/use-tdarr";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getHttpErrorMessage } from "@/lib/http-client";
import { lightHaptic } from "@/lib/haptics";
import { fileBaseName } from "@/lib/tdarr-format";
import { bulkConfirmMessage, pruneSelection, toggleSelected } from "@/lib/tdarr-selection";
import { TDARR_TABLES, flattenStatusPages, getTableDef, rowActions, tableCount } from "@/lib/tdarr-tables";
import type { TdarrRowAction } from "@/lib/tdarr-tables";
import type { TdarrStatusTableId, TdarrStatusTableRow } from "@/lib/types";

const rowName = (r: TdarrStatusTableRow) =>
  r.fileNameWithoutExtension || fileBaseName(r.file) || r._id;

const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

const DONE: Record<TdarrRowAction["key"], string> = {
  bump: "Bumped", skip: "Skipped", requeue: "Requeued", ignore: "Ignored", unhold: "Unheld",
};

// Skip/Ignore mark files as needing no work; they leave the queue for good.
const isDestructive = (a: TdarrRowAction) => a.key === "skip" || a.key === "ignore";

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
  const bulk = useTdarrBulkUpdateFiles();
  const setAll = useTdarrSetAllStatus();
  // Every modal on this screen is a step of one flow, so the "all" sheet →
  // confirm chain can never race the iOS dismiss (#83). See use-modal-flow.ts.
  const flow = useModalFlow<{
    rowActions: TdarrStatusTableRow;
    allActions: undefined;
    confirmAll: TdarrRowAction;
  }>();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => flattenStatusPages(query.data?.pages), [query.data]);
  const actions = rowActions(tableId);
  // The live total beats the statistics doc, which can lag the table.
  const count = query.data?.pages.at(-1)?.totalCount ?? tableCount(stats, tableId);
  const canBulk = actions.length > 0 && count !== 0;
  // A refresh can empty the table mid-selection; the bar hides with it.
  const inSelection = selecting && canBulk;
  const listExtra = useMemo(() => ({ selected, inSelection }), [selected, inSelection]);

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // A different table is a different list: start unselected.
  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
  }, [tableId]);

  // Drop ids a refetch removed (e.g. a single-row action moved them out).
  useEffect(() => {
    setSelected((prev) => {
      const next = pruneSelection(prev, rows.map((r) => r._id));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const runRow = (a: TdarrRowAction) => {
    const row = flow.payload("rowActions");
    if (!row) return;
    const name = rowName(row);
    bulk.mutate(
      { fileIds: [row._id], updatedObj: a.updatedObj },
      {
        onSuccess: () => toast(`${a.label}: ${name}`, "success"),
        onError: (e) => toastError(`${a.label} failed`, e),
      },
    );
  };

  const runSelected = (a: TdarrRowAction) => {
    const fileIds = [...selected];
    if (fileIds.length === 0) return;
    bulk.mutate(
      { fileIds, updatedObj: a.updatedObj },
      {
        onSuccess: () => {
          toast(`${DONE[a.key]} ${files(fileIds.length)}`, "success");
          exitSelection();
        },
        onError: (e) => toastError(`${a.label} failed`, e),
      },
    );
  };

  const runAll = () => {
    const a = flow.payload("confirmAll");
    flow.close();
    if (!a || setAll.isPending) return;
    exitSelection();
    setAll.mutate(
      { table: tableId, updatedObj: a.updatedObj },
      {
        onSuccess: () => toast(`${DONE[a.key]} all files in "${label}"`, "success"),
        onError: (e) => toastError(`${a.label} all failed`, e),
      },
    );
  };

  const confirmAction = flow.payload("confirmAll");

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader
        title={label}
        right={
          canBulk && !inSelection ? (
            <Pressable
              onPress={() => flow.open("allActions")}
              className="p-1 active:opacity-70"
              hitSlop={8}
              accessibilityLabel={`Actions for all files in ${label}`}
            >
              <Icon icon={MoreHorizontal} size={22} color="#e4e4e7" />
            </Pressable>
          ) : null
        }
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r._id}
        extraData={listExtra}
        renderItem={({ item }) => (
          <StatusTableRow
            row={item}
            table={tableId}
            selecting={inSelection}
            selected={selected.has(item._id)}
            onPress={() =>
              inSelection
                ? setSelected((prev) => toggleSelected(prev, item._id))
                : flow.open("rowActions", item)
            }
            onLongPress={
              canBulk
                ? () => {
                    lightHaptic();
                    setSelecting(true);
                    setSelected((prev) => toggleSelected(prev, item._id));
                  }
                : undefined
            }
          />
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
          ) : query.isError ? (
            <EmptyState
              title="Couldn't load this table"
              message={getHttpErrorMessage(query.error) ?? (query.error as Error)?.message}
              action={<Button label="Retry" size="sm" onPress={() => void query.refetch()} />}
            />
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
      {inSelection && (
        <View
          className="-mx-4 px-4 pt-3 pb-3 bg-surface border-t border-border"
        >
          <Text className="text-zinc-100 text-sm font-semibold mb-2">
            {selected.size} selected
          </Text>
          <View className="flex-row gap-2">
            {actions.map((a) => (
              <Button
                key={a.key}
                label={a.label}
                size="sm"
                variant={isDestructive(a) ? "danger" : "primary"}
                onPress={() => runSelected(a)}
                disabled={selected.size === 0 || bulk.isPending}
                className="flex-1"
              />
            ))}
            <Button
              label="Cancel"
              size="sm"
              variant="outline"
              onPress={exitSelection}
              className="flex-1"
            />
          </View>
        </View>
      )}

      <ActionSheet
        {...flow.bind("rowActions")}
        title={(() => {
          const row = flow.payload("rowActions");
          return row ? rowName(row) : undefined;
        })()}
        actions={actions.map((a) => ({ label: a.label, onPress: () => runRow(a) }))}
      />
      <ActionSheet
        {...flow.bind("allActions")}
        title={label}
        actions={actions.map((a) => ({
          label: `${a.label} all`,
          subtitle: count !== null ? files(count) : undefined,
          variant: isDestructive(a) ? "danger" : "default",
          onPress: () => flow.open("confirmAll", a),
        }))}
      />
      <ConfirmModal
        {...flow.bind("confirmAll")}
        title={confirmAction ? `${confirmAction.label} all?` : ""}
        message={confirmAction ? bulkConfirmMessage(confirmAction, count, label) : ""}
        tone={confirmAction && isDestructive(confirmAction) ? "danger" : "default"}
        confirmLabel={confirmAction ? `${confirmAction.label} all` : undefined}
        onConfirm={runAll}
      />
    </ScreenWrapper>
  );
}
