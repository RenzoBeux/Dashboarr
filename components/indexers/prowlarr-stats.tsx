import { View, Text } from "react-native";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useProwlarrStats } from "@/hooks/use-prowlarr";

// Prowlarr-only: Jackett exposes no stats endpoint without the admin cookie,
// so this sub-tab simply doesn't render for the Jackett source.
export function ProwlarrStats() {
  const { data: stats, isLoading } = useProwlarrStats();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (!stats?.indexers?.length) {
    return <EmptyState title="No stats available" />;
  }

  return (
    <View className="gap-2">
      {stats.indexers.map((indexer) => (
        <Card key={indexer.indexerId}>
          <Text className="text-zinc-200 text-sm font-medium mb-2">
            {indexer.indexerName}
          </Text>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            <StatItem label="Queries" value={String(indexer.numberOfQueries)} />
            <StatItem label="Grabs" value={String(indexer.numberOfGrabs)} />
            <StatItem label="Failures" value={String(indexer.numberOfFailures)} danger={indexer.numberOfFailures > 0} />
            <StatItem label="Avg Response" value={`${indexer.averageResponseTime}ms`} />
          </View>
        </Card>
      ))}
    </View>
  );
}

function StatItem({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-sm font-medium ${danger ? "text-danger" : "text-zinc-300"}`}>
        {value}
      </Text>
    </View>
  );
}
