import { useMemo } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { PlexPosterCell } from "@/components/plex/plex-poster-cell";
import { usePlexLibraries, usePlexLibraryContents } from "@/hooks/use-plex";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useUiScale } from "@/hooks/use-ui-scale";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeColor } from "@/hooks/use-theme-color";

export default function PlexLibraryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const sectionKey = String(key ?? "");
  const theme = useAppTheme();
  const tc = useThemeColor();
  const uiScale = useUiScale();
  const bottomPadding = useScreenBottomPadding();
  const { width: cellWidth, columns, gap } = usePosterCellLayout();
  const { refreshing, onRefresh } = usePullToRefresh([["plex"]]);

  // The section list is already cached from the Libraries tab, so the title
  // shows immediately without passing it through the route.
  const { data: libraries } = usePlexLibraries();
  const library = libraries?.find((lib) => lib.key === sectionKey);

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = usePlexLibraryContents(sectionKey);

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const totalSize = data?.pages[0]?.totalSize;

  const header = (
    <>
      <BackHeader title={library?.title ?? "Library"} />
      {error ? <ErrorBanner error={error} title="Failed to load library" className="mb-4" /> : null}
      {totalSize !== undefined && totalSize > 0 ? (
        <Text className="text-zinc-500 text-xs mb-3 ml-1">
          {totalSize} {totalSize === 1 ? "item" : "items"}
        </Text>
      ) : null}
    </>
  );

  const empty = isLoading ? (
    <View className="flex-row flex-wrap" style={{ gap }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={{ width: cellWidth }}>
          <Skeleton width="100%" height={150} borderRadius={12} />
          <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
        </View>
      ))}
    </View>
  ) : error ? null : (
    <EmptyState title="This library is empty" />
  );

  return (
    <ScreenWrapper scrollable={false}>
      <FlatList
        // numColumns cannot change at runtime without a remount.
        key={columns}
        data={items}
        keyExtractor={(item) => item.ratingKey}
        renderItem={({ item }) => <PlexPosterCell item={item} />}
        numColumns={columns}
        columnWrapperStyle={{ gap, marginBottom: gap }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ paddingVertical: 16 }} color={tc("#a1a1aa")} />
          ) : null
        }
        // isFetching, not isFetchingNextPage: fetchNextPage cancels an
        // in-flight refetch, which would mix stale and fresh pages.
        onEndReached={() => {
          if (hasNextPage && !isFetching) void fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
            progressBackgroundColor={theme.surface}
          />
        }
        contentContainerStyle={{ paddingTop: 7 * uiScale, paddingBottom: bottomPadding }}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </ScreenWrapper>
  );
}
