import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { Download, ExternalLink } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { toast, toastError } from "@/components/ui/toast";
import { sabnzbdAdapter } from "@/lib/usenet-adapters/sabnzbd";
import { nzbgetAdapter } from "@/lib/usenet-adapters/nzbget";
import {
  useUsenetTargets,
  USENET_CLIENT_LABELS,
  type UsenetClientId,
} from "@/hooks/use-usenet-targets";
import { ICON } from "@/lib/constants";
import type { GrabFlowProps } from "@/lib/indexer-adapter";

// A grab the user has picked a destination for. The url/title are captured at
// press time because the ActionSheet clears `release` as it closes.
interface PendingSend {
  client: UsenetClientId;
  instanceId: string;
  url: string;
}

// NZBHydra2 grab: client-side — Hydra's send-to-downloader lives on
// /internalapi, which is guarded by the web session rather than the install
// API key, so there is no server-side grab to POST. The release's NZB link is
// handed to one of the user's Usenet clients via the unified
// UsenetAdapter.useAddUrl instead. The destination sheet doubles as the
// confirmation (explicit target labels); action presses only set inline state
// or open an external URL — no second modal, no in-app navigation — so this
// doesn't need useModalFlow (same reasoning as jackett-grab-flow.tsx and the
// Downloads tab's incoming-magnet sheet).
export function Nzbhydra2GrabFlow({ release, onClose }: GrabFlowProps) {
  const targets = useUsenetTargets();
  const [pending, setPending] = useState<PendingSend | null>(null);

  // Both add-url hooks are called unconditionally in fixed order (rules of
  // hooks); each binds the picked instance only when its kind is the selected
  // destination. Keep them ABOVE the effect: useMutation applies new options in
  // its own effect and effects fire in hook order, so this ordering is what
  // guarantees the rebind lands before we mutate.
  const sabAdd = sabnzbdAdapter.useAddUrl(
    pending?.client === "sabnzbd" ? pending.instanceId : undefined,
  );
  const nzbgetAdd = nzbgetAdapter.useAddUrl(
    pending?.client === "nzbget" ? pending.instanceId : undefined,
  );

  // The mutation fires from the effect AFTER the render that re-bound the
  // instanceId, so it always targets the picked instance — no
  // set-active-instance-then-mutate race. Two clients instead of four doesn't
  // change this: the hazard is the instanceId hook argument, and it bites just
  // as hard with one kind and two instances.
  useEffect(() => {
    if (!pending) return;
    const mutation = pending.client === "sabnzbd" ? sabAdd : nzbgetAdd;
    const label = USENET_CLIENT_LABELS[pending.client];
    mutation.mutate(
      { url: pending.url },
      {
        onSuccess: () => toast(`Sent to ${label}`),
        onError: (err) => toastError(`Failed to send to ${label}`, err),
      },
    );
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // The NZB link is self-authenticating — Hydra's DownloadUrlBuilder emits
  // <hydraBaseUrl>/getnzb/api/<id>?apikey=<install key> for external API calls,
  // so the key rides along. But SABnzbd/NZBGet fetch that URL THEMSELVES, so
  // the download client must be able to reach the NZBHydra2 host, and the host
  // in the link is whatever Hydra derived from our request (or its configured
  // downloading.externalUrl). A client on a different network than the app can
  // therefore still fail here even though the search worked — the same
  // reachability constraint as the Jackett-proxied .torrent URL.
  const url = release?.downloadUrl || undefined;

  const actions: ActionSheetAction[] = [];
  if (url) {
    for (const t of targets) {
      actions.push({
        label: `Send to ${t.label}`,
        icon: <Icon icon={Download} size={ICON.SM} color="#a1a1aa" />,
        onPress: () =>
          setPending({ client: t.client, instanceId: t.instanceId, url }),
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

  const noTargets = url !== undefined && targets.length === 0;

  return (
    <ActionSheet
      visible={release !== null}
      onClose={onClose}
      title="Grab Release"
      subtitle={
        release
          ? noTargets
            ? `${release.title}\nNo Usenet client attached to this workspace`
            : release.title
          : undefined
      }
      actions={actions}
    />
  );
}
