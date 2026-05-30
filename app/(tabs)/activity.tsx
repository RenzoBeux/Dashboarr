import { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Play, Pause, Loader } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ServiceLogo } from "@/components/ui/service-logo";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { POLLING_INTERVALS } from "@/lib/constants";
import {
  getMonitorAdapter,
  type MonitorHistoryItem,
  type MonitorKind,
} from "@/lib/monitor-adapter";
import type { NowPlayingStream } from "@/lib/now-playing-stream";

type Tab = "streams" | "history";

interface MonitorSource {
  kind: MonitorKind;
  instanceId: string;
}

// Resolve every enabled instance across both stream monitors (Tautulli +
// Tracearr) into a flat source list. MONITOR_KINDS has fixed length, so the
// per-kind hook calls keep a stable order.
function useMonitorSources(): MonitorSource[] {
  const tautulli = useEnabledInstances("tautulli");
  const tracearr = useEnabledInstances("tracearr");
  return useMemo<MonitorSource[]>(
    () => [
      ...tautulli.map((i) => ({ kind: "tautulli" as MonitorKind, instanceId: i.id })),
      ...tracearr.map((i) => ({ kind: "tracearr" as MonitorKind, instanceId: i.id })),
    ],
    [tautulli, tracearr],
  );
}

export default function ActivityScreen() {
  const [tab, setTab] = useState<Tab>("streams");
  const sources = useMonitorSources();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["monitor"]]);

  // Kind-aggregated online: green when any enabled monitor kind is reachable.
  const enabledKinds = new Set(sources.map((s) => s.kind));
  const online =
    enabledKinds.size === 0
      ? undefined
      : [...enabledKinds].some((k) => healthData?.find((s) => s.id === k)?.online);

  // Show the source logo on each row only when both monitors contribute streams.
  const showSource = enabledKinds.size > 1;

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Activity" online={online} />

      {sources.length === 0 ? (
        <EmptyState title="No monitor configured" message="Enable Tautulli or Tracearr in Settings" />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            className="mb-4"
          >
            {(["streams", "history"] as Tab[]).map((t) => (
              <FilterChip
                key={t}
                label={t.charAt(0).toUpperCase() + t.slice(1)}
                selected={tab === t}
                onPress={() => setTab(t)}
              />
            ))}
          </ScrollView>

          {tab === "streams" && <ActiveStreams sources={sources} showSource={showSource} />}
          {tab === "history" && <HistoryList sources={sources} />}
        </>
      )}
    </ScreenWrapper>
  );
}

function ActiveStreams({
  sources,
  showSource,
}: {
  sources: MonitorSource[];
  showSource: boolean;
}) {
  const queries = useQueries({
    queries: sources.map((src) => ({
      queryKey: ["monitor", src.kind, src.instanceId, "activity"] as const,
      queryFn: () => getMonitorAdapter(src.kind).getActivity(src.instanceId),
      refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s — live streams
    })),
  });

  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState(queries);

  if (isInitialLoading) return <SkeletonCardContent rows={3} />;
  if (isAllErrored) {
    const error = queries.find((q) => q.error)?.error;
    return <ErrorBanner error={error} title="Failed to load active streams" />;
  }

  const streams: NowPlayingStream[] = queries.flatMap((q) => q.data?.streams ?? []);
  const streamCount = queries.reduce((acc, q) => acc + (q.data?.streamCount ?? 0), 0);
  const bandwidthLabels = queries
    .map((q) => q.data?.bandwidthLabel)
    .filter((l): l is string => !!l);

  return (
    <View>
      <Card className="mb-4">
        <View className="flex-row justify-between">
          <View>
            <Text className="text-zinc-500 text-xs">Active Streams</Text>
            <Text className="text-zinc-100 text-2xl font-bold">{streamCount}</Text>
          </View>
          {bandwidthLabels.length > 0 && (
            <View className="items-end">
              <Text className="text-zinc-500 text-xs">Total Bandwidth</Text>
              <Text className="text-zinc-100 text-lg font-semibold">
                {bandwidthLabels.join(" · ")}
              </Text>
            </View>
          )}
        </View>
      </Card>

      {streams.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Play} size={32} color="#71717a" />}
          title="No active streams"
          message="Nothing is playing right now"
        />
      ) : (
        <View className="gap-3">
          {streams.map((stream) => (
            <StreamCard key={stream.key} stream={stream} showSource={showSource} />
          ))}
        </View>
      )}
    </View>
  );
}

function StreamCard({
  stream,
  showSource,
}: {
  stream: NowPlayingStream;
  showSource: boolean;
}) {
  const StateIcon =
    stream.state === "paused" ? Pause : stream.state === "buffering" ? Loader : Play;
  const stateColor = stream.state === "playing" ? "#22c55e" : "#f59e0b";

  const meta = [stream.user, stream.device].filter(Boolean);

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-2">
        <Icon icon={StateIcon} size={16} color={stateColor} />
        <Text className="text-zinc-200 text-sm font-medium flex-1" numberOfLines={1}>
          {stream.title}
        </Text>
        {showSource && <ServiceLogo id={stream.serviceId} size={16} />}
      </View>

      <ProgressBar progress={stream.progress} showLabel className="mb-2" />

      <View className="flex-row items-center gap-2">
        <Badge label={stream.transcoding ? "Transcode" : "Direct Play"} variant={stream.transcoding ? "warning" : "success"} />
        {stream.resolution && <Badge label={stream.resolution} variant="default" />}
      </View>

      {meta.length > 0 && (
        <View className="flex-row items-center gap-2 mt-2">
          {meta.map((m, i) => (
            <View key={i} className="flex-row items-center gap-2">
              {i > 0 && <Text className="text-zinc-600 text-xs">·</Text>}
              <Text className="text-zinc-500 text-xs">{m}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function HistoryList({ sources }: { sources: MonitorSource[] }) {
  const queries = useQueries({
    queries: sources.map((src) => ({
      queryKey: ["monitor", src.kind, src.instanceId, "history", 30] as const,
      queryFn: () => getMonitorAdapter(src.kind).getHistory(30, src.instanceId),
      refetchInterval: POLLING_INTERVALS.calendar, // 60s
    })),
  });

  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState(queries);

  if (isInitialLoading) return <SkeletonCardContent rows={5} />;
  if (isAllErrored) {
    const error = queries.find((q) => q.error)?.error;
    return <ErrorBanner error={error} title="Failed to load history" />;
  }

  // Combine across sources, newest first.
  const items = queries
    .flatMap((q) => q.data ?? [])
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (items.length === 0) {
    return <EmptyState title="No history" message="No recent playback history" />;
  }

  return (
    <View className="gap-2">
      {items.map((item) => (
        <HistoryRow key={item.key} item={item} />
      ))}
    </View>
  );
}

function HistoryRow({ item }: { item: MonitorHistoryItem }) {
  const meta = [item.user, item.device, `${item.durationMin}m`, item.date.toLocaleDateString()]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="flex-row items-center gap-3">
      <View
        className={`w-1.5 h-10 rounded-full ${item.watched ? "bg-success" : "bg-zinc-600"}`}
      />
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-zinc-500 text-xs">{meta}</Text>
      </View>
      <Text className="text-zinc-500 text-xs">{item.percentComplete}%</Text>
    </Card>
  );
}
