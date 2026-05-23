import { View, Text } from "react-native";
import { Cpu, MemoryStick, HardDrive, Activity, Gpu } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useGlancesCpu,
  useGlancesPerCpu,
  useGlancesLoad,
  useGlancesMem,
  useGlancesFs,
  useGlancesDiskIO,
  useGlancesGpu,
} from "@/hooks/use-glances";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatBytes, formatSpeed } from "@/lib/utils";
import type { GlancesFsItem, GlancesDiskIOItem, GlancesGpuItem } from "@/lib/types";

function usageBarColor(percent: number): string {
  if (percent >= 85) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-success";
}

function usageTextColor(percent: number): string {
  if (percent >= 85) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-success";
}

// Glances returns different shapes per host OS — macOS/Windows omit several
// fields (most notably `iowait`). Use these helpers so a missing value renders
// as a dash instead of crashing with "undefined.toFixed".
function fmt(n: number | null | undefined, dp: number): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(dp) : "—";
}

function pct(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export default function GlancesScreen() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["glances"]]);
  const glancesHealth = healthData?.find((s) => s.id === "glances");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Server" online={glancesHealth?.online} serviceId="glances" />
      <View className="gap-4">
        <CpuCard />
        <MemoryCard />
        <GpuCard />
        <DisksCard />
        <DiskIOCard />
      </View>
    </ScreenWrapper>
  );
}

