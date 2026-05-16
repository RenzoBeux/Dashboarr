import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useServiceImage } from "@/hooks/use-service-image";
import { usePosterCellWidth } from "@/hooks/use-poster-cell";

export type MonitorFilter = "monitored" | "unmonitored" | "all";

export const MONITOR_FILTER_OPTIONS: { value: MonitorFilter; label: string }[] = [
  { value: "monitored", label: "Monitored" },
  { value: "unmonitored", label: "Unmonitored" },
  { value: "all", label: "All" },
];

interface PosterImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

interface MonitoredItem {
  id: number;
  title: string;
  monitored: boolean;
  images: PosterImage[];
}

interface MonitoredLibraryGridProps<T extends MonitoredItem, S extends string> {
  data: T[] | undefined;
  isLoading: boolean;
  error: Error | null;
  monitorFilter: MonitorFilter;
  sort: S;
  compare: (a: T, b: T, sort: S) => number;
  serviceId: "radarr" | "sonarr";
  placeholderIcon: LucideIcon;
  /** Plural noun used in empty state titles, e.g. "movies" / "shows". */
  nounPlural: string;
  /** Footer line under the poster title (e.g. year or season count). */
  renderFooter: (item: T) => string;
  onItemPress: (item: T) => void;
  onItemLongPress: (item: T) => void;
}

export function MonitoredLibraryGrid<T extends MonitoredItem, S extends string>({
  data,
  isLoading,
  error,
  monitorFilter,
  sort,
  compare,
  serviceId,
  placeholderIcon,
  nounPlural,
  renderFooter,
  onItemPress,
  onItemLongPress,
}: MonitoredLibraryGridProps<T, S>) {
  const cellWidth = usePosterCellWidth();

  if (isLoading) {
    return (
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={{ width: cellWidth }}>
            <Skeleton width="100%" height={150} borderRadius={12} />
            <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
          </View>
        ))}
      </View>
    );
  }
  if (error) {
    return <ErrorBanner error={error} title="Failed to load library" />;
  }
  if (!data?.length) {
    return (
      <EmptyState
        icon={<Icon icon={placeholderIcon} size={32} color="#71717a" />}
        title={`No ${nounPlural} in library`}
      />
    );
  }

  const filtered = data.filter((item) => {
    if (monitorFilter === "monitored") return item.monitored;
    if (monitorFilter === "unmonitored") return !item.monitored;
    return true;
  });

  if (!filtered.length) {
    const title =
      monitorFilter === "monitored"
        ? `No monitored ${nounPlural}`
        : monitorFilter === "unmonitored"
          ? `No unmonitored ${nounPlural}`
          : `No ${nounPlural} in library`;
    return (
      <EmptyState
        icon={<Icon icon={placeholderIcon} size={32} color="#71717a" />}
        title={title}
      />
    );
  }

  const sorted = [...filtered].sort((a, b) => compare(a, b, sort));

  return (
    <View className="flex-row flex-wrap gap-3">
      {sorted.map((item) => (
        <LibraryPoster
          key={item.id}
          item={item}
          serviceId={serviceId}
          placeholderIcon={placeholderIcon}
          footer={renderFooter(item)}
          onPress={() => onItemPress(item)}
          onLongPress={() => onItemLongPress(item)}
        />
      ))}
    </View>
  );
}

function LibraryPoster<T extends MonitoredItem>({
  item,
  serviceId,
  placeholderIcon,
  footer,
  onPress,
  onLongPress,
}: {
  item: T;
  serviceId: "radarr" | "sonarr";
  placeholderIcon: LucideIcon;
  footer: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const poster = item.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, serviceId);
  const cellWidth = usePosterCellWidth();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{ width: cellWidth }}
      className="active:opacity-80"
    >
      {src ? (
        <Image
          source={{ uri: src }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={src}
          onError={onError}
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Icon icon={placeholderIcon} size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-sm mt-1" numberOfLines={1}>
        {item.title}
      </Text>
      <Text className="text-zinc-600 text-xs">{footer}</Text>
    </Pressable>
  );
}
