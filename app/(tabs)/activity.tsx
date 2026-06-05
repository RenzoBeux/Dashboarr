import { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  Play,
  Pause,
  Loader,
  ChevronDown,
  ChevronUp,
  ChartColumn,
} from "lucide-react-native";
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
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { lightHaptic } from "@/lib/haptics";
import { POLLING_INTERVALS, ICON } from "@/lib/constants";
import {
  getMonitorAdapter,
  type MonitorHistoryItem,
  type MonitorKind,
} from "@/lib/monitor-adapter";
import type { NowPlayingStream, StreamDetails } from "@/lib/now-playing-stream";

type Tab = "streams" | "history";

interface MonitorSource {
  kind: MonitorKind;
  instanceId: string;
}

// Resolve every enabled instance across the stream monitors (Tautulli +
// Tracearr + JellyStat) and the media servers with live sessions (Jellyfin +
// Emby) into a flat source list. The per-kind hook calls keep a stable order.
function useMonitorSources(): MonitorSource[] {
  const attached = useAttachedInstances();
  const tautulli = useEnabledInstances("tautulli");
  const tracearr = useEnabledInstances("tracearr");
  const jellystat = useEnabledInstances("jellystat");
  const jellyfin = useEnabledInstances("jellyfin");
  const emby = useEnabledInstances("emby");
  return useMemo<MonitorSource[]>(() => {
    // Only monitors attached to the active workspace — otherwise a curated
    // dashboard's Activity tab would surface (and poll every 5s) another
    // workspace's live sessions and history (#148 review Rec #2). This is a
    // full-screen tab with no per-widget binding, so the filter is purely the
    // workspace attachment set.
    const inWs = (i: { id: string }) => attached.has(i.id);
    return [
      ...tautulli.filter(inWs).map((i) => ({ kind: "tautulli" as MonitorKind, instanceId: i.id })),
      ...tracearr.filter(inWs).map((i) => ({ kind: "tracearr" as MonitorKind, instanceId: i.id })),
      ...jellystat.filter(inWs).map((i) => ({ kind: "jellystat" as MonitorKind, instanceId: i.id })),
      ...jellyfin.filter(inWs).map((i) => ({ kind: "jellyfin" as MonitorKind, instanceId: i.id })),
      ...emby.filter(inWs).map((i) => ({ kind: "emby" as MonitorKind, instanceId: i.id })),
    ];
  }, [tautulli, tracearr, jellystat, jellyfin, emby, attached]);
}

// Stream monitors with a dedicated stats screen (charts + most active users).
// Tautulli covers Plex; JellyStat covers Jellyfin. A button is shown per
// configured source — the logo disambiguates when both are present.
const STATS_SOURCES: { kind: MonitorKind; route: "/tautulli-stats" | "/jellystat-stats"; label: string }[] = [
  { kind: "tautulli", route: "/tautulli-stats", label: "Tautulli stats" },
  { kind: "jellystat", route: "/jellystat-stats", label: "JellyStat stats" },
];

