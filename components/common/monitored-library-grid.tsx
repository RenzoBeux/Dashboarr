import { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useServiceImage } from "@/hooks/use-service-image";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useUiScale } from "@/hooks/use-ui-scale";
import { BAR_TRACK_COLOR } from "@/lib/arr-poster-status";

/** Sonarr/Radarr-style poster overlay: bottom status bar + top-right corner triangle. */
export interface PosterStatus {
  barColor: string | null;
  cornerColor: string | null;
  /**
   * Fill percentage (0–100) for the bottom bar. Omitted ⇒ 100 (a solid bar in
   * `barColor`, matching Radarr's hardcoded full poster bar). Sonarr series and
   * Lidarr artists pass a real progress so the bar is a gray track with a
   * `barColor` fill sized to the percentage, like the *arr index posters.
   */
  progress?: number;
}

export type MonitorFilter = "monitored" | "unmonitored" | "all";

export const MONITOR_FILTER_OPTIONS: { value: MonitorFilter; label: string }[] = [
  { value: "monitored", label: "Monitored" },
  { value: "unmonitored", label: "Unmonitored" },
  { value: "all", label: "All" },
];

interface PosterImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

interface MonitoredItem {
  id: number;
  title: string;
  monitored: boolean;
  images: PosterImage[];
}

