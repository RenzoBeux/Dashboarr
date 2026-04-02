import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, MonitorPlay } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useTautulliActivity } from "@/hooks/use-tautulli";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { formatBytes, truncateText } from "@/lib/utils";
import type { TautulliSession } from "@/lib/types";

export function TautulliActivityCard() {
  const { data: activity, isLoading } = useTautulliActivity();
  const router = useRouter();

  const sessions = activity?.sessions ?? [];
  const streamCount = parseInt(activity?.stream_count ?? "0", 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Now Playing</CardTitle>
        {streamCount > 0 && (
          <Badge label={`${streamCount} stream${streamCount !== 1 ? "s" : ""}`} variant="success" />
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<MonitorPlay size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <View className="gap-3">
          {sessions.slice(0, 3).map((session) => (
            <SessionRow key={session.session_key} session={session} />
          ))}
          {sessions.length > 3 && (
            <Pressable
              onPress={() => router.push("/(tabs)/activity")}
              className="active:opacity-70"
            >
              <Text className="text-primary text-sm text-center font-medium">
                View All →
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {streamCount > 0 && activity && (
        <View className="flex-row gap-3 mt-3 pt-3 border-t border-border/50">
          <Text className="text-zinc-500 text-xs">
            Bandwidth: {formatBytes(activity.total_bandwidth * 1000)}/s
          </Text>
        </View>
      )}
    </Card>
  );
}

function SessionRow({ session }: { session: TautulliSession }) {
  const progress = parseInt(session.progress_percent, 10) / 100;
  const isPaused = session.state === "paused";
  const isBuffering = session.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1">
        <StateIcon size={14} color={stateColor} />
        <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
          {truncateText(session.full_title, 35)}
        </Text>
      </View>
      <ProgressBar progress={progress} className="mb-1" />
      <Text className="text-zinc-500 text-xs">
        {session.user} · {session.player} · {session.transcode_decision}
      </Text>
    </View>
  );
}
