import { memo, useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  Cpu as CpuIcon,
  MemoryStick,
  Gpu as GpuIconSvg,
  HardDrive,
  Network,
  Gauge,
  Activity,
  ServerCrash,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getCpu, getMem, getFs, getGpu, getNet, getLoad, selectInterfaces, type GlancesNetRate } from "@/services/glances-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { useUiScale } from "@/hooks/use-ui-scale";
import {
  SERVER_STATS_DEFAULT_SETTINGS,
  type ServerStatsSettingsValue,
} from "@/components/dashboard/widget-settings/server-stats-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { formatBytes, formatSpeed } from "@/lib/utils";
import type { GlancesFsItem, GlancesGpuItem, GlancesLoad } from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

const RING_BASE = 60;
const STROKE_WIDTH = 6;
const FAST_POLL = 5000;

function ringColor(percent: number): string {
  if (percent >= 85) return "#ef4444";
  if (percent >= 70) return "#f59e0b";
  return "#22c55e";
}

function diskBarColor(percent: number): string {
  if (percent >= 85) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-success";
}

function diskTextColor(percent: number): string {
  if (percent >= 85) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-success";
}

interface MetricRingProps {
  percent: number;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
}

// Memoized: each Glances section has its own query, so when (say) the `net`
// query lands every poll, InstanceBlock re-renders — but the CPU/RAM/GPU rings'
// props are unchanged, so memo skips re-drawing their SVGs. Only the ring whose
// metric actually changed re-renders. This is the main fix for server-stats
// being the dashboard's heaviest re-render (6 queries × N instances, each
// resolution previously redrawing every ring).
const MetricRing = memo(function MetricRing({ percent, label, sublabel, icon }: MetricRingProps) {
  // Use numeric pixel size scaled by uiScale so the ring resizes with
  // accessibility scaling — react-native-svg props are numeric, not rem.
  const scale = useUiScale();
  const size = Math.round(RING_BASE * scale);
  const stroke = Math.max(4, Math.round(STROKE_WIDTH * scale));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercent =
    typeof percent === "number" && Number.isFinite(percent) ? percent : 0;
  const filled = circumference * (1 - Math.min(Math.max(safePercent, 0), 100) / 100);
  const color = ringColor(safePercent);

  return (
    <View className="items-center gap-1.5" style={{ minWidth: size + 8 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#27272a"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={filled}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text style={{ color }} className="text-sm font-bold leading-none">
            {safePercent.toFixed(0)}
            <Text style={{ color }} className="text-[0.6rem] font-semibold">
              %
            </Text>
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <Icon icon={icon} size={11} color="#a1a1aa" />
        <Text className="text-zinc-300 text-[0.7rem] font-semibold uppercase tracking-wider">
          {label}
        </Text>
      </View>
      {sublabel ? (
        <Text
          className="text-zinc-500 text-[0.65rem]"
          numberOfLines={1}
        >
          {sublabel}
        </Text>
      ) : null}
    </View>
  );
});

export function ServerStatsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<ServerStatsSettingsValue>(
    slotId,
    SERVER_STATS_DEFAULT_SETTINGS,
  );

  const instances = useWorkspaceScopedInstances("glances", settings.instanceIds);

  const allHidden =
    !settings.showCpu && !settings.showRam && !settings.showGpu && !settings.showDisks;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server</CardTitle>
      </CardHeader>

      {allHidden ? (
        <Text className="text-zinc-500 text-sm py-1">
          All sections hidden — enable one in the widget settings.
        </Text>
      ) : instances.length === 0 ? (
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ServerCrash} size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">No Glances instances enabled</Text>
        </View>
      ) : (
        <View className="gap-4">
          {instances.map((inst) => (
            <InstanceBlock
              key={inst.id}
              instance={inst}
              settings={settings}
              showName={instances.length > 1}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

interface InstanceBlockProps {
  instance: ServiceInstance;
  settings: ServerStatsSettingsValue;
  showName: boolean;
}

function InstanceBlock({ instance, settings, showName }: InstanceBlockProps) {
  // Each section has its own query so a flaky host doesn't block the others.
  const queries = useQueries({
    queries: [
      {
        queryKey: ["glances", instance.id, "cpu"] as const,
        queryFn: () => getCpu(instance.id),
        refetchInterval: FAST_POLL,
        // CPU also carries iowait, so fetch it when either is shown.
        enabled: settings.showCpu || settings.showIoWait,
      },
      {
        queryKey: ["glances", instance.id, "mem"] as const,
        queryFn: () => getMem(instance.id),
        refetchInterval: FAST_POLL,
        enabled: settings.showRam,
      },
      {
        queryKey: ["glances", instance.id, "fs"] as const,
        queryFn: () => getFs(instance.id),
        refetchInterval: FAST_POLL,
        enabled: settings.showDisks,
      },
      {
        queryKey: ["glances", instance.id, "gpu"] as const,
        queryFn: () => getGpu(instance.id),
        refetchInterval: FAST_POLL,
        enabled: settings.showGpu,
      },
      {
        queryKey: ["glances", instance.id, "net"] as const,
        queryFn: () => getNet(instance.id),
        refetchInterval: FAST_POLL,
        enabled: settings.showNetwork,
      },
      {
        queryKey: ["glances", instance.id, "load"] as const,
        queryFn: () => getLoad(instance.id),
        refetchInterval: FAST_POLL,
        enabled: settings.showLoad,
      },
    ],
  });
  const [cpuQuery, memQuery, fsQuery, gpuQuery, netQuery, loadQuery] = queries;
  const cpu = settings.showCpu ? cpuQuery.data : undefined;
  const mem = settings.showRam ? memQuery.data : undefined;
  const fs = settings.showDisks ? fsQuery.data : undefined;
  const gpus = settings.showGpu ? gpuQuery.data : undefined;
  // Memoized so an unchanged `net` payload keeps the same row refs across polls,
  // letting the memoized NetRow children skip re-rendering.
  const netRows = useMemo(
    () =>
      settings.showNetwork
        ? selectInterfaces(netQuery.data, settings.networkInterfaces, { activeOnly: true })
        : [],
    [settings.showNetwork, netQuery.data, settings.networkInterfaces],
  );
  const load = settings.showLoad ? loadQuery.data : undefined;
  const iowait =
    settings.showIoWait && typeof cpuQuery.data?.iowait === "number"
      ? cpuQuery.data.iowait
      : undefined;

  const isLoading =
    ((settings.showCpu || settings.showIoWait) && cpuQuery.isLoading) ||
    (settings.showRam && memQuery.isLoading) ||
    (settings.showDisks && fsQuery.isLoading) ||
    (settings.showGpu && gpuQuery.isLoading) ||
    (settings.showNetwork && netQuery.isLoading) ||
    (settings.showLoad && loadQuery.isLoading);
  const hasData =
    cpu ||
    mem ||
    (fs && fs.length > 0) ||
    (gpus && gpus.length > 0) ||
    netRows.length > 0 ||
    !!load ||
    typeof iowait === "number";
  const showError =
    !isLoading &&
    !hasData &&
    (((settings.showCpu || settings.showIoWait) && cpuQuery.isError) ||
      (settings.showRam && memQuery.isError) ||
      (settings.showDisks && fsQuery.isError) ||
      (settings.showGpu && gpuQuery.isError) ||
      (settings.showNetwork && netQuery.isError) ||
      (settings.showLoad && loadQuery.isError));

  const gpuRings = useMemo(() => buildGpuRings(gpus), [gpus]);
  const hasRings =
    (settings.showCpu && cpu) ||
    (settings.showRam && mem) ||
    gpuRings.length > 0;
  const hasStats = !!load || typeof iowait === "number";
  const hasDisks = settings.showDisks && fs && fs.length > 0;
  const hasNetwork = settings.showNetwork && netRows.length > 0;
  const showStatsDivider = hasRings && hasStats;
  const showDisksDivider = (hasRings || hasStats) && hasDisks;
  const showNetworkDivider = (hasRings || hasStats || hasDisks) && hasNetwork;

  return (
    <View className="gap-3">
      {showName && (
        <Text className="text-zinc-400 text-xs uppercase tracking-wider">
          {instance.name}
        </Text>
      )}
      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : showError ? (
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ServerCrash} size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">Could not reach Glances</Text>
        </View>
      ) : (
        <>
          {hasRings && (
            <View className="flex-row flex-wrap justify-around gap-y-3">
              {settings.showCpu && cpu && (
                <MetricRing
                  percent={cpu.total}
                  label="CPU"
                  icon={CpuIcon}
                  sublabel={
                    typeof cpu.cpucore === "number"
                      ? `${cpu.cpucore} ${cpu.cpucore === 1 ? "core" : "cores"}`
                      : undefined
                  }
                />
              )}
              {settings.showRam && mem && (
                <MetricRing
                  percent={mem.percent}
                  label="RAM"
                  icon={MemoryStick}
                  sublabel={`${formatBytes(mem.used)} / ${formatBytes(mem.total)}`}
                />
              )}
              {gpuRings.map((ring) => (
                <MetricRing
                  key={ring.key}
                  percent={ring.percent}
                  label={ring.label}
                  icon={GpuIconSvg}
                  sublabel={ring.sublabel}
                />
              ))}
            </View>
          )}

          {showStatsDivider && <View className="h-px bg-border" />}

          {hasStats && <StatsRow load={load} iowait={iowait} />}

          {showDisksDivider && <View className="h-px bg-border" />}

          {hasDisks && (
            <View className="gap-2">
              {fs.map((disk) => (
                <DiskRow key={disk.mnt_point} disk={disk} />
              ))}
            </View>
          )}

          {showNetworkDivider && <View className="h-px bg-border" />}

          {hasNetwork && (
            <View className="gap-2">
              {netRows.map((iface) => (
                <NetRow key={iface.interface_name} iface={iface} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// Glances returns different shapes per host OS (some omit load/iowait fields),
// so guard each value to render a dash instead of crashing on undefined.toFixed
// — mirrors the fmt() helper on the Glances screen.
function loadVal(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "—";
}

const StatsRow = memo(function StatsRow({
  load,
  iowait,
}: {
  load: GlancesLoad | undefined;
  iowait: number | undefined;
}) {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      {load && (
        <View className="flex-row items-center gap-1.5">
          <Icon icon={Gauge} size={11} color="#a1a1aa" />
          <Text className="text-zinc-400 text-xs">
            Load {loadVal(load.min1)} · {loadVal(load.min5)} · {loadVal(load.min15)}
          </Text>
        </View>
      )}
      {typeof iowait === "number" && (
        <View className="flex-row items-center gap-1.5">
          <Icon icon={Activity} size={11} color="#a1a1aa" />
          <Text className="text-zinc-400 text-xs">
            I/O Wait {iowait.toFixed(1)}%
          </Text>
        </View>
      )}
    </View>
  );
});

const NetRow = memo(function NetRow({ iface }: { iface: GlancesNetRate }) {
  return (
    <View className="flex-row justify-between items-center gap-2">
      <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
        <Icon icon={Network} size={11} color="#a1a1aa" />
        <Text className="text-zinc-300 text-xs font-medium" numberOfLines={1}>
          {iface.alias || iface.interface_name}
        </Text>
      </View>
      <Text className="text-zinc-400 text-[0.7rem]">↓ {formatSpeed(iface.rx)}</Text>
      <Text className="text-zinc-400 text-[0.7rem]">↑ {formatSpeed(iface.tx)}</Text>
    </View>
  );
});

interface GpuRingEntry {
  key: string;
  label: string;
  percent: number;
  sublabel?: string;
}

function buildGpuRings(gpus: GlancesGpuItem[] | undefined): GpuRingEntry[] {
  if (!gpus || gpus.length === 0) return [];
  const multi = gpus.length > 1;
  const entries: GpuRingEntry[] = [];
  gpus.forEach((gpu, idx) => {
    const suffix = multi ? ` ${idx + 1}` : "";
    const name = (gpu.name || gpu.gpu_id || "").trim();
    if (typeof gpu.proc === "number") {
      entries.push({
        key: `${gpu.gpu_id ?? idx}-proc`,
        label: `GPU${suffix}`,
        percent: gpu.proc,
        sublabel: !multi && name ? shortenGpuName(name) : undefined,
      });
    }
    if (typeof gpu.mem === "number") {
      entries.push({
        key: `${gpu.gpu_id ?? idx}-mem`,
        label: `VRAM${suffix}`,
        percent: gpu.mem,
      });
    }
  });
  return entries;
}

function shortenGpuName(name: string): string {
  // Strip vendor noise so the sublabel stays inside the ring column. Common
  // patterns: "NVIDIA GeForce RTX 3080", "AMD Radeon RX 6800", "Intel Arc A770".
  return name
    .replace(/^NVIDIA\s+/i, "")
    .replace(/^AMD\s+/i, "")
    .replace(/^Intel\s+/i, "")
    .replace(/\s+\(.*\)$/, "")
    .trim();
}

const DiskRow = memo(function DiskRow({ disk }: { disk: GlancesFsItem }) {
  const mount = disk.mnt_point.replace(/^\/host/, "") || "/";
  const pct = Math.min(Math.max(disk.percent, 0), 100);
  return (
    <View className="gap-1">
      <View className="flex-row justify-between items-center gap-2">
        <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
          <Icon icon={HardDrive} size={11} color="#a1a1aa" />
          <Text
            className="text-zinc-300 text-xs font-medium"
            numberOfLines={1}
          >
            {mount}
          </Text>
        </View>
        <Text className="text-zinc-500 text-[0.7rem]">
          {formatBytes(disk.used)} / {formatBytes(disk.size)}
        </Text>
        <Text className={`text-xs font-semibold w-10 text-right ${diskTextColor(pct)}`}>
          {pct.toFixed(0)}%
        </Text>
      </View>
      <View className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${diskBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
});
