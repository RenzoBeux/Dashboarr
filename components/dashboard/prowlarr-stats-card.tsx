import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Search, AlertTriangle } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useProwlarrIndexers, useProwlarrIndexerStatuses } from "@/hooks/use-prowlarr";

export function ProwlarrStatsCard() {
  const { data: indexers, isLoading } = useProwlarrIndexers();
  const { data: statuses } = useProwlarrIndexerStatuses();
  const router = useRouter();

  const enabledCount = indexers?.filter((i) => i.enable).length ?? 0;
  const failedIds = new Set(
    statuses?.filter((s) => s.disabledTill).map((s) => s.indexerId) ?? [],
  );
  const failedCount = indexers?.filter((i) => i.enable && failedIds.has(i.id)).length ?? 0;

  return (
    <Card onPress={() => router.push("/(tabs)/indexers")}>
      <CardHeader>
        <CardTitle>Indexers</CardTitle>
        <View className="flex-row gap-2">
          <Badge label={`${enabledCount} active`} variant="success" />
          {failedCount > 0 && (
            <Badge label={`${failedCount} failed`} variant="error" />
          )}
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !indexers?.length ? (
        <EmptyState
          icon={<Search size={32} color="#71717a" />}
          title="No indexers"
        />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {indexers
            .filter((i) => i.enable)
            .slice(0, 8)
            .map((indexer) => {
              const isFailed = failedIds.has(indexer.id);
              return (
                <View
                  key={indexer.id}
                  className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    isFailed ? "bg-red-600/10" : "bg-surface-light"
                  }`}
                >
                  <View
                    className={`w-1.5 h-1.5 rounded-full ${
                      isFailed ? "bg-danger" : "bg-success"
                    }`}
                  />
                  <Text className="text-zinc-400 text-xs">{indexer.name}</Text>
                  {isFailed && <AlertTriangle size={10} color="#ef4444" />}
                </View>
              );
            })}
        </View>
      )}
    </Card>
  );
}
