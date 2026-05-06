import { View, Text, Pressable } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Film, Tv, type LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useUiScale } from "@/hooks/use-ui-scale";

export const BACKDROP_ROW_HEIGHT = 64;
const POSTER_W = 44;
const POSTER_H = BACKDROP_ROW_HEIGHT - 8;

interface MediaBackdropRowProps {
  posterUrl: string | ImageSource | null;
  backdropUrl: string | ImageSource | null;
  title: string;
  subtitle?: string;
  rightAccessory?: React.ReactNode;
  fallbackIcon?: LucideIcon;
  mediaType?: "movie" | "tv";
  onPress?: () => void;
}

export function MediaBackdropRow({
  posterUrl,
  backdropUrl,
  title,
  subtitle,
  rightAccessory,
  fallbackIcon,
  mediaType,
  onPress,
}: MediaBackdropRowProps) {
  const FallbackIcon =
    fallbackIcon ?? (mediaType === "tv" ? Tv : Film);
  const scale = useUiScale();
  const rowHeight = Math.round(BACKDROP_ROW_HEIGHT * scale);
  const posterW = Math.round(POSTER_W * scale);
  const posterH = Math.round(POSTER_H * scale);

  const posterSource = toSource(posterUrl);
  const backdropSource = toSource(backdropUrl);
  const recyclingKey = recycleKeyFor(posterUrl) ?? recycleKeyFor(backdropUrl);

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-80 overflow-hidden rounded-xl bg-surface-light"
      style={{ height: rowHeight }}
    >
      {backdropSource ? (
        <Image
          source={backdropSource}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={recyclingKey}
        />
      ) : null}

      {/* Left-to-right dark overlay so the title stays legible against any
          backdrop. Heavier on the left where the poster + text sit. */}
      <LinearGradient
        colors={[
          "rgba(15, 15, 17, 0.92)",
          "rgba(15, 15, 17, 0.75)",
          "rgba(15, 15, 17, 0.45)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <View className="flex-row items-center h-full px-2 gap-3">
        <View
          className="rounded-md overflow-hidden bg-surface"
          style={{ width: posterW, height: posterH }}
        >
          {posterSource ? (
            <Image
              source={posterSource}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              recyclingKey={recyclingKey}
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <Icon icon={FallbackIcon} size={18} color="#71717a" />
            </View>
          )}
        </View>

        <View className="flex-1">
          <Text
            className="text-zinc-100 text-sm font-semibold"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text className="text-zinc-300 text-xs" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {rightAccessory && <View className="pr-1">{rightAccessory}</View>}
      </View>
    </Pressable>
  );
}

function toSource(value: string | ImageSource | null): ImageSource | null {
  if (!value) return null;
  if (typeof value === "string") return { uri: value };
  return value;
}

function recycleKeyFor(value: string | ImageSource | null): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.cacheKey ?? value.uri ?? undefined;
}
