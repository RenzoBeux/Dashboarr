import { Text, View } from "react-native";
import { ProgressBar } from "@/components/ui/progress-bar";
import { diskBarColor, diskTextColor } from "@/components/dashboard/disk-usage-row";
import { formatBeszelUptime } from "@/lib/beszel-normalize";
import type { BeszelSystem } from "@/lib/types";

export function SystemOverview({ system }: { system: BeszelSystem }) {
  return (
    <View className="gap-3">
      <MetricRow label="CPU" percent={system.cpuPct} />
      <MetricRow label="Memory" percent={system.memPct} />
      <MetricRow label="Disk" percent={system.diskPct} />
      {system.gpuPct !== undefined ? <MetricRow label="GPU" percent={system.gpuPct} /> : null}

      <View className="flex-row flex-wrap gap-x-6 gap-y-2 mt-1">
        <Stat label="Uptime" value={formatBeszelUptime(system.uptimeSeconds)} />
        {system.loadAvg ? (
          <Stat label="Load avg" value={system.loadAvg.map((n) => n.toFixed(2)).join(" / ")} />
        ) : null}
        {system.dashboardTempC !== undefined ? (
          <Stat label="Temp" value={`${system.dashboardTempC.toFixed(0)}°C`} />
        ) : null}
        <Stat label="Agent" value={system.agentVersion || "—"} />
      </View>
    </View>
  );
}

function MetricRow({ label, percent }: { label: string; percent: number }) {
  const pct = Math.min(Math.max(percent, 0), 100);
  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="text-zinc-300 text-xs font-medium">{label}</Text>
        <Text className={`text-xs font-semibold ${diskTextColor(pct)}`}>{pct.toFixed(0)}%</Text>
      </View>
      <ProgressBar progress={pct / 100} color={diskBarColor(pct)} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className="text-zinc-200 text-sm font-medium">{value}</Text>
    </View>
  );
}
