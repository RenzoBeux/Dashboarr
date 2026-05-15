import { useState, useCallback, useContext, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  BackHandler,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useConfigStore } from "@/store/config-store";
import { UsenetDownloadsView } from "@/components/downloads/usenet-downloads-view";
import { sabnzbdAdapter } from "@/lib/usenet-adapters/sabnzbd";
import { nzbgetAdapter } from "@/lib/usenet-adapters/nzbget";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { toast, toastError } from "@/components/ui/toast";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pause, Play, Trash2, Plus, CheckCircle2, Circle, ArrowUpDown, Check, Zap, AlertCircle } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceHeader } from "@/components/common/service-header";
import { DemoBanner } from "@/components/common/demo-banner";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { errorHaptic, lightHaptic, mediumHaptic } from "@/lib/haptics";
import { SortButton } from "@/components/ui/sort-button";
import { HAS_GLASS_TAB_BAR } from "@/lib/glass";
import {
  useSortStore,
  SORT_DEFAULTS,
  type DownloadsSortKey,
} from "@/store/sort-store";
import {
  useInfiniteTorrents,
  useTransferInfo,
  usePauseTorrent,
  useResumeTorrent,
  useDeleteTorrent,
  useAddTorrent,
  useSpeedLimitsMode,
} from "@/hooks/use-qbittorrent";
import type { QBTorrentFilter } from "@/services/qbittorrent-api";
import { SpeedLimitsSheet } from "@/components/qbittorrent/speed-limits-sheet";
import { useMultiSelect } from "@/hooks/use-multi-select";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useQueryClient } from "@tanstack/react-query";
import { formatSpeed, formatEta, formatBytes, truncateText } from "@/lib/utils";
import { isTorrentPaused, type QBTorrent, type TorrentState } from "@/lib/types";

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

const PAGE_SIZE = 50;

// Tab filter maps directly to qBittorrent's `filter` param. "all" omits it
// rather than sending `filter=all`, which is functionally identical and a
// few bytes cheaper on the wire.
function tabFilterToQB(filter: FilterType): QBTorrentFilter | undefined {
  return filter === "all" ? undefined : filter;
}

// Sort key from `useSortStore` → qBittorrent's `sort` field name + `reverse`.
function sortKeyToQB(key: DownloadsSortKey): { sort: keyof QBTorrent; reverse: boolean } {
  switch (key) {
    case "progress-desc":
      return { sort: "progress", reverse: true };
    case "progress-asc":
      return { sort: "progress", reverse: false };
    case "name-asc":
      return { sort: "name", reverse: false };
    case "size-desc":
      return { sort: "size", reverse: true };
    case "added-desc":
      return { sort: "added_on", reverse: true };
  }
}

function getTorrentBadgeVariant(state: TorrentState): "downloading" | "seeding" | "paused" | "error" | "default" {
  // Paused/stopped must be checked before the DL/UP suffix tests, otherwise
  // paused torrents wear the downloading/seeding badge color.
  if (state === "error" || state === "missingFiles") return "error";
  if (isTorrentPaused(state)) return "paused";
  if (state.includes("DL") || state === "downloading" || state === "metaDL") return "downloading";
  if (state.includes("UP") || state === "uploading") return "seeding";
  return "default";
}

type DownloadClient = "qbittorrent" | "sabnzbd" | "nzbget";

