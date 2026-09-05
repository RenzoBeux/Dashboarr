import { router } from "expo-router";
import { Cloud } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { BackendStatusPill } from "@/components/ui/backend-status-pill";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { useConfigStore } from "@/store/config-store";

export default function NotificationsSettingsScreen() {
  const notifEnabled = useConfigStore((s) => s.notificationSettings.enabled);
  const torrentCompleted = useConfigStore((s) => s.notificationSettings.torrentCompleted);
  const sabnzbdCompleted = useConfigStore((s) => s.notificationSettings.sabnzbdCompleted);
  const nzbgetCompleted = useConfigStore((s) => s.notificationSettings.nzbgetCompleted);
  const radarrDownloaded = useConfigStore((s) => s.notificationSettings.radarrDownloaded);
  const sonarrDownloaded = useConfigStore((s) => s.notificationSettings.sonarrDownloaded);
  const serviceOffline = useConfigStore((s) => s.notificationSettings.serviceOffline);
  const overseerrNewRequest = useConfigStore((s) => s.notificationSettings.overseerrNewRequest);
  const setNotifSetting = useConfigStore((s) => s.setNotificationSetting);

  return (
    <ScreenWrapper>
      <BackHeader title="Notifications" />

      <SettingsGroup
        title="Notifications"
        footer="Apply to all dashboards. Open a specific instance in Services to override per-instance."
      >
        <SettingsToggleRow
          label="Enable notifications"
          description="Master switch for in-app banners and backend pushes"
          value={notifEnabled}
          onValueChange={(v) => setNotifSetting("enabled", v)}
        />
        {notifEnabled ? (
          <SettingsToggleRow
            label="Torrent completed"
            value={torrentCompleted}
            onValueChange={(v) => setNotifSetting("torrentCompleted", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="SABnzbd completed"
            value={sabnzbdCompleted}
            onValueChange={(v) => setNotifSetting("sabnzbdCompleted", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="NZBGet completed"
            value={nzbgetCompleted}
            onValueChange={(v) => setNotifSetting("nzbgetCompleted", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="Movie downloaded"
            value={radarrDownloaded}
            onValueChange={(v) => setNotifSetting("radarrDownloaded", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="Episode downloaded"
            value={sonarrDownloaded}
            onValueChange={(v) => setNotifSetting("sonarrDownloaded", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="Service offline"
            value={serviceOffline}
            onValueChange={(v) => setNotifSetting("serviceOffline", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="New Seerr request"
            value={overseerrNewRequest}
            onValueChange={(v) => setNotifSetting("overseerrNewRequest", v)}
          />
        ) : null}
        <SettingsRow
          icon={Cloud}
          label="Backend"
          subtitle="Self-host for real push notifications when the app is closed"
          onPress={() => router.push("/backend")}
          right={<BackendStatusPill />}
        />
      </SettingsGroup>
    </ScreenWrapper>
  );
}
