import { View, Text } from "react-native";
import { ArrowDown, ArrowUp, ServerCrash } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ThroughputPill,
  ThroughputPillSkeleton,
} from "@/components/dashboard/throughput-pill";
import { getServerState } from "@/services/qbittorrent-api";
import { getRtorrentGlobalStats } from "@/services/rtorrent-api";
import { getSabQueue } from "@/services/sabnzbd-api";
import { getNet, selectInterfaces } from "@/services/glances-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { POLLING_INTERVALS } from "@/lib/constants";
import { formatSpeed, formatBytes } from "@/lib/utils";
import {
  SPEED_STATS_DEFAULT_SETTINGS,
  resolveSpeedStatsSource,
  type SpeedStatsSettingsValue,
} from "@/components/dashboard/widget-settings/speed-stats-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function SpeedStatsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<SpeedStatsSettingsValue>(
    slotId,
    SPEED_STATS_DEFAULT_SETTINGS,
  );
  const allQbitInstances = useEnabledInstances("qbittorrent");
  const allSabInstances = useEnabledInstances("sabnzbd");
  const allRtInstances = useEnabledInstances("rtorrent");
  const allGlancesInstances = useEnabledInstances("glances");

  // A widget shows exactly one source — download clients OR server network —
  // so the pills never double-count traffic a client pushes through the same
  // NIC Glances reports. The selection is forced when only one kind is
  // configured (see resolveSpeedStatsSource).
  const hasClients =
    allQbitInstances.length + allSabInstances.length + allRtInstances.length > 0;
  const source = resolveSpeedStatsSource(
    settings.source,
    hasClients,
    allGlancesInstances.length > 0,
  );
  const useClients = source === "clients";
  const useNetwork = source === "network";

  // qBittorrent binds per-widget; rtorrent folds in every enabled instance (no
  // per-widget binding yet, phase 2).
  const qbitInstances = useClients
    ? resolveBoundInstances(settings.instanceIds, allQbitInstances)
    : [];
  // When the user has no qBit configured at all, the toggle is moot — fold any
  // enabled SAB instances in automatically so a SAB-only user sees real numbers
  // instead of a perpetual skeleton. Once they enable qBit, the explicit toggle
  // takes over again.
  const effectiveIncludeSab =
    useClients && (settings.includeSab || allQbitInstances.length === 0);
  const sabInstances = effectiveIncludeSab
    ? resolveBoundInstances(settings.sabInstanceIds, allSabInstances)
    : [];
  const rtInstances = useClients ? allRtInstances : [];
  // Glances interfaces: received bytes → down pill, sent bytes → up pill.
  const glancesInstances = useNetwork
    ? resolveBoundInstances(settings.glancesInstanceIds, allGlancesInstances)
    : [];

  // Fan out across the resolved instances and sum their counters so a single
  // Speed pill represents the whole stack at a glance. Each instance keeps
  // its own cache slot via the [serviceId, instanceId, …] queryKey shape.
  // Uses /sync/maindata (server_state) instead of /transfer/info because
  // only server_state carries lifetime totals (alltime_dl/alltime_ul) — the
  // dashboard "X GB total" used to reset when qBit restarted (#104).
  const qbitQueries = useQueries({
    queries: qbitInstances.map((inst) => ({
      queryKey: ["qbittorrent", inst.id, "serverState"] as const,
      queryFn: () => getServerState(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  // SAB only reports an instantaneous download speed (no upload, no lifetime
  // counter) — it gets folded into the down pill only.
  const sabQueries = useQueries({
    queries: sabInstances.map((inst) => ({
      queryKey: ["sabnzbd", inst.id, "queue"] as const,
      queryFn: () => getSabQueue(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  // rtorrent reports current dl/up rate + cumulative totals via the same
  // ["rtorrent", id, "globalStats"] key the adapter uses, so the cache is shared.
  const rtQueries = useQueries({
    queries: rtInstances.map((inst) => ({
      queryKey: ["rtorrent", inst.id, "globalStats"] as const,
      queryFn: () => getRtorrentGlobalStats(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  // Shares the ["glances", id, "net"] key with the Server Stats widget and the
  // Glances screen, so the cache is reused across all three.
  const glancesQueries = useQueries({
    queries: glancesInstances.map((inst) => ({
      queryKey: ["glances", inst.id, "net"] as const,
      queryFn: () => getNet(inst.id),
      refetchInterval: POLLING_INTERVALS.transferSpeed,
    })),
  });

  // Show the skeleton only on the very first cold load; once any instance has
  // returned a transfer snapshot, keep rendering the summed pill even if one
  // instance later goes offline. The sum gracefully drops to the live
  // instances' contributions instead of flickering back to skeleton on each
  // retry.
  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState([
    ...qbitQueries,
    ...sabQueries,
    ...rtQueries,
    ...glancesQueries,
  ]);

  const hasAnySource =
    qbitInstances.length +
      sabInstances.length +
      rtInstances.length +
      glancesInstances.length >
    0;

  const title = settings.title.trim();
  const header = title ? (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
  ) : null;

  if (!hasAnySource) {
    return (
      <Card>
        {header}
        <Text className="text-zinc-500 text-sm">
          No sources selected. Enable download clients or server network in widget settings.
        </Text>
      </Card>
    );
  }

  // Every bound source errored without ever returning data — surface that
  // instead of a misleading "0 B/s" that reads as "idle".
  if (isAllErrored) {
    return (
      <Card>
        {header}
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ServerCrash} size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">
            Could not reach {useNetwork ? "Glances" : "the download clients"}
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
          <ThroughputPillSkeleton tone="down" />
          <ThroughputPillSkeleton tone="up" />
        </View>
      </Card>
    );
  }

  let dlSpeed = 0;
  let upSpeed = 0;
  let dlAlltime = 0;
  let upAlltime = 0;
  let dlSession = 0;
  let upSession = 0;
  for (const q of qbitQueries) {
    if (!q.data) continue;
    dlSpeed += q.data.dl_info_speed;
    upSpeed += q.data.up_info_speed;
    // server_state carries both counters — alltime persists across restarts,
    // session resets on each qBit start. The widget's `totalsScope` setting
    // picks which subtitle(s) to render (see #104).
    dlAlltime += q.data.alltime_dl;
    upAlltime += q.data.alltime_ul;
    dlSession += q.data.dl_info_data;
    upSession += q.data.up_info_data;
  }
  for (const q of sabQueries) {
    if (!q.data) continue;
    // SAB returns kbpersec as a string in KB/s; the rest of the card works in
    // bytes/s so normalize here.
    const kbps = parseFloat(q.data.kbpersec);
    if (Number.isFinite(kbps)) dlSpeed += kbps * 1024;
  }
  for (const q of rtQueries) {
    if (!q.data) continue;
    dlSpeed += q.data.dlSpeed;
    upSpeed += q.data.upSpeed;
    // rtorrent's global totals are cumulative since the rtorrent process
    // started, so fold them into the "total" bucket alongside qBit's alltime.
    dlAlltime += q.data.dlTotalLifetime;
    upAlltime += q.data.upTotalLifetime;
  }
  for (const q of glancesQueries) {
    if (!q.data) continue;
    // Received → down, sent → up. Glances exposes no lifetime counter, so it
    // contributes to live speed only (handled by the totals guard below).
    for (const iface of selectInterfaces(q.data, settings.glancesInterfaces)) {
      dlSpeed += iface.rx;
      upSpeed += iface.tx;
    }
  }

  // Lifetime totals are a client-only concept (qBit/rtorrent counters), so they
  // only apply to a client-source widget. (SAB still suppresses the down total
  // below — it adds live download speed with no matching counter.)
  const clientTotalsMeaningful = useClients;
  const scope = settings.totalsScope;
  const dlTotalLines =
    clientTotalsMeaningful && sabInstances.length === 0
      ? buildTotalLines(scope, dlAlltime, dlSession)
      : [];
  const upTotalLines = clientTotalsMeaningful
    ? buildTotalLines(scope, upAlltime, upSession)
    : [];

  return (
    <Card>
      {header}
      <View className="flex-row gap-3">
        <ThroughputPill
          icon={ArrowDown}
          iconColor="#3b82f6"
          bgClass="bg-blue-600/10"
          valueClass="text-download"
          value={formatSpeed(dlSpeed)}
          subtitles={dlTotalLines.map((l) => `${l.value} ${l.label}`)}
        />
        <ThroughputPill
          icon={ArrowUp}
          iconColor="#22c55e"
          bgClass="bg-green-600/10"
          valueClass="text-upload"
          value={formatSpeed(upSpeed)}
          subtitles={upTotalLines.map((l) => `${l.value} ${l.label}`)}
        />
      </View>
    </Card>
  );
}

function buildTotalLines(
  scope: SpeedStatsSettingsValue["totalsScope"],
  alltime: number,
  session: number,
): { label: string; value: string }[] {
  // Labels stay short ("total"/"session") so they fit inside the pill at
  // uiScale 1.3 — longer words like "all-time" overflow the 50%-width pill
  // even with min-w-0 + ellipsize. In Both mode the two rows are adjacent,
  // so "total" reads unambiguously as "lifetime" against the "session" row.
  switch (scope) {
    case "session":
      return [{ label: "session", value: formatBytes(session) }];
    case "both":
      return [
        { label: "total", value: formatBytes(alltime) },
        { label: "session", value: formatBytes(session) },
      ];
    case "alltime":
    default:
      return [{ label: "total", value: formatBytes(alltime) }];
  }
}