// Top-level switcher for the Downloads tab. When more than one download client
// is enabled the user picks via a segmented control; otherwise the available
// client is rendered directly. qBittorrent's logic stays inlined here so the
// virtualized FlatList + server-side pagination + sort store all share the
// screen's state.
export default function DownloadsScreen() {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const sabEnabled = useConfigStore((s) => s.services.sabnzbd?.enabled ?? false);
  const nzbgetEnabled = useConfigStore((s) => s.services.nzbget?.enabled ?? false);

  const enabledClients: DownloadClient[] = [];
  if (qbEnabled) enabledClients.push("qbittorrent");
  if (sabEnabled) enabledClients.push("sabnzbd");
  if (nzbgetEnabled) enabledClients.push("nzbget");

  // `?client=...` lets the Services tab (and dashboard Status widget) deep-link
  // straight to the matching segment instead of always landing on whichever
  // client was opened first.
  const { client: clientParam } = useLocalSearchParams<{ client?: string }>();
  const paramClient =
    clientParam === "qbittorrent" ||
    clientParam === "sabnzbd" ||
    clientParam === "nzbget"
      ? clientParam
      : undefined;

  const [client, setClient] = useState<DownloadClient>(
    paramClient && enabledClients.includes(paramClient)
      ? paramClient
      : enabledClients[0] ?? "qbittorrent",
  );

  // Re-select when the deep-link param changes (e.g. user is already on this
  // tab and taps a different download-client tile in the Services tab).
  useEffect(() => {
    if (paramClient && enabledClients.includes(paramClient) && paramClient !== client) {
      setClient(paramClient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramClient]);

  if (enabledClients.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No download client configured"
          message="Enable qBittorrent, SABnzbd, or NZBGet in Settings to manage downloads."
        />
      </ScreenWrapper>
    );
  }

  const showSegmented = enabledClients.length > 1;
  const activeClient: DownloadClient = showSegmented
    ? enabledClients.includes(client)
      ? client
      : enabledClients[0]
    : enabledClients[0];

  const segmentedControl = showSegmented ? (
    <DownloadsSegmentedControl
      value={activeClient}
      enabled={enabledClients}
      onChange={setClient}
    />
  ) : null;

  if (activeClient === "sabnzbd") {
    return (
      <ScreenWrapper>
        <UsenetDownloadsView
          adapter={sabnzbdAdapter}
          showHeader={!showSegmented}
          segmentedControl={segmentedControl}
        />
      </ScreenWrapper>
    );
  }

  if (activeClient === "nzbget") {
    return (
      <ScreenWrapper>
        <UsenetDownloadsView
          adapter={nzbgetAdapter}
          showHeader={!showSegmented}
          segmentedControl={segmentedControl}
        />
      </ScreenWrapper>
    );
  }

  return <QbittorrentDownloadsScreen segmentedControl={segmentedControl} />;
}

const SEGMENT_LABELS: Record<DownloadClient, string> = {
  qbittorrent: "qBittorrent",
  sabnzbd: "SABnzbd",
  nzbget: "NZBGet",
};

function DownloadsSegmentedControl({
  value,
  enabled,
  onChange,
}: {
  value: DownloadClient;
  enabled: DownloadClient[];
  onChange: (next: DownloadClient) => void;
}) {
  return (
    <View className="flex-row bg-surface-light rounded-2xl p-1 mb-4 mt-2 mx-4">
      {enabled.map((c) => (
        <Segment
          key={c}
          label={SEGMENT_LABELS[c]}
          active={value === c}
          onPress={() => onChange(c)}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2 rounded-xl items-center active:opacity-70 ${active ? "bg-surface" : ""}`}
    >
      <Text className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-400"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function QbittorrentDownloadsScreen({
  segmentedControl,
}: {
  segmentedControl?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<FilterType>("all");
  const sort = useSortStore((s) => s.downloads);
  const setSort = useSortStore((s) => s.setDownloads);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [speedLimitsOpen, setSpeedLimitsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [magnetUri, setMagnetUri] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { sort: qbSort, reverse } = sortKeyToQB(sort);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isLoading,
    error,
    refetch,
  } = useInfiniteTorrents({
    filter: tabFilterToQB(filter),
    sort: qbSort,
    reverse,
    pageSize: PAGE_SIZE,
  });
  // Server-side sort means we just flatten pages in order — no client re-sort.
  const torrents = data?.pages.flat() ?? [];
  const { data: transfer } = useTransferInfo();
  const { data: healthData } = useServiceHealth();
  const { data: altModeOn } = useSpeedLimitsMode();
  const addTorrent = useAddTorrent();
  const pauseMutation = usePauseTorrent();
  const resumeMutation = useResumeTorrent();
  const deleteMutation = useDeleteTorrent();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Tab-bar offset so the last list item clears the floating glass tab bar
  // (iOS 26+). On other platforms the safe-area inset already handles it.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const usesFloatingTabBar = HAS_GLASS_TAB_BAR && tabBarHeight !== undefined;
  const safeAreaEdges = usesFloatingTabBar
    ? (["top", "left", "right"] as const)
    : (["top", "left", "right", "bottom"] as const);
  const listBottomPadding = 24 + (usesFloatingTabBar ? tabBarHeight : 0);

  const onRefresh = useCallback(async () => {
    lightHaptic();
    setRefreshing(true);
    try {
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["qbittorrent", "transfer"] });
    } finally {
      setRefreshing(false);
    }
  }, [refetch, queryClient]);

  // Only the rows whose hashes are actually in-flight should disable —
  // mutating one torrent shouldn't gray out every other row's buttons.
  const busyHashes = new Set<string>([
    ...(pauseMutation.isPending ? pauseMutation.variables ?? [] : []),
    ...(resumeMutation.isPending ? resumeMutation.variables ?? [] : []),
    ...(deleteMutation.isPending ? deleteMutation.variables?.hashes ?? [] : []),
  ]);

  const multiSelect = useMultiSelect<QBTorrent>((t) => t.hash);

  // Selection refers to specific torrent hashes; if the active filter changes
  // those hashes may no longer be in the loaded set, so drop the selection.
  useEffect(() => {
    if (multiSelect.isActive) multiSelect.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
      onError: (err) => toastError("Failed to add torrent", err),
    });
  };

  const selectedHashes = () => multiSelect.selectedItems(torrents).map((t) => t.hash);

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

  const header = multiSelect.isActive ? (
    <SelectionBar
      count={multiSelect.count}
      onCancel={multiSelect.clear}
      onPause={handleBulkPause}
      onResume={handleBulkResume}
      onDelete={handleBulkDelete}
      busy={bulkBusy}
    />
  ) : (
    <>
      {segmentedControl}
      <ServiceHeader name="Downloads" online={qbHealth?.online} serviceId="qbittorrent" />

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
          <Pressable
            onPress={() => setSpeedLimitsOpen(true)}
            hitSlop={6}
            accessibilityLabel="Speed limits"
            className={`w-12 rounded-xl items-center justify-center active:opacity-70 ${
              altModeOn ? "bg-amber-600/20" : "bg-surface-light"
            }`}
          >
            <Icon icon={Zap}
              size={20}
              color={altModeOn ? "#f59e0b" : "#a1a1aa"}
              fill={altModeOn ? "#f59e0b" : "transparent"}
            />
          </Pressable>
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
          icon={<Icon icon={Plus} size={16} color="#a1a1aa" />}
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
  );

  const showEmpty = !isLoading && torrents.length === 0;

  return (
    <SafeAreaView edges={safeAreaEdges} className="flex-1 bg-background">
      <DemoBanner />
      <FlatList
        data={torrents}
        keyExtractor={(t) => t.hash}
        renderItem={({ item }) => (
          <TorrentListItem
            torrent={item}
            selectionMode={multiSelect.isActive}
            isSelected={multiSelect.isSelected(item)}
            onPress={() => handleTorrentPress(item)}
            onLongPress={() => handleTorrentLongPress(item)}
            onTogglePause={(t) => {
              if (isTorrentPaused(t.state)) {
                resumeMutation.mutate([t.hash]);
              } else {
                pauseMutation.mutate([t.hash]);
              }
            }}
            onDelete={(t, deleteFiles) => {
              errorHaptic();
              deleteMutation.mutate({ hashes: [t.hash], deleteFiles });
            }}
            busy={busyHashes.has(item.hash)}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error ? (
            <ErrorBanner error={error} title="Failed to load torrents" />
          ) : showEmpty ? (
            <EmptyState title="No torrents" message={`No ${filter} torrents found`} />
          ) : null
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : isFetchNextPageError ? (
            // Page-2+ failure: keep already-loaded pages visible and offer a
            // retry instead of silently stalling onEndReached. Initial-load
            // failure is handled by ListEmptyComponent above.
            <Pressable
              onPress={() => fetchNextPage()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry loading more torrents"
              className="py-4 flex-row items-center justify-center gap-2 active:opacity-60"
            >
              <Icon icon={AlertCircle} size={14} color="#f87171" />
              <Text className="text-red-300 text-sm">
                Couldn't load more — tap to retry
              </Text>
            </Pressable>
          ) : null
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: listBottomPadding,
          flexGrow: 1,
        }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
            progressBackgroundColor="#18181b"
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // Pre-render a screen-and-a-half ahead/behind so fast scrolls don't
        // expose blank gaps; balance against memory on large libraries.
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        removeClippedSubviews
      />

      <ActionSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort torrents"
        actions={SORT_OPTIONS.map<ActionSheetAction>((opt) => ({
          label: opt.label,
          icon:
            sort === opt.key ? (
              <Icon icon={Check} size={18} color="#3b82f6" />
            ) : (
              <Icon icon={ArrowUpDown} size={18} color="#71717a" />
            ),
          onPress: () => setSort(opt.key),
        }))}
      />

      <SpeedLimitsSheet
        visible={speedLimitsOpen}
        onClose={() => setSpeedLimitsOpen(false)}
      />
    </SafeAreaView>
  );
}

function SelectionBar({
  count,
  onCancel,
  onPause,
  onResume,
  onDelete,
  busy,
}: {
  count: number;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center justify-between mt-2 mb-3">
        <Pressable onPress={onCancel} className="p-2 active:opacity-70" hitSlop={8}>
          <Text className="text-primary text-base">Cancel</Text>
        </Pressable>
        <Text className="text-zinc-100 text-base font-semibold">
          {count} selected
        </Text>
        <View className="w-16" />
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

function TorrentListItem({
  torrent,
  onPress,
  onLongPress,
  selectionMode,
  isSelected,
  onTogglePause,
  onDelete,
  busy,
}: {
  torrent: QBTorrent;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onTogglePause: (torrent: QBTorrent) => void;
  onDelete: (torrent: QBTorrent, deleteFiles: boolean) => void;
  busy: boolean;
}) {
  const isPaused = isTorrentPaused(torrent.state);
  const badgeVariant = getTorrentBadgeVariant(torrent.state);

  const handleDelete = () => {
    Alert.alert("Delete Torrent", `Delete "${truncateText(torrent.name, 30)}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(torrent, false),
      },
      {
        text: "Delete + Files",
        style: "destructive",
        onPress: () => onDelete(torrent, true),
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
              <Icon icon={CheckCircle2} size={18} color="#3b82f6" />
            ) : (
              <Icon icon={Circle} size={18} color="#71717a" />
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
              onPress={() => onTogglePause(torrent)}
              disabled={busy}
              className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              {isPaused ? (
                <Icon icon={Play} size={16} color="#3b82f6" />
              ) : (
                <Icon icon={Pause} size={16} color="#f59e0b" />
              )}
            </Pressable>
            <Pressable
              onPress={handleDelete}
              disabled={busy}
              className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              <Icon icon={Trash2} size={16} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}