function CpuCard() {
  const { data: cpu, isLoading: cpuLoading } = useGlancesCpu();
  const { data: perCpu, isLoading: perCpuLoading } = useGlancesPerCpu();
  const { data: load, isLoading: loadLoading } = useGlancesLoad();

  const isLoading = cpuLoading || perCpuLoading || loadLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>CPU</CardTitle>
        {cpu && (
          <Text className={`text-2xl font-bold ${usageTextColor(pct(cpu.total))}`}>
            {fmt(cpu.total, 1)}%
          </Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !cpu ? (
        <EmptyState title="No data" />
      ) : (
        <View className="gap-4">
          <ProgressBar progress={pct(cpu.total) / 100} color={usageBarColor(pct(cpu.total))} />

          <View className="flex-row gap-3">
            {typeof cpu.user === "number" && (
              <StatPill label="User" value={`${fmt(cpu.user, 1)}%`} />
            )}
            {typeof cpu.system === "number" && (
              <StatPill label="System" value={`${fmt(cpu.system, 1)}%`} />
            )}
            {typeof cpu.iowait === "number" && (
              <StatPill label="I/O Wait" value={`${fmt(cpu.iowait, 1)}%`} />
            )}
            {typeof cpu.cpucore === "number" && (
              <StatPill label="Cores" value={String(cpu.cpucore)} />
            )}
          </View>

          {load && (
            <View>
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                Load Average
              </Text>
              <View className="flex-row gap-3">
                <StatPill label="1 min" value={fmt(load.min1, 2)} />
                <StatPill label="5 min" value={fmt(load.min5, 2)} />
                <StatPill label="15 min" value={fmt(load.min15, 2)} />
              </View>
            </View>
          )}

          {perCpu && perCpu.length > 0 && (
            <View>
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                Per Core
              </Text>
              <View className="gap-1.5">
                {perCpu.map((core) => (
                  <View key={core.cpu_number} className="flex-row items-center gap-2">
                    <Text className="text-zinc-500 text-xs w-10">
                      Core {core.cpu_number}
                    </Text>
                    <View className="flex-1">
                      <ProgressBar
                        progress={pct(core.total) / 100}
                        color={usageBarColor(pct(core.total))}
                      />
                    </View>
                    <Text className={`text-xs font-medium w-10 text-right ${usageTextColor(pct(core.total))}`}>
                      {fmt(core.total, 0)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function MemoryCard() {
  const { data: mem, isLoading } = useGlancesMem();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        {mem && (
          <Text className={`text-2xl font-bold ${usageTextColor(pct(mem.percent))}`}>
            {fmt(mem.percent, 1)}%
          </Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !mem ? (
        <EmptyState title="No data" />
      ) : (
        <View className="gap-4">
          <ProgressBar progress={pct(mem.percent) / 100} color={usageBarColor(pct(mem.percent))} />

          <View className="flex-row gap-3 flex-wrap">
            <StatPill label="Used" value={formatBytes(mem.used)} />
            <StatPill label="Free" value={formatBytes(mem.free)} />
            <StatPill label="Total" value={formatBytes(mem.total)} />
          </View>

          {(typeof mem.available === "number" ||
            typeof mem.cached === "number" ||
            typeof mem.buffers === "number") && (
            <View className="flex-row gap-3 flex-wrap">
              {typeof mem.available === "number" && (
                <StatPill label="Available" value={formatBytes(mem.available)} />
              )}
              {typeof mem.cached === "number" && (
                <StatPill label="Cached" value={formatBytes(mem.cached)} />
              )}
              {typeof mem.buffers === "number" && (
                <StatPill label="Buffers" value={formatBytes(mem.buffers)} />
              )}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function GpuCard() {
  const { data: gpus, isLoading } = useGlancesGpu();

  // Hide entirely on hosts with no GPU — the endpoint returns [] when the
  // plugin is enabled but no card is detected (and getGpu swallows 404 when
  // the plugin is disabled), so an empty list isn't an error condition.
  if (!isLoading && (!gpus || gpus.length === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>GPU</CardTitle>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : (
        <View className="gap-4">
          {gpus!.map((gpu, idx) => (
            <GpuDetail key={gpu.gpu_id ?? idx} gpu={gpu} />
          ))}
        </View>
      )}
    </Card>
  );
}

function GpuDetail({ gpu }: { gpu: GlancesGpuItem }) {
  const proc = typeof gpu.proc === "number" ? gpu.proc : null;
  const mem = typeof gpu.mem === "number" ? gpu.mem : null;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-2">
        <Icon icon={Gpu} size={14} color="#a1a1aa" />
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {gpu.name || gpu.gpu_id}
        </Text>
      </View>

      {proc !== null && (
        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-zinc-500 text-xs">Compute</Text>
            <Text className={`text-xs font-medium ${usageTextColor(proc)}`}>
              {fmt(proc, 1)}%
            </Text>
          </View>
          <ProgressBar progress={proc / 100} color={usageBarColor(proc)} />
        </View>
      )}

      {mem !== null && (
        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-zinc-500 text-xs">VRAM</Text>
            <Text className={`text-xs font-medium ${usageTextColor(mem)}`}>
              {fmt(mem, 1)}%
            </Text>
          </View>
          <ProgressBar progress={mem / 100} color={usageBarColor(mem)} />
        </View>
      )}

      {(typeof gpu.temperature === "number" || typeof gpu.fan_speed === "number") && (
        <View className="flex-row gap-3 flex-wrap mt-1">
          {typeof gpu.temperature === "number" && (
            <StatPill label="Temp" value={`${fmt(gpu.temperature, 0)}°C`} />
          )}
          {typeof gpu.fan_speed === "number" && (
            <StatPill label="Fan" value={`${fmt(gpu.fan_speed, 0)} RPM`} />
          )}
        </View>
      )}
    </View>
  );
}

function DisksCard() {
  const { data: fs, isLoading } = useGlancesFs();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disks</CardTitle>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : !fs || fs.length === 0 ? (
        <EmptyState
          icon={<Icon icon={HardDrive} size={32} color="#71717a" />}
          title="No disks"
        />
      ) : (
        <View className="gap-4">
          {fs.map((disk) => (
            <DiskDetail key={disk.mnt_point} disk={disk} />
          ))}
        </View>
      )}
    </Card>
  );
}

function DiskDetail({ disk }: { disk: GlancesFsItem }) {
  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <Icon icon={HardDrive} size={14} color="#a1a1aa" />
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {disk.mnt_point.replace(/^\/host/, "") || "/"}
          </Text>
          <Text className="text-zinc-600 text-xs">{disk.device_name}</Text>
        </View>
        <Text className={`text-sm font-bold ${usageTextColor(pct(disk.percent))}`}>
          {fmt(disk.percent, 1)}%
        </Text>
      </View>
      <ProgressBar progress={pct(disk.percent) / 100} color={usageBarColor(pct(disk.percent))} className="mb-1.5" />
      <View className="flex-row gap-3">
        <Text className="text-zinc-500 text-xs">Used {formatBytes(disk.used)}</Text>
        <Text className="text-zinc-500 text-xs">Free {formatBytes(disk.free)}</Text>
        <Text className="text-zinc-500 text-xs">Total {formatBytes(disk.size)}</Text>
        <Text className="text-zinc-600 text-xs">{disk.fs_type}</Text>
      </View>
    </View>
  );
}

function DiskIOCard() {
  const { data: diskio, isLoading } = useGlancesDiskIO();

  const activeDrives = diskio?.filter(
    (d) => d.read_bytes > 0 || d.write_bytes > 0,
  );

  if (!isLoading && (!activeDrives || activeDrives.length === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disk I/O</CardTitle>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : (
        <View className="gap-3">
          {activeDrives!.map((drive) => (
            <DiskIORow key={drive.disk_name} drive={drive} />
          ))}
        </View>
      )}
    </Card>
  );
}

function DiskIORow({ drive }: { drive: GlancesDiskIOItem }) {
  const readRate = drive.time_since_update > 0
    ? drive.read_bytes / drive.time_since_update
    : 0;
  const writeRate = drive.time_since_update > 0
    ? drive.write_bytes / drive.time_since_update
    : 0;

  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2 flex-1">
        <Icon icon={Activity} size={14} color="#a1a1aa" />
        <Text className="text-zinc-300 text-sm">{drive.disk_name}</Text>
      </View>
      <View className="flex-row gap-4">
        <Text className="text-zinc-400 text-xs">R {formatSpeed(readRate)}</Text>
        <Text className="text-zinc-400 text-xs">W {formatSpeed(writeRate)}</Text>
      </View>
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-surface-light rounded-xl px-3 py-2 items-center min-w-16">
      <Text className="text-zinc-100 text-sm font-semibold">{value}</Text>
      <Text className="text-zinc-500 text-xs">{label}</Text>
    </View>
  );
}
