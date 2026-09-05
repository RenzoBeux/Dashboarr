import { useMemo, useState } from "react";
import { View, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  ScreenWrapper,
  useScreenBottomPadding,
} from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { PosterCard } from "@/components/overseerr/poster-card";
import { MediaDetailModal } from "@/components/overseerr/media-detail-modal";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useOverseerrDiscoverList } from "@/hooks/use-overseerr";
import type { DiscoverCollectionKind } from "@/lib/overseerr-discover";
import type { OverseerrMediaResult, OverseerrMediaType } from "@/lib/types";

function isDiscoverKind(value: string | undefined): value is DiscoverCollectionKind {
  return value === "network" || value === "studio" || value === "genre";
}

// Paginated grid of everything in a network / studio / genre, reached by
// tapping a tile on the Seerr Discover tab. Hosts its own MediaDetailModal so
// the existing request flow works here (the modal is screen-scoped). Opening
// it only flips `selected` state and closing only clears it — no chained modal
// at open time and no navigation on close — so the iOS modal-sequencing rules
// (CLAUDE.md / issue #83) don't apply.
export default function DiscoverListScreen() {
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    title?: string;
    mediaType?: string;
  }>();

  const kind = params.kind;
  const idNum = Number(params.id);
  const mediaType: OverseerrMediaType = params.mediaType === "tv" ? "tv" : "movie";
  const title = typeof params.title === "string" && params.title ? params.title : "Discover";
  const valid = isDiscoverKind(kind) && Number.isFinite(idNum) && idNum > 0;

  const { width: cellWidth, columns, gap } = usePosterCellLayout();
  const paddingBottom = useScreenBottomPadding();
  const [selected, setSelected] = useState<OverseerrMediaResult | null>(null);

  const query = useOverseerrDiscoverList(
    isDiscoverKind(kind) ? kind : "network",
    valid ? idNum : 0,
    mediaType,
  );

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data],
  );

  const emptyComponent = useMemo(() => {
    if (query.isLoading) {
      return (
        <View className="flex-row flex-wrap" style={{ gap }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={{ width: cellWidth }}>
              <Skeleton width="100%" height={Math.round(cellWidth * 1.5)} borderRadius={12} />
              <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
            </View>
          ))}
        </View>
      );
    }
    if (query.isError) {
      return <ErrorBanner error={query.error} title="Failed to load titles" />;
    }
    return <EmptyState title="Nothing here" message="No titles to show." />;
  }, [query.isLoading, query.isError, query.error, cellWidth, gap]);

  if (!valid) {
    return (
      <ScreenWrapper scrollable={false}>
        <BackHeader title={title} />
        <EmptyState title="Invalid link" message="This discover collection couldn't be opened." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable={false}>
      {/* Fixed header — only the grid below scrolls. */}
      <BackHeader title={title} />

      <FlatList
        // Fill the space under the fixed header so the list owns the scroll.
        style={{ flex: 1 }}
        // numColumns cannot change at runtime without a remount.
        key={columns}
        data={items}
        keyExtractor={(item) => `${item.mediaType}-${item.id}`}
        renderItem={({ item }) => (
          <PosterCard item={item} onPress={setSelected} size="sm" widthOverride={cellWidth} />
        )}
        numColumns={columns}
        columnWrapperStyle={{ gap, marginBottom: gap }}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View className="py-6 items-center">
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom }}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />

      <MediaDetailModal
        item={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />
    </ScreenWrapper>
  );
}
