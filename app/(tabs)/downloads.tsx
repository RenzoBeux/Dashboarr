import { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { UsenetDownloadsView } from "@/components/downloads/usenet-downloads-view";
import { TorrentDownloadsView } from "@/components/downloads/torrent-downloads-view";
import { sabnzbdAdapter } from "@/lib/usenet-adapters/sabnzbd";
import { nzbgetAdapter } from "@/lib/usenet-adapters/nzbget";
import { qbittorrentTorrentAdapter } from "@/lib/torrent-adapters/qbittorrent";
import { rtorrentTorrentAdapter } from "@/lib/torrent-adapters/rtorrent";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocalSearchParams } from "expo-router";

type DownloadClient = "qbittorrent" | "rtorrent" | "sabnzbd" | "nzbget";

// Top-level switcher for the Downloads tab. When more than one download client
// is enabled the user picks via a segmented control; otherwise the available
// client is rendered directly. qBittorrent renders through the shared
// TorrentDownloadsView (driven by a TorrentAdapter); SABnzbd/NZBGet render
// through the shared UsenetDownloadsView.
export default function DownloadsScreen() {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const rtEnabled = useConfigStore((s) => s.services.rtorrent?.enabled ?? false);
  const sabEnabled = useConfigStore((s) => s.services.sabnzbd?.enabled ?? false);
  const nzbgetEnabled = useConfigStore((s) => s.services.nzbget?.enabled ?? false);
  const attachedKinds = useAttachedKinds();

  // Workspace filter: only show clients enabled globally AND with at least
  // one attached instance on the active dashboard. Pinning Downloads to a
  // workspace that has no clients attached is prevented at pin time by
  // pickableTabIdsFor, so the empty case here only happens when the user
  // un-attaches every client after pinning — in which case the redirect in
  // _layout.tsx kicks them out before this screen renders.
  const enabledClients: DownloadClient[] = [];
  if (qbEnabled && attachedKinds.has("qbittorrent")) enabledClients.push("qbittorrent");
  if (rtEnabled && attachedKinds.has("rtorrent")) enabledClients.push("rtorrent");
  if (sabEnabled && attachedKinds.has("sabnzbd")) enabledClients.push("sabnzbd");
  if (nzbgetEnabled && attachedKinds.has("nzbget")) enabledClients.push("nzbget");

  // `?client=...` lets the Services tab (and dashboard Status widget) deep-link
  // straight to the matching segment instead of always landing on whichever
  // client was opened first.
  const { client: clientParam } = useLocalSearchParams<{ client?: string }>();
  const paramClient =
    clientParam === "qbittorrent" ||
    clientParam === "rtorrent" ||
    clientParam === "sabnzbd" ||
    clientParam === "nzbget"
      ? clientParam
      : undefined;

  const [client, setClient] = useState<DownloadClient>(
    paramClient && enabledClients.includes(paramClient)
      ? paramClient
      : enabledClients[0] ?? "qbittorrent",
  );

  // Re-select when the deep-link param changes (e.g. user is already on this
  // tab and taps a different download-client tile in the Services tab).
  useEffect(() => {
    if (paramClient && enabledClients.includes(paramClient) && paramClient !== client) {
      setClient(paramClient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramClient]);

  if (enabledClients.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No download client configured"
          message="Enable qBittorrent, rTorrent, SABnzbd, or NZBGet in Settings to manage downloads."
        />
      </ScreenWrapper>
    );
  }

  const showSegmented = enabledClients.length > 1;
  const activeClient: DownloadClient = showSegmented
    ? enabledClients.includes(client)
      ? client
      : enabledClients[0]
    : enabledClients[0];

  const segmentedControl = showSegmented ? (
    <DownloadsSegmentedControl
      value={activeClient}
      enabled={enabledClients}
      onChange={setClient}
    />
  ) : null;

  if (activeClient === "sabnzbd") {
    return (
      <ScreenWrapper>
        <UsenetDownloadsView
          adapter={sabnzbdAdapter}
          showHeader={!showSegmented}
          segmentedControl={segmentedControl}
        />
      </ScreenWrapper>
    );
  }

  if (activeClient === "nzbget") {
    return (
      <ScreenWrapper>
        <UsenetDownloadsView
          adapter={nzbgetAdapter}
          showHeader={!showSegmented}
          segmentedControl={segmentedControl}
        />
      </ScreenWrapper>
    );
  }

  // qBittorrent and rtorrent both render through the shared TorrentDownloadsView.
  // Key by client so switching between the two torrent clients remounts (resets
  // the local filter state and keeps hook usage stable across adapters).
  const torrentAdapter =
    activeClient === "rtorrent" ? rtorrentTorrentAdapter : qbittorrentTorrentAdapter;
  return (
    <TorrentDownloadsView
      key={activeClient}
      adapter={torrentAdapter}
      segmentedControl={segmentedControl}
    />
  );
}

const SEGMENT_LABELS: Record<DownloadClient, string> = {
  qbittorrent: "qBittorrent",
  rtorrent: "rTorrent",
  sabnzbd: "SABnzbd",
  nzbget: "NZBGet",
};

function DownloadsSegmentedControl({
  value,
  enabled,
  onChange,
}: {
  value: DownloadClient;
  enabled: DownloadClient[];
  onChange: (next: DownloadClient) => void;
}) {
  return (
    <View className="flex-row bg-surface-light rounded-2xl p-1 mb-4 mt-2 mx-4">
      {enabled.map((c) => (
        <Segment
          key={c}
          label={SEGMENT_LABELS[c]}
          active={value === c}
          onPress={() => onChange(c)}
        />
      ))}
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
      <Text className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-400"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
