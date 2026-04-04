import { View, Text, Pressable, Image } from "react-native";
import { Star, Check, Clock, Film, Tv } from "lucide-react-native";
import { getPosterUrl } from "@/services/overseerr-api";
import type { OverseerrMediaResult } from "@/lib/types";

interface PosterCardProps {
  item: OverseerrMediaResult;
  onPress: (item: OverseerrMediaResult) => void;
  size?: "sm" | "md";
}

const SIZES = {
  sm: { width: 110, height: 165, poster: "w185" as const },
  md: { width: 140, height: 210, poster: "w342" as const },
};

export function PosterCard({ item, onPress, size = "sm" }: PosterCardProps) {
  const { width, height, poster } = SIZES[size];
  const title = item.title || item.name || "Unknown";
  const year =
    item.releaseDate?.slice(0, 4) || item.firstAirDate?.slice(0, 4);
  const posterUrl = getPosterUrl(item.posterPath, poster);
  const isAvailable = item.mediaInfo?.status === 5;
  const isPending =
    item.mediaInfo?.status === 2 || item.mediaInfo?.status === 3;

  return (
    <Pressable
      onPress={() => onPress(item)}
      className="active:opacity-80"
      style={{ width }}
    >
      {/* Poster image */}
      <View className="rounded-xl overflow-hidden bg-surface-light" style={{ width, height }}>
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            {item.mediaType === "movie" ? (
              <Film size={24} color="#71717a" />
            ) : (
              <Tv size={24} color="#71717a" />
            )}
          </View>
        )}

        {/* Status indicator */}
        {isAvailable && (
          <View className="absolute top-1.5 right-1.5 bg-green-600 rounded-full p-1">
            <Check size={10} color="#fff" />
          </View>
        )}
        {isPending && (
          <View className="absolute top-1.5 right-1.5 bg-yellow-600 rounded-full p-1">
            <Clock size={10} color="#fff" />
          </View>
        )}

        {/* Rating badge */}
        {item.voteAverage > 0 && (
          <View className="absolute bottom-1.5 left-1.5 flex-row items-center gap-0.5 bg-black/70 rounded-md px-1.5 py-0.5">
            <Star size={10} color="#eab308" fill="#eab308" />
            <Text className="text-white text-[10px] font-semibold">
              {item.voteAverage.toFixed(1)}
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text
        className="text-zinc-200 text-xs font-medium mt-1.5"
        numberOfLines={2}
      >
        {title}
      </Text>
      {year && (
        <Text className="text-zinc-500 text-[11px]">{year}</Text>
      )}
    </Pressable>
  );
}
