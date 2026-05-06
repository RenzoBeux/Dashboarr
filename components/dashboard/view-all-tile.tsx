import { View, Text, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useUiScale } from "@/hooks/use-ui-scale";
import {
  POSTER_TILE_WIDTH,
  POSTER_TILE_HEIGHT,
} from "@/components/dashboard/media-poster-tile";

interface ViewAllTileProps {
  onPress: () => void;
  width?: number;
  height?: number;
  label?: string;
}

export function ViewAllTile({
  onPress,
  width = POSTER_TILE_WIDTH,
  height = POSTER_TILE_HEIGHT,
  label = "View all",
}: ViewAllTileProps) {
  const scale = useUiScale();
  return (
    <Pressable
      onPress={onPress}
      className="items-center justify-center active:opacity-70"
      style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
    >
      <View className="items-center justify-center bg-surface-light rounded-xl border border-border w-full h-full gap-1.5">
        <Icon icon={ChevronRight} size={28} color="#a1a1aa" />
        <Text className="text-zinc-300 text-xs font-medium">{label}</Text>
      </View>
    </Pressable>
  );
}
