import { View, Text, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ServiceLogo, hasServiceLogo } from "@/components/ui/service-logo";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { ICON, type ServiceId } from "@/lib/constants";
import { applyServicesOrder } from "@/lib/services-order";
import { useConfigStore } from "@/store/config-store";
import { resolveBoundInstances } from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  SERVICE_HEALTH_DEFAULT_SETTINGS,
  type ServiceHealthSettingsValue,
} from "@/components/dashboard/widget-settings/service-health-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import type { ServiceInstanceHealthStatus } from "@/lib/types";
import type { ServiceInstance } from "@/store/config-store";

const SERVICE_ROUTES: Partial<Record<ServiceId, string>> = {
  qbittorrent: "/(tabs)/downloads",
  sabnzbd: "/(tabs)/downloads",
  radarr: "/(tabs)/movies",
  sonarr: "/(tabs)/tv",
};

// One indicator per (kind, instance) pair after applying the slot's binding
// settings. The card always renders one tile per bound instance — the prior
// behavior of showing a single aggregated icon per kind was wrong when one of
// two qBittorrents was offline (the kind would still flash green).
interface RenderEntry {
  kindId: ServiceId;
  instanceId: string;
  label: string;
  online: boolean;
}

export function ServiceHealthCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<ServiceHealthSettingsValue>(
    slotId,
    SERVICE_HEALTH_DEFAULT_SETTINGS,
  );
  const { data: services } = useServiceHealth();
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const servicesOrder = useConfigStore((s) => s.servicesOrder);
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);
  const router = useRouter();

  const hiddenSet = new Set(settings.hiddenKinds);
  // Index health by (kind, instanceId) so we can pair each bound instance with
  // its live status. The hook already pings every configured instance, so this
  // is a pure lookup — no extra requests.
  const healthByInstance = new Map<string, ServiceInstanceHealthStatus>();
  for (const kind of services ?? []) {
    for (const inst of kind.instances) {
      healthByInstance.set(`${kind.id}:${inst.instanceId}`, inst);
    }
  }

  const entries: RenderEntry[] = [];
  // Honor the user-defined kind order (shared with the Services tab via
  // store.servicesOrder). Kinds the user hasn't touched fall in at the end in
  // canonical SERVICE_IDS order via applyServicesOrder.
  for (const kindId of applyServicesOrder(servicesOrder)) {
    if (!hasServiceLogo(kindId)) continue;
    if (hiddenSet.has(kindId)) continue;
    const allInstances = (serviceInstances[kindId] ?? []).filter(
      (i: ServiceInstance) => i.enabled,
    );
    if (allInstances.length === 0) continue;
    const binding = settings.instances[kindId];
    const bound = resolveBoundInstances(binding, allInstances);
    if (bound.length === 0) continue;
    for (const inst of bound) {
      const status = healthByInstance.get(`${kindId}:${inst.id}`);
      entries.push({
        kindId,
        instanceId: inst.id,
        // Always use the instance's own name so users with two qBittorrents
        // ("qBit Home" / "qBit Cabin") can tell which one is offline at a
        // glance instead of seeing two identical "qBittorrent" tiles.
        label: inst.name,
        online: status?.online ?? false,
      });
    }
  }

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
      </CardHeader>
      <View className="flex-row flex-wrap gap-4">
        {entries.map((entry) => {
          const route = SERVICE_ROUTES[entry.kindId];

          return (
            <Pressable
              key={`${entry.kindId}:${entry.instanceId}`}
              onPress={() => {
                if (!route) return;
                // Switch the active instance to the one tapped so the
                // destination tab opens against this server, not whichever
                // instance the user happened to last visit.
                setActiveInstance(entry.kindId, entry.instanceId);
                router.push(route as any);
              }}
              className="items-center gap-1.5 active:opacity-70"
              hitSlop={6}
            >
              <View className="relative">
                <View className="bg-surface-light rounded-xl p-2.5">
                  <ServiceLogo
                    id={entry.kindId}
                    size={ICON.LG}
                    online={entry.online}
                  />
                </View>
                <View
                  className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${
                    entry.online ? "bg-success" : "bg-danger"
                  }`}
                  style={Platform.OS === "ios" ? {
                    shadowColor: entry.online ? "#22c55e" : "#ef4444",
                    shadowRadius: 6,
                    shadowOpacity: 0.6,
                    shadowOffset: { width: 0, height: 0 },
                  } : undefined}
                />
              </View>
              <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
