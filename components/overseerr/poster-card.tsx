import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Star, Check, Clock, Film, Tv } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { getPosterUrl } from "@/services/overseerr-api";
import type { OverseerrMediaResult } from "@/lib/types";

interface PosterCardProps {
  item: OverseerrMediaResult;
  onPress: (item: OverseerrMediaResult) => void;
  size?: "sm" | "md";
  // Override the default rem-based width with an explicit pixel value — pass
  // `usePosterCellWidth()` when rendering inside a wrap-grid that should
  // drop columns at higher uiScale. The poster image keeps its 2:3 aspect
  // ratio either way.
  widthOverride?: number;
}

const SIZES = {
  // Widths as rem so they grow with uiScale. Defaults map to the original
  // 110px (sm) and 140px (md) at NativeWind's 14-rem base. Height comes from
  // aspect-[2/3] so it tracks the rendered width.
  sm: { wrapper: "w-[7.85rem]", poster: "w185" as const },
  md: { wrapper: "w-[10rem]", poster: "w342" as const },
};

export function PosterCard({ item, onPress, size = "sm", widthOverride }: PosterCardProps) {
  const { wrapper, poster } = SIZES[size];
  const wrapperClass = widthOverride !== undefined ? "" : wrapper;
  const wrapperStyle = widthOverride !== undefined ? { width: widthOverride } : undefined;
  const title = item.title || item.name || "Unknown";
  const year =
    item.releaseDate?.slice(0, 4) || item.firstAirDate?.slice(0, 4);
  const posterUrl = getPosterUrl(item.posterPath, poster);
  const isAvailable = item.mediaInfo?.status === 5;
  // Partially available (TV with some seasons present) — green like Seerr,
  // but with a clock glyph to distinguish it from fully available.
  const isPartial = item.mediaInfo?.status === 4;
  const isPending =
    item.mediaInfo?.status === 2 || item.mediaInfo?.status === 3;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={wrapperStyle}
      className={`active:opacity-80 ${wrapperClass}`}
    >
      {/* Poster image */}
      <View className="rounded-xl overflow-hidden bg-surface-light w-full aspect-[2/3]">
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={posterUrl}
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            {item.mediaType === "movie" ? (
              <Icon icon={Film} size={24} color="#71717a" />
            ) : (
              <Icon icon={Tv} size={24} color="#71717a" />
            )}
          </View>
        )}

        {/* Status indicator */}
        {isAvailable && (
          <View className="absolute top-1.5 right-1.5 bg-green-600 rounded-full p-1">
            <Icon icon={Check} size={10} color="#fff" />
          </View>
        )}
        {isPartial && (
          <View className="absolute top-1.5 right-1.5 bg-green-600 rounded-full p-1">
            <Icon icon={Clock} size={10} color="#fff" />
          </View>
        )}
        {isPending && (
          <View className="absolute top-1.5 right-1.5 bg-yellow-600 rounded-full p-1">
            <Icon icon={Clock} size={10} color="#fff" />
          </View>
        )}

        {/* Rating badge */}
        {item.voteAverage > 0 && (
          <View className="absolute bottom-1.5 left-1.5 flex-row items-center gap-0.5 bg-black/70 rounded-md px-1.5 py-0.5">
            <Icon icon={Star} size={10} color="#eab308" fill="#eab308" />
            <Text className="text-white text-xs font-semibold">
              {item.voteAverage.toFixed(1)}
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text
        className="text-zinc-200 text-sm font-medium mt-1.5"
        numberOfLines={2}
      >
        {title}
      </Text>
      {year && (
        <Text className="text-zinc-500 text-xs">{year}</Text>
      )}
    </Pressable>
  );
}
