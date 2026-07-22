import { View, Text, Pressable, Platform } from "react-native";
import { Power, AlertTriangle } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import {
  useProwlarrIndexers,
  useProwlarrIndexerStatuses,
  useToggleIndexer,
} from "@/hooks/use-prowlarr";

// Prowlarr's indexer list: per-indexer health dot (from /indexerstatus) and an
// enable/disable toggle. Deliberately NOT shared with Jackett — its admin API
// is cookie-authed, so its list (jackett-indexer-list.tsx) is read-only.
export function ProwlarrIndexerList() {
  const { data: indexers, isLoading, error } = useProwlarrIndexers();
  const { data: statuses } = useProwlarrIndexerStatuses();
  const toggleIndexer = useToggleIndexer();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load indexers" />;
  }
  if (!indexers?.length) {
    return <EmptyState title="No indexers configured" />;
  }

  const statusMap = new Map(statuses?.map((s) => [s.indexerId, s]) ?? []);

  return (
    <View className="gap-2">
      {indexers.map((indexer) => {
        const status = statusMap.get(indexer.id);
        const isDisabled = !!status?.disabledTill;
        const isEnabled = indexer.enable;

        return (
          <Card key={indexer.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <View
                  className={`w-2.5 h-2.5 rounded-full ${
                    !isEnabled
                      ? "bg-zinc-600"
                      : isDisabled
                        ? "bg-danger"
                        : "bg-success"
                  }`}
                  style={Platform.OS === "ios" && isEnabled ? {
                    shadowColor: isDisabled ? "#ef4444" : "#22c55e",
                    shadowRadius: 6,
                    shadowOpacity: 0.6,
                    shadowOffset: { width: 0, height: 0 },
                  } : undefined}
                />
                <View className="flex-1">
                  <Text className="text-zinc-200 text-sm font-medium">
                    {indexer.name}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {indexer.protocol} · Priority {indexer.priority}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                {isDisabled && (
                  <Icon icon={AlertTriangle} size={14} color="#ef4444" />
                )}
                <Badge
                  label={indexer.protocol}
                  variant={indexer.protocol === "torrent" ? "downloading" : "default"}
                />
                <Pressable
                  onPress={() =>
                    toggleIndexer.mutate({ indexer, enable: !isEnabled })
                  }
                  className="p-1.5 active:opacity-70"
                  hitSlop={6}
                >
                  <Icon icon={Power}
                    size={16}
                    color={isEnabled ? "#22c55e" : "#71717a"}
                  />
                </Pressable>
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
