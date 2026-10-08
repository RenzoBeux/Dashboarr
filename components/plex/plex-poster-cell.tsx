import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Play } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { getPlexImageSource } from "@/services/plex-api";
import type { PlexMediaItem } from "@/lib/types";

/** Route to an item's detail screen inside the Plex tab. */
export function plexItemHref(ratingKey: string): string {
  return `/plex/item/${encodeURIComponent(ratingKey)}`;
}

/** Poster grid cell for the Plex tab and library browser. Tapping opens the item. */
export function PlexPosterCell({ item }: { item: PlexMediaItem }) {
  const router = useRouter();
  const { width: cellWidth } = usePosterCellLayout();
  // Episodes show their series poster and title so a grid of new episodes
  // reads as shows, not stills.
  const source = getPlexImageSource(
    item.grandparentThumb || item.parentThumb || item.thumb,
    200,
    300,
  );
  const title =
    item.type === "episode"
      ? item.grandparentTitle || item.title
      : item.type === "season"
        ? item.parentTitle || item.title
        : item.title;

  return (
    <Pressable
      onPress={() => router.push(plexItemHref(item.ratingKey))}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="active:opacity-70"
      style={{ width: cellWidth }}
    >
      {source ? (
        <Image
          source={source}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={source.cacheKey}
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Icon icon={Play} size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-sm mt-1" numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}
