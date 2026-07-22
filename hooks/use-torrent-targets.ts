import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { useActiveInstance } from "@/hooks/use-active-instance";
import type { ServiceInstance } from "@/store/config-store";

export type TorrentClientId = "qbittorrent" | "rtorrent" | "transmission";

// One candidate destination for a magnet/torrent link: a torrent client kind +
// a specific configured instance of it.
export interface TorrentTarget {
  client: TorrentClientId;
  instanceId: string;
  label: string;
}

export const TORRENT_CLIENT_LABELS: Record<TorrentClientId, string> = {
  qbittorrent: "qBittorrent",
  rtorrent: "rTorrent",
  transmission: "Transmission",
};

/**
 * Every place a magnet/torrent link can be sent: each enabled + workspace-
 * attached instance of each enabled torrent client. Single source of truth for
 * the Downloads tab's incoming-magnet picker and the Jackett grab flow, so
 * "which clients can receive a link" can't drift between the two.
 */
export function useTorrentTargets(): TorrentTarget[] {
  const qbEnabled = useConfigStore((s) => s.services.qbittorrent.enabled);
  const rtEnabled = useConfigStore((s) => s.services.rtorrent?.enabled ?? false);
  const trEnabled = useConfigStore((s) => s.services.transmission?.enabled ?? false);
  const attachedKinds = useAttachedKinds();
  const qbInstances = useActiveInstance("qbittorrent").instances;
  const rtInstances = useActiveInstance("rtorrent").instances;
  const trInstances = useActiveInstance("transmission").instances;

  const kinds: [TorrentClientId, boolean, ServiceInstance[]][] = [
    ["qbittorrent", qbEnabled, qbInstances],
    ["rtorrent", rtEnabled, rtInstances],
    ["transmission", trEnabled, trInstances],
  ];

  return kinds.flatMap(([kind, enabled, instances]) =>
    enabled && attachedKinds.has(kind)
      ? instances.map((i) => ({
          client: kind,
          instanceId: i.id,
          // Only disambiguate with the instance name when the kind has several
          // instances — "qBittorrent · Seedbox" vs just "qBittorrent".
          label:
            instances.length > 1
              ? `${TORRENT_CLIENT_LABELS[kind]} · ${i.name || i.id}`
              : TORRENT_CLIENT_LABELS[kind],
        }))
      : [],
  );
}
