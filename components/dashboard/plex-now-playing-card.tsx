import { View, Text, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Play, Pause, Loader, PlayCircle } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { usePlexSessions } from "@/hooks/use-plex";
import { getPlexImageUrl } from "@/services/plex-api";
import { truncateText } from "@/lib/utils";
import type { PlexSession } from "@/lib/types";

export function PlexNowPlayingCard() {
  const { data: sessions, isLoading } = usePlexSessions();
  const router = useRouter();

  const activeCount = sessions?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plex</CardTitle>
        {activeCount > 0 && (
          <Badge
            label={`${activeCount} stream${activeCount !== 1 ? "s" : ""}`}
            variant="success"
          />
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !sessions?.length ? (
        <EmptyState
          icon={<PlayCircle size={32} color="#71717a" />}
          title="Nothing playing"
        />
      ) : (
        <View className="gap-3">
          {sessions.slice(0, 3).map((session) => (
            <PlexSessionRow key={session.sessionKey} session={session} />
          ))}
          {sessions.length > 3 && (
            <Pressable
              onPress={() => router.push("/(tabs)/plex")}
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

function PlexSessionRow({ session }: { session: PlexSession }) {
  const progress = session.duration > 0 ? session.viewOffset / session.duration : 0;
  const isPaused = session.Player.state === "paused";
  const isBuffering = session.Player.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  const title =
    session.type === "episode"
      ? `${session.grandparentTitle} — ${session.title}`
      : session.title;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1">
        <StateIcon size={14} color={stateColor} />
        <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
          {truncateText(title, 30)}
        </Text>
      </View>
      <ProgressBar progress={progress} className="mb-1" />
      <Text className="text-zinc-500 text-xs">
        {session.User.title} · {session.Player.title}
      </Text>
    </View>
  );
}
