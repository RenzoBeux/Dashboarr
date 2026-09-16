import { Text, View } from "react-native";
import { formatBytes } from "@/lib/utils";
import type { BeszelContainerRecord } from "@/lib/types";

// DockerHealth enum from container.go: 0=none 1=starting 2=healthy 3=unhealthy.
const HEALTH_DOT: Record<number, string> = {
  0: "bg-zinc-600",
  1: "bg-amber-500",
  2: "bg-success",
  3: "bg-danger",
};

export function ContainerRow({ container }: { container: BeszelContainerRecord }) {
  return (
    <View className="flex-row items-center gap-2 py-1.5">
      <View className={`w-2 h-2 rounded-full ${HEALTH_DOT[container.health] ?? "bg-zinc-600"}`} />
      <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
        {container.name}
      </Text>
      <Text className="text-zinc-500 text-xs" numberOfLines={1}>
        {container.status}
      </Text>
      <Text className="text-zinc-400 text-xs w-12 text-right">
        {container.cpu.toFixed(0)}%
      </Text>
      <Text className="text-zinc-400 text-xs w-16 text-right">
        {formatBytes(container.memory * 1024 * 1024)}
      </Text>
    </View>
  );
}
