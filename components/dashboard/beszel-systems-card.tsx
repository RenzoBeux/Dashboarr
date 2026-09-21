import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { diskTextColor } from "@/components/dashboard/disk-usage-row";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { useServiceTileLayout } from "@/hooks/use-service-tile-cell";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useBeszelSystems } from "@/hooks/use-beszel";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import {
  resolveBoundInstances,
  isExplicitInstanceBinding,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  BESZEL_SYSTEMS_DEFAULT_SETTINGS,
  type BeszelSystemsSettingsValue,
} from "@/components/dashboard/widget-settings/beszel-systems-settings";
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { BeszelSystem } from "@/lib/types";

const STATUS_MAP: Record<BeszelSystem["status"], "ok" | "offline" | "checking"> = {
  up: "ok",
  down: "offline",
  paused: "checking",
  pending: "checking",
};

export function BeszelSystemsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<BeszelSystemsSettingsValue>(
    slotId,
    BESZEL_SYSTEMS_DEFAULT_SETTINGS,
  );
  // useEnabledInstances wraps its selector in useShallow — a bare
  // useConfigStore(s => s.serviceInstances.beszel.filter(...)) returns a new
  // array every render, which Zustand's default reference-equality check
  // reads as "the store changed" on every render, causing an infinite
  // render loop (confirmed live: "Maximum update depth exceeded").
  const allInstances = useEnabledInstances("beszel");
  const attachedInstances = useAttachedInstances();
  const { width: tileWidth, gap: tileGap } = useServiceTileLayout();
  const router = useRouter();

  const resolved = resolveBoundInstances(settings.instanceIds, allInstances);
  const bound = isExplicitInstanceBinding(settings.instanceIds)
    ? resolved
    : resolved.filter((inst) => attachedInstances.has(inst.id));

  if (bound.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Beszel Systems</CardTitle>
      </CardHeader>
      <View className="gap-3">
        {bound.map((inst) => (
          <InstanceBlock
            key={inst.id}
            instanceId={inst.id}
            instanceName={bound.length > 1 ? inst.name : undefined}
            tileWidth={tileWidth}
            tileGap={tileGap}
            onPressSystem={() => router.push("/(tabs)/beszel")}
          />
        ))}
      </View>
    </Card>
  );
}

function InstanceBlock({
  instanceId,
  instanceName,
  tileWidth,
  tileGap,
  onPressSystem,
}: {
  instanceId: string;
  instanceName?: string;
  tileWidth: number;
  tileGap: number;
  onPressSystem: () => void;
}) {
  const { data: systems } = useBeszelSystems(instanceId);
  if (!systems || systems.length === 0) return null;

  return (
    <View className="gap-2">
      {instanceName ? <Text className="text-zinc-500 text-xs">{instanceName}</Text> : null}
      <View className="flex-row flex-wrap" style={{ gap: tileGap }}>
        {systems.map((system) => (
          <Pressable
            key={system.id}
            onPress={onPressSystem}
            className="items-center gap-1 active:opacity-70"
            style={{ width: tileWidth }}
            hitSlop={6}
          >
            <View className="relative bg-surface-light rounded-xl p-2.5 items-center justify-center w-full">
              <Text
                className={`text-sm font-semibold ${diskTextColor(system.cpuPct)}`}
              >
                {system.status === "up" ? `${system.cpuPct.toFixed(0)}%` : "—"}
              </Text>
              <StatusDot state={STATUS_MAP[system.status]} overlay shadow />
            </View>
            <Text
              className="text-zinc-500 text-xs text-center w-full"
              numberOfLines={2}
            >
              {system.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
