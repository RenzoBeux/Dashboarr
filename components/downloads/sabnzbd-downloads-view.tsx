import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, Alert, BackHandler, ScrollView } from "react-native";
import { toast } from "@/components/ui/toast";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Pause,
  Play,
  Trash2,
  Plus,
  CheckCircle2,
  Circle,
  ArrowUpDown,
  Check,
} from "lucide-react-native";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { errorHaptic, mediumHaptic } from "@/lib/haptics";
import {
  useSabQueue,
  useSabHistory,
  usePauseSabSlot,
  useResumeSabSlot,
  useDeleteSabSlot,
  useDeleteSabHistorySlot,
  useAddSabUrl,
  usePauseSabAll,
  useResumeSabAll,
} from "@/hooks/use-sabnzbd";
import { useMultiSelect } from "@/hooks/use-multi-select";
import { useServiceHealth } from "@/hooks/use-service-health";
import { truncateText } from "@/lib/utils";
import type { SabQueueSlot, SabHistorySlot, SabSlotStatus } from "@/lib/types";

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

// Unified shape so the list can render queue slots and history slots together.
interface UnifiedItem {
  id: string;
  name: string;
  category: string;
  status: SabSlotStatus;
  progress: number;
  sizeLabel: string;
  timeleft?: string;
  source: "queue" | "history";
  // Original numeric size (from history.bytes or parsed mb*1024^2 for queue)
  // so size sort works across both lists.
  bytes: number;
  index: number;
}

