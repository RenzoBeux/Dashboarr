import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, Alert, BackHandler, ScrollView } from "react-native";
import { toast } from "@/components/ui/toast";
import { useRouter, useFocusEffect } from "expo-router";
import { Pause, Play, Trash2, Plus, CheckCircle2, Circle, ArrowUpDown, Check } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
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
import { SortButton } from "@/components/ui/sort-button";
import {
  useSortStore,
  SORT_DEFAULTS,
  type DownloadsSortKey,
} from "@/store/sort-store";
import {
  useAllTorrents,
  useTransferInfo,
  usePauseTorrent,
  useResumeTorrent,
  useDeleteTorrent,
  useAddTorrent,
} from "@/hooks/use-qbittorrent";
import {
  useAllRTTorrents,
  useRTTransferInfo,
  usePauseRTTorrent,
  useResumeRTTorrent,
  useDeleteRTTorrent,
  useAddRTTorrent,
} from "@/hooks/use-rtorrent";
import { useMultiSelect } from "@/hooks/use-multi-select";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useConfigStore } from "@/store/config-store";
import { formatSpeed, formatEta, formatBytes, truncateText } from "@/lib/utils";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { rtorrentStateToLabel } from "@/services/rtorrent-api";
import type { QBTorrent, TorrentState, RTTorrent } from "@/lib/types";

type FilterType = "all" | "downloading" | "seeding" | "completed" | "paused";

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "downloading", label: "Downloading" },
  { key: "seeding", label: "Seeding" },
  { key: "completed", label: "Done" },
  { key: "paused", label: "Paused" },
];

const SORT_OPTIONS: { key: DownloadsSortKey; label: string }[] = [
  { key: "progress-desc", label: "Progress: High → Low" },
  { key: "progress-asc", label: "Progress: Low → High" },
  { key: "name-asc", label: "Name: A → Z" },
  { key: "size-desc", label: "Size: Large → Small" },
  { key: "added-desc", label: "Added: Newest First" },
];

// --- qBittorrent helpers ---

function compareTorrents(a: QBTorrent, b: QBTorrent, sort: DownloadsSortKey): number {
  switch (sort) {
    case "progress-desc":
      return b.progress - a.progress;
    case "progress-asc":
      return a.progress - b.progress;
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "size-desc":
      return b.size - a.size;
    case "added-desc":
      return b.added_on - a.added_on;
  }
}

function getTorrentBadgeVariant(state: TorrentState): "downloading" | "seeding" | "paused" | "error" | "default" {
  if (state.includes("DL") || state === "downloading" || state === "metaDL") return "downloading";
  if (state.includes("UP") || state === "uploading") return "seeding";
  if (state.includes("paused")) return "paused";
  if (state === "error" || state === "missingFiles") return "error";
  return "default";
}

// --- rTorrent helpers ---

function compareRTTorrents(a: RTTorrent, b: RTTorrent, sort: DownloadsSortKey): number {
  const aProgress = a.size > 0 ? a.bytes_done / a.size : 0;
  const bProgress = b.size > 0 ? b.bytes_done / b.size : 0;
  switch (sort) {
    case "progress-desc":
      return bProgress - aProgress;
    case "progress-asc":
      return aProgress - bProgress;
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "size-desc":
      return b.size - a.size;
    case "added-desc":
      return b.timestamp_started - a.timestamp_started;
  }
}

function getRTBadgeVariant(t: RTTorrent): "downloading" | "seeding" | "paused" | "error" | "default" {
  const state = rtorrentStateToLabel(t);
  if (state === "downloading") return "downloading";
  if (state === "seeding") return "seeding";
  if (state === "paused" || state === "stopped") return "paused";
  return "default";
}

// --- Main screen ---

