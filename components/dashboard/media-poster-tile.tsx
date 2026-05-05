import { View, Text, Pressable } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { Film, Tv, type LucideIcon } from "lucide-react-native";

export const POSTER_TILE_WIDTH = 110;
export const POSTER_TILE_HEIGHT = 165;

export interface PosterBadge {
  icon?: LucideIcon;
  label?: string;
  color: string;
  onPress?: () => void;
}

interface MediaPosterTileProps {
  posterUrl: string | ImageSource | null;
  title: string;
  subtitle?: string;
  cornerBadge?: PosterBadge;
  bottomLeftBadge?: PosterBadge;
  bottomOverlay?: React.ReactNode;
  fallbackIcon?: LucideIcon;
  mediaType?: "movie" | "tv";
  onPress?: () => void;
  onLongPress?: () => void;
  width?: number;
  height?: number;
}

export function MediaPosterTile({
  posterUrl,
  title,
  subtitle,
  cornerBadge,
  bottomLeftBadge,
  bottomOverlay,
  fallbackIcon,
  mediaType,
  onPress,
  onLongPress,
  width = POSTER_TILE_WIDTH,
  height = POSTER_TILE_HEIGHT,
}: MediaPosterTileProps) {
  const FallbackIcon =
    fallbackIcon ?? (mediaType === "tv" ? Tv : Film);

  const source: ImageSource | null =
    typeof posterUrl === "string"
      ? { uri: posterUrl }
      : (posterUrl as ImageSource | null);
  const recyclingKey =
    typeof posterUrl === "string"
      ? posterUrl
      : (posterUrl?.cacheKey ?? posterUrl?.uri ?? undefined);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="active:opacity-80"
      style={{ width }}
    >
      <View
        className="rounded-xl overflow-hidden bg-surface-light"
        style={{ width, height }}
      >
        {source ? (
          <Image
            source={source}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={recyclingKey}
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <FallbackIcon size={24} color="#71717a" />
          </View>
        )}

        {cornerBadge && <CornerBadge badge={cornerBadge} position="top-right" />}
        {bottomLeftBadge && (
          <CornerBadge badge={bottomLeftBadge} position="bottom-left" />
        )}

        {bottomOverlay && (
          <View className="absolute bottom-0 left-0 right-0">
            {bottomOverlay}
          </View>
        )}
      </View>

      <Text
        className="text-zinc-200 text-xs font-medium mt-1.5"
        numberOfLines={2}
      >
        {title}
      </Text>
      {subtitle && (
        <Text className="text-zinc-500 text-[11px]" numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

function CornerBadge({
  badge,
  position,
}: {
  badge: PosterBadge;
  position: "top-right" | "bottom-left";
}) {
  const positionClass =
    position === "top-right"
      ? "absolute top-1.5 right-1.5"
      : "absolute bottom-1.5 left-1.5";
  const Icon = badge.icon;
  const hasLabel = !!badge.label;
  const interactive = !!badge.onPress;
  // Interactive badges get a slightly larger tap target.
  const padding = hasLabel
    ? "px-1.5 py-0.5"
    : interactive
      ? "p-1.5"
      : "p-1";
  const iconSize = interactive && !hasLabel ? 14 : 10;

  const content = (
    <>
      {Icon && <Icon size={iconSize} color="#fff" />}
      {hasLabel && (
        <Text className="text-white text-[10px] font-semibold">
          {badge.label}
        </Text>
      )}
    </>
  );

  if (interactive) {
    return (
      <Pressable
        onPress={badge.onPress}
        hitSlop={6}
        className={`${positionClass} rounded-full ${padding} flex-row items-center gap-0.5 active:opacity-70`}
        style={{ backgroundColor: badge.color }}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      className={`${positionClass} rounded-full ${padding} flex-row items-center gap-0.5`}
      style={{ backgroundColor: badge.color }}
    >
      {content}
    </View>
  );
}