function parseFloatSafe(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function queueSlotToItem(s: SabQueueSlot): UnifiedItem {
  return {
    id: s.nzo_id,
    name: s.filename,
    category: s.cat,
    status: s.status,
    progress: parseFloatSafe(s.percentage) / 100,
    sizeLabel: s.size,
    timeleft: s.timeleft,
    source: "queue",
    bytes: parseFloatSafe(s.mb) * 1024 * 1024,
    index: s.index,
  };
}

function historySlotToItem(s: SabHistorySlot, index: number): UnifiedItem {
  return {
    id: s.nzo_id,
    name: s.name,
    category: s.category,
    status: s.status,
    progress: s.status === "Completed" ? 1 : 0,
    sizeLabel: s.size,
    source: "history",
    bytes: s.bytes,
    // History items have no `index` from SAB, but they're ordered newest-first
    // so inverting the array index gives a stable comparator value where
    // newer history items sort with the highest "index".
    index: -index,
  };
}

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

function getBadgeVariant(
  status: SabSlotStatus,
): "downloading" | "seeding" | "paused" | "error" | "default" {
  if (status === "Paused") return "paused";
  if (status === "Failed") return "error";
  if (status === "Completed") return "seeding";
  if (status === "Queued") return "default";
  // Downloading / Grabbing / Fetching / Checking / Verifying / Repairing /
  // Extracting / Moving — all in-flight states
  return "downloading";
}

interface ViewProps {
  showHeader?: boolean;
}

export function SabnzbdDownloadsView({ showHeader = true }: ViewProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortKey>("progress-desc");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [nzbUrl, setNzbUrl] = useState("");

  const { data: queue } = useSabQueue();
  const { data: history } = useSabHistory(50);
  const { data: healthData } = useServiceHealth();

  const addUrl = useAddSabUrl();
  const pauseSlot = usePauseSabSlot();
  const resumeSlot = useResumeSabSlot();
  const deleteSlot = useDeleteSabSlot();
  const deleteHistorySlot = useDeleteSabHistorySlot();
  const pauseAll = usePauseSabAll();
  const resumeAll = useResumeSabAll();
  const router = useRouter();

  const items = useMemo<UnifiedItem[]>(() => {
    const useHistory = filter === "completed" || filter === "failed";
    if (useHistory) {
      const slots = history?.slots ?? [];
      return slots
        .filter((s) => (filter === "completed" ? s.status === "Completed" : s.status === "Failed"))
        .map(historySlotToItem);
    }
    const slots = (queue?.slots ?? []).map(queueSlotToItem);
    if (filter === "all") return slots;
    if (filter === "downloading") {
      return slots.filter((s) => s.status === "Downloading" || s.status === "Grabbing" || s.status === "Fetching");
    }
    if (filter === "paused") return slots.filter((s) => s.status === "Paused");
    if (filter === "queued") return slots.filter((s) => s.status === "Queued");
    return slots;
  }, [queue, history, filter]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => compare(a, b, sort)),
    [items, sort],
  );

  const sabHealth = healthData?.find((s) => s.id === "sabnzbd");
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
        onError: () => toast("Failed to add NZB", "error"),
      },
    );
  };

  const selectedItems = () => multiSelect.selectedItems(sortedItems);

  const handleBulkPause = () => {
    const sel = selectedItems().filter((s) => s.source === "queue" && s.status !== "Paused");
    if (sel.length === 0) return;
    sel.forEach((s) => pauseSlot.mutate(s.id));
  };

  const handleBulkResume = () => {
    const sel = selectedItems().filter((s) => s.source === "queue" && s.status === "Paused");
    if (sel.length === 0) return;
    sel.forEach((s) => resumeSlot.mutate(s.id));
  };

  const handleBulkDelete = () => {
    const sel = selectedItems();
    if (sel.length === 0) return;
    Alert.alert("Delete Downloads", `Delete ${sel.length} item(s)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          sel.forEach((s) => {
            if (s.source === "history") {
              deleteHistorySlot.mutate({ nzoId: s.id });
            } else {
              deleteSlot.mutate({ nzoId: s.id });
            }
          });
          multiSelect.clear();
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          sel.forEach((s) => {
            if (s.source === "history") {
              deleteHistorySlot.mutate({ nzoId: s.id, deleteFiles: true });
            } else {
              deleteSlot.mutate({ nzoId: s.id, deleteFiles: true });
            }
          });
          multiSelect.clear();
        },
      },
    ]);
  };

  const handleItemPress = (item: UnifiedItem) => {
    if (multiSelect.isActive) {
      multiSelect.toggle(item);
    } else if (item.source === "queue") {
      router.push(`/sab/${item.id}`);
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

  const speedLabel = queue?.speed?.trim() ? `${queue.speed}B/s` : "0 B/s";

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
          {showHeader && <ServiceHeader name="SABnzbd" online={sabHealth?.online} />}

          {/* Speed + global pause/resume */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-blue-600/10 rounded-xl p-3">
              <Text className="text-download text-lg font-bold">↓ {speedLabel}</Text>
              {queue?.sizeleft ? (
                <Text className="text-zinc-500 text-xs mt-0.5">
                  {queue.sizeleft} left
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => (queuePaused ? resumeAll.mutate() : pauseAll.mutate())}
              disabled={pauseAll.isPending || resumeAll.isPending}
              className="bg-surface-light rounded-xl px-4 items-center justify-center active:opacity-70"
            >
              {queuePaused ? (
                <Play size={20} color="#3b82f6" />
              ) : (
                <Pause size={20} color="#f59e0b" />
              )}
            </Pressable>
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
            </Card>
          ) : (
            <Button
              label="Add NZB"
              variant="outline"
              size="sm"
              onPress={() => setShowAddModal(true)}
              icon={<Plus size={16} color="#a1a1aa" />}
              className="mb-4 self-start"
            />
          )}

          <View className="flex-row items-center gap-2 mb-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
              className="flex-1"
            >
              {FILTER_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.key}
                  label={opt.label}
                  selected={filter === opt.key}
                  onPress={() => setFilter(opt.key)}
                />
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setSortSheetOpen(true)}
              hitSlop={6}
              className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
            >
              <ArrowUpDown size={16} color="#a1a1aa" />
            </Pressable>
          </View>
        </>
      )}

      {/* Slot List */}
      {sortedItems.length === 0 ? (
        <EmptyState title="Nothing to show" message={`No ${filter} items`} />
      ) : (
        <View className="gap-2">
          {sortedItems.map((item) => (
            <SlotListItem
              key={item.id}
              item={item}
              selectionMode={multiSelect.isActive}
              isSelected={multiSelect.isSelected(item)}
              onPress={() => handleItemPress(item)}
              onLongPress={() => handleItemLongPress(item)}
            />
          ))}
        </View>
      )}

      <ActionSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort downloads"
        actions={SORT_OPTIONS.map<ActionSheetAction>((opt) => ({
          label: opt.label,
          icon:
            sort === opt.key ? (
              <Check size={18} color="#3b82f6" />
            ) : (
              <ArrowUpDown size={18} color="#71717a" />
            ),
          onPress: () => setSort(opt.key),
        }))}
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
          icon={<Pause size={14} color="#f59e0b" />}
          className="flex-1"
        />
        <Button
          label="Resume"
          variant="outline"
          size="sm"
          onPress={onResume}
          disabled={busy || count === 0}
          icon={<Play size={14} color="#3b82f6" />}
          className="flex-1"
        />
        <Button
          label="Delete"
          variant="danger"
          size="sm"
          onPress={onDelete}
          disabled={busy || count === 0}
          icon={<Trash2 size={14} color="white" />}
          className="flex-1"
        />
      </View>
    </View>
  );
}

function SlotListItem({
  item,
  onPress,
  onLongPress,
  selectionMode,
  isSelected,
}: {
  item: UnifiedItem;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  isSelected: boolean;
}) {
  const pauseSlot = usePauseSabSlot();
  const resumeSlot = useResumeSabSlot();
  const deleteSlot = useDeleteSabSlot();
  const deleteHistory = useDeleteSabHistorySlot();

  const isPaused = item.status === "Paused";
  const inQueue = item.source === "queue";
  const badgeVariant = getBadgeVariant(item.status);
  const showProgress = inQueue || item.status === "Completed";

  const handleDelete = () => {
    Alert.alert("Delete Download", `Delete "${truncateText(item.name, 30)}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          if (item.source === "history") {
            deleteHistory.mutate({ nzoId: item.id });
          } else {
            deleteSlot.mutate({ nzoId: item.id });
          }
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          if (item.source === "history") {
            deleteHistory.mutate({ nzoId: item.id, deleteFiles: true });
          } else {
            deleteSlot.mutate({ nzoId: item.id, deleteFiles: true });
          }
        },
      },
    ]);
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
              <CheckCircle2 size={18} color="#3b82f6" />
            ) : (
              <Circle size={18} color="#71717a" />
            )}
          </View>
        )}
        <Text className="text-zinc-200 text-sm flex-1 mr-2" numberOfLines={2}>
          {item.name}
        </Text>
        <Badge label={item.status} variant={badgeVariant} />
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
                  <Play size={16} color="#3b82f6" />
                ) : (
                  <Pause size={16} color="#f59e0b" />
                )}
              </Pressable>
            )}
            <Pressable
              onPress={handleDelete}
              disabled={deletePending}
              className={`p-1.5 active:opacity-70 ${deletePending ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              <Trash2 size={16} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}
