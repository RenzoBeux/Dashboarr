import { useMemo } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Wifi, Bell, Palette, HardDrive, Info, Plug, Link } from "lucide-react-native";
import { StatusDot } from "@/components/ui/status-dot";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useWindowControlsContentPadding } from "@/hooks/use-window-controls-inset";
import { APP_THEMES } from "@/lib/app-themes";
import { useConfigStore } from "@/store/config-store";
import { isWebSlotPending, useBackendStore } from "@/store/backend-store";
import { useIntegrationRows } from "@/hooks/use-integration-rows";
import { summarizeIntegrations } from "@/lib/integration-status";
import { NATIVE_VERSION } from "@/lib/app-version";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";

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
  const webSlotPending = useBackendStore((s) => isWebSlotPending(s));
  const shortcutsCount = useConfigStore((s) => s.shortcuts.length);
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

  // The exact same projection the Integrations hub renders (one shared hook),
  // so the row's count and the hub's summary line can never disagree.
  const { rows } = useIntegrationRows();
  const summary = useMemo(() => summarizeIntegrations(rows), [rows]);

  // Keeps the title clear of the iPadOS 26 window-control cluster (#342).
  const windowControlsPadding = useWindowControlsContentPadding();

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
      <View className="mt-2 mb-4" style={windowControlsPadding}>
        <Text className="text-zinc-100 text-2xl font-bold">Settings</Text>
        <Text className="text-zinc-500 text-xs mt-0.5">
          Applies to all dashboards
        </Text>
      </View>

      {/* One row, no section header: "Services" above a row called
          "Integrations" next to a tab called Services is three names for the
          same thing. The full list lives at /settings/integrations. */}
      <SettingsGroup>
        <SettingsRow
          icon={Plug}
          label="Integrations"
          subtitle={summary.line}
          subtitleTone={summary.attention > 0 ? "warn" : "default"}
          right={
            summary.worst ? <StatusDot state={summary.worst} size="sm" /> : null
          }
          onPress={() => router.push("/settings/integrations")}
        />
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
            webSlotPending
              ? "Backend: configuration edited on the web"
              : notifEnabled
                ? `On · ${notifOnCount} of ${NOTIF_CATEGORY_KEYS.length} alerts`
                : "Off"
          }
          subtitleTone={webSlotPending ? "warn" : "default"}
          onPress={() => router.push("/settings/notifications")}
        />
        <SettingsRow
          icon={Link}
          label="Shortcuts"
          subtitle={
            shortcutsCount
              ? `${shortcutsCount} shortcut${shortcutsCount > 1 ? "s" : ""} configured`
              : "Quick links to web UIs"
          }
          onPress={() => router.push("/shortcuts")}
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
