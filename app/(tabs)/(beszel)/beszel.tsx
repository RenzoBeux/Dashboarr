import { useRouter } from "expo-router";
import { View } from "react-native";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { ErrorBanner } from "@/components/common/error-banner";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { SystemRow } from "@/components/beszel/system-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBeszelSystems } from "@/hooks/use-beszel";
import { useServiceHealth } from "@/hooks/use-service-health";

export default function BeszelScreen() {
  return (
    <WorkspaceServiceGuard kinds={["beszel"]}>
      <BeszelScreenInner />
    </WorkspaceServiceGuard>
  );
}

function BeszelScreenInner() {
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const health = healthData?.find((s) => s.id === "beszel");
  // One kind-prefix key: every Beszel query key starts ["beszel", instanceId],
  // so this invalidates the systems list, the detail screen and its history
  // chart / containers at once.
  const { refreshing, onRefresh } = usePullToRefresh([["beszel"]]);
  const { data: systems, isLoading, error } = useBeszelSystems();

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {/* ServiceHeader renders the instance switcher itself when more than
          one Beszel hub is configured, and useBeszelSystems resolves through
          useInstanceTarget, so the whole screen re-scopes on switch. */}
      <ServiceHeader name="Beszel" online={health?.online} serviceId="beszel" />
      <CachedDataBanner serviceId="beszel" label="Beszel" />

      {isLoading && !systems ? (
        <View className="gap-3">
          <Skeleton height={84} />
          <Skeleton height={84} />
          <Skeleton height={84} />
        </View>
      ) : error && !systems?.length ? (
        // A rejected login or unreachable hub must not read as "no agents yet".
        <ErrorBanner error={error} title="Couldn't load Beszel systems" />
      ) : !systems || systems.length === 0 ? (
        <EmptyState title="No systems yet" message="Connect an agent to your Beszel hub to see it here." />
      ) : (
        <View className="gap-3">
          {systems.map((system) => (
            <SystemRow
              key={system.id}
              system={system}
              onPress={() => router.push(`/beszel/system/${system.id}`)}
            />
          ))}
        </View>
      )}
    </ScreenWrapper>
  );
}
