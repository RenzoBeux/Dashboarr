import { useState, useCallback, useContext, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  BackHandler,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { toast, toastError } from "@/components/ui/toast";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Pause,
  Play,
  Trash2,
  Plus,
  Tag,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceHeader } from "@/components/common/service-header";
import { DemoBanner } from "@/components/common/demo-banner";
import { useRefreshSpinner } from "@/components/common/pull-to-refresh";
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
import { CategorySheet } from "@/components/qbittorrent/category-sheet";
import { errorHaptic, mediumHaptic } from "@/lib/haptics";
import { HAS_GLASS_TAB_BAR } from "@/lib/glass";
import { useScreenSafeAreaEdges } from "@/components/common/screen-wrapper";
import {
  useSortStore,
  SORT_DEFAULTS,
  type DownloadsSortKey,
} from "@/store/sort-store";
import { useMultiSelect } from "@/hooks/use-multi-select";
import { useServiceHealth } from "@/hooks/use-service-health";
import {
  formatSpeed,
  formatEta,
  formatBytes,
  truncateText,
  magnetDisplayName,
} from "@/lib/utils";
import {
  torrentBadgeVariant,
  type TorrentAdapter,
  type TorrentFilterType,
  type UnifiedTorrent,
} from "@/lib/torrent-adapter";
import { useAppTheme } from "@/hooks/use-app-theme";

const FILTER_OPTIONS: { key: TorrentFilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "downloading", label: "Downloading" },
  { key: "seeding", label: "Seeding" },
  { key: "completed", label: "Done" },
  { key: "paused", label: "Paused" },
];

// Sentinel for the category filter's "all" choice. qBittorrent treats an
// omitted `category` param as all and an empty string as uncategorized, so we
// can't reuse "" for "all" — this maps to "omit the param" before the request.
const ALL_CATEGORIES = "__all__";

const SORT_OPTIONS: { key: DownloadsSortKey; label: string }[] = [
  { key: "progress-desc", label: "Progress: High → Low" },
  { key: "progress-asc", label: "Progress: Low → High" },
  { key: "name-asc", label: "Name: A → Z" },
  { key: "size-desc", label: "Size: Large → Small" },
  { key: "added-desc", label: "Added: Newest First" },
];

// Caveat shown on rtorrent "Delete + Files" — rtorrent only removes data when
// ruTorrent's erasedata plugin is installed (capabilities.deleteWithDataCaveat).
const DELETE_DATA_CAVEAT = "Files removed only if ruTorrent's erasedata plugin is installed";

interface ViewProps {
  adapter: TorrentAdapter;
  showHeader?: boolean;
  segmentedControl?: React.ReactNode;
  // Magnet URI from the OS-level magnet: handler (app/+native-intent.ts →
  // downloads.tsx). Prefills and opens the add card; the parent clears it via
  // onMagnetConsumed once the torrent is added or the card is dismissed.
  incomingMagnet?: string;
  onMagnetConsumed?: () => void;
}

