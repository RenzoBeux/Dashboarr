import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Braces, ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import { useWindowControlsContentPadding } from "@/hooks/use-window-controls-inset";
import { lightHaptic } from "@/lib/haptics";
import { checkHealth } from "@/services/custom-api";
import { useQueries } from "@tanstack/react-query";
import type { ServiceInstance } from "@/store/config-store";

// The Custom tab lists every attached-and-enabled `custom` instance (they are
// heterogeneous — each describes a different arbitrary API — so, unlike a
// single-active-instance tab, all of them show at once). Tapping one opens
// its full detail (health + stat tiles + actions) at /custom/stats.
export default function CustomScreen() {
  return (
    <WorkspaceServiceGuard kinds={["custom"]}>
      <CustomScreenInner />
    </WorkspaceServiceGuard>
  );
}

function CustomScreenInner() {
  const enabled = useEnabledInstances("custom");
  const attached = useAttachedInstances();
  const instances = enabled.filter((i) => attached.has(i.id));
  const { refreshing, onRefresh } = usePullToRefresh([["custom"]]);
  const windowControlsPadding = useWindowControlsContentPadding();

  const healthQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["custom", inst.id, "health"] as const,
      queryFn: () => checkHealth(inst.id),
      staleTime: 30000,
    })),
  });

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View
        className="flex-row items-center gap-2 mb-4 mt-2"
        style={windowControlsPadding}
      >
        <Icon icon={Braces} size={20} color="#a1a1aa" />
        <Text className="text-zinc-100 text-xl font-bold">Custom Services</Text>
      </View>

      {instances.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Braces} size={28} color="#71717a" />}
          title="No custom instances enabled"
          message="Add one in Settings → Integrations → Custom Service"
        />
      ) : (
        <View className="gap-3">
          {instances.map((inst, i) => (
            <InstanceRow
              key={inst.id}
              instance={inst}
              health={healthQueries[i]?.data}
              healthLoading={healthQueries[i]?.isLoading ?? false}
            />
          ))}
        </View>
      )}
    </ScreenWrapper>
  );
}

function InstanceRow({
  instance,
  health,
  healthLoading,
}: {
  instance: ServiceInstance;
  health: Awaited<ReturnType<typeof checkHealth>> | undefined;
  healthLoading: boolean;
}) {
  const router = useRouter();
  const statCount = instance.custom?.stats?.length ?? 0;
  const actionCount = instance.custom?.actions?.length ?? 0;

  return (
    <Card
      onPress={() => {
        lightHaptic();
        router.push(`/custom/stats?instance=${instance.id}`);
      }}
    >
      <View className="flex-row items-center gap-3">
        <StatusDot
          state={
            healthLoading
              ? "checking"
              : !health
                ? "offline"
                : health.status === "ok"
                  ? "ok"
                  : health.status === "warning"
                    ? "auth_failed"
                    : "offline"
          }
          size="md"
        />
        <View className="flex-1">
          <Text className="text-zinc-100 text-base font-medium" numberOfLines={1}>
            {instance.name}
          </Text>
          <Text className="text-zinc-500 text-xs" numberOfLines={1}>
            {health?.version
              ? `v${health.version}`
              : health?.message ?? `${statCount} stats · ${actionCount} actions`}
          </Text>
        </View>
        <Icon icon={ChevronRight} size={18} color="#52525b" />
      </View>
    </Card>
  );
}
