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
import { useUiScale, BASE_REM } from "@/hooks/use-ui-scale";
import { fitTagBadges } from "@/lib/library-tags";
import { BAR_TRACK_COLOR } from "@/lib/arr-poster-status";
import type { ServiceId } from "@/lib/constants";

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

export type MonitorFilter = "monitored" | "unmonitored" | "missing" | "all";

export const MONITOR_FILTER_OPTIONS: { value: MonitorFilter; label: string }[] = [
  { value: "monitored", label: "Monitored" },
  { value: "unmonitored", label: "Unmonitored" },
  { value: "missing", label: "Missing" },
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
  /**
   * Predicate for the "Missing" filter — released/aired but not downloaded
   * (issue #265). Injected per screen since the check reads service-specific
   * fields the generic item type doesn't know (hasFile / episode counts).
   */
  isMissing: (item: T) => boolean;
  /**
   * Additional screen-level predicate ANDed with the monitor filter (e.g. the
   * TV library's series-status filter). Pass undefined when inactive so the
   * empty state can tell "library is empty" from "nothing matches filters".
   */
  extraFilter?: (item: T) => boolean;
  sort: S;
  compare: (a: T, b: T, sort: S) => number;
  // Widened from the three *arr literals so Bindery can reuse the grid. Its
  // items carry a single imageUrl string rather than an images[] array, so the
  // Books screen projects one into the shape below before passing it in.
  serviceId: ServiceId;
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
   * Tag labels for the badge row under the footer (issue #343). Return an empty
   * array — ideally a shared one, which `tagLabelResolver` does — for an
   * untagged item; the tile then renders exactly as it did before this prop
   * existed, with no reserved row. Optional because Lidarr albums and both
   * Bindery grids have no tag concept at all.
   */
  renderTags?: (item: T) => string[];
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
  isMissing,
  extraFilter,
  sort,
  compare,
  serviceId,
  placeholderIcon,
  nounPlural,
  posterCoverType = "poster",
  renderFooter,
  renderTags,
  posterStatus,
  onItemPress,
  onItemLongPress,
  ListHeaderComponent,
  refreshControl,
  contentContainerStyle,
}: MonitoredLibraryGridProps<T, S>) {
  const { width: cellWidth, columns, gap } = usePosterCellLayout();

  const sorted = useMemo(() => {
    // Guard against a non-array slipping through (e.g. an auth-proxy HTML page
    // returned in place of JSON): a truthy string would reach .filter and crash
    // with "undefined is not a function". serviceRequest now throws on that, but
    // keep the call site itself safe against any non-array data.
    if (!Array.isArray(data)) return [];
    const filtered = data.filter((item) => {
      if (extraFilter && !extraFilter(item)) return false;
      if (monitorFilter === "monitored") return item.monitored;
      if (monitorFilter === "unmonitored") return !item.monitored;
      if (monitorFilter === "missing") return isMissing(item);
      return true;
    });
    return [...filtered].sort((a, b) => compare(a, b, sort));
  }, [data, monitorFilter, isMissing, extraFilter, sort, compare]);

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
    const title = extraFilter
      ? `No ${nounPlural} match filters`
      : monitorFilter === "monitored"
        ? `No monitored ${nounPlural}`
        : monitorFilter === "unmonitored"
          ? `No unmonitored ${nounPlural}`
          : monitorFilter === "missing"
            ? `No missing ${nounPlural}`
            : `No ${nounPlural} in library`;
    return (
      <EmptyState
        icon={<Icon icon={placeholderIcon} size={32} color="#71717a" />}
        title={title}
      />
    );
  }, [isLoading, error, data, nounPlural, monitorFilter, extraFilter, placeholderIcon, cellWidth, gap]);

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
          tags={renderTags?.(item)}
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
  tags,
  status,
  onPress,
  onLongPress,
}: {
  item: T;
  serviceId: ServiceId;
  posterCoverType: string;
  placeholderIcon: LucideIcon;
  footer: string;
  tags?: string[];
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
      {tags?.length ? <PosterTagBadges tags={tags} cellWidth={cellWidth} /> : null}
    </Pressable>
  );
}

/**
 * Tag chips under the poster footer (issue #343). Only rendered for an item
 * that has tags, so an untagged tile is byte-identical to before — no reserved
 * row, no layout shift.
 *
 * How many chips fit is decided by `fitTagBadges` rather than measured: an
 * onLayout round-trip per cell inside a virtualized FlatList would cost two
 * passes and re-measure on every recycle. The estimate errs wide, and `shrink`
 * is what catches the cases no character average can model.
 */
function PosterTagBadges({ tags, cellWidth }: { tags: string[]; cellWidth: number }) {
  const remPx = BASE_REM * useUiScale();
  // Deliberately not memoized: `tags` is a fresh array on most renders, so a
  // useMemo would pay a deps comparison and recompute anyway. The work is a few
  // dozen character reads — noise next to the expo-image load in the same cell.
  const { shown, overflow } = fitTagBadges(tags, cellWidth, remPx);

  return (
    <View
      className="flex-row items-center gap-1 mt-1 overflow-hidden"
      accessibilityLabel={`Tags: ${tags.join(", ")}`}
    >
      {shown.map((label, i) => (
        // `shrink` is load-bearing: React Native defaults flexShrink to 0, so
        // without it an under-estimated badge spills past the cell and gets
        // clipped mid-glyph instead of ellipsizing. Keep px-1.5 / gap-1 /
        // text-[0.65rem] in sync with TAG_BADGE_REM in lib/library-tags.ts.
        // Same blue as the detail screens' <Badge variant="info"> tag chips.
        <View
          // Index in the key: *arr enforces unique tag labels, but the ids come
          // off the wire and a duplicated one would otherwise collide here.
          key={`${i}-${label}`}
          className="shrink rounded-full bg-blue-600 px-1.5 py-0.5"
        >
          <Text className="text-white text-[0.65rem] font-medium" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
      {overflow > 0 ? (
        // shrink-0: the count must never ellipsize into "+…". Neutral rather
        // than blue so it reads as a count, not as a tag literally named "+2".
        <View className="shrink-0 rounded-full bg-zinc-700 px-1.5 py-0.5">
          <Text className="text-white text-[0.65rem] font-medium">{`+${overflow}`}</Text>
        </View>
      ) : null}
    </View>
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
