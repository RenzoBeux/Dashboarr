import { View, Text, Pressable } from "react-native";
import { useConfigStore } from "@/store/config-store";

export function DemoBanner() {
  const demoMode = useConfigStore((s) => s.demoMode);
  const disableDemoMode = useConfigStore((s) => s.disableDemoMode);

  if (!demoMode) return null;

  return (
    <View className="bg-amber-500/15 border-b border-amber-500/30 flex-row items-center justify-between px-4 py-2">
      <Text className="text-amber-400 text-xs font-semibold tracking-wide">
        DEMO MODE — Sample data only
      </Text>
      <Pressable onPress={disableDemoMode} className="active:opacity-60 px-2 py-1">
        <Text className="text-amber-400 text-xs underline">Exit</Text>
      </Pressable>
    </View>
  );
}
