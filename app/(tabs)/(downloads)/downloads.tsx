import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { UsenetDownloadsView } from "@/components/downloads/usenet-downloads-view";
import {
  TorrentDownloadsView,
  type IncomingTorrent,
} from "@/components/downloads/torrent-downloads-view";
import { sabnzbdAdapter } from "@/lib/usenet-adapters/sabnzbd";
import { nzbgetAdapter } from "@/lib/usenet-adapters/nzbget";
import { qbittorrentTorrentAdapter } from "@/lib/torrent-adapters/qbittorrent";
import { rtorrentTorrentAdapter } from "@/lib/torrent-adapters/rtorrent";
import { transmissionTorrentAdapter } from "@/lib/torrent-adapters/transmission";
import { delugeTorrentAdapter } from "@/lib/torrent-adapters/deluge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionSheet } from "@/components/ui/action-sheet";
import { toastError } from "@/components/ui/toast";
import { useTorrentTargets, type TorrentTarget } from "@/hooks/use-torrent-targets";
import { magnetDisplayName, torrentFileDisplayName } from "@/lib/utils";
import {
  discardTorrentFile,
  discardTorrentSource,
  inspectTorrentFile,
} from "@/lib/torrent-file";
import { useLocalSearchParams, useRouter } from "expo-router";

type DownloadClient =
  | "qbittorrent"
  | "rtorrent"
  | "transmission"
  | "deluge"
  | "sabnzbd"
  | "nzbget";

