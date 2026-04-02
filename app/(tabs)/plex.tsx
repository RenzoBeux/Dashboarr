import { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { Play, Pause, Loader, Library, Clock, Tv } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  usePlexLibraries,
  usePlexRecentlyAdded,
  usePlexOnDeck,
  usePlexSessions,
} from "@/hooks/use-plex";
import { getPlexImageUrl } from "@/services/plex-api";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { truncateText } from "@/lib/utils";
import type { PlexSession, PlexMediaItem, PlexLibrary } from "@/lib/types";

type Tab = "playing" | "recent" | "ondeck" | "libraries";

export default function PlexScreen() {
  const [tab, setTab] = useState<Tab>("playing");
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["plex"]]);

  const plexHealth = healthData?.find((s) => s.id === "plex");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Plex" online={plexHealth?.online} />

      <View className="flex-row gap-2 mb-4">
        {(["playing", "recent", "ondeck", "libraries"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            className={`px-3 py-2 rounded-full ${
              tab === t ? "bg-primary" : "bg-surface-light"
            }`}
          >
            <Text
              className={`text-xs font-medium capitalize ${
                tab === t ? "text-white" : "text-zinc-400"
              }`}
            >
              {t === "playing" ? "Now Playing" : t === "ondeck" ? "On Deck" : t}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "playing" && <NowPlaying />}
      {tab === "recent" && <RecentlyAdded />}
      {tab === "ondeck" && <OnDeck />}
      {tab === "libraries" && <Libraries />}
    </ScreenWrapper>
  );
}

function NowPlaying() {
  const { data: sessions, isLoading } = usePlexSessions();

  if (isLoading) return <Text className="text-zinc-500">Loading...</Text>;
  if (!sessions?.length) {
    return (
      <EmptyState
        icon={<Play size={32} color="#71717a" />}
        title="Nothing playing"
        message="No active Plex streams"
      />
    );
  }

  return (
    <View className="gap-3">
      {sessions.map((session) => (
        <SessionCard key={session.sessionKey} session={session} />
      ))}
    </View>
  );
}

function SessionCard({ session }: { session: PlexSession }) {
  const progress = session.duration > 0 ? session.viewOffset / session.duration : 0;
  const isPaused = session.Player.state === "paused";
  const isBuffering = session.Player.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  const title =
    session.type === "episode"
      ? `${session.grandparentTitle} — ${session.title}`
      : session.title;

  const thumbUrl = getPlexImageUrl(
    session.grandparentThumb || session.thumb,
    80,
    120,
  );

  const transcodeLabel =
    session.TranscodeSession?.videoDecision === "direct play"
      ? "Direct Play"
      : session.TranscodeSession?.videoDecision === "copy"
        ? "Direct Stream"
        : session.TranscodeSession
          ? "Transcode"
          : "Direct Play";

  return (
    <Card className="flex-row gap-3">
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          className="w-14 h-20 rounded-lg bg-surface-light"
          resizeMode="cover"
        />
      ) : (
        <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
          <Play size={18} color="#71717a" />
        </View>
      )}
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5 mb-1">
          <StateIcon size={14} color={stateColor} />
          <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
            {truncateText(title, 30)}
          </Text>
        </View>
        <ProgressBar progress={progress} className="mb-1.5" />
        <View className="flex-row items-center gap-2">
          <Badge label={transcodeLabel} variant={transcodeLabel === "Direct Play" ? "success" : "warning"} />
        </View>
        <Text className="text-zinc-500 text-xs mt-1">
          {session.User.title} · {session.Player.title} · {session.Player.platform}
        </Text>
      </View>
    </Card>
  );
}

function RecentlyAdded() {
  const { data: items, isLoading } = usePlexRecentlyAdded();

  if (isLoading) return <Text className="text-zinc-500">Loading...</Text>;
  if (!items?.length) {
    return <EmptyState title="Nothing recently added" />;
  }

  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((item) => (
        <MediaPoster key={item.ratingKey} item={item} />
      ))}
    </View>
  );
}

function OnDeck() {
  const { data: items, isLoading } = usePlexOnDeck();

  if (isLoading) return <Text className="text-zinc-500">Loading...</Text>;
  if (!items?.length) {
    return <EmptyState title="Nothing on deck" />;
  }

  return (
    <View className="gap-2">
      {items.map((item) => {
        const thumbUrl = getPlexImageUrl(
          item.grandparentThumb || item.parentThumb || item.thumb,
          80,
          120,
        );
        const title =
          item.type === "episode"
            ? `${item.grandparentTitle} — ${item.title}`
            : item.title;

        return (
          <Card key={item.ratingKey} className="flex-row gap-3">
            {thumbUrl ? (
              <Image
                source={{ uri: thumbUrl }}
                className="w-14 h-20 rounded-lg bg-surface-light"
                resizeMode="cover"
              />
            ) : (
              <View className="w-14 h-20 rounded-lg bg-surface-light items-center justify-center">
                <Tv size={18} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                {title}
              </Text>
              {item.parentTitle && (
                <Text className="text-zinc-500 text-xs">{item.parentTitle}</Text>
              )}
              {item.year && (
                <Text className="text-zinc-600 text-xs">{item.year}</Text>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

function Libraries() {
  const { data: libraries, isLoading } = usePlexLibraries();

  if (isLoading) return <Text className="text-zinc-500">Loading...</Text>;
  if (!libraries?.length) {
    return <EmptyState title="No libraries found" />;
  }

  const iconForType = (type: string) => {
    switch (type) {
      case "movie": return "film";
      case "show": return "tv";
      default: return "library";
    }
  };

  return (
    <View className="gap-2">
      {libraries.map((lib) => (
        <Card key={lib.key} className="flex-row items-center gap-3">
          <View className="bg-surface-light rounded-xl p-2.5">
            <Library size={20} color="#a1a1aa" />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-200 text-sm font-medium">{lib.title}</Text>
            <Text className="text-zinc-500 text-xs capitalize">{lib.type}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

function MediaPoster({ item }: { item: PlexMediaItem }) {
  const thumbUrl = getPlexImageUrl(
    item.grandparentThumb || item.parentThumb || item.thumb,
    200,
    300,
  );
  const title =
    item.type === "episode"
      ? item.grandparentTitle || item.title
      : item.title;

  return (
    <View className="w-[30%]">
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Play size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-xs mt-1" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
