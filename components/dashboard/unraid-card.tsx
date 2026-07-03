import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Container } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { DiskUsageRow } from "@/components/dashboard/disk-usage-row";
import { useUnraidContainers, useUnraidStorage } from "@/hooks/use-unraid";

// Array state at a glance: state dot + capacity bar + running-container count.
// Scoped to the workspace's active unRAID instance (the hooks' default
// resolution) — no per-widget settings in v1.
export function UnraidCard() {
  const router = useRouter();
  const { data: storage, isLoading: storageLoading } = useUnraidStorage();
  const { data: containers } = useUnraidContainers();

  const started = storage?.arrayState.toUpperCase() === "STARTED";
  const capacity = storage?.capacity;
  const capacityPct =
    capacity && capacity.total > 0 ? (capacity.used / capacity.total) * 100 : 0;
  const runningCount =
    containers?.filter((c) => c.state.toUpperCase() === "RUNNING").length ?? 0;

  return (
    <Card onPress={() => router.push("/(tabs)/unraid")}>
      <CardHeader>
        <CardTitle>unRAID</CardTitle>
        {storage && (
          <View className="flex-row items-center gap-1.5">
            <View
              className={`w-2 h-2 rounded-full ${started ? "bg-success" : "bg-zinc-600"}`}
            />
            <Text className={`text-xs font-medium ${started ? "text-success" : "text-zinc-500"}`}>
              {started ? "Array started" : "Array stopped"}
            </Text>
          </View>
        )}
      </CardHeader>

      {storageLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !storage ? (
        <EmptyState compact title="No data" />
      ) : (
        <View className="gap-3">
          {capacity && capacity.total > 0 && (
            <DiskUsageRow
              label="Array"
              percent={capacityPct}
              used={capacity.used}
              total={capacity.total}
            />
          )}

          {storage.parityCheck?.running && (
            <Text className="text-amber-400 text-xs">
              Parity check
              {typeof storage.parityCheck.progress === "number"
                ? ` · ${storage.parityCheck.progress.toFixed(0)}%`
                : ""}
            </Text>
          )}

          {containers && containers.length > 0 && (
            <View className="flex-row items-center gap-1.5">
              <Icon icon={Container} size={12} color="#a1a1aa" />
              <Text className="text-zinc-400 text-xs">
                {runningCount}/{containers.length} containers running
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
