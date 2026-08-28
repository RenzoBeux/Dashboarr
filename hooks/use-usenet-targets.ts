import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { useActiveInstance } from "@/hooks/use-active-instance";
import type { ServiceInstance } from "@/store/config-store";

export type UsenetClientId = "sabnzbd" | "nzbget";

// One candidate destination for an NZB URL: a Usenet client kind + a specific
// configured instance of it.
export interface UsenetTarget {
  client: UsenetClientId;
  instanceId: string;
  label: string;
}

export const USENET_CLIENT_LABELS: Record<UsenetClientId, string> = {
  sabnzbd: "SABnzbd",
  nzbget: "NZBGet",
};

/**
 * Every place an NZB URL can be sent: each enabled + workspace-attached
 * instance of each enabled Usenet client. The Usenet twin of
 * hooks/use-torrent-targets.ts, and the single source of truth for "which
 * clients can receive a link" on the Usenet side.
 */
export function useUsenetTargets(): UsenetTarget[] {
  const sabEnabled = useConfigStore((s) => s.services.sabnzbd?.enabled ?? false);
  const nzbgetEnabled = useConfigStore((s) => s.services.nzbget?.enabled ?? false);
  const attachedKinds = useAttachedKinds();
  const sabInstances = useActiveInstance("sabnzbd").instances;
  const nzbgetInstances = useActiveInstance("nzbget").instances;

  const kinds: [UsenetClientId, boolean, ServiceInstance[]][] = [
    ["sabnzbd", sabEnabled, sabInstances],
    ["nzbget", nzbgetEnabled, nzbgetInstances],
  ];

  return kinds.flatMap(([kind, enabled, instances]) =>
    enabled && attachedKinds.has(kind)
      ? instances.map((i) => ({
          client: kind,
          instanceId: i.id,
          // Only disambiguate with the instance name when the kind has several
          // instances — "SABnzbd · Seedbox" vs just "SABnzbd".
          label:
            instances.length > 1
              ? `${USENET_CLIENT_LABELS[kind]} · ${i.name || i.id}`
              : USENET_CLIENT_LABELS[kind],
        }))
      : [],
  );
}
