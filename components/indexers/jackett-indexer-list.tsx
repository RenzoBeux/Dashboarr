import { View, Text } from "react-native";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useJackettIndexers } from "@/hooks/use-jackett";

// Read-only: Jackett's per-indexer toggle/test/config REST endpoints require
// the admin-password cookie, so unlike Prowlarr's list there are no mutations
// and no health dots here — just what the Torznab t=indexers meta endpoint
// reports about the configured set.
export function JackettIndexerList() {
  const { data: indexers, isLoading, error } = useJackettIndexers();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load indexers" />;
  }
  if (!indexers?.length) {
    return (
      <EmptyState
        title="No indexers configured"
        message="Add indexers in Jackett's web UI — they'll show up here."
      />
    );
  }

  return (
    <View className="gap-2">
      {indexers.map((indexer) => (
        <Card key={indexer.id}>
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <Text className="text-zinc-200 text-sm font-medium">
                {indexer.name}
              </Text>
              {indexer.description ? (
                <Text className="text-zinc-500 text-xs" numberOfLines={2}>
                  {indexer.description}
                </Text>
              ) : null}
            </View>
            <Badge
              label={indexer.type}
              variant={indexer.type === "public" ? "default" : "seeding"}
            />
          </View>
        </Card>
      ))}
    </View>
  );
}
