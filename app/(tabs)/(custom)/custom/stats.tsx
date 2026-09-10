import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { toast, toastError } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";
import { checkHealth, getStats, runAction } from "@/services/custom-api";
import type { CustomServiceAction } from "@/lib/custom-service";

export default function CustomStatsScreen() {
  const { instance: instanceId } = useLocalSearchParams<{ instance?: string }>();
  const inst = useConfigStore((s) =>
    (s.serviceInstances.custom ?? []).find((i) => i.id === instanceId),
  );

  const { refreshing, onRefresh } = usePullToRefresh([["custom", instanceId]]);

  const healthQuery = useQuery({
    queryKey: ["custom", instanceId, "health"] as const,
    queryFn: () => checkHealth(instanceId as string),
    enabled: !!instanceId,
    staleTime: 30000,
  });
  const statsQuery = useQuery({
    queryKey: ["custom", instanceId, "stats"] as const,
    queryFn: () => getStats(instanceId as string),
    enabled: !!instanceId,
    staleTime: 30000,
  });

  const [confirmAction, setConfirmAction] = useState<CustomServiceAction | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  if (!instanceId || !inst) {
    return (
      <ScreenWrapper>
        <BackHeader title="Custom Service" />
        <EmptyState title="Instance not found" />
      </ScreenWrapper>
    );
  }

  const stats = statsQuery.data ?? [];
  const actions = inst.custom?.actions ?? [];
  const health = healthQuery.data;

  const fireAction = async (action: CustomServiceAction) => {
    setRunningId(action.id);
    try {
      const result = await runAction(instanceId, action.id);
      if (result.status >= 200 && result.status < 300) {
        toast(`${action.label} ran`, "success");
      } else {
        toast(`${action.label} failed (${result.status})`, "error");
      }
    } catch (e) {
      toastError(`Couldn't run ${action.label}`, e);
    } finally {
      setRunningId(null);
    }
  };

  const handleActionPress = (action: CustomServiceAction) => {
    if (action.confirm) {
      setConfirmAction(action);
      setConfirmVisible(true);
      return;
    }
    void fireAction(action);
  };

  const confirmRun = () => {
    const action = confirmAction;
    setConfirmVisible(false);
    if (!action) return;
    void fireAction(action);
  };

  const healthLabel =
    health?.status === "ok" ? "Online" : health?.status === "warning" ? "Warning" : "Offline";
  const healthVariant =
    health?.status === "ok" ? "success" : health?.status === "warning" ? "warning" : "error";

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader title={inst.name} />

      <View className="gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Health</CardTitle>
            {healthQuery.isLoading ? null : (
              <Badge label={healthLabel} variant={healthVariant} />
            )}
          </CardHeader>
          {health?.version ? (
            <Text className="text-zinc-500 text-xs">Version {health.version}</Text>
          ) : health?.message ? (
            <Text className="text-zinc-500 text-xs">{health.message}</Text>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stats</CardTitle>
          </CardHeader>
          {statsQuery.isLoading ? (
            <SkeletonCardContent rows={2} />
          ) : stats.length === 0 ? (
            <EmptyState compact title="No stats configured" />
          ) : (
            <View className="flex-row flex-wrap gap-x-6 gap-y-3">
              {stats.map((s) => (
                <View key={s.label}>
                  <Text className="text-zinc-500 text-xs">{s.label}</Text>
                  <Text className="text-zinc-100 text-base font-bold">
                    {s.display}
                    {s.unit ? ` ${s.unit}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          {actions.length === 0 ? (
            <EmptyState compact title="No actions configured" />
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  label={action.label}
                  size="sm"
                  variant="outline"
                  loading={runningId === action.id}
                  onPress={() => handleActionPress(action)}
                />
              ))}
            </View>
          )}
        </Card>
      </View>

      <ConfirmModal
        visible={confirmVisible}
        title="Run action"
        message={`Run "${confirmAction?.label ?? "this action"}" now?`}
        icon={Play}
        confirmLabel="Run"
        onConfirm={confirmRun}
        onCancel={() => setConfirmVisible(false)}
      />
    </ScreenWrapper>
  );
}
