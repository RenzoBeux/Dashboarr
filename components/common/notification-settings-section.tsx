import { View, Text } from "react-native";
import { Bell } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { useNotificationStore } from "@/store/notifications-store";

export function NotificationSettingsSection() {
  const enabled = useNotificationStore((s) => s.enabled);
  const torrentCompleted = useNotificationStore((s) => s.torrentCompleted);
  const radarrDownloaded = useNotificationStore((s) => s.radarrDownloaded);
  const sonarrDownloaded = useNotificationStore((s) => s.sonarrDownloaded);
  const serviceOffline = useNotificationStore((s) => s.serviceOffline);
  const overseerrNewRequest = useNotificationStore((s) => s.overseerrNewRequest);
  const setSetting = useNotificationStore((s) => s.setSetting);

  return (
    <View>
      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1 mt-6">
        Notifications
      </Text>
      <Card className="gap-1">
        <View className="flex-row items-center gap-2 mb-1">
          <Bell size={16} color="#a1a1aa" />
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            Local alerts
          </Text>
        </View>
        <Toggle
          label="Enabled"
          description="Fire banners when Dashboarr is open"
          value={enabled}
          onValueChange={(v) => setSetting("enabled", v)}
        />
        {enabled && (
          <View className="gap-1 mt-1 pt-2 border-t border-border">
            <Toggle
              label="Torrent completed"
              value={torrentCompleted}
              onValueChange={(v) => setSetting("torrentCompleted", v)}
            />
            <Toggle
              label="Movie downloaded"
              value={radarrDownloaded}
              onValueChange={(v) => setSetting("radarrDownloaded", v)}
            />
            <Toggle
              label="Episode downloaded"
              value={sonarrDownloaded}
              onValueChange={(v) => setSetting("sonarrDownloaded", v)}
            />
            <Toggle
              label="Service offline"
              value={serviceOffline}
              onValueChange={(v) => setSetting("serviceOffline", v)}
            />
            <Toggle
              label="New Seerr request"
              value={overseerrNewRequest}
              onValueChange={(v) => setSetting("overseerrNewRequest", v)}
            />
          </View>
        )}
      </Card>
    </View>
  );
}
