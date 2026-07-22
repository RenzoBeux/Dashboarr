import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { ExternalLink, Download } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { toast, toastError } from "@/components/ui/toast";
import { qbittorrentTorrentAdapter } from "@/lib/torrent-adapters/qbittorrent";
import { rtorrentTorrentAdapter } from "@/lib/torrent-adapters/rtorrent";
import { transmissionTorrentAdapter } from "@/lib/torrent-adapters/transmission";
import {
  useTorrentTargets,
  TORRENT_CLIENT_LABELS,
  type TorrentClientId,
} from "@/hooks/use-torrent-targets";
import { ICON } from "@/lib/constants";
import type { GrabFlowProps } from "@/lib/indexer-adapter";

// A grab the user has picked a destination for. The uri/title are captured at
// press time because the ActionSheet clears `release` as it closes.
interface PendingSend {
  client: TorrentClientId;
  instanceId: string;
  uri: string;
}

// Jackett grab: client-side — Jackett has no server-side grab endpoint (that
// needs the admin cookie), so the release's magnet/.torrent link is handed to
// one of the user's torrent clients via the unified TorrentAdapter.useAddTorrent.
// The destination sheet doubles as the confirmation (explicit target labels);
// action presses only set inline state or open an external URL — no second
// modal, no in-app navigation — so this doesn't need useModalFlow (same
// reasoning as the Downloads tab's incoming-magnet sheet).
export function JackettGrabFlow({ release, onClose }: GrabFlowProps) {
  const targets = useTorrentTargets();
  const [pending, setPending] = useState<PendingSend | null>(null);

  // All three add-torrent hooks are called unconditionally in fixed order
  // (rules of hooks); each binds the picked instance only when its kind is the
  // selected destination. The mutation fires from the effect AFTER the render
  // that re-bound the instanceId, so it always targets the picked instance —
  // no set-active-instance-then-mutate race.
  const qbAdd = qbittorrentTorrentAdapter.useAddTorrent(
    pending?.client === "qbittorrent" ? pending.instanceId : undefined,
  );
  const rtAdd = rtorrentTorrentAdapter.useAddTorrent(
    pending?.client === "rtorrent" ? pending.instanceId : undefined,
  );
  const trAdd = transmissionTorrentAdapter.useAddTorrent(
    pending?.client === "transmission" ? pending.instanceId : undefined,
  );

  useEffect(() => {
    if (!pending) return;
    const mutation =
      pending.client === "qbittorrent"
        ? qbAdd
        : pending.client === "rtorrent"
          ? rtAdd
          : trAdd;
    const label = TORRENT_CLIENT_LABELS[pending.client];
    mutation.mutate(
      { uri: pending.uri },
      {
        onSuccess: () => toast(`Sent to ${label}`),
        onError: (err) => toastError(`Failed to send to ${label}`, err),
      },
    );
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Prefer the magnet (no reachability constraint); fall back to the
  // Jackett-proxied .torrent URL, which the torrent client fetches itself and
  // therefore must be able to reach the Jackett host.
  const uri = release?.magnetUrl || release?.downloadUrl || undefined;

  const actions: ActionSheetAction[] = [];
  if (uri) {
    for (const t of targets) {
      actions.push({
        label: `Send to ${t.label}`,
        icon: <Icon icon={Download} size={ICON.SM} color="#a1a1aa" />,
        onPress: () =>
          setPending({ client: t.client, instanceId: t.instanceId, uri }),
      });
    }
  }
  if (release?.infoUrl) {
    const infoUrl = release.infoUrl;
    actions.push({
      label: "Open details page",
      icon: <Icon icon={ExternalLink} size={ICON.SM} color="#a1a1aa" />,
      onPress: () => {
        Linking.openURL(infoUrl).catch(() => {});
      },
    });
  }

  const noTargets = uri !== undefined && targets.length === 0;

  return (
    <ActionSheet
      visible={release !== null}
      onClose={onClose}
      title="Grab Release"
      subtitle={
        release
          ? noTargets
            ? `${release.title}\nNo torrent client attached to this workspace`
            : release.title
          : undefined
      }
      actions={actions}
    />
  );
}
