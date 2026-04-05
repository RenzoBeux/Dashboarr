import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Play,
  Pause,
  Monitor,
  Smartphone,
  Loader,
  Wifi,
  ArrowDown,
} from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useTautulliActivity, useTautulliHistory } from "@/hooks/use-tautulli";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatBytes } from "@/lib/utils";
import type { TautulliSession, TautulliHistoryItem } from "@/lib/types";

type Tab = "streams" | "history";

export default function ActivityScreen() {
  const [tab, setTab] = useState<Tab>("streams");
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["tautulli"]]);

  const tautulliHealth = healthData?.find((s) => s.id === "tautulli");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Activity" online={tautulliHealth?.online} />

      <View className="flex-row gap-2 mb-4">
        {(["streams", "history"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </View>

      {tab === "streams" && <ActiveStreams />}
      {tab === "history" && <HistoryList />}
    </ScreenWrapper>
  );
}

function ActiveStreams() {
  const { data: activity, isLoading } = useTautulliActivity();

  if (isLoading) return <SkeletonCardContent rows={3} />;

  const sessions = activity?.sessions ?? [];
  const streamCount = parseInt(activity?.stream_count ?? "0", 10);

  return (
    <View>
      {/* Bandwidth Summary */}
      {activity && (
        <Card className="mb-4">
          <View className="flex-row justify-between">
            <View>
              <Text className="text-zinc-500 text-xs">Active Streams</Text>
              <Text className="text-zinc-100 text-2xl font-bold">{streamCount}</Text>
            </View>
            <View className="items-end">
              <Text className="text-zinc-500 text-xs">Total Bandwidth</Text>
              <Text className="text-zinc-100 text-lg font-semibold">
                {formatBytes(activity.total_bandwidth * 1000)}/s
              </Text>
            </View>
          </View>
          {streamCount > 0 && (
            <View className="flex-row gap-4 mt-2">
              <Text className="text-zinc-500 text-xs">
                WAN: {formatBytes(activity.wan_bandwidth * 1000)}/s
              </Text>
              <Text className="text-zinc-500 text-xs">
                LAN: {formatBytes(activity.lan_bandwidth * 1000)}/s
              </Text>
            </View>
          )}
        </Card>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Play size={32} color="#71717a" />}
          title="No active streams"
          message="Nothing is playing right now"
        />
      ) : (
        <View className="gap-3">
          {sessions.map((session) => (
            <SessionCard key={session.session_key} session={session} />
          ))}
        </View>
      )}
    </View>
  );
}

function SessionCard({ session }: { session: TautulliSession }) {
  const progress = parseInt(session.progress_percent, 10) / 100;
  const isPaused = session.state === "paused";
  const isBuffering = session.state === "buffering";

  const StateIcon = isPaused ? Pause : isBuffering ? Loader : Play;
  const stateColor = isPaused ? "#f59e0b" : isBuffering ? "#f59e0b" : "#22c55e";

  const transcodeLabel =
    session.transcode_decision === "direct play"
      ? "Direct Play"
      : session.transcode_decision === "copy"
        ? "Direct Stream"
        : "Transcode";

  const transcodeVariant =
    session.transcode_decision === "direct play"
      ? "success"
      : session.transcode_decision === "copy"
        ? "downloading"
        : "warning";

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-2">
        <StateIcon size={16} color={stateColor} />
        <Text className="text-zinc-200 text-sm font-medium flex-1" numberOfLines={1}>
          {session.full_title}
        </Text>
      </View>

      <ProgressBar progress={progress} showLabel className="mb-2" />

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Badge label={transcodeLabel} variant={transcodeVariant as any} />
          {session.video_resolution && (
            <Badge label={session.video_resolution} variant="default" />
          )}
        </View>
      </View>

      <View className="flex-row items-center gap-3 mt-2">
        <Text className="text-zinc-500 text-xs">{session.user}</Text>
        <Text className="text-zinc-600 text-xs">·</Text>
        <Text className="text-zinc-500 text-xs">{session.player}</Text>
        <Text className="text-zinc-600 text-xs">·</Text>
        <Text className="text-zinc-500 text-xs">{session.platform}</Text>
      </View>
    </Card>
  );
}

function HistoryList() {
  const { data, isLoading } = useTautulliHistory(30);

  if (isLoading) return <SkeletonCardContent rows={5} />;

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <EmptyState title="No history" message="No recent playback history" />;
  }

  return (
    <View className="gap-2">
      {items.map((item) => (
        <HistoryRow key={item.row_id} item={item} />
      ))}
    </View>
  );
}

function HistoryRow({ item }: { item: TautulliHistoryItem }) {
  const date = new Date(item.date * 1000);
  const duration = Math.round(item.duration / 60);
  const watched = item.watched_status === 1;

  return (
    <Card className="flex-row items-center gap-3">
      <View
        className={`w-1.5 h-10 rounded-full ${watched ? "bg-success" : "bg-zinc-600"}`}
      />
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm" numberOfLines={1}>
          {item.full_title}
        </Text>
        <Text className="text-zinc-500 text-xs">
          {item.friendly_name} · {item.player} · {duration}m ·{" "}
          {date.toLocaleDateString()}
        </Text>
      </View>
      <Text className="text-zinc-500 text-xs">{item.percent_complete}%</Text>
    </Card>
  );
}
