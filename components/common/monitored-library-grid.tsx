import { useMemo } from "react";
import type { RefreshControlProps, StyleProp, ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LibraryCollection,
  LibraryPosterTile,
  type PosterStatus,
} from "@/components/common/library-collection";
import { useServiceImage } from "@/hooks/use-service-image";
import type { LibraryViewMode } from "@/store/library-view-store";
import type { ServiceId } from "@/lib/constants";

// Moved to library-collection with the poster tile; re-exported for the
// screens that compute it.
export type { PosterStatus } from "@/components/common/library-collection";

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
  /** Undefined until the first load (an error then shows instead of the list). */
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
  /**
   * List mode (the shared library toolbar's view switch) renders rows from
   * `renderRow` instead of posters. Defaults to the poster grid.
   */
  mode?: LibraryViewMode;
  renderRow?: (item: T) => React.ReactElement;
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
  mode = "poster",
  renderRow,
}: MonitoredLibraryGridProps<T, S>) {
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

  const emptyTitle = !data?.length
    ? `No ${nounPlural} in library`
    : extraFilter
      ? `No ${nounPlural} match filters`
      : monitorFilter === "monitored"
        ? `No monitored ${nounPlural}`
        : monitorFilter === "unmonitored"
          ? `No unmonitored ${nounPlural}`
          : monitorFilter === "missing"
            ? `No missing ${nounPlural}`
            : `No ${nounPlural} in library`;

  return (
    <LibraryCollection
      mode={renderRow ? mode : "poster"}
      data={sorted}
      keyOf={(item) => String(item.id)}
      renderRow={renderRow}
      renderCell={(item, width) => (
        <MonitoredPoster
          item={item}
          width={width}
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
      isLoading={isLoading}
      // Only a failed first load: after a failed refetch the library still
      // shows, and a filter matching nothing keeps its empty state.
      error={data ? null : error}
      empty={
        <EmptyState
          icon={<Icon icon={placeholderIcon} size={32} color="#71717a" />}
          title={emptyTitle}
        />
      }
      ListHeaderComponent={ListHeaderComponent}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

function MonitoredPoster<T extends MonitoredItem>({
  item,
  width,
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
  width: number;
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
  return (
    <LibraryPosterTile
      width={width}
      src={src}
      onImageError={onError}
      placeholderIcon={placeholderIcon}
      title={item.title}
      footer={footer}
      tags={tags}
      status={status}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}
