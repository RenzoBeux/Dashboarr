import { View, ScrollView } from "react-native";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiScale } from "@/hooks/use-ui-scale";
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
  const scale = useUiScale();
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: w }}>
          <Skeleton width={w} height={h} borderRadius={12} />
          <View className="mt-2">
            <Skeleton width={Math.min(90 * scale, w - 20)} height={12} borderRadius={4} />
          </View>
          {showSubtitle && (
            <View className="mt-1">
              <Skeleton
                width={Math.min(60 * scale, w - 40)}
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
