import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ServerCrash } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useGlancesCpu, useGlancesMem, useGlancesFs } from "@/hooks/use-glances";
import { formatBytes } from "@/lib/utils";
import type { GlancesFsItem } from "@/lib/types";

const RING_SIZE = 80;
const STROKE_WIDTH = 8;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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
          {/* Track */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#3f3f46"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {/* Progress */}
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
        {/* Center label */}
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

export function ServerStatsCard() {
  const { data: cpu, isLoading: cpuLoading, isError: cpuError } = useGlancesCpu();
  const { data: mem, isLoading: memLoading, isError: memError } = useGlancesMem();
  const { data: fs, isLoading: fsLoading, isError: fsError } = useGlancesFs();

  const isLoading = cpuLoading || memLoading || fsLoading;
  const hasData = cpu || mem || (fs && fs.length > 0);
  const showError = !isLoading && !hasData && (cpuError || memError || fsError);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server</CardTitle>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : showError ? (
        <View className="flex-row items-center gap-2 py-1">
          <ServerCrash size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">Could not reach Glances</Text>
        </View>
      ) : (
        <View className="gap-4">
          {/* Rings */}
          <View className="flex-row justify-around">
            {cpu && <RingChart percent={cpu.total} label="CPU" />}
            {mem && <RingChart percent={mem.percent} label="RAM" />}
          </View>

          {/* Disks */}
          {fs && fs.length > 0 && (
            <View className="gap-2">
              {fs.map((disk) => (
                <DiskRow key={disk.mnt_point} disk={disk} />
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
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