// Top-level switcher for the Downloads tab. When more than one download client
// is enabled the user picks via a segmented control; otherwise the available
// client is rendered directly. qBittorrent renders through the shared
// TorrentDownloadsView (driven by a TorrentAdapter); SABnzbd/NZBGet render
// through the shared UsenetDownloadsView.
export default function DownloadsScreen() {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const rtEnabled = useConfigStore((s) => s.services.rtorrent?.enabled ?? false);
  const transEnabled = useConfigStore((s) => s.services.transmission?.enabled ?? false);
  const delugeEnabled = useConfigStore((s) => s.services.deluge?.enabled ?? false);
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
  if (transEnabled && attachedKinds.has("transmission"))
    enabledClients.push("transmission");
  if (delugeEnabled && attachedKinds.has("deluge")) enabledClients.push("deluge");
  if (sabEnabled && attachedKinds.has("sabnzbd")) enabledClients.push("sabnzbd");
  if (nzbgetEnabled && attachedKinds.has("nzbget")) enabledClients.push("nzbget");

  // `?client=...` lets the Services tab (and dashboard Status widget) deep-link
  // straight to the matching segment instead of always landing on whichever
  // client was opened first. `?magnet=...` arrives from the OS magnet-link
  // handler and `?torrentFile=...` from an opened .torrent file (both via
  // app/+native-intent.ts); either prefills the add card.
  const {
    client: clientParam,
    magnet: magnetParam,
    torrentFile: torrentFileParam,
  } = useLocalSearchParams<{
    client?: string;
    magnet?: string;
    torrentFile?: string;
  }>();
  const paramClient =
    clientParam === "qbittorrent" ||
    clientParam === "rtorrent" ||
    clientParam === "transmission" ||
    clientParam === "deluge" ||
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

  // Incoming magnet link or .torrent file. Stash it in state (not the route)
  // so the prefill survives segment switches — TorrentDownloadsView remounts
  // per client — and clear the param immediately so tab revisits don't
  // re-trigger the add card.
  //
  // Candidate destinations are every enabled+attached instance of every
  // enabled torrent client. One candidate → open the add card directly;
  // several → an ActionSheet picks the client + instance first.
  const router = useRouter();
  const [pendingTorrent, setPendingTorrent] = useState<IncomingTorrent>();
  // Item waiting on the destination ActionSheet (only set with 2+ targets).
  const [incomingPick, setIncomingPick] = useState<IncomingTorrent>();
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);

  // Shared with the Jackett grab flow — see hooks/use-torrent-targets.ts.
  const torrentTargets = useTorrentTargets();

  const applyTorrentTarget = (target: TorrentTarget, incoming: IncomingTorrent) => {
    setClient(target.client);
    // Switch the tab to the picked instance so the torrent list and add card
    // show the actual destination (useAddTorrent follows the active instance).
    setActiveInstance(target.client, target.instanceId);
    setPendingTorrent(incoming);
  };

  // An opened file we own a local copy of is deleted when it is abandoned
  // here (no client, picker dismissed); once staged in the add card the card
  // owns that cleanup.
  const abandonIncoming = (incoming: IncomingTorrent) => {
    if (incoming.kind === "file") discardTorrentSource(incoming.file);
  };

  const routeIncoming = (incoming: IncomingTorrent) => {
    if (torrentTargets.length === 0) {
      toastError("No torrent client enabled");
      abandonIncoming(incoming);
      return;
    }
    if (torrentTargets.length === 1) {
      applyTorrentTarget(torrentTargets[0], incoming);
    } else {
      setIncomingPick(incoming);
    }
  };

  useEffect(() => {
    if (!magnetParam) return;
    router.setParams({ magnet: undefined });
    routeIncoming({ kind: "magnet", uri: magnetParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magnetParam]);

  useEffect(() => {
    if (!torrentFileParam) return;
    router.setParams({ torrentFile: undefined });
    // The OS names nothing for us (an Android content:// URI has no filename
    // at all), so inspectTorrentFile reads the torrent's own name from the
    // metainfo and refuses anything that isn't a torrent.
    void (async () => {
      try {
        const file = await inspectTorrentFile(torrentFileParam);
        routeIncoming({ kind: "file", file });
      } catch (err) {
        discardTorrentFile(torrentFileParam);
        toastError("Can't open this file", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torrentFileParam]);

  const incomingTitle = (incoming: IncomingTorrent | undefined) => {
    if (!incoming) return undefined;
    return incoming.kind === "magnet"
      ? magnetDisplayName(incoming.uri) ?? undefined
      : incoming.file.title ?? torrentFileDisplayName(incoming.file.name);
  };

  // Destination picker for incoming magnets/files. Action presses only set
  // inline state (no second modal, no navigation), so this doesn't need
  // useModalFlow. The sheet fires onClose before an action's onPress, so a
  // dismissal is only treated as abandonment once the sheet has fully closed
  // (onClosed) with no action having claimed the item in between.
  const unclaimedPick = useRef<IncomingTorrent | undefined>(undefined);
  const magnetSheet = (
    <ActionSheet
      visible={incomingPick !== undefined}
      onClose={() => {
        unclaimedPick.current = incomingPick;
        setIncomingPick(undefined);
      }}
      onClosed={() => {
        const abandoned = unclaimedPick.current;
        unclaimedPick.current = undefined;
        if (abandoned) abandonIncoming(abandoned);
      }}
      title="Add Torrent To"
      subtitle={incomingTitle(incomingPick)}
      actions={torrentTargets.map((t) => ({
        label: t.label,
        onPress: () => {
          unclaimedPick.current = undefined;
          if (incomingPick) applyTorrentTarget(t, incomingPick);
        },
      }))}
    />
  );

  if (enabledClients.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No download client configured"
          message="Enable a download client in Settings → Integrations to manage downloads."
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
        {magnetSheet}
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
        {magnetSheet}
      </ScreenWrapper>
    );
  }

  // qBittorrent, rtorrent, Transmission and Deluge all render through the
  // shared TorrentDownloadsView. Key by client so switching between torrent
  // clients remounts (resets the local filter state and keeps hook usage stable
  // across adapters).
  const torrentAdapter =
    activeClient === "rtorrent"
      ? rtorrentTorrentAdapter
      : activeClient === "transmission"
        ? transmissionTorrentAdapter
        : activeClient === "deluge"
          ? delugeTorrentAdapter
          : qbittorrentTorrentAdapter;
  return (
    <>
      <TorrentDownloadsView
        key={activeClient}
        adapter={torrentAdapter}
        segmentedControl={segmentedControl}
        incomingTorrent={pendingTorrent}
        onIncomingConsumed={() => setPendingTorrent(undefined)}
      />
      {magnetSheet}
    </>
  );
}

const SEGMENT_LABELS: Record<DownloadClient, string> = {
  qbittorrent: "qBittorrent",
  rtorrent: "rTorrent",
  transmission: "Transmission",
  deluge: "Deluge",
  sabnzbd: "SABnzbd",
  nzbget: "NZBGet",
};

// Above this many clients the equal-width segments get too narrow for their
// labels ("Transmission" at text-sm already fills a quarter-width slot on a
// 390pt screen, and every label grows with uiScale). Past the threshold the row
// becomes a horizontal ScrollView of intrinsically-sized segments so nothing
// clips and every client stays reachable — the same rule the FilterChip rows
// follow. At or below it the control keeps its full-width look unchanged.
const MAX_FIXED_SEGMENTS = 3;

function DownloadsSegmentedControl({
  value,
  enabled,
  onChange,
}: {
  value: DownloadClient;
  enabled: DownloadClient[];
  onChange: (next: DownloadClient) => void;
}) {
  const segments = enabled.map((c) => (
    <Segment
      key={c}
      label={SEGMENT_LABELS[c]}
      active={value === c}
      onPress={() => onChange(c)}
      fill={enabled.length <= MAX_FIXED_SEGMENTS}
    />
  ));

  if (enabled.length <= MAX_FIXED_SEGMENTS) {
    return (
      <View className="flex-row bg-surface-light rounded-2xl p-1 mb-4 mt-2 mx-4">
        {segments}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-4 mt-2"
      contentContainerClassName="px-4"
    >
      <View className="flex-row bg-surface-light rounded-2xl p-1">{segments}</View>
    </ScrollView>
  );
}

function Segment({
  label,
  active,
  onPress,
  fill,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  // Split the row evenly (few clients) vs size to the label (scrolling row).
  fill: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`py-2 rounded-xl items-center active:opacity-70 ${fill ? "flex-1" : "px-4"} ${active ? "bg-surface" : ""}`}
    >
      <Text className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-400"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
