import { View, ScrollView } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import {
  POSTER_TILE_WIDTH,
  POSTER_TILE_HEIGHT,
} from "@/components/dashboard/media-poster-tile";

interface PosterSkeletonRowProps {
  count?: number;
  width?: number;
  height?: number;
  showSubtitle?: boolean;
}

export function PosterSkeletonRow({
  count = 4,
  width = POSTER_TILE_WIDTH,
  height = POSTER_TILE_HEIGHT,
  showSubtitle = false,
}: PosterSkeletonRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width }}>
          <Skeleton width={width} height={height} borderRadius={12} />
          <View className="mt-2">
            <Skeleton width={Math.min(90, width - 20)} height={12} borderRadius={4} />
          </View>
          {showSubtitle && (
            <View className="mt-1">
              <Skeleton
                width={Math.min(60, width - 40)}
                height={10}
                borderRadius={4}
              />
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