interface MonitoredLibraryGridProps<T extends MonitoredItem, S extends string> {
  data: T[] | undefined;
  isLoading: boolean;
  error: Error | null;
  monitorFilter: MonitorFilter;
  sort: S;
  compare: (a: T, b: T, sort: S) => number;
  serviceId: "radarr" | "sonarr" | "lidarr";
  placeholderIcon: LucideIcon;
  /** Plural noun used in empty state titles, e.g. "movies" / "shows". */
  nounPlural: string;
  /**
   * Which `coverType` to render as the poster. Radarr movies / Sonarr series /
   * Lidarr artists use "poster"; Lidarr albums use "cover". Defaults to
   * "poster".
   */
  posterCoverType?: string;
  /** Footer line under the poster title (e.g. year or season count). */
  renderFooter: (item: T) => string;
  /**
   * Sonarr/Radarr-style status overlay for each poster (bottom color bar +
   * corner triangle). Computed at the screen level since it needs the download
   * queue. Omit to render plain posters.
   */
  posterStatus?: (item: T) => PosterStatus;
  onItemPress: (item: T) => void;
  onItemLongPress: (item: T) => void;
  /**
   * Rendered above the grid inside the FlatList so it scrolls with the
   * content. Use this for the screen's header (service header, tab chips,
   * filter button) when this grid is the screen's scroll container.
   */
  ListHeaderComponent?: React.ReactElement | null;
  /** Pull-to-refresh; forwarded directly to the underlying FlatList. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /**
   * Extra contentContainerStyle merged on top of the grid's row spacing —
   * use this for screen padding (horizontal + bottom) when this grid is the
   * screen's scroll container.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function MonitoredLibraryGrid<T extends MonitoredItem, S extends string>({
  data,
  isLoading,
  error,
  monitorFilter,
  sort,
  compare,
  serviceId,
  placeholderIcon,
  nounPlural,
  posterCoverType = "poster",
  renderFooter,
  posterStatus,
  onItemPress,
  onItemLongPress,
  ListHeaderComponent,
  refreshControl,
  contentContainerStyle,
}: MonitoredLibraryGridProps<T, S>) {
  const { width: cellWidth, columns, gap } = usePosterCellLayout();

  const sorted = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((item) => {
      if (monitorFilter === "monitored") return item.monitored;
      if (monitorFilter === "unmonitored") return !item.monitored;
      return true;
    });
    return [...filtered].sort((a, b) => compare(a, b, sort));
  }, [data, monitorFilter, sort, compare]);

  const emptyState = useMemo(() => {
    if (isLoading) {
      return (
        <View className="flex-row flex-wrap" style={{ gap }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ width: cellWidth }}>
              <Skeleton width="100%" height={150} borderRadius={12} />
              <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
            </View>
          ))}
        </View>
      );
    }
    if (error) {
      return <ErrorBanner error={error} title="Failed to load library" />;
    }
    if (!data?.length) {
      return (
        <EmptyState
          icon={<Icon icon={placeholderIcon} size={32} color="#71717a" />}
          title={`No ${nounPlural} in library`}
        />
      );
    }
    const title =
      monitorFilter === "monitored"
        ? `No monitored ${nounPlural}`
        : monitorFilter === "unmonitored"
          ? `No unmonitored ${nounPlural}`
          : `No ${nounPlural} in library`;
    return (
      <EmptyState
        icon={<Icon icon={placeholderIcon} size={32} color="#71717a" />}
        title={title}
      />
    );
  }, [isLoading, error, data, nounPlural, monitorFilter, placeholderIcon, cellWidth, gap]);

  return (
    <FlatList
      // numColumns cannot change at runtime without a remount.
      key={columns}
      data={sorted}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <LibraryPoster
          item={item}
          serviceId={serviceId}
          posterCoverType={posterCoverType}
          placeholderIcon={placeholderIcon}
          footer={renderFooter(item)}
          status={posterStatus?.(item)}
          onPress={() => onItemPress(item)}
          onLongPress={() => onItemLongPress(item)}
        />
      )}
      numColumns={columns}
      columnWrapperStyle={{ gap, marginBottom: gap }}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={emptyState}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={5}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

function LibraryPoster<T extends MonitoredItem>({
  item,
  serviceId,
  posterCoverType,
  placeholderIcon,
  footer,
  status,
  onPress,
  onLongPress,
}: {
  item: T;
  serviceId: "radarr" | "sonarr" | "lidarr";
  posterCoverType: string;
  placeholderIcon: LucideIcon;
  footer: string;
  status?: PosterStatus;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const poster = item.images.find((i) => i.coverType === posterCoverType);
  const { src, onError } = useServiceImage(poster, serviceId);
  const { width: cellWidth } = usePosterCellLayout();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{ width: cellWidth }}
      className="active:opacity-80"
    >
      <View className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-light">
        {src ? (
          <Image
            source={{ uri: src }}
            className="w-full h-full"
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={src}
            onError={onError}
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <Icon icon={placeholderIcon} size={24} color="#71717a" />
          </View>
        )}
        {status?.cornerColor ? <PosterCornerTriangle color={status.cornerColor} /> : null}
        {status?.barColor ? (
          // Gray track + a `barColor` fill sized to progress%, mirroring the *arr
          // index posters. progress omitted ⇒ 100% (a solid bar, like Radarr).
          <View
            className="absolute bottom-0 left-0 right-0 h-1.5"
            style={{ backgroundColor: BAR_TRACK_COLOR }}
          >
            <View
              className="absolute left-0 top-0 bottom-0"
              style={{
                backgroundColor: status.barColor,
                width: `${Math.max(0, Math.min(100, status.progress ?? 100))}%`,
              }}
            />
          </View>
        ) : null}
      </View>
      <Text className="text-zinc-300 text-sm mt-1" numberOfLines={1}>
        {item.title}
      </Text>
      <Text className="text-zinc-600 text-xs">{footer}</Text>
    </Pressable>
  );
}

/**
 * Top-right corner triangle, replicating the *arr poster ribbon. Built with the
 * border-trick (a box with two adjacent borders, the others transparent). Size
 * is multiplied by the UI scale so it grows with the accessibility setting.
 */
function PosterCornerTriangle({ color }: { color: string }) {
  const uiScale = useUiScale();
  const size = Math.round(20 * uiScale);
  // Mirrors Sonarr's CSS (border-width: 0 N N 0; right border colored, bottom
  // transparent) → right-angle at the top-right corner.
  return (
    <View
      className="absolute top-0 right-0"
      style={{
        width: 0,
        height: 0,
        borderRightWidth: size,
        borderBottomWidth: size,
        borderRightColor: color,
        borderBottomColor: "transparent",
      }}
    />
  );
}
