import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfigStore } from "@/store/config-store";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { QbittorrentDownloadsView } from "@/components/downloads/qbittorrent-downloads-view";
import { SabnzbdDownloadsView } from "@/components/downloads/sabnzbd-downloads-view";

type Client = "qbittorrent" | "sabnzbd";

export default function DownloadsScreen() {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const sabEnabled = useConfigStore((s) => s.services.sabnzbd.enabled);

  // Default the segmented control to the first enabled client. If only one is
  // enabled the segmented control is hidden and we render that view directly,
  // so this state only matters when both are on.
  const [client, setClient] = useState<Client>(qbEnabled ? "qbittorrent" : "sabnzbd");

  const { refreshing, onRefresh } = usePullToRefresh([["qbittorrent"], ["sabnzbd"]]);

  if (!qbEnabled && !sabEnabled) {
    return (
      <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
        <EmptyState
          title="No download client configured"
          message="Enable qBittorrent or SABnzbd in Settings to manage downloads."
        />
      </ScreenWrapper>
    );
  }

  const showSegmented = qbEnabled && sabEnabled;
  const activeClient: Client = showSegmented ? client : qbEnabled ? "qbittorrent" : "sabnzbd";

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      {showSegmented && (
        <SegmentedControl
          value={activeClient}
          onChange={setClient}
        />
      )}

      {activeClient === "qbittorrent" ? (
        <QbittorrentDownloadsView showHeader={!showSegmented} />
      ) : (
        <SabnzbdDownloadsView showHeader={!showSegmented} />
      )}
    </ScreenWrapper>
  );
}

function SegmentedControl({
  value,
  onChange,
}: {
  value: Client;
  onChange: (next: Client) => void;
}) {
  return (
    <View className="flex-row bg-surface-light rounded-2xl p-1 mb-4 mt-2">
      <Segment
        label="qBittorrent"
        active={value === "qbittorrent"}
        onPress={() => onChange("qbittorrent")}
      />
      <Segment
        label="SABnzbd"
        active={value === "sabnzbd"}
        onPress={() => onChange("sabnzbd")}
      />
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2 rounded-xl items-center active:opacity-70 ${active ? "bg-surface" : ""}`}
    >
      <Text
        className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-400"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
