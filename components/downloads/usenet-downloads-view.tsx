import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, BackHandler } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { toastError } from "@/components/ui/toast";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Pause,
  Play,
  Trash2,
  Plus,
  CheckCircle2,
  Circle,
  FileUp,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import { ActionSheet } from "@/components/ui/action-sheet";
import { errorHaptic, mediumHaptic } from "@/lib/haptics";
import { useMultiSelect } from "@/hooks/use-multi-select";
import { useServiceHealth } from "@/hooks/use-service-health";
import { truncateText } from "@/lib/utils";
import {
  usenetBadgeVariant,
  type UnifiedItem,
  type UsenetAdapter,
} from "@/lib/usenet-adapter";

type FilterType = "all" | "downloading" | "paused" | "queued" | "completed" | "failed";

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "downloading", label: "Downloading" },
  { key: "paused", label: "Paused" },
  { key: "queued", label: "Queued" },
  { key: "completed", label: "Done" },
  { key: "failed", label: "Failed" },
];

type SortKey = "progress-desc" | "progress-asc" | "name-asc" | "size-desc" | "added-desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "progress-desc", label: "Progress: High → Low" },
  { key: "progress-asc", label: "Progress: Low → High" },
  { key: "name-asc", label: "Name: A → Z" },
  { key: "size-desc", label: "Size: Large → Small" },
  { key: "added-desc", label: "Added: Newest First" },
];

function compare(a: UnifiedItem, b: UnifiedItem, sort: SortKey): number {
  switch (sort) {
    case "progress-desc":
      return b.progress - a.progress;
    case "progress-asc":
      return a.progress - b.progress;
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "size-desc":
      return b.bytes - a.bytes;
    case "added-desc":
      return b.index - a.index;
  }
}

interface ViewProps {
  adapter: UsenetAdapter;
  showHeader?: boolean;
  segmentedControl?: React.ReactNode;
}

