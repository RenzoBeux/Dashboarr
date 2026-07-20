import { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Wifi, Bell, Palette, HardDrive, Info } from "lucide-react-native";
import { ServiceLogo } from "@/components/ui/service-logo";
import { StatusDot } from "@/components/ui/status-dot";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { APP_THEMES } from "@/lib/app-themes";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { NATIVE_VERSION } from "@/lib/app-version";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SERVICE_DEFAULTS_KIND_LABEL } from "@/components/settings/service-kind-shared";
import { InstanceList } from "@/components/settings/instance-list";
import { ServiceEditor } from "@/components/settings/service-editor";

// The 7 per-category notification toggles, for the hub row's "On · X of 7
// alerts" subtitle. Must mirror the toggles on /settings/notifications.
const NOTIF_CATEGORY_KEYS = [
  "torrentCompleted",
  "sabnzbdCompleted",
  "nzbgetCompleted",
  "radarrDownloaded",
  "sonarrDownloaded",
  "serviceOffline",
  "overseerrNewRequest",
] as const;

export default function SettingsScreen() {
  // Multi-instance settings has three views:
  //   • main: hub with the Services list + category rows
  //   • viewingService: list of instances for one kind (with add/edit/delete)
  //   • editingInstance: per-instance editor (URL/auth/name/delete)
  const [viewingService, setViewingService] = useState<ServiceId | null>(null);
  const [editingInstance, setEditingInstance] = useState<{
    serviceId: ServiceId;
    instanceId: string;
    isNew?: boolean;
  } | null>(null);

  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeNetworksCount = useConfigStore((s) => s.homeNetworks.length);
  const treatVpnAsHome = useConfigStore((s) => s.treatVpnAsHome);
  const demoMode = useConfigStore((s) => s.demoMode);
  const uiScale = useConfigStore((s) => s.uiScale);
  const appTheme = useConfigStore((s) => s.appTheme);
  const notifEnabled = useConfigStore((s) => s.notificationSettings.enabled);
  const notifOnCount = useConfigStore((s) =>
    NOTIF_CATEGORY_KEYS.filter((k) => s.notificationSettings[k]).length,
  );

  // Pull live health for every (kind, instance) pair so the kind-row dots can
  // reflect ok/auth_failed/offline instead of just "any instance enabled".
  // Cached + polled by the shared hook — no extra requests fired here.
  const { data: healthData } = useServiceHealth();

  if (editingInstance) {
    return (
      // Key by instance id so the editor fully remounts when switching between
      // instances. The form seeds its URL/credential fields from `inst` via
      // useState initializers (which run once per mount); without a per-instance
      // key those fields would keep a previous instance's values — the "remote
      // URL shows blank until you tap it" symptom — and a Save could then
      // persist the stale/empty value over a good stored URL (#106).
      <ServiceEditor
        key={editingInstance.instanceId}
        serviceId={editingInstance.serviceId}
        instanceId={editingInstance.instanceId}
        isNew={editingInstance.isNew ?? false}
        onBack={() => setEditingInstance(null)}
        onDeleted={() => setEditingInstance(null)}
      />
    );
  }

  if (viewingService) {
    return (
      <InstanceList
        serviceId={viewingService}
        onBack={() => setViewingService(null)}
        onEditInstance={(instanceId, options) =>
          setEditingInstance({
            serviceId: viewingService,
            instanceId,
            isNew: options?.isNew,
          })
        }
      />
    );
  }

  const renderKindRow = (id: ServiceId) => {
    const list = serviceInstances[id] ?? [];
    const enabledCount = list.filter((i) => i.enabled).length;
    const subtitle =
      list.length === 0
        ? "Tap to add"
        : list.length === 1
          ? list[0].enabled
            ? list[0].useRemote
              ? list[0].remoteUrl || "No remote URL set"
              : list[0].localUrl || list[0].remoteUrl || "No URL set"
            : "Tap to configure"
          : `${list.length} instances · ${enabledCount} enabled`;
    // Only show the dot when the kind has at least one enabled instance —
    // disabled kinds have nothing to be healthy about. Use the aggregated
    // kind status from the health hook (best of any instance: ok >
    // auth_failed > offline) so a healthy primary masks a broken secondary.
    const kindHealth = enabledCount > 0
      ? healthData?.find((h) => h.id === id)?.status
      : undefined;
    return (
      <SettingsRow
        key={id}
        leading={<ServiceLogo id={id} size={20} />}
        label={SERVICE_DEFAULTS_KIND_LABEL[id]}
        subtitle={subtitle}
        onPress={() => setViewingService(id)}
        right={
          kindHealth ? <StatusDot state={kindHealth} size="sm" /> : null
        }
      />
    );
  };

  // Determine ordering: kinds with at least one enabled instance come first,
  // matching the v12 "configured at top" UX.
  const enabledKinds = SERVICE_IDS.filter((id) =>
    (serviceInstances[id] ?? []).some((i) => i.enabled),
  );
  const disabledKinds = SERVICE_IDS.filter(
    (id) => !(serviceInstances[id] ?? []).some((i) => i.enabled),
  );

  const networkNeedsHomeNetwork =
    autoSwitchNetwork && homeNetworksCount === 0 && !treatVpnAsHome;
  const networkSubtitle = networkNeedsHomeNetwork
    ? "Add a home network — remote URLs in use"
    : autoSwitchNetwork
      ? `Auto-switch on · ${homeNetworksCount} network${homeNetworksCount === 1 ? "" : "s"}`
      : "Auto-switch off";

  const uiScaleLabel =
    uiScale === 1.3 ? "Extra Large" : uiScale === 1.15 ? "Large" : "Normal";
  const themeLabel =
    APP_THEMES.find((t) => t.id === appTheme)?.label ?? "Default";

  return (
    <ScreenWrapper>
      <View className="mt-2 mb-4">
        <Text className="text-zinc-100 text-2xl font-bold">Settings</Text>
        <Text className="text-zinc-500 text-xs mt-0.5">
          Applies to all dashboards
        </Text>
      </View>

      <SettingsGroup
        title="Services"
        footer="Instances are shared across dashboards. Attach them to a workspace in its settings."
      >
        {enabledKinds.map(renderKindRow)}
        {disabledKinds.length > 0 && enabledKinds.length > 0 ? (
          <View className="px-4 py-2 bg-surface-light/30">
            <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
              Not configured
            </Text>
          </View>
        ) : null}
        {disabledKinds.map(renderKindRow)}
      </SettingsGroup>

      <SettingsGroup title="App">
        <SettingsRow
          icon={Wifi}
          label="Network"
          subtitle={networkSubtitle}
          subtitleTone={networkNeedsHomeNetwork ? "warn" : "default"}
          onPress={() => router.push("/settings/network")}
        />
        <SettingsRow
          icon={Bell}
          label="Notifications"
          subtitle={
            notifEnabled
              ? `On · ${notifOnCount} of ${NOTIF_CATEGORY_KEYS.length} alerts`
              : "Off"
          }
          onPress={() => router.push("/settings/notifications")}
        />
        <SettingsRow
          icon={Palette}
          label="Appearance"
          subtitle={`${themeLabel} · ${uiScaleLabel}`}
          onPress={() => router.push("/settings/appearance")}
        />
        <SettingsRow
          icon={HardDrive}
          label="Backup & Storage"
          subtitle={demoMode ? "Demo Mode is on" : "Export, import, image cache"}
          subtitleTone={demoMode ? "warn" : "default"}
          onPress={() => router.push("/settings/backup")}
        />
        <SettingsRow
          icon={Info}
          label="About"
          subtitle={`Dashboarr ${NATIVE_VERSION}`}
          onPress={() => router.push("/settings/about")}
        />
      </SettingsGroup>
    </ScreenWrapper>
  );
}
