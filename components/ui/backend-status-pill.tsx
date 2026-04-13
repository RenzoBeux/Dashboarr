import { View, Text } from "react-native";
import { Cloud, CloudOff } from "lucide-react-native";
import { useBackendStore } from "@/store/backend-store";

/**
 * Small indicator for the backend pair state. Shown on the Settings → Backend
 * screen header and anywhere else a quick glance is useful.
 */
export function BackendStatusPill() {
  const url = useBackendStore((s) => s.url);
  const isHealthy = useBackendStore((s) => s.isHealthy);

  if (!url) {
    return (
      <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800">
        <CloudOff size={12} color="#71717a" />
        <Text className="text-zinc-400 text-xs">Not paired</Text>
      </View>
    );
  }

  if (isHealthy) {
    return (
      <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-950">
        <Cloud size={12} color="#22c55e" />
        <Text className="text-green-400 text-xs">Connected</Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950">
      <CloudOff size={12} color="#f59e0b" />
      <Text className="text-amber-400 text-xs">Offline</Text>
    </View>
  );
}
