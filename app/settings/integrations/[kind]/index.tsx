import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import {
  SERVICE_DEFAULTS_KIND_LABEL,
  EMPTY_INSTANCES,
} from "@/components/settings/service-kind-shared";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import type { HealthStatusKind } from "@/lib/types";
import { qbClearSession } from "@/services/qbittorrent-api";
import { navidromeClearSession } from "@/services/navidrome-api";
import { piholeClearSession } from "@/services/pihole-api";
import { SERVICE_IDS, type ServiceId } from "@/lib/constants";

/**
 * Instance list for one service kind.
 *
 * Absorbs the old components/settings/instance-list.tsx. The BackHandler
 * interception that file carried is gone: this is a real route now, so the
 * hardware back and the edge swipe pop it for free.
 */
export default function KindInstancesRoute() {
  const router = useRouter();
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const validKind = SERVICE_IDS.includes(kind as ServiceId)
    ? (kind as ServiceId)
    : null;

  if (!validKind) return <Redirect href="/settings/integrations" />;
  return <KindInstances kind={validKind} router={router} />;
}

function KindInstances({
  kind,
  router,
}: {
  kind: ServiceId;
  router: ReturnType<typeof useRouter>;
}) {
  const instances = useConfigStore(
    (s) => s.serviceInstances[kind] ?? EMPTY_INSTANCES,
  );
  const addInstance = useConfigStore((s) => s.addInstance);
  const removeInstance = useConfigStore((s) => s.removeInstance);
  const moveInstance = useConfigStore((s) => s.moveInstance);
  const dashboards = useConfigStore((s) => s.dashboards);
  const kindLabel = SERVICE_DEFAULTS_KIND_LABEL[kind];
  const catalog = SERVICE_CATALOG[kind];

  // Per-instance tri-state health for the row dot. The shared hook is already
  // polling, so this is a pure index by instance UUID.
  const { data: healthData } = useServiceHealth();
  const healthByInstance = new Map<string, HealthStatusKind>();
  for (const inst of healthData?.find((h) => h.id === kind)?.instances ?? []) {
    healthByInstance.set(inst.instanceId, inst.status);
  }

  // v22: how many workspaces attach a given instance UUID. Auto-attach mode
  // (attachedInstances === undefined) counts as attached. Only displayed
  // when the install has more than one dashboard.
  const totalDashboards = dashboards.length;
  const countAttached = (instanceId: string): number => {
    let n = 0;
    for (const d of dashboards) {
      if (
        d.attachedInstances === undefined ||
        d.attachedInstances.includes(instanceId)
      ) {
        n++;
      }
    }
    return n;
  };

  // Plain useState, not a flow step: this confirm chains into nothing.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openInstance = (instanceId: string, opts?: { isNew?: boolean }) => {
    router.push(
      `/settings/integrations/${kind}/${instanceId}${opts?.isNew ? "?new=1" : ""}` as never,
    );
  };

  const handleAdd = () => {
    // First instance for a kind takes the kind's default name; subsequent ones
    // are auto-numbered to a unique label so the user has something to edit
    // rather than a blank field.
    const existing = instances.length;
    const defaultName =
      existing === 0 ? kindLabel : `${kindLabel} ${existing + 1}`;
    const inst = addInstance(kind, { name: defaultName });
    openInstance(inst.id, { isNew: true });
  };

  const performDelete = async (instanceId: string) => {
    setConfirmDelete(null);
    if (kind === "qbittorrent") {
      // Drop any cached qBit session for the deleted instance before its
      // SecureStore row goes away.
      await qbClearSession(instanceId);
    }
    if (kind === "navidrome") {
      // Same for Navidrome's cached JWT + Subsonic salt.
      navidromeClearSession(instanceId);
    }
    if (kind === "pihole") {
      // Log the Pi-hole session out before dropping it, so its seat goes back
      // to the pool of 16 instead of idling for thirty minutes.
      await piholeClearSession(instanceId);
    }
    await removeInstance(kind, instanceId);
  };

  return (
    <ScreenWrapper>
      <BackHeader title={kindLabel} />

      <Card className="gap-3 mb-4">
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-2xl bg-surface-light items-center justify-center">
            <ServiceLogo id={kind} size={28} />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-100 text-lg font-bold">{kindLabel}</Text>
            <Text className="text-zinc-400 text-sm mt-0.5">
              {catalog.tagline}
            </Text>
          </View>
        </View>
      </Card>

      <SettingsGroup
        title={instances.length === 1 ? "Instance" : "Instances"}
        footer={
          instances.length > 1
            ? "Tap an instance to edit. Use the arrows to reorder — the order here is the order shown in the per-tab switcher."
            : undefined
        }
      >
        {instances.map((inst, idx) => {
          const subtitle = inst.enabled
            ? inst.useRemote
              ? inst.remoteUrl || "No remote URL set"
              : inst.localUrl || inst.remoteUrl || "No URL set"
            : "Disabled";
          // Only enabled instances are actively probed; for disabled ones
          // we want NO dot (not red) — there's nothing wrong, the user has
          // just turned it off.
          const instanceStatus = inst.enabled
            ? healthByInstance.get(inst.id)
            : undefined;
          return (
            <View
              key={inst.id}
              className="flex-row items-center border-b border-surface-light last:border-b-0"
            >
              <Pressable
                onPress={() => openInstance(inst.id)}
                className="flex-1 flex-row items-center px-4 py-3 active:opacity-70"
              >
                <View className="flex-1">
                  <Text className="text-zinc-100 text-base">{inst.name}</Text>
                  <Text className="text-zinc-500 text-xs">{subtitle}</Text>
                  {totalDashboards > 1
                    ? (() => {
                        const attached = countAttached(inst.id);
                        const label =
                          attached === 0
                            ? "Not in any workspace"
                            : attached === totalDashboards
                              ? `In all ${totalDashboards} workspaces`
                              : `In ${attached} of ${totalDashboards} workspaces`;
                        return (
                          <Text className="text-zinc-600 text-[0.7rem] mt-0.5">
                            {label}
                          </Text>
                        );
                      })()
                    : null}
                </View>
                {instanceStatus ? (
                  <StatusDot state={instanceStatus} size="sm" className="mr-2" />
                ) : null}
              </Pressable>
              {instances.length > 1 ? (
                <View className="flex-row items-center pr-2">
                  <Pressable
                    onPress={() => moveInstance(kind, inst.id, "up")}
                    disabled={idx === 0}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                    style={{ opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    <Icon icon={ArrowUp} size={16} color="#a1a1aa" />
                  </Pressable>
                  <Pressable
                    onPress={() => moveInstance(kind, inst.id, "down")}
                    disabled={idx === instances.length - 1}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                    style={{ opacity: idx === instances.length - 1 ? 0.3 : 1 }}
                  >
                    <Icon icon={ArrowDown} size={16} color="#a1a1aa" />
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmDelete(inst.id)}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                  >
                    <Icon icon={Trash2} size={16} color="#f87171" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
        <SettingsRow
          icon={Plus}
          label={
            instances.length === 0 ? `Add ${kindLabel}` : "Add another instance"
          }
          subtitle={
            instances.length > 0
              ? "Configure a second server of this kind"
              : undefined
          }
          onPress={handleAdd}
        />
      </SettingsGroup>

      <ConfirmModal
        visible={confirmDelete !== null}
        title="Delete instance"
        message={
          confirmDelete
            ? `This will remove "${
                instances.find((i) => i.id === confirmDelete)?.name ??
                "this instance"
              }" and its credentials. This cannot be undone.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && void performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </ScreenWrapper>
  );
}
