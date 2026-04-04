import { View, Text } from "react-native";
import { Cpu, MemoryStick, HardDrive, Activity } from "lucide-react-native";
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
} from "@/hooks/use-glances";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatBytes, formatSpeed } from "@/lib/utils";
import type { GlancesFsItem, GlancesDiskIOItem } from "@/lib/types";

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

export default function GlancesScreen() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["glances"]]);
  const glancesHealth = healthData?.find((s) => s.id === "glances");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Server" online={glancesHealth?.online} />
      <View className="gap-4">
        <CpuCard />
        <MemoryCard />
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
          <Text className={`text-2xl font-bold ${usageTextColor(cpu.total)}`}>
            {cpu.total.toFixed(1)}%
          </Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !cpu ? (
        <EmptyState title="No data" />
      ) : (
        <View className="gap-4">
          <ProgressBar progress={cpu.total / 100} color={usageBarColor(cpu.total)} />

          <View className="flex-row gap-3">
            <StatPill label="User" value={`${cpu.user.toFixed(1)}%`} />
            <StatPill label="System" value={`${cpu.system.toFixed(1)}%`} />
            <StatPill label="I/O Wait" value={`${cpu.iowait.toFixed(1)}%`} />
            <StatPill label="Cores" value={String(cpu.cpucore)} />
          </View>

          {load && (
            <View>
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                Load Average
              </Text>
              <View className="flex-row gap-3">
                <StatPill label="1 min" value={load.min1.toFixed(2)} />
                <StatPill label="5 min" value={load.min5.toFixed(2)} />
                <StatPill label="15 min" value={load.min15.toFixed(2)} />
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
                        progress={core.total / 100}
                        color={usageBarColor(core.total)}
                      />
                    </View>
                    <Text className={`text-xs font-medium w-10 text-right ${usageTextColor(core.total)}`}>
                      {core.total.toFixed(0)}%
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
          <Text className={`text-2xl font-bold ${usageTextColor(mem.percent)}`}>
            {mem.percent.toFixed(1)}%
          </Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !mem ? (
        <EmptyState title="No data" />
      ) : (
        <View className="gap-4">
          <ProgressBar progress={mem.percent / 100} color={usageBarColor(mem.percent)} />

          <View className="flex-row gap-3 flex-wrap">
            <StatPill label="Used" value={formatBytes(mem.used)} />
            <StatPill label="Free" value={formatBytes(mem.free)} />
            <StatPill label="Total" value={formatBytes(mem.total)} />
          </View>

          <View className="flex-row gap-3 flex-wrap">
            <StatPill label="Available" value={formatBytes(mem.available)} />
            <StatPill label="Cached" value={formatBytes(mem.cached)} />
            <StatPill label="Buffers" value={formatBytes(mem.buffers)} />
          </View>
        </View>
      )}
    </Card>
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
          icon={<HardDrive size={32} color="#71717a" />}
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
          <HardDrive size={14} color="#a1a1aa" />
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {disk.mnt_point.replace(/^\/host/, "") || "/"}
          </Text>
          <Text className="text-zinc-600 text-xs">{disk.device_name}</Text>
        </View>
        <Text className={`text-sm font-bold ${usageTextColor(disk.percent)}`}>
          {disk.percent.toFixed(1)}%
        </Text>
      </View>
      <ProgressBar progress={disk.percent / 100} color={usageBarColor(disk.percent)} className="mb-1.5" />
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
        <Activity size={14} color="#a1a1aa" />
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
