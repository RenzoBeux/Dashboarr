import type { ComponentType } from "react";
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Plus, Check, SlidersHorizontal } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { useServiceImage } from "@/hooks/use-service-image";
import type { ServiceId } from "@/lib/constants";

// The shape useServiceImage needs from a result image. The *arr result image
// types (RadarrImage/SonarrImage/LidarrImage) all satisfy this structurally.
interface PosterImage {
  url: string;
  remoteUrl: string;
}

interface MediaSearchResultCardProps {
  /** Used to resolve the poster against the right service URL + api key. */
  serviceId: ServiceId;
  /** The `coverType === "poster"` entry from the result, if any. */
  poster?: PosterImage;
  /** Lucide icon shown when no poster resolves (Film / Tv / Mic2). */
  fallbackIcon: ComponentType<{ size?: number; color?: string }>;
  title: string;
  /** Single metadata line (year, or year · network · seasons, or type · disambiguation). */
  metaLine?: string;
  overview?: string;
  /** When true, shows the green Check + makes the card tap-to-open-existing. */
  alreadyAdded: boolean;
  /** Disables the quick-add button while the add mutation is in flight. */
  addPending?: boolean;
  onQuickAdd: () => void;
  onAdvanced: () => void;
  onOpenExisting: () => void;
}

/**
 * Shared result row for the Radarr / Sonarr / Lidarr add-search flows. Extracted
 * verbatim from the three near-identical per-service search screens so the
 * dedicated screens and the global-search sections render the exact same card.
 * Purely presentational: the caller owns the search hook, the library-dedup
 * lookup, and the quick-add/advanced mutations.
 */
export function MediaSearchResultCard({
  serviceId,
  poster,
  fallbackIcon,
  title,
  metaLine,
  overview,
  alreadyAdded,
  addPending = false,
  onQuickAdd,
  onAdvanced,
  onOpenExisting,
}: MediaSearchResultCardProps) {
  const { src: posterUrl, onError: onPosterError } = useServiceImage(
    poster,
    serviceId,
  );

  return (
    <Card
      className="flex-row gap-3"
      onPress={alreadyAdded ? onOpenExisting : undefined}
    >
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          className="w-16 h-24 rounded-lg bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={posterUrl}
          onError={onPosterError}
        />
      ) : (
        <View className="w-16 h-24 rounded-lg bg-surface-light items-center justify-center">
          <Icon icon={fallbackIcon} size={20} color="#71717a" />
        </View>
      )}
      <View className="flex-1 justify-center">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {title}
        </Text>
        {metaLine ? (
          <Text className="text-zinc-500 text-xs">{metaLine}</Text>
        ) : null}
        {overview ? (
          <Text className="text-zinc-500 text-xs mt-1" numberOfLines={2}>
            {overview}
          </Text>
        ) : null}
      </View>
      {alreadyAdded ? (
        <View className="self-center p-2">
          <Icon icon={Check} size={20} color="#22c55e" />
        </View>
      ) : (
        <View className="flex-row items-center self-center">
          <Pressable onPress={onAdvanced} className="p-2 active:opacity-70" hitSlop={4}>
            <Icon icon={SlidersHorizontal} size={18} color="#a1a1aa" />
          </Pressable>
          <Pressable
            onPress={onQuickAdd}
            className="p-2 active:opacity-70"
            disabled={addPending}
            hitSlop={4}
          >
            <Icon icon={Plus} size={20} color="#3b82f6" />
          </Pressable>
        </View>
      )}
    </Card>
  );
}