export function UsenetDownloadsView({
  adapter,
  showHeader = true,
  segmentedControl,
}: ViewProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortKey>("progress-desc");
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [nzbUrl, setNzbUrl] = useState("");
  const [bulkDelete, setBulkDelete] = useState<{ count: number } | null>(null);

  const { data: queue, error: queueError } = adapter.useQueue();
  const { data: history, error: historyError } = adapter.useHistory(50);
  const fetchError = queueError ?? historyError;
  const { data: healthData } = useServiceHealth();

  const addUrl = adapter.useAddUrl();
  const addFile = adapter.useAddFile();
  const pauseSlot = adapter.usePauseSlot();
  const resumeSlot = adapter.useResumeSlot();
  const deleteSlot = adapter.useDeleteSlot();
  const deleteHistorySlot = adapter.useDeleteHistorySlot();
  const pauseAll = adapter.usePauseAll();
  const resumeAll = adapter.useResumeAll();
  const SpeedLimitsControl = adapter.SpeedLimitsControl;
  const router = useRouter();

  const items = useMemo<UnifiedItem[]>(() => {
    const useHistoryList = filter === "completed" || filter === "failed";
    if (useHistoryList) {
      const slots = history?.items ?? [];
      return slots.filter((s) =>
        filter === "completed" ? s.status === "completed" : s.status === "failed",
      );
    }
    const slots = queue?.items ?? [];
    if (filter === "all") return slots;
    return slots.filter((s) => s.status === filter);
  }, [queue, history, filter]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => compare(a, b, sort)),
    [items, sort],
  );

  const serviceHealth = healthData?.find((s) => s.id === adapter.serviceId);
  const queuePaused = queue?.paused ?? false;

  const multiSelect = useMultiSelect<UnifiedItem>((s) => s.id);

  useFocusEffect(
    useCallback(() => {
      if (!multiSelect.isActive) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        multiSelect.clear();
        return true;
      });
      return () => sub.remove();
    }, [multiSelect.isActive, multiSelect.clear]),
  );

  const handleAdd = () => {
    if (!nzbUrl.trim()) return;
    addUrl.mutate(
      { url: nzbUrl.trim() },
      {
        onSuccess: () => {
          setNzbUrl("");
          setShowAddModal(false);
        },
        onError: (err) => toastError("Failed to add NZB", err),
      },
    );
  };

  const handlePickFile = async () => {
    // iOS maps the `type` filter via UTType(mimeType:), which returns nil for
    // niche types like application/x-nzb and leaves the picker unusable — use
    // the wildcard (same workaround as config import) and let the server
    // reject non-nzb files.
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    addFile.mutate(
      { fileUri: asset.uri, fileName: asset.name },
      {
        onSuccess: () => {
          setNzbUrl("");
          setShowAddModal(false);
        },
        onError: (err) => toastError("Failed to upload NZB", err),
      },
    );
  };

  const selectedItems = () => multiSelect.selectedItems(sortedItems);

  const handleBulkPause = () => {
    const sel = selectedItems().filter((s) => s.source === "queue" && s.status !== "paused");
    if (sel.length === 0) return;
    sel.forEach((s) => pauseSlot.mutate(s.id));
  };

  const handleBulkResume = () => {
    const sel = selectedItems().filter((s) => s.source === "queue" && s.status === "paused");
    if (sel.length === 0) return;
    sel.forEach((s) => resumeSlot.mutate(s.id));
  };

  const handleBulkDelete = () => {
    const sel = selectedItems();
    if (sel.length === 0) return;
    setBulkDelete({ count: sel.length });
  };

  const runBulkDelete = (deleteFiles: boolean) => {
    const sel = selectedItems();
    if (sel.length === 0) return;
    errorHaptic();
    sel.forEach((s) => {
      if (s.source === "history") {
        deleteHistorySlot.mutate({ id: s.id, deleteFiles });
      } else {
        deleteSlot.mutate({ id: s.id, deleteFiles });
      }
    });
    multiSelect.clear();
  };

  const handleItemPress = (item: UnifiedItem) => {
    if (multiSelect.isActive) {
      multiSelect.toggle(item);
    } else if (item.source === "queue") {
      router.push(adapter.detailRoute(item.id));
    }
  };

  const handleItemLongPress = (item: UnifiedItem) => {
    if (multiSelect.isActive) return;
    mediumHaptic();
    multiSelect.enter(item);
  };

  const bulkBusy =
    pauseSlot.isPending ||
    resumeSlot.isPending ||
    deleteSlot.isPending ||
    deleteHistorySlot.isPending;

  const speedLabel = queue?.speedLabel ?? "0 B/s";

  return (
    <>
      {multiSelect.isActive ? (
        <SelectionBar
          count={multiSelect.count}
          total={sortedItems.length}
          onCancel={multiSelect.clear}
          onSelectAll={() => {
            if (multiSelect.count === sortedItems.length) multiSelect.clear();
            else multiSelect.selectAll(sortedItems);
          }}
          onPause={handleBulkPause}
          onResume={handleBulkResume}
          onDelete={handleBulkDelete}
          busy={bulkBusy}
        />
      ) : (
        <>
          {segmentedControl}
          {showHeader && (
            <ServiceHeader
              name={adapter.displayName}
              online={serviceHealth?.online}
              serviceId={adapter.serviceId}
            />
          )}

          {/* Speed + global pause/resume */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-blue-600/10 rounded-xl p-3">
              <Text className="text-download text-lg font-bold">↓ {speedLabel}</Text>
              {queue?.sizeLeftLabel ? (
                <Text className="text-zinc-500 text-xs mt-0.5">
                  {queue.sizeLeftLabel} left
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => (queuePaused ? resumeAll.mutate() : pauseAll.mutate())}
              disabled={pauseAll.isPending || resumeAll.isPending}
              className="bg-surface-light rounded-xl px-4 items-center justify-center active:opacity-70"
            >
              {queuePaused ? (
                <Icon icon={Play} size={20} color="#3b82f6" />
              ) : (
                <Icon icon={Pause} size={20} color="#f59e0b" />
              )}
            </Pressable>
            {SpeedLimitsControl ? <SpeedLimitsControl /> : null}
          </View>

          {/* Add NZB by URL */}
          {showAddModal ? (
            <Card className="mb-4 gap-3">
              <TextInput
                placeholder="Paste NZB URL..."
                value={nzbUrl}
                onChangeText={setNzbUrl}
                autoFocus
                keyboardType="url"
              />
              <View className="flex-row gap-2">
                <Button
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setShowAddModal(false);
                    setNzbUrl("");
                  }}
                  className="flex-1"
                />
                <Button
                  label="Add"
                  size="sm"
                  onPress={handleAdd}
                  loading={addUrl.isPending}
                  className="flex-1"
                />
              </View>
              <Button
                label="Upload .nzb File"
                variant="outline"
                size="sm"
                onPress={handlePickFile}
                loading={addFile.isPending}
                icon={<Icon icon={FileUp} size={16} color="#a1a1aa" />}
              />
            </Card>
          ) : (
            <Button
              label="Add NZB"
              variant="outline"
              size="sm"
              onPress={() => setShowAddModal(true)}
              icon={<Icon icon={Plus} size={16} color="#a1a1aa" />}
              className="mb-4 self-start"
            />
          )}

          <View className="mb-4">
            <FilterSortButton
              summary={`${FILTER_OPTIONS.find((f) => f.key === filter)?.label ?? ""} · ${SORT_OPTIONS.find((o) => o.key === sort)?.label ?? ""}`}
              onPress={() => setFilterSortOpen(true)}
              active={filter !== "all" || sort !== "progress-desc"}
            />
          </View>
        </>
      )}

      {/* Slot List */}
      {sortedItems.length === 0 ? (
        fetchError ? (
          <ErrorBanner error={fetchError} title="Failed to load downloads" />
        ) : (
          <EmptyState title="Nothing to show" message={`No ${filter} items`} />
        )
      ) : (
        <View className="gap-2">
          {sortedItems.map((item) => (
            <SlotListItem
              key={item.id}
              item={item}
              adapter={adapter}
              selectionMode={multiSelect.isActive}
              isSelected={multiSelect.isSelected(item)}
              onPress={() => handleItemPress(item)}
              onLongPress={() => handleItemLongPress(item)}
            />
          ))}
        </View>
      )}

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort downloads"
        filterOptions={FILTER_OPTIONS}
        filterValue={filter}
        onFilterChange={setFilter}
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={setSort}
      />

      <ActionSheet
        visible={bulkDelete !== null}
        onClose={() => setBulkDelete(null)}
        title="Delete downloads"
        subtitle={bulkDelete ? `${bulkDelete.count} selected` : ""}
        actions={[
          {
            label: "Delete",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => runBulkDelete(false),
          },
          {
            label: "Delete + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => runBulkDelete(true),
          },
        ]}
      />
    </>
  );
}