export default function ActivityScreen() {
  const [tab, setTab] = useState<Tab>("streams");
  const sources = useMonitorSources();
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["monitor"]]);

  // Which stats screens to surface — one button per configured stats source.
  const statsSources = useMemo(
    () => STATS_SOURCES.filter((ss) => sources.some((s) => s.kind === ss.kind)),
    [sources],
  );

  // Kind-aggregated online: green when any enabled monitor kind is reachable.
  const enabledKinds = new Set(sources.map((s) => s.kind));
  const online =
    enabledKinds.size === 0
      ? undefined
      : [...enabledKinds].some((k) => healthData?.find((s) => s.id === k)?.online);

  // Show the source logo on each row only when more than one source contributes.
  const showSource = enabledKinds.size > 1;

  // Tautulli/Tracearr/JellyStat expose history; Jellyfin/Emby are live-only.
  // Hide the History tab entirely when no configured source supports it.
  const historySources = useMemo(
    () => sources.filter((s) => getMonitorAdapter(s.kind).supportsHistory),
    [sources],
  );
  const tabs: Tab[] = historySources.length > 0 ? ["streams", "history"] : ["streams"];
  // Fall back to Streams if History became unavailable (e.g. Tautulli removed).
  const activeTab: Tab = tabs.includes(tab) ? tab : "streams";

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="Activity" online={online} />
        {statsSources.length > 0 && (
          <View className="flex-row items-center gap-1">
            {statsSources.map((ss) => (
              <Pressable
                key={ss.kind}
                onPress={() => router.push(ss.route)}
                className="p-2 active:opacity-70"
                accessibilityLabel={ss.label}
              >
                {statsSources.length > 1 ? (
                  <ServiceLogo id={ss.kind} size={ICON.LG} />
                ) : (
                  <Icon icon={ChartColumn} size={ICON.LG} color="#a1a1aa" />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {sources.length === 0 ? (
        <EmptyState
          title="No monitor configured"
          message="Enable Tautulli, Tracearr, JellyStat, Jellyfin, or Emby in Settings"
        />
      ) : (
        <>
          {tabs.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
              className="mb-4"
            >
              {tabs.map((t) => (
                <FilterChip
                  key={t}
                  label={t.charAt(0).toUpperCase() + t.slice(1)}
                  selected={activeTab === t}
                  onPress={() => setTab(t)}
                />
              ))}
            </ScrollView>
          )}

          {activeTab === "streams" && (
            <ActiveStreams sources={sources} showSource={showSource} />
          )}
          {activeTab === "history" && <HistoryList sources={historySources} />}
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
  const [expanded, setExpanded] = useState(false);
  const StateIcon =
    stream.state === "paused" ? Pause : stream.state === "buffering" ? Loader : Play;
  const stateColor = stream.state === "playing" ? "#22c55e" : "#f59e0b";

  const meta = [stream.user, stream.device].filter(Boolean);
  const details = stream.details;
  // Only Tautulli supplies the per-track breakdown today, so only those cards
  // are tappable to expand.
  const expandable = !!details && details.tracks.length > 0;

  return (
    <Card
      onPress={
        expandable
          ? () => {
              lightHaptic();
              setExpanded((e) => !e);
            }
          : undefined
      }
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Icon icon={StateIcon} size={16} color={stateColor} />
        <Text className="text-zinc-200 text-sm font-medium flex-1" numberOfLines={1}>
          {stream.title}
        </Text>
        {showSource && <ServiceLogo id={stream.serviceId} size={16} />}
        {expandable && (
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={16} color="#71717a" />
        )}
      </View>

      <ProgressBar progress={stream.progress} showLabel className="mb-2" />

      <View className="flex-row items-center gap-2 flex-wrap">
        <Badge label={stream.transcoding ? "Transcode" : "Direct Play"} variant={stream.transcoding ? "warning" : "success"} />
        {stream.resolution && <Badge label={stream.resolution} variant="default" />}
        {details?.totalBitrateLabel && (
          <Badge label={details.totalBitrateLabel} variant="default" />
        )}
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

      {expandable && expanded && <StreamDetailSection details={details} />}
    </Card>
  );
}

function StreamDetailSection({ details }: { details: StreamDetails }) {
  return (
    <View className="mt-3 pt-3 border-t border-border/50 gap-2">
      {details.tracks.map((track) => (
        <View key={track.label} className="flex-row items-center gap-2">
          <Text className="text-zinc-500 text-xs w-16">{track.label}</Text>
          <Badge
            label={track.decision}
            variant={track.transcoding ? "warning" : "success"}
          />
          <Text className="text-zinc-400 text-xs flex-1" numberOfLines={1}>
            {track.summary}
          </Text>
          {track.bitrateLabel && (
            <Text className="text-zinc-500 text-xs">{track.bitrateLabel}</Text>
          )}
        </View>
      ))}
      {(details.container || details.qualityProfile) && (
        <Text className="text-zinc-500 text-xs mt-1">
          {[
            details.container ? `Container: ${details.container}` : null,
            details.qualityProfile ? `Quality: ${details.qualityProfile}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
      )}
    </View>
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
      {item.percentComplete != null && (
        <Text className="text-zinc-500 text-xs">{item.percentComplete}%</Text>
      )}
    </Card>
  );
}
