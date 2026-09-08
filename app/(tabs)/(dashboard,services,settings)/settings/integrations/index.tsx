import { useMemo } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Plus, Plug } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SERVICE_DEFAULTS_KIND_LABEL } from "@/components/settings/service-kind-shared";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { lanGuardBlockReason } from "@/lib/http-client";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import {
  buildIntegrationRows,
  summarizeIntegrations,
  integrationSubtitle,
  resolveKindRoute,
  type InstanceProbeContext,
} from "@/lib/integration-status";
import { SERVICE_IDS, type ServiceId } from "@/lib/constants";

/** Sensible first integrations for someone with an empty install. */
const STARTING_POINTS: ServiceId[] = ["qbittorrent", "radarr", "sonarr", "plex"];

export default function IntegrationsHub() {
  const router = useRouter();
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const getActiveUrl = useConfigStore((s) => s.getActiveUrl);
  // Re-resolve the probe context whenever the network verdict changes: the
  // same LAN URL is reachable at home and blocked on cellular.
  const networkAwayFromHome = useConfigStore((s) => s.networkAwayFromHome);
  const isOnWifi = useConfigStore((s) => s.isOnWifi);

  const { data: healthData, isPending, isPlaceholderData } = useServiceHealth();
  // "Determining": the first probe batch, or a re-keyed refetch after a
  // network or workspace change. Same derivation as the Services tab.
  const determining = isPending || isPlaceholderData;

  const rows = useMemo(() => {
    const context: Record<string, InstanceProbeContext> = {};
    for (const kind of SERVICE_IDS) {
      for (const inst of serviceInstances[kind] ?? []) {
        const activeUrl = getActiveUrl(kind, inst.id);
        context[inst.id] = {
          activeUrl,
          lanBlocked: lanGuardBlockReason(activeUrl, inst) !== null,
        };
      }
    }
    return buildIntegrationRows(
      serviceInstances,
      determining ? undefined : healthData,
      context,
    );
    // networkAwayFromHome / isOnWifi feed lanGuardBlockReason indirectly.
  }, [
    serviceInstances,
    healthData,
    determining,
    getActiveUrl,
    networkAwayFromHome,
    isOnWifi,
  ]);

  const summary = summarizeIntegrations(rows);
  const configured = rows.filter((r) => r.configured);
  const attention = rows
    .flatMap((r) => r.rows)
    .filter((r) => r.state === "attention");

  const goBrowse = () => router.push("/settings/integrations/browse");

  const renderCatalogRow = (kind: ServiceId) => (
    <SettingsRow
      key={kind}
      leading={<ServiceLogo id={kind} size={20} />}
      label={SERVICE_DEFAULTS_KIND_LABEL[kind]}
      subtitle={SERVICE_CATALOG[kind].tagline}
      onPress={() =>
        router.push(
          resolveKindRoute(kind, serviceInstances[kind] ?? []) as never,
        )
      }
    />
  );

  // Nothing anywhere has a URL: this is the app's first-run service setup.
  // The attention check matters for one real case: a service enabled with no
  // URL is "unconfigured" for this list but still needs saying, so it must not
  // be swallowed by the welcome card.
  if (configured.length === 0 && attention.length === 0) {
    return (
      <ScreenWrapper>
        <BackHeader title="Integrations" />
        <Card className="items-center py-6 mb-4">
          <View className="w-14 h-14 rounded-2xl bg-primary/15 items-center justify-center mb-3">
            <Icon icon={Plug} size={26} color="#60a5fa" />
          </View>
          <Text className="text-zinc-100 text-lg font-bold">
            No services yet
          </Text>
          <Text className="text-zinc-400 text-sm text-center mt-1 px-4">
            Connect your first service to fill the dashboard. Most people start
            with a download client.
          </Text>
          <Button
            label="Browse services"
            className="mt-4"
            icon={<Icon icon={Plus} size={16} color="#fff" />}
            onPress={goBrowse}
          />
        </Card>

        <SettingsGroup title="Popular starting points">
          {STARTING_POINTS.map(renderCatalogRow)}
        </SettingsGroup>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <BackHeader title="Integrations" />

      <Text className="text-zinc-500 text-xs mb-4 ml-1" numberOfLines={2}>
        {summary.line}
      </Text>

      {attention.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(260)}>
          <SettingsGroup title="Needs attention">
            {attention.map((row) => (
              <SettingsRow
                key={row.instanceId}
                leading={<ServiceLogo id={row.kind} size={20} />}
                label={row.instanceName}
                subtitle={row.reason}
                subtitleTone="warn"
                right={<StatusDot state={row.status ?? "offline"} size="sm" />}
                onPress={() =>
                  router.push(
                    `/settings/integrations/${row.kind}/${row.instanceId}` as never,
                  )
                }
              />
            ))}
          </SettingsGroup>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(35).duration(260)}>
        <SettingsGroup
          title="Your services"
          footer="Instances are shared across dashboards. Attach them to a workspace in its settings."
        >
          {configured.map((row) => {
            const subtitle = integrationSubtitle(row);
            return (
              <SettingsRow
                key={row.kind}
                leading={
                  <ServiceLogo
                    id={row.kind}
                    size={20}
                    online={row.enabledCount > 0}
                  />
                }
                label={row.label}
                subtitle={subtitle.text}
                subtitleTone={subtitle.tone}
                right={
                  row.enabledCount === 0 ? (
                    <Badge label="Off" variant="default" />
                  ) : row.state === "away" ? (
                    // Away is not a health verdict — the subtitle already says
                    // "away from home". A dot here would read as broken.
                    null
                  ) : (
                    <StatusDot
                      state={
                        row.state === "checking"
                          ? "checking"
                          : (row.status ?? "checking")
                      }
                      size="sm"
                    />
                  )
                }
                onPress={() =>
                  router.push(resolveKindRoute(row.kind, row.instances) as never)
                }
              />
            );
          })}
        </SettingsGroup>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(70).duration(260)}>
        <SettingsGroup>
          <SettingsRow
            icon={Plus}
            label="Add a service"
            subtitle={`${summary.available} available`}
            onPress={goBrowse}
          />
        </SettingsGroup>
      </Animated.View>
    </ScreenWrapper>
  );
}
