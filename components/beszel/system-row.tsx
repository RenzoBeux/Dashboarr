import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { diskTextColor } from "@/components/dashboard/disk-usage-row";
import { formatBeszelUptime } from "@/lib/beszel-normalize";
import { ICON } from "@/lib/constants";
import type { BeszelSystem } from "@/lib/types";

const STATUS_DOT: Record<BeszelSystem["status"], string> = {
  up: "bg-success",
  down: "bg-danger",
  paused: "bg-zinc-500",
  pending: "bg-amber-500",
};

const STATUS_LABEL: Record<BeszelSystem["status"], string> = {
  up: "Online",
  down: "Offline",
  paused: "Paused",
  pending: "Pending",
};

interface SystemRowProps {
  system: BeszelSystem;
  onPress: () => void;
}

export function SystemRow({ system, onPress }: SystemRowProps) {
  const isLive = system.status === "up";

  return (
    <Pressable
      onPress={onPress}
      className="bg-zinc-900 rounded-xl p-4 gap-2 active:opacity-70"
    >
      <View className="flex-row items-center gap-2">
        <View className={`w-2 h-2 rounded-full ${STATUS_DOT[system.status]}`} />
        <Text className="text-zinc-100 text-sm font-semibold flex-1" numberOfLines={1}>
          {system.name}
        </Text>
        <Text className="text-zinc-500 text-xs">{STATUS_LABEL[system.status]}</Text>
        <Icon icon={ChevronRight} size={ICON.SM} color="#52525b" />
      </View>

      {isLive ? (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <Metric label="CPU" percent={system.cpuPct} />
          <Metric label="RAM" percent={system.memPct} />
          <Metric label="Disk" percent={system.diskPct} />
          {system.gpuPct !== undefined ? <Metric label="GPU" percent={system.gpuPct} /> : null}
          <Text className="text-zinc-600 text-xs">
            up {formatBeszelUptime(system.uptimeSeconds)}
          </Text>
        </View>
      ) : (
        <Text className="text-zinc-600 text-xs">{system.host}</Text>
      )}
    </Pressable>
  );
}

function Metric({ label, percent }: { label: string; percent: number }) {
  return (
    <Text className="text-xs">
      <Text className="text-zinc-500">{label} </Text>
      <Text className={`font-semibold ${diskTextColor(percent)}`}>{percent.toFixed(0)}%</Text>
    </Text>
  );
}
