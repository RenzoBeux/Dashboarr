import { View, Text } from "react-native";

export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-surface-light rounded-xl px-3 py-2 items-center min-w-16">
      <Text className="text-zinc-100 text-sm font-semibold">{value}</Text>
      <Text className="text-zinc-500 text-xs">{label}</Text>
    </View>
  );
}
