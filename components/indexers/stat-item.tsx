import { View, Text } from "react-native";

/**
 * One labelled number in an indexer stats card. Lifted out of
 * prowlarr-stats.tsx when NZBHydra2's stats sub-tab needed the same row so the
 * two wouldn't drift; both render inside a `flex-row flex-wrap gap-x-4 gap-y-1`
 * container and are intrinsically sized, which is why they wrap correctly at
 * every UI scale without a computed cell width.
 */
export function StatItem({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text
        className={`text-sm font-medium ${danger ? "text-danger" : "text-zinc-300"}`}
      >
        {value}
      </Text>
    </View>
  );
}
