import { View, Text } from "react-native";
import { Globe, Network, ServerCrash } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ThroughputPill,
  ThroughputPillSkeleton,
} from "@/components/dashboard/throughput-pill";
import { getActivity as getTautulliActivity } from "@/services/tautulli-api";
import { getSessions as getPlexSessions } from "@/services/plex-api";
import { getSessions as getJellyfinSessions } from "@/services/jellyfin-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  STREAMING_BANDWIDTH_DEFAULT_SETTINGS,
  type StreamingBandwidthSettingsValue,
} from "@/components/dashboard/widget-settings/streaming-bandwidth-settings";
import {
  resolveStreamingService,
  tautulliActivityToWanLan,
  plexSessionsToWanLan,
  mediaServerSessionsToWanLan,
  type StreamingServiceId,
  type WanLanKbps,
} from "@/lib/streaming-bandwidth";
import { POLLING_INTERVALS, SERVICE_DEFAULTS } from "@/lib/constants";
import { formatBitrate } from "@/lib/utils";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type {
  TautulliActivity,
  PlexSession,
  JellyfinSession,
} from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

const STREAMING_SERVICES: readonly StreamingServiceId[] = [
  "tautulli",
  "plex",
  "jellyfin",
  "emby",
];

type StreamingPayload = TautulliActivity | PlexSession[] | JellyfinSession[];

// Reuse the keys the now-playing / monitor surfaces already poll so the cache
// is shared (no extra polling) for Plex/Jellyfin/Emby. Tautulli activity uses a
// dedicated key (the monitor stores an adapter shape without WAN/LAN).
function streamingQueryKey(kind: StreamingServiceId, id: string) {
  switch (kind) {
    case "tautulli":
      return ["tautulli", id, "activity"] as const;
    case "plex":
      return ["plex", id, "sessions"] as const;
    case "jellyfin":
      return ["jellyfin", id, "sessions"] as const;
    case "emby":
      return ["emby", id, "sessions"] as const;
  }
}

function fetchStreaming(
  kind: StreamingServiceId,
  id: string,
): Promise<StreamingPayload> {
  switch (kind) {
    case "tautulli":
      return getTautulliActivity(id);
    case "plex":
      return getPlexSessions(id);
    case "jellyfin":
      return getJellyfinSessions(id, "jellyfin");
    case "emby":
      return getJellyfinSessions(id, "emby");
  }
}

function streamingWanLan(
  kind: StreamingServiceId,
  data: StreamingPayload,
): WanLanKbps {
  switch (kind) {
    case "tautulli":
      return tautulliActivityToWanLan(data as TautulliActivity);
    case "plex":
      return plexSessionsToWanLan(data as PlexSession[]);
    default:
      return mediaServerSessionsToWanLan(data as JellyfinSession[]);
  }
}

export function StreamingBandwidthCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<StreamingBandwidthSettingsValue>(
    slotId,
    STREAMING_BANDWIDTH_DEFAULT_SETTINGS,
  );

  const tautulli = useEnabledInstances("tautulli");
  const plex = useEnabledInstances("plex");
  const jellyfin = useEnabledInstances("jellyfin");
  const emby = useEnabledInstances("emby");
  const instancesByService: Record<StreamingServiceId, ServiceInstance[]> = {
    tautulli,
    plex,
    jellyfin,
    emby,
  };
  const configured = STREAMING_SERVICES.filter(
    (s) => instancesByService[s].length > 0,
  );
  const service = resolveStreamingService(settings.service, configured);

  const instances = service
    ? resolveBoundInstances(settings.instanceIds, instancesByService[service])
    : [];

  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: service
        ? streamingQueryKey(service, inst.id)
        : (["streaming-bandwidth", "idle"] as const),
      queryFn: () => fetchStreaming(service!, inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState(queries);
  const hasSource = !!service && instances.length > 0;
  const serviceLabel = service ? SERVICE_DEFAULTS[service].name : "";

  const title = settings.title.trim();
  const header = title ? (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
  ) : null;

  if (!hasSource) {
    return (
      <Card>
        {header}
        <Text className="text-zinc-500 text-sm">
          No streaming server selected. Pick one in widget settings.
        </Text>
      </Card>
    );
  }

  // Every bound instance errored without ever returning data — surface that
  // instead of a misleading "0 Mbps" that reads as "nothing streaming".
  if (isAllErrored) {
    return (
      <Card>
        {header}
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ServerCrash} size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">
            Could not reach {serviceLabel}
          </Text>
        </View>
      </Card>
    );
  }

  if (isInitialLoading) {
    return (
      <Card>
        {header}
        <View className="flex-row gap-3">
          <ThroughputPillSkeleton tone="up" />
          <ThroughputPillSkeleton tone="down" />
        </View>
      </Card>
    );
  }

  let wan = 0;
  let lan = 0;
  for (const q of queries) {
    if (!q.data) continue;
    const wl = streamingWanLan(service!, q.data);
    wan += wl.wan;
    lan += wl.lan;
  }

  return (
    <Card>
      {header}
      <View className="flex-row gap-3">
        <ThroughputPill
          icon={Globe}
          iconColor="#22c55e"
          bgClass="bg-green-600/10"
          valueClass="text-upload"
          value={formatBitrate(wan)}
          subtitles={["WAN"]}
        />
        <ThroughputPill
          icon={Network}
          iconColor="#3b82f6"
          bgClass="bg-blue-600/10"
          valueClass="text-download"
          value={formatBitrate(lan)}
          subtitles={["LAN"]}
        />
      </View>
      {/* Jellyfin/Emby only expose a bitrate while transcoding, so direct-play
          streams read as 0 — say so rather than look broken. */}
      {(service === "jellyfin" || service === "emby") && (
        <Text className="text-zinc-600 text-[0.7rem] mt-2">
          Transcoded streams only — direct play isn&apos;t counted
        </Text>
      )}
    </Card>
  );
}
