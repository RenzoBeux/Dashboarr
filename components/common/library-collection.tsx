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
import { Icon } from "@/components/ui/icon";
import { ErrorBanner } from "@/components/common/error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useUiScale, BASE_REM } from "@/hooks/use-ui-scale";
import { fitTagBadges } from "@/lib/library-tags";
import { BAR_TRACK_COLOR } from "@/lib/arr-poster-status";
import type { LibraryViewMode } from "@/store/library-view-store";

/**
 * A library screen's scroll container, as list rows or a poster grid:
 * one virtualized FlatList with the screen header scrolling along, pull to
 * refresh, a loading skeleton, an error banner and an empty state. Items,
 * filtering and the cells themselves come from the caller.
 *
 * Shared by the Radarr/Sonarr/Lidarr/Bindery poster grids (through
 * MonitoredLibraryGrid) and the Bazarr library.
 */
export function LibraryCollection<T>({
  mode,
  data,
  keyOf,
  renderRow,
  renderCell,
  isLoading,
  error,
  errorTitle = "Failed to load library",
  empty,
  ListHeaderComponent,
  refreshControl,
  contentContainerStyle,
}: {
  mode: LibraryViewMode;
  data: readonly T[];
  keyOf: (item: T) => string;
  // List mode row. Required when mode can be "list".
  renderRow?: (item: T) => React.ReactElement;
  // Poster mode cell, given the cell width to size itself with.
  renderCell?: (item: T, cellWidth: number) => React.ReactElement;
  isLoading: boolean;
  error: Error | null;
  errorTitle?: string;
  // Shown when there is nothing to list (and not loading or failed).
  empty: React.ReactElement;
  // Rendered above the items inside the list, so it scrolls with them.
  ListHeaderComponent?: React.ReactElement | null;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  // Screen padding (horizontal + bottom) when this is the scroll container.
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const { width: cellWidth, columns, gap } = usePosterCellLayout();
  const poster = mode === "poster";

  const emptyComponent = isLoading ? (
    poster ? (
      <View className="flex-row flex-wrap" style={{ gap }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={{ width: cellWidth }}>
            <Skeleton width="100%" height={150} borderRadius={12} />
            <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
          </View>
        ))}
      </View>
    ) : (
      <View className="gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={84} borderRadius={16} />
        ))}
      </View>
    )
  ) : error ? (
    <ErrorBanner error={error} title={errorTitle} />
  ) : (
    empty
  );

  return (
    <FlatList
      // numColumns cannot change at runtime without a remount.
      key={poster ? `poster-${columns}` : "list"}
      data={data as T[]}
      keyExtractor={keyOf}
      renderItem={({ item }) =>
        poster ? renderCell!(item, cellWidth) : renderRow!(item)
      }
      numColumns={poster ? columns : 1}
      columnWrapperStyle={poster ? { gap, marginBottom: gap } : undefined}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={emptyComponent}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={5}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
      // The header may hold the search field: taps on buttons and items must
      // land while the keyboard is up instead of only dismissing it.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

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

/**
 * One poster cell: 2:3 artwork (or a placeholder icon), optional status bar
 * and corner ribbon, an optional overlay over the artwork's bottom (the
 * Bazarr library's language lines), title, footer and tag badges.
 */
export function LibraryPosterTile({
  width,
  src,
  onImageError,
  placeholderIcon,
  title,
  footer,
  tags,
  status,
  overlay,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  width: number;
  src?: string;
  onImageError?: (e?: { error?: string }) => void;
  placeholderIcon: React.ComponentType<any>;
  title: string;
  footer?: string;
  tags?: string[];
  status?: PosterStatus;
  overlay?: React.ReactNode;
  // Omitted: the tile isn't interactive (nothing to open).
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      disabled={!onPress && !onLongPress}
      style={{ width }}
      className={onPress ? "active:opacity-80" : ""}
      accessibilityRole={onPress ? "button" : undefined}
      // A label replaces the grouped child text, so the default keeps what a
      // screen reader read before the tile was shared: footer and tags too.
      accessibilityLabel={accessibilityLabel ?? [title, footer, ...(tags ?? [])].filter(Boolean).join(", ")}
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
            onError={onImageError}
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <Icon icon={placeholderIcon} size={24} color="#71717a" />
          </View>
        )}
        {status?.cornerColor ? <PosterCornerTriangle color={status.cornerColor} /> : null}
        {overlay}
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
        {title}
      </Text>
      {footer ? <Text className="text-zinc-600 text-xs">{footer}</Text> : null}
      {tags?.length ? <PosterTagBadges tags={tags} cellWidth={width} /> : null}
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
          <Text className="text-zinc-50 text-[0.65rem] font-medium">{`+${overflow}`}</Text>
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
