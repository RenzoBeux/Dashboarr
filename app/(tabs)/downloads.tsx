import { useState, useCallback } from "react";
import { View, Text, Pressable, Alert, BackHandler } from "react-native";
import { toast } from "@/components/ui/toast";
import { useRouter, useFocusEffect } from "expo-router";
import { Pause, Play, Trash2, Plus, CheckCircle2, Circle } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { errorHaptic, mediumHaptic } from "@/lib/haptics";
import {
  useAllTorrents,
  useTransferInfo,
  usePauseTorrent,
  useResumeTorrent,
  useDeleteTorrent,
  useAddTorrent,
} from "@/hooks/use-qbittorrent";
import { useMultiSelect } from "@/hooks/use-multi-select";
import { useServiceHealth } from "@/hooks/use-service-health";
import { formatSpeed, formatEta, formatBytes, truncateText } from "@/lib/utils";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import type { QBTorrent, TorrentState } from "@/lib/types";

type FilterType = "all" | "downloading" | "seeding" | "completed" | "paused";

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "downloading", label: "Downloading" },
  { key: "seeding", label: "Seeding" },
  { key: "completed", label: "Done" },
  { key: "paused", label: "Paused" },
];

function getTorrentBadgeVariant(state: TorrentState): "downloading" | "seeding" | "paused" | "error" | "default" {
  if (state.includes("DL") || state === "downloading" || state === "metaDL") return "downloading";
  if (state.includes("UP") || state === "uploading") return "seeding";
  if (state.includes("paused")) return "paused";
  if (state === "error" || state === "missingFiles") return "error";
  return "default";
}

export default function DownloadsScreen() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [magnetUri, setMagnetUri] = useState("");
  const { data: torrents } = useAllTorrents(filter === "all" ? undefined : filter);
  const { data: transfer } = useTransferInfo();
  const { data: healthData } = useServiceHealth();
  const addTorrent = useAddTorrent();
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const deleteMutation = useDeleteTorrent();
  const router = useRouter();
  const { refreshing, onRefresh } = usePullToRefresh([["qbittorrent"]]);

  const multiSelect = useMultiSelect<QBTorrent>((t) => t.hash);

  const qbHealth = healthData?.find((s) => s.id === "qbittorrent");

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
    if (!magnetUri.trim()) return;
    addTorrent.mutate(magnetUri.trim(), {
      onSuccess: () => {
        setMagnetUri("");
        setShowAddModal(false);
      },
      onError: () => toast("Failed to add torrent", "error"),
    });
  };

  const selectedHashes = () =>
    torrents ? multiSelect.selectedItems(torrents).map((t) => t.hash) : [];

  const handleBulkPause = () => {
    const hashes = selectedHashes();
    if (hashes.length === 0) return;
    pauseMutation.mutate(hashes);
  };

  const handleBulkResume = () => {
    const hashes = selectedHashes();
    if (hashes.length === 0) return;
    resumeMutation.mutate(hashes);
  };

  const handleBulkDelete = () => {
    const hashes = selectedHashes();
    if (hashes.length === 0) return;
    Alert.alert("Delete Torrents", `Delete ${hashes.length} torrent(s)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          deleteMutation.mutate({ hashes });
          multiSelect.clear();
        },
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => {
          errorHaptic();
          deleteMutation.mutate({ hashes, deleteFiles: true });
          multiSelect.clear();
        },
      },
    ]);
  };

  const handleTorrentPress = (torrent: QBTorrent) => {
    if (multiSelect.isActive) {
      multiSelect.toggle(torrent);
    } else {
      router.push(`/torrent/${torrent.hash}`);
    }
  };

  const handleTorrentLongPress = (torrent: QBTorrent) => {
    if (multiSelect.isActive) return;
    mediumHaptic();
    multiSelect.enter(torrent);
  };

  const bulkBusy =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    deleteMutation.isPending;

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {multiSelect.isActive ? (
        <SelectionBar
          count={multiSelect.count}
          total={torrents?.length ?? 0}
          onCancel={multiSelect.clear}
          onSelectAll={() => {
            if (!torrents) return;
            if (multiSelect.count === torrents.length) multiSelect.clear();
            else multiSelect.selectAll(torrents);
          }}
          onPause={handleBulkPause}
          onResume={handleBulkResume}
          onDelete={handleBulkDelete}
          busy={bulkBusy}
        />
      ) : (
        <>
          <ServiceHeader name="Downloads" online={qbHealth?.online} />

          {/* Speed Summary */}
          {transfer && (
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1 bg-blue-600/10 rounded-xl p-3">
                <Text className="text-download text-lg font-bold">
                  ↓ {formatSpeed(transfer.dl_info_speed)}
                </Text>
              </View>
              <View className="flex-1 bg-green-600/10 rounded-xl p-3">
                <Text className="text-upload text-lg font-bold">
                  ↑ {formatSpeed(transfer.up_info_speed)}
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
                  loading={addTorrent.isPending}
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

          <View className="flex-row gap-2 mb-4">
            {FILTER_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                selected={filter === opt.key}
                onPress={() => setFilter(opt.key)}
              />
            ))}
          </View>
        </>
      )}

      {/* Torrent List */}
      {!torrents || torrents.length === 0 ? (
        <EmptyState title="No torrents" message={`No ${filter} torrents found`} />
      ) : (
        <View className="gap-2">
          {torrents.map((torrent) => (
            <TorrentListItem
              key={torrent.hash}
              torrent={torrent}
              selectionMode={multiSelect.isActive}
              isSelected={multiSelect.isSelected(torrent)}
              onPress={() => handleTorrentPress(torrent)}
              onLongPress={() => handleTorrentLongPress(torrent)}
            />
          ))}
        </View>
      )}
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
