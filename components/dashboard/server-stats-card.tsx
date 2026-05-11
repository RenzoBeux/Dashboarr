import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ServerCrash } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { getCpu, getMem, getFs, getGpu } from "@/services/glances-api";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  SERVER_STATS_DEFAULT_SETTINGS,
  type ServerStatsSettingsValue,
} from "@/components/dashboard/widget-settings/server-stats-settings";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { formatBytes } from "@/lib/utils";
import type { GlancesFsItem, GlancesGpuItem } from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

const RING_SIZE = 80;
const STROKE_WIDTH = 8;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
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

function RingChart({ percent, label }: { percent: number; label: string }) {
  const filled = CIRCUMFERENCE * (1 - percent / 100);
  const color = ringColor(percent);

  return (
    <View className="items-center gap-1">
      <View style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#3f3f46"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={filled}
            strokeLinecap="round"
            rotation="-90"
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text style={{ color }} className="text-sm font-bold">
            {percent.toFixed(0)}%
          </Text>
        </View>
      </View>
      <Text className="text-zinc-400 text-xs">{label}</Text>
    </View>
  );
}

export function ServerStatsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<ServerStatsSettingsValue>(
    slotId,
    SERVER_STATS_DEFAULT_SETTINGS,
  );

  const allInstances = useEnabledInstances("glances");
  const instances = resolveBoundInstances(settings.instanceIds, allInstances);

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
        <View className="gap-5">
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
        enabled: settings.showCpu,
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
    ],
  });
  const [cpuQuery, memQuery, fsQuery, gpuQuery] = queries;
  const cpu = settings.showCpu ? cpuQuery.data : undefined;
  const mem = settings.showRam ? memQuery.data : undefined;
  const fs = settings.showDisks ? fsQuery.data : undefined;
  const gpus = settings.showGpu ? gpuQuery.data : undefined;

  const isLoading =
    (settings.showCpu && cpuQuery.isLoading) ||
    (settings.showRam && memQuery.isLoading) ||
    (settings.showDisks && fsQuery.isLoading) ||
    (settings.showGpu && gpuQuery.isLoading);
  const hasData = cpu || mem || (fs && fs.length > 0) || (gpus && gpus.length > 0);
  const showError =
    !isLoading &&
    !hasData &&
    ((settings.showCpu && cpuQuery.isError) ||
      (settings.showRam && memQuery.isError) ||
      (settings.showDisks && fsQuery.isError) ||
      (settings.showGpu && gpuQuery.isError));

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
        <View className="gap-4">
          {(settings.showCpu || settings.showRam) && (
            <View className="flex-row justify-around">
              {settings.showCpu && cpu && <RingChart percent={cpu.total} label="CPU" />}
              {settings.showRam && mem && <RingChart percent={mem.percent} label="RAM" />}
            </View>
          )}

          {settings.showGpu && gpus && gpus.length > 0 && (
            <View className="gap-3">
              {gpus.map((gpu, idx) => (
                <GpuRow
                  key={gpu.gpu_id ?? idx}
                  gpu={gpu}
                  showName={gpus.length > 1}
                />
              ))}
            </View>
          )}

          {settings.showDisks && fs && fs.length > 0 && (
            <View className="gap-2">
              {fs.map((disk) => (
                <DiskRow key={disk.mnt_point} disk={disk} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function GpuRow({ gpu, showName }: { gpu: GlancesGpuItem; showName: boolean }) {
  // Glances reports null for backends that can't read a value (e.g. some AMD
  // cards lack temperature/fan_speed). Skip rings whose value is missing.
  const proc = typeof gpu.proc === "number" ? gpu.proc : null;
  const mem = typeof gpu.mem === "number" ? gpu.mem : null;

  if (proc === null && mem === null) return null;

  return (
    <View className="gap-2">
      {showName && (
        <Text className="text-zinc-500 text-xs" numberOfLines={1}>
          {gpu.name || gpu.gpu_id}
        </Text>
      )}
      <View className="flex-row justify-around">
        {proc !== null && <RingChart percent={proc} label="GPU" />}
        {mem !== null && <RingChart percent={mem} label="VRAM" />}
      </View>
    </View>
  );
}

function DiskRow({ disk }: { disk: GlancesFsItem }) {
  return (
    <View className="gap-1">
      <View className="flex-row justify-between items-center">
        <Text className="text-zinc-400 text-xs" numberOfLines={1}>
          {disk.mnt_point.replace(/^\/host/, "") || "/"}
        </Text>
        <Text className="text-zinc-500 text-xs">
          {formatBytes(disk.used)} / {formatBytes(disk.size)}
        </Text>
      </View>
      <ProgressBar progress={disk.percent / 100} color={diskBarColor(disk.percent)} />
    </View>
  );
}
