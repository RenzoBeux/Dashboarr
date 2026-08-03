import { View, Text, Pressable } from "react-native";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import type { UnifiedRelease } from "@/lib/indexer-adapter";

// Dense release row shared by the Indexers tab search and the global-search
// Releases sections (both kinds). Tap = start the adapter's grab flow.
export function ReleaseCard({
  release,
  onPress,
}: {
  release: UnifiedRelease;
  onPress: () => void;
}) {
  return (
    <Card>
      <Pressable onPress={onPress} className="active:opacity-80">
        <Text className="text-zinc-200 text-sm" numberOfLines={2}>
          {release.title}
        </Text>
        {/* Yoga defaults flexShrink to 0 (web CSS defaults it to 1), so without a
            flexible child the indexer name lays out at full intrinsic width and shoves
            the stats + protocol pill past the card's content box — #314. Making the
            indexer the one `flex-1` element is the same fix ReleaseListItem uses. */}
        <View className="flex-row items-center gap-2 mt-1.5">
          <Text className="text-zinc-500 text-xs">{formatBytes(release.sizeBytes)}</Text>
          <Text className="text-zinc-500 text-xs flex-1 min-w-0" numberOfLines={1}>
            {release.indexer}
          </Text>
          {release.seeders !== undefined && (
            <Text className="text-success text-xs">S:{release.seeders}</Text>
          )}
          {release.leechers !== undefined && (
            <Text className="text-danger text-xs">L:{release.leechers}</Text>
          )}
          <Badge
            label={release.protocol}
            variant={release.protocol === "torrent" ? "downloading" : "default"}
          />
        </View>
      </Pressable>
    </Card>
  );
}
