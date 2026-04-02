import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Film } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useRadarrQueue, useWantedMissing } from "@/hooks/use-radarr";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { truncateText } from "@/lib/utils";

export function RadarrQueueCard() {
  const { data: queue, isLoading } = useRadarrQueue();
  const { data: wanted } = useWantedMissing();
  const router = useRouter();

  const records = queue?.records ?? [];
  const missingCount = wanted?.totalRecords ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Radarr Queue</CardTitle>
        <View className="flex-row gap-2">
          {missingCount > 0 && (
            <Badge label="Missing" variant="missing" count={missingCount} />
          )}
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Film size={32} color="#71717a" />}
          title="No movies in queue"
        />
      ) : (
        <View className="gap-3">
          {records.slice(0, 5).map((item) => {
            const progress =
              item.size > 0 ? (item.size - item.sizeleft) / item.size : 0;

            return (
              <Pressable
                key={item.id}
                onPress={() =>
                  item.movie && router.push(`/movie/${item.movie.id}`)
                }
                className="active:opacity-80"
              >
                <View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
                      {truncateText(item.title, 35)}
                    </Text>
                    <Badge
                      label={item.quality.quality.name}
                      variant="default"
                    />
                  </View>
                  <ProgressBar progress={progress} showLabel className="mt-1.5" />
                  {item.timeleft && (
                    <Text className="text-zinc-500 text-xs mt-1">
                      ETA {item.timeleft}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