export default function DownloadsScreen() {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const rtEnabled = useConfigStore((s) => s.services.rtorrent.enabled);
  // qBittorrent takes priority when both are enabled
  const activeClient = qbEnabled ? "qbittorrent" : rtEnabled ? "rtorrent" : null;
  const qbActive = activeClient === "qbittorrent";
  const rtActive = activeClient === "rtorrent";

  const [filter, setFilter] = useState<FilterType>("all");
  const sort = useSortStore((s) => s.downloads);
  const setSort = useSortStore((s) => s.setDownloads);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [magnetUri, setMagnetUri] = useState("");

  // qBittorrent hooks (internally gated by qbEnabled)
  const { data: qbTorrents } = useAllTorrents(filter === "all" ? undefined : filter, qbActive);
  const { data: qbTransfer } = useTransferInfo(qbActive);
  const qbAddTorrent = useAddTorrent();
  const qbPause = usePauseTorrent();
  const qbResume = useResumeTorrent();
  const qbDelete = useDeleteTorrent();

  // rTorrent hooks (internally gated by rtEnabled)
  const { data: rtTorrents, error: rtError } = useAllRTTorrents(
    filter === "all" ? undefined : filter,
    rtActive,
  );
  const { data: rtTransfer } = useRTTransferInfo(rtActive);
  const rtAddTorrent = useAddRTTorrent();
  const rtPause = usePauseRTTorrent();
  const rtResume = useResumeRTTorrent();
  const rtDelete = useDeleteRTTorrent();

  const { data: healthData } = useServiceHealth();
  const router = useRouter();
  const { refreshing, onRefresh } = usePullToRefresh([[activeClient ?? "qbittorrent"]]);

  const clientHealth = healthData?.find((s) => s.id === (activeClient ?? "qbittorrent"));

  // Sorted torrent lists
  const sortedQBTorrents = useMemo(
    () => (qbTorrents ? [...qbTorrents].sort((a, b) => compareTorrents(a, b, sort)) : qbTorrents),
    [qbTorrents, sort],
  );
  const sortedRTTorrents = useMemo(
    () => (rtTorrents ? [...rtTorrents].sort((a, b) => compareRTTorrents(a, b, sort)) : rtTorrents),
    [rtTorrents, sort],
  );

  const qbMultiSelect = useMultiSelect<QBTorrent>((t) => t.hash);
  const rtMultiSelect = useMultiSelect<RTTorrent>((t) => t.hash);
  const multiSelect = activeClient === "rtorrent" ? rtMultiSelect : qbMultiSelect;

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

  const pauseMutation = activeClient === "rtorrent" ? rtPause : qbPause;
  const resumeMutation = activeClient === "rtorrent" ? rtResume : qbResume;

  const dlSpeed =
    activeClient === "rtorrent" ? rtTransfer?.dl_rate : qbTransfer?.dl_info_speed;
  const upSpeed =
    activeClient === "rtorrent" ? rtTransfer?.up_rate : qbTransfer?.up_info_speed;

  const handleAdd = () => {
    if (!magnetUri.trim()) return;
    const addMutate = activeClient === "rtorrent" ? rtAddTorrent : qbAddTorrent;
    addMutate.mutate(magnetUri.trim(), {
      onSuccess: () => {
        setMagnetUri("");
        setShowAddModal(false);
      },
      onError: () => toast("Failed to add torrent", "error"),
    });
  };

  const handleBulkPause = () => {
    if (activeClient === "rtorrent") {
      const hashes = sortedRTTorrents
        ? rtMultiSelect.selectedItems(sortedRTTorrents).map((t) => t.hash)
        : [];
      if (hashes.length) rtPause.mutate(hashes);
    } else {
      const hashes = sortedQBTorrents
        ? qbMultiSelect.selectedItems(sortedQBTorrents).map((t) => t.hash)
        : [];
      if (hashes.length) qbPause.mutate(hashes);
    }
  };

  const handleBulkResume = () => {
    if (activeClient === "rtorrent") {
      const hashes = sortedRTTorrents
        ? rtMultiSelect.selectedItems(sortedRTTorrents).map((t) => t.hash)
        : [];
      if (hashes.length) rtResume.mutate(hashes);
    } else {
      const hashes = sortedQBTorrents
        ? qbMultiSelect.selectedItems(sortedQBTorrents).map((t) => t.hash)
        : [];
      if (hashes.length) qbResume.mutate(hashes);
    }
  };

  const handleBulkDelete = () => {
    if (activeClient === "rtorrent") {
      const selected = sortedRTTorrents
        ? rtMultiSelect.selectedItems(sortedRTTorrents)
        : [];
      if (!selected.length) return;
      Alert.alert("Delete Torrents", `Delete ${selected.length} torrent(s)?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            errorHaptic();
            rtDelete.mutate({ hashes: selected.map((t) => t.hash) });
            rtMultiSelect.clear();
          },
        },
        {
          text: "Delete + Files",
          style: "destructive",
          onPress: () => {
            errorHaptic();
            rtDelete.mutate({
              hashes: selected.map((t) => t.hash),
              deleteFiles: true,
              basePaths: selected.map((t) => t.base_path),
            });
            rtMultiSelect.clear();
          },
        },
      ]);
    } else {
      const hashes = sortedQBTorrents
        ? qbMultiSelect.selectedItems(sortedQBTorrents).map((t) => t.hash)
        : [];
      if (!hashes.length) return;
      Alert.alert("Delete Torrents", `Delete ${hashes.length} torrent(s)?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            errorHaptic();
            qbDelete.mutate({ hashes });
            qbMultiSelect.clear();
          },
        },
        {
          text: "Delete + Files",
          style: "destructive",
          onPress: () => {
            errorHaptic();
            qbDelete.mutate({ hashes, deleteFiles: true });
            qbMultiSelect.clear();
          },
        },
      ]);
    }
  };

  const bulkBusy =
    pauseMutation.isPending || resumeMutation.isPending ||
    qbDelete.isPending || rtDelete.isPending;

  const addPending =
    activeClient === "rtorrent" ? rtAddTorrent.isPending : qbAddTorrent.isPending;

  const sortedTorrents =
    activeClient === "rtorrent" ? sortedRTTorrents : sortedQBTorrents;

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {multiSelect.isActive ? (
        <SelectionBar
          count={multiSelect.count}
          total={sortedTorrents?.length ?? 0}
          onCancel={multiSelect.clear}
          onSelectAll={() => {
            if (!sortedTorrents) return;
            if (multiSelect.count === sortedTorrents.length) multiSelect.clear();
            else {
              if (activeClient === "rtorrent") rtMultiSelect.selectAll(sortedRTTorrents ?? []);
              else qbMultiSelect.selectAll(sortedQBTorrents ?? []);
            }
          }}
          onPause={handleBulkPause}
          onResume={handleBulkResume}
          onDelete={handleBulkDelete}
          busy={bulkBusy}
        />
      ) : (
        <>
          <ServiceHeader name="Downloads" online={clientHealth?.online} />

          {/* Speed Summary */}
          {(dlSpeed !== undefined || upSpeed !== undefined) && (
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1 bg-blue-600/10 rounded-xl p-3">
                <Text className="text-download text-lg font-bold">
                  ↓ {formatSpeed(dlSpeed ?? 0)}
                </Text>
              </View>
              <View className="flex-1 bg-green-600/10 rounded-xl p-3">
                <Text className="text-upload text-lg font-bold">
                  ↑ {formatSpeed(upSpeed ?? 0)}
                </Text>
              </View>
            </View>
          )}

          {/* Add Torrent */}
          {showAddModal ? (
            <Card className="mb-4 gap-3">
              <TextInput
                placeholder="Paste magnet link..."
                value={magnetUri}
                onChangeText={setMagnetUri}
                autoFocus
              />
              <View className="flex-row gap-2">
                <Button
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setShowAddModal(false);
                    setMagnetUri("");
                  }}
                  className="flex-1"
                />
                <Button
                  label="Add"
                  size="sm"
                  onPress={handleAdd}
                  loading={addPending}
                  className="flex-1"
                />
              </View>
            </Card>
          ) : (
            <Button
              label="Add Torrent"
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
            <SortButton
              onPress={() => setSortSheetOpen(true)}
              active={sort !== SORT_DEFAULTS.downloads}
            />
          </View>
        </>
      )}

      {/* Torrent List */}
      {activeClient === "rtorrent" && rtError ? (
        <EmptyState title="rTorrent error" message={(rtError as Error).message ?? "Failed to fetch torrents"} />
      ) : !sortedTorrents || sortedTorrents.length === 0 ? (
        <EmptyState title="No torrents" message={`No ${filter} torrents found`} />
      ) : activeClient === "rtorrent" ? (
        <View className="gap-2">
          {(sortedRTTorrents ?? []).map((torrent) => (
            <RTorrentListItem
              key={torrent.hash}
              torrent={torrent}
              selectionMode={rtMultiSelect.isActive}
              isSelected={rtMultiSelect.isSelected(torrent)}
              onPress={() => {
                if (rtMultiSelect.isActive) rtMultiSelect.toggle(torrent);
                else router.push(`/torrent/${torrent.hash}`);
              }}
              onLongPress={() => {
                if (rtMultiSelect.isActive) return;
                mediumHaptic();
                rtMultiSelect.enter(torrent);
              }}
            />
          ))}
        </View>
      ) : (
        <View className="gap-2">
          {(sortedQBTorrents ?? []).map((torrent) => (
            <TorrentListItem
              key={torrent.hash}
              torrent={torrent}
              selectionMode={qbMultiSelect.isActive}
              isSelected={qbMultiSelect.isSelected(torrent)}
              onPress={() => {
                if (qbMultiSelect.isActive) qbMultiSelect.toggle(torrent);
                else router.push(`/torrent/${torrent.hash}`);
              }}
              onLongPress={() => {
                if (qbMultiSelect.isActive) return;
                mediumHaptic();
                qbMultiSelect.enter(torrent);
              }}
            />
          ))}
        </View>
      )}

      <ActionSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort torrents"
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
    </ScreenWrapper>
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

