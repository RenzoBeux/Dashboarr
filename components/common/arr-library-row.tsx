import { View, Text, Pressable } from "react-native";
import { LibraryThumb } from "@/components/common/library-thumb";
import { useServiceImage } from "@/hooks/use-service-image";
import type { PosterStatus } from "@/components/common/library-collection";
import type { ServiceId } from "@/lib/constants";

/**
 * The list-view row for an *arr library item (Radarr movie, Sonarr series):
 * thumbnail with the same status bar as the poster grid, title, the footer
 * line the poster shows, and tag labels. Same press / long-press as the grid.
 */
export function ArrLibraryRow({
  images,
  serviceId,
  placeholderIcon,
  title,
  footer,
  tags,
  status,
  onPress,
  onLongPress,
}: {
  images: { coverType: string; url: string; remoteUrl: string }[];
  serviceId: ServiceId;
  placeholderIcon: React.ComponentType<any>;
  title: string;
  footer: string;
  tags?: string[];
  status?: PosterStatus;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const poster = images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, serviceId);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      className="flex-row items-center gap-3 rounded-2xl bg-surface border border-border p-2.5 mb-2 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${footer}`}
    >
      <LibraryThumb
        src={src}
        onError={onError}
        fallback={placeholderIcon}
        barColor={status?.barColor}
        progress={status?.progress}
      />
      <View className="flex-1 min-w-0">
        <Text className="text-zinc-100 text-sm font-semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
          {footer}
        </Text>
        {tags?.length ? (
          <Text className="text-blue-400 text-xs mt-1" numberOfLines={1}>
            {tags.join(" · ")}
          </Text>
        ) : null}
      </View>
      {status?.cornerColor ? (
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: status.cornerColor }}
        />
      ) : null}
    </Pressable>
  );
}