function SelectionBar({
  count,
  total,
  onCancel,
  onSelectAll,
  onPause,
  onResume,
  onDelete,
  busy,
}: {
  count: number;
  total: number;
  onCancel: () => void;
  onSelectAll: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const allSelected = count === total && total > 0;
  return (
    <View className="mb-4">
      <View className="flex-row items-center justify-between mt-2 mb-3">
        <Pressable onPress={onCancel} className="p-2 active:opacity-70" hitSlop={8}>
          <Text className="text-primary text-base">Cancel</Text>
        </Pressable>
        <Text className="text-zinc-100 text-base font-semibold">
          {count} selected
        </Text>
        <Pressable onPress={onSelectAll} className="p-2 active:opacity-70" hitSlop={8}>
          <Text className="text-primary text-base">
            {allSelected ? "Deselect All" : "Select All"}
          </Text>
        </Pressable>
      </View>
      <View className="flex-row gap-2">
        <Button
          label="Pause"
          variant="outline"
          size="sm"
          onPress={onPause}
          disabled={busy || count === 0}
          icon={<Icon icon={Pause} size={14} color="#f59e0b" />}
          className="flex-1"
        />
        <Button
          label="Resume"
          variant="outline"
          size="sm"
          onPress={onResume}
          disabled={busy || count === 0}
          icon={<Icon icon={Play} size={14} color="#3b82f6" />}
          className="flex-1"
        />
        <Button
          label="Delete"
          variant="danger"
          size="sm"
          onPress={onDelete}
          disabled={busy || count === 0}
          icon={<Icon icon={Trash2} size={14} color="white" />}
          className="flex-1"
        />
      </View>
    </View>
  );
}

function SlotListItem({
  item,
  adapter,
  onPress,
  onLongPress,
  selectionMode,
  isSelected,
}: {
  item: UnifiedItem;
  adapter: UsenetAdapter;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  isSelected: boolean;
}) {
  const pauseSlot = adapter.usePauseSlot();
  const resumeSlot = adapter.useResumeSlot();
  const deleteSlot = adapter.useDeleteSlot();
  const deleteHistory = adapter.useDeleteHistorySlot();

  const isPaused = item.status === "paused";
  const inQueue = item.source === "queue";
  const badgeVariant = usenetBadgeVariant(item.status);
  const showProgress = inQueue || item.status === "completed";

  const [deleteOpen, setDeleteOpen] = useState(false);

  const runDelete = (deleteFiles: boolean) => {
    errorHaptic();
    if (item.source === "history") {
      deleteHistory.mutate({ id: item.id, deleteFiles });
    } else {
      deleteSlot.mutate({ id: item.id, deleteFiles });
    }
  };

  const togglePending = pauseSlot.isPending || resumeSlot.isPending;
  const deletePending = deleteSlot.isPending || deleteHistory.isPending;

  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      className={isSelected ? "border-primary" : ""}
    >
      <View className="flex-row items-start justify-between mb-1">
        {selectionMode && (
          <View className="mr-2 mt-0.5">
            {isSelected ? (
              <Icon icon={CheckCircle2} size={18} color="#3b82f6" />
            ) : (
              <Icon icon={Circle} size={18} color="#71717a" />
            )}
          </View>
        )}
        <Text className="text-zinc-200 text-sm flex-1 mr-2" numberOfLines={2}>
          {item.name}
        </Text>
        <Badge label={item.statusLabel} variant={badgeVariant} />
      </View>

      {showProgress && (
        <ProgressBar progress={item.progress} showLabel className="my-2" />
      )}

      <View className="flex-row items-center justify-between">
        <View className="flex-row gap-3">
          <Text className="text-zinc-500 text-xs">{item.sizeLabel}</Text>
          {item.timeleft && item.timeleft !== "0:00:00" && (
            <Text className="text-zinc-500 text-xs">ETA {item.timeleft}</Text>
          )}
          {item.category && (
            <Text className="text-zinc-500 text-xs">{item.category}</Text>
          )}
        </View>

        {!selectionMode && (
          <View className="flex-row gap-1">
            {inQueue && (
              <Pressable
                onPress={() =>
                  isPaused
                    ? resumeSlot.mutate(item.id)
                    : pauseSlot.mutate(item.id)
                }
                disabled={togglePending}
                className={`p-1.5 active:opacity-70 ${togglePending ? "opacity-50" : ""}`}
                hitSlop={6}
              >
                {isPaused ? (
                  <Icon icon={Play} size={16} color="#3b82f6" />
                ) : (
                  <Icon icon={Pause} size={16} color="#f59e0b" />
                )}
              </Pressable>
            )}
            <Pressable
              onPress={() => setDeleteOpen(true)}
              disabled={deletePending}
              className={`p-1.5 active:opacity-70 ${deletePending ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              <Icon icon={Trash2} size={16} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>

      <ActionSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete download"
        subtitle={truncateText(item.name, 40)}
        actions={[
          {
            label: "Delete",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => runDelete(false),
          },
          {
            label: "Delete + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => runDelete(true),
          },
        ]}
      />
    </Card>
  );
}