function TorrentListItem({
  torrent,
  onPress,
  onLongPress,
  selectionMode,
  isSelected,
}: {
  torrent: QBTorrent;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  isSelected: boolean;
}) {
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const deleteMutation = useDeleteTorrent();

  const isPaused = torrent.state.includes("paused");
  const badgeVariant = getTorrentBadgeVariant(torrent.state);

  const handleDelete = () => {
    Alert.alert("Delete Torrent", `Delete "${truncateText(torrent.name, 30)}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          deleteMutation.mutate({ hashes: [torrent.hash] });
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          deleteMutation.mutate({ hashes: [torrent.hash], deleteFiles: true });
        },
      },
    ]);
  };

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
          {torrent.name}
        </Text>
        <Badge label={torrent.state} variant={badgeVariant} />
      </View>

      <ProgressBar progress={torrent.progress} showLabel className="my-2" />

      <View className="flex-row items-center justify-between">
        <View className="flex-row gap-3">
          <Text className="text-zinc-500 text-xs">
            {formatBytes(torrent.size)}
          </Text>
          {torrent.dlspeed > 0 && (
            <Text className="text-zinc-500 text-xs">
              ↓ {formatSpeed(torrent.dlspeed)}
            </Text>
          )}
          {torrent.eta > 0 && torrent.eta < 8640000 && (
            <Text className="text-zinc-500 text-xs">
              ETA {formatEta(torrent.eta)}
            </Text>
          )}
        </View>

        {!selectionMode && (
          <View className="flex-row gap-1">
            <Pressable
              onPress={() =>
                isPaused
                  ? resumeMutation.mutate([torrent.hash])
                  : pauseMutation.mutate([torrent.hash])
              }
              disabled={pauseMutation.isPending || resumeMutation.isPending}
              className={`p-1.5 active:opacity-70 ${pauseMutation.isPending || resumeMutation.isPending ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              {isPaused ? (
                <Play size={16} color="#3b82f6" />
              ) : (
                <Pause size={16} color="#f59e0b" />
              )}
            </Pressable>
            <Pressable
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              className={`p-1.5 active:opacity-70 ${deleteMutation.isPending ? "opacity-50" : ""}`}
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

function RTorrentListItem({
  torrent,
  onPress,
  onLongPress,
  selectionMode,
  isSelected,
}: {
  torrent: RTTorrent;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  isSelected: boolean;
}) {
  const pauseMutation = usePauseRTTorrent();
  const resumeMutation = useResumeRTTorrent();
  const deleteMutation = useDeleteRTTorrent();

  const state = rtorrentStateToLabel(torrent);
  const isPaused = state === "paused" || state === "stopped";
  const badgeVariant = getRTBadgeVariant(torrent);
  const progress = torrent.size > 0 ? torrent.bytes_done / torrent.size : 0;

  const handleDelete = () => {
    Alert.alert("Delete Torrent", `Delete "${truncateText(torrent.name, 30)}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          deleteMutation.mutate({ hashes: [torrent.hash] });
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          deleteMutation.mutate({
            hashes: [torrent.hash],
            deleteFiles: true,
            basePaths: [torrent.base_path],
          });
        },
      },
    ]);
  };

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
          {torrent.name}
        </Text>
        <Badge label={state} variant={badgeVariant} />
      </View>

      <ProgressBar progress={progress} showLabel className="my-2" />

      <View className="flex-row items-center justify-between">
        <View className="flex-row gap-3">
          <Text className="text-zinc-500 text-xs">
            {formatBytes(torrent.size)}
          </Text>
          {torrent.dl_rate > 0 && (
            <Text className="text-zinc-500 text-xs">
              ↓ {formatSpeed(torrent.dl_rate)}
            </Text>
          )}
        </View>

        {!selectionMode && (
          <View className="flex-row gap-1">
            <Pressable
              onPress={() =>
                isPaused
                  ? resumeMutation.mutate([torrent.hash])
                  : pauseMutation.mutate([torrent.hash])
              }
              disabled={pauseMutation.isPending || resumeMutation.isPending}
              className={`p-1.5 active:opacity-70 ${pauseMutation.isPending || resumeMutation.isPending ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              {isPaused ? (
                <Play size={16} color="#3b82f6" />
              ) : (
                <Pause size={16} color="#f59e0b" />
              )}
            </Pressable>
            <Pressable
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              className={`p-1.5 active:opacity-70 ${deleteMutation.isPending ? "opacity-50" : ""}`}
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
