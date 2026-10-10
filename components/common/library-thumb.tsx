import { View } from "react-native";
import { Image } from "expo-image";
import { Icon } from "@/components/ui/icon";
import { BAR_TRACK_COLOR } from "@/lib/arr-poster-status";

/**
 * The small poster at the start of a library list row (Bazarr library, the
 * Radarr/Sonarr list view), with an optional status bar along its bottom like
 * the poster grid's.
 */
export function LibraryThumb({
  src,
  onError,
  fallback,
  barColor,
  progress,
}: {
  src?: string;
  onError?: (e?: { error?: string }) => void;
  fallback: React.ComponentType<any>;
  barColor?: string | null;
  // 0–100; omitted fills the bar.
  progress?: number;
}) {
  return (
    <View className="w-11 h-16 rounded-lg overflow-hidden bg-surface-light items-center justify-center">
      {src ? (
        <Image
          source={{ uri: src }}
          className="w-full h-full"
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={src}
          onError={onError}
        />
      ) : (
        <Icon icon={fallback} size={18} color="#71717a" />
      )}
      {barColor ? (
        <View
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{ backgroundColor: BAR_TRACK_COLOR }}
        >
          <View
            className="absolute left-0 top-0 bottom-0"
            style={{
              backgroundColor: barColor,
              width: `${Math.max(0, Math.min(100, progress ?? 100))}%`,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
