import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Inbox, Check, Clock, X } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useOverseerrRequests, useOverseerrRequestCount } from "@/hooks/use-overseerr";

const REQUEST_STATUS_ICON: Record<number, React.ElementType> = {
  1: Clock, // pending
  2: Check, // approved
  3: X, // declined
};

const REQUEST_STATUS_COLOR: Record<number, string> = {
  1: "#f59e0b",
  2: "#22c55e",
  3: "#ef4444",
};

export function OverseerrRequestsCard() {
  const { data, isLoading } = useOverseerrRequests(1, "pending");
  const { data: counts } = useOverseerrRequestCount();
  const router = useRouter();

  const pendingRequests = data?.results ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests</CardTitle>
        <View className="flex-row gap-2">
          {counts && counts.pending > 0 && (
            <Badge label="Pending" variant="warning" count={counts.pending} />
          )}
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : pendingRequests.length === 0 ? (
        <EmptyState
          icon={<Inbox size={32} color="#71717a" />}
          title="No pending requests"
        />
      ) : (
        <View className="gap-2">
          {pendingRequests.slice(0, 5).map((req) => {
            const Icon = REQUEST_STATUS_ICON[req.status] ?? Clock;
            const color = REQUEST_STATUS_COLOR[req.status] ?? "#71717a";

            return (
              <Pressable
                key={req.id}
                onPress={() => router.push("/(tabs)/requests")}
                className="flex-row items-center gap-3 py-1 active:opacity-80"
              >
                <Icon size={16} color={color} />
                <View className="flex-1">
                  <Text className="text-zinc-200 text-sm">
                    {req.media.mediaType === "movie" ? "Movie" : "TV"} #{req.media.tmdbId}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {req.requestedBy.displayName} ·{" "}
                    {new Date(req.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {pendingRequests.length > 5 && (
            <Pressable
              onPress={() => router.push("/(tabs)/requests")}
              className="active:opacity-70"
            >
              <Text className="text-primary text-sm text-center font-medium">
                View All →
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}