// Shared downloads view for every torrent client. Driven entirely by the
// adapter + capability flags. Keeps qBittorrent's virtualized FlatList +
// server-side pagination structure (torrent libraries can be large), with the
// list hook abstracting server-vs-client pagination (see TorrentListResult).
export function TorrentDownloadsView({
  adapter,
  showHeader = true,
  segmentedControl,
  incomingMagnet,
  onMagnetConsumed,
}: ViewProps) {
  const [filter, setFilter] = useState<TorrentFilterType>("all");
  const theme = useAppTheme();
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const sort = useSortStore((s) => s.downloads);
  const setSort = useSortStore((s) => s.setDownloads);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  const [bulkDelete, setBulkDelete] = useState<{ count: number } | null>(null);
  const [categoryBulkOpen, setCategoryBulkOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [magnetUri, setMagnetUri] = useState("");

  // Runs on mount too (segment switches remount this view per client), so a
  // pending magnet re-prefills whichever client the user lands on.
  useEffect(() => {
    if (!incomingMagnet) return;
    setMagnetUri(incomingMagnet);
    setShowAddModal(true);
  }, [incomingMagnet]);

  // "all" sentinel → omit the param entirely (qBittorrent reads no param as
  // "all categories"); "" stays "" so it maps to uncategorized.
  const categoryParam = category === ALL_CATEGORIES ? undefined : category;
  const {
    torrents,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = adapter.useTorrents({ filter, sort, category: categoryParam });
  const categories = adapter.useCategories();
  const statsResult = adapter.useGlobalStats();
  const stats = statsResult.data;
  const { data: healthData } = useServiceHealth();
  const addTorrent = adapter.useAddTorrent();
  const pauseMutation = adapter.usePauseTorrent();
  const resumeMutation = adapter.useResumeTorrent();
  const deleteMutation = adapter.useDeleteTorrent();
  const setCategoryMutation = adapter.useSetCategory();
  const router = useRouter();

  const caveat = adapter.capabilities.deleteWithDataCaveat ?? false;
  const SpeedLimitsControl = adapter.SpeedLimitsControl;

  // Extra list padding so the last item clears the floating glass tab bar
  // (iOS 26+), which content scrolls behind. Otherwise the bar sits below the
  // scene, so only breathing room (24) is needed and the bottom safe-area edge
  // is dropped via useScreenSafeAreaEdges (the bar owns that inset — #212).
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const usesFloatingTabBar = HAS_GLASS_TAB_BAR && tabBarHeight !== undefined;
  const safeAreaEdges = useScreenSafeAreaEdges();
  const listBottomPadding = 24 + (usesFloatingTabBar ? tabBarHeight : 0);

  // Hand-rolled refresh (custom qBittorrent refetch instead of a query-key
  // invalidate) routed through the shared spinner primitive so it gets the
  // same bounded-wait, minimum-spin, and iOS focus/blur reset as every other
  // screen — that's what keeps the native control from sticking (#147).
  const doRefresh = useCallback(async () => {
    await refetch();
    await statsResult.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, statsResult.refetch]);
  const { refreshing, onRefresh } = useRefreshSpinner(doRefresh);

  // Only the rows whose hashes are actually in-flight should disable —
  // mutating one torrent shouldn't gray out every other row's buttons.
  const busyHashes = new Set<string>([
    ...(pauseMutation.isPending ? pauseMutation.variables ?? [] : []),
    ...(resumeMutation.isPending ? resumeMutation.variables ?? [] : []),
    ...(deleteMutation.isPending ? deleteMutation.variables?.hashes ?? [] : []),
  ]);

  const multiSelect = useMultiSelect<UnifiedTorrent>((t) => t.hash);

  // Selection refers to specific torrent hashes; if the active filter or
  // category changes those hashes may no longer be in the loaded set, so drop
  // the selection.
  useEffect(() => {
    if (multiSelect.isActive) multiSelect.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, category]);

  const serviceHealth = healthData?.find((s) => s.id === adapter.serviceId);

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

  // Torrent name from the magnet's `dn` param, shown above the input so the
  // user sees what they're adding (covers pasted and incoming magnets alike).
  const magnetName = magnetDisplayName(magnetUri.trim());

  const handleAdd = () => {
    if (!magnetUri.trim()) return;
    addTorrent.mutate(
      { uri: magnetUri.trim() },
      {
        onSuccess: () => {
          setMagnetUri("");
          setShowAddModal(false);
          onMagnetConsumed?.();
          toast("Torrent added");
        },
        onError: (err) => toastError("Failed to add torrent", err),
      },
    );
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
    setBulkDelete({ count: hashes.length });
  };

  const runBulkDelete = (deleteFiles: boolean) => {
    const hashes = selectedHashes();
    if (hashes.length === 0) return;
    errorHaptic();
    deleteMutation.mutate({ hashes, deleteFiles });
    multiSelect.clear();
  };

  const handleBulkCategory = () => {
    if (selectedHashes().length === 0) return;
    setCategoryBulkOpen(true);
  };

  const runBulkCategory = (category: string) => {
    const hashes = selectedHashes();
    if (hashes.length === 0) return;
    setCategoryMutation.mutate(
      { hashes, category },
      {
        onSuccess: () => {
          toast("Category updated", "success");
          multiSelect.clear();
          setCategoryBulkOpen(false);
        },
        onError: (err) => toastError("Failed to set category", err),
      },
    );
  };

  const handleTorrentPress = (torrent: UnifiedTorrent) => {
    if (multiSelect.isActive) {
      multiSelect.toggle(torrent);
    } else if (adapter.capabilities.perTorrentFiles) {
      router.push(adapter.detailRoute(torrent.hash));
    }
  };

  const handleTorrentLongPress = (torrent: UnifiedTorrent) => {
    if (multiSelect.isActive) return;
    mediumHaptic();
    multiSelect.enter(torrent);
  };

  const bulkBusy =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    deleteMutation.isPending ||
    setCategoryMutation.isPending;

  // Category filter is qBittorrent-only and only worth showing once the server
  // actually has categories defined.
  const showCategoryFilter =
    adapter.capabilities.categories && categories.length > 0;
  const categoryLabelFor = (c: string) =>
    c === ALL_CATEGORIES ? "All categories" : c === "" ? "Uncategorized" : c;
  const categorySections = showCategoryFilter
    ? [
        {
          label: "Category",
          options: [
            { key: ALL_CATEGORIES, label: "All categories" },
            { key: "", label: "Uncategorized" },
            ...categories.map((c) => ({ key: c, label: c })),
          ],
          value: category,
          onChange: setCategory,
        },
      ]
    : undefined;

  const categoryActive = showCategoryFilter && category !== ALL_CATEGORIES;
  const filterSummary = [
    FILTER_OPTIONS.find((f) => f.key === filter)?.label ?? "",
    categoryActive ? categoryLabelFor(category) : null,
    SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  const filterActive =
    filter !== "all" || sort !== SORT_DEFAULTS.downloads || categoryActive;

  const header = multiSelect.isActive ? (
    <SelectionBar
      count={multiSelect.count}
      onCancel={multiSelect.clear}
      onPause={handleBulkPause}
      onResume={handleBulkResume}
      onDelete={handleBulkDelete}
      onCategory={showCategoryFilter ? handleBulkCategory : undefined}
      busy={bulkBusy}
    />
  ) : (
    <>
      {segmentedControl}
      {showHeader && (
        <ServiceHeader
          name="Downloads"
          online={serviceHealth?.online}
          serviceId={adapter.serviceId}
        />
      )}

      {/* Speed Summary */}
      {stats && (
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-blue-600/10 rounded-xl p-3">
            <Text className="text-download text-lg font-bold">
              ↓ {formatSpeed(stats.dlSpeed)}
            </Text>
          </View>
          <View className="flex-1 bg-green-600/10 rounded-xl p-3">
            <Text className="text-upload text-lg font-bold">
              ↑ {formatSpeed(stats.upSpeed)}
            </Text>
          </View>
          {adapter.capabilities.globalSpeedLimits && SpeedLimitsControl ? (
            <SpeedLimitsControl />
          ) : null}
        </View>
      )}

      {/* Add Torrent */}
      {showAddModal ? (
        <Card className="mb-4 gap-3">
          {magnetName ? (
            <Text className="text-zinc-100 text-sm font-semibold" numberOfLines={2}>
              {magnetName}
            </Text>
          ) : null}
          <TextInput
            placeholder="Paste magnet link..."
            value={magnetUri}
            onChangeText={setMagnetUri}
            // Incoming magnets arrive prefilled — popping the keyboard would
            // just cover the Add button.
            autoFocus={!incomingMagnet}
          />
          <View className="flex-row gap-2">
            <Button
              label="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => {
                setShowAddModal(false);
                setMagnetUri("");
                onMagnetConsumed?.();
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

      <View className="mb-4">
        <FilterSortButton
          summary={filterSummary}
          onPress={() => setFilterSortOpen(true)}
          active={filterActive}
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
            caveat={caveat}
            selectionMode={multiSelect.isActive}
            isSelected={multiSelect.isSelected(item)}
            onPress={() => handleTorrentPress(item)}
            onLongPress={() => handleTorrentLongPress(item)}
            onTogglePause={(t) => {
              if (t.status === "paused") {
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
            progressBackgroundColor={theme.surface}
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

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort torrents"
        filterOptions={FILTER_OPTIONS}
        filterValue={filter}
        onFilterChange={setFilter}
        extraSections={categorySections}
        sortOptions={SORT_OPTIONS}
        sortValue={sort}
        onSortChange={setSort}
      />

      <ActionSheet
        visible={bulkDelete !== null}
        onClose={() => setBulkDelete(null)}
        title="Delete torrents"
        subtitle={
          bulkDelete
            ? caveat
              ? `${bulkDelete.count} selected · ${DELETE_DATA_CAVEAT}`
              : `${bulkDelete.count} selected`
            : ""
        }
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

      <CategorySheet
        visible={categoryBulkOpen}
        onClose={() => setCategoryBulkOpen(false)}
        categories={categories}
        current=""
        saving={setCategoryMutation.isPending}
        subtitle={`${multiSelect.count} selected`}
        onSave={runBulkCategory}
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
  onCategory,
  busy,
}: {
  count: number;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  // Bulk set-category — only provided when the client supports categories
  // (qBittorrent). Undefined hides the button.
  onCategory?: () => void;
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
      {/* Horizontal scroll so the action buttons don't clip when categories add
          a 4th button or at higher uiScale (see CLAUDE.md chip-row rule). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        <Button
          label="Pause"
          variant="outline"
          size="sm"
          onPress={onPause}
          disabled={busy || count === 0}
          icon={<Icon icon={Pause} size={14} color="#f59e0b" />}
          className="min-w-[6rem]"
        />
        <Button
          label="Resume"
          variant="outline"
          size="sm"
          onPress={onResume}
          disabled={busy || count === 0}
          icon={<Icon icon={Play} size={14} color="#3b82f6" />}
          className="min-w-[6rem]"
        />
        {onCategory ? (
          <Button
            label="Category"
            variant="outline"
            size="sm"
            onPress={onCategory}
            disabled={busy || count === 0}
            icon={<Icon icon={Tag} size={14} color="#a1a1aa" />}
            className="min-w-[6rem]"
          />
        ) : null}
        <Button
          label="Delete"
          variant="danger"
          size="sm"
          onPress={onDelete}
          disabled={busy || count === 0}
          icon={<Icon icon={Trash2} size={14} color="white" />}
          className="min-w-[6rem]"
        />
      </ScrollView>
    </View>
  );
}

function TorrentListItem({
  torrent,
  caveat,
  onPress,
  onLongPress,
  selectionMode,
  isSelected,
  onTogglePause,
  onDelete,
  busy,
}: {
  torrent: UnifiedTorrent;
  caveat: boolean;
  onPress: () => void;
  onLongPress: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onTogglePause: (torrent: UnifiedTorrent) => void;
  onDelete: (torrent: UnifiedTorrent, deleteFiles: boolean) => void;
  busy: boolean;
}) {
  const isPaused = torrent.status === "paused";
  const badgeVariant = torrent.badgeVariant ?? torrentBadgeVariant(torrent.status);

  const [deleteOpen, setDeleteOpen] = useState(false);

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
        <Badge label={torrent.statusLabel} variant={badgeVariant} />
      </View>

      {/* Category (qBittorrent) / label (rtorrent) pill — only when set. */}
      {torrent.label ? (
        <View className="flex-row items-center gap-1 self-start max-w-full bg-surface-light rounded-full px-2 py-0.5 mb-1">
          <Icon icon={Tag} size={12} color="#a1a1aa" />
          <Text className="text-zinc-400 text-xs shrink" numberOfLines={1}>
            {torrent.label}
          </Text>
        </View>
      ) : null}

      <ProgressBar progress={torrent.progress} showLabel className="my-2" />

      <View className="flex-row items-center justify-between">
        <View className="flex-row gap-3">
          <Text className="text-zinc-500 text-xs">
            {formatBytes(torrent.sizeBytes)}
          </Text>
          {torrent.dlSpeed > 0 && (
            <Text className="text-zinc-500 text-xs">
              ↓ {formatSpeed(torrent.dlSpeed)}
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
              onPress={() => setDeleteOpen(true)}
              disabled={busy}
              className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
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
        title="Delete torrent"
        subtitle={
          caveat
            ? `${truncateText(torrent.name, 40)} · ${DELETE_DATA_CAVEAT}`
            : truncateText(torrent.name, 40)
        }
        actions={[
          {
            label: "Delete",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => onDelete(torrent, false),
          },
          {
            label: "Delete + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => onDelete(torrent, true),
          },
        ]}
      />
    </Card>
  );
}
