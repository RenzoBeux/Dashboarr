import { useState } from "react";
import { View, Text } from "react-native";
import { ScanSearch } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Select, type SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast, toastError } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";
import {
  useEnabledInstances,
  useTargetInstance,
} from "@/hooks/use-instance-target";
import {
  useBazarrLinkEntries,
  useBazarrLinkStatus,
} from "@/hooks/use-bazarr-link";
import {
  linkField,
  moveLinkPatches,
  type ArrKind,
  type LinkState,
} from "@/lib/bazarr-link";
import { ARR_LINK_OFF } from "@/lib/config-types";
import type { ServiceId } from "@/lib/constants";

const KIND_LABEL: Record<ArrKind, string> = { radarr: "Radarr", sonarr: "Sonarr" };

// Select needs a value for "automatic with nothing detected"; instance ids are
// UUIDs, so this never collides.
const NOT_LINKED = "";

/**
 * "Connected apps" on a Bazarr instance: which Radarr and Sonarr this Bazarr
 * serves subtitles for (model: lib/bazarr-link.ts).
 *
 * Each row is detected from Bazarr's own settings unless the user picks
 * something else. Picking the detected instance stores "automatic" rather than
 * a fixed id, so the badge always tells the truth: Detected means it follows
 * Bazarr's configuration, Set by you means it doesn't. Writes go straight to
 * the store, like the other per-instance cards.
 *
 * Renders nothing for other service kinds, and nothing until the instance is
 * enabled with a URL — detection has to reach it.
 */
export function BazarrLinksCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  const inst = useTargetInstance("bazarr", instanceId);
  if (serviceId !== "bazarr" || !inst?.enabled || !(inst.localUrl || inst.remoteUrl)) {
    return null;
  }
  return <LinksBody instanceId={instanceId} />;
}

function LinksBody({ instanceId }: { instanceId: string }) {
  const status = useBazarrLinkStatus(instanceId);
  const [detecting, setDetecting] = useState(false);
  const updateInstance = useConfigStore((s) => s.updateInstance);
  const instName = useTargetInstance("bazarr", instanceId)?.name ?? "Bazarr";

  const addresses = [status.detection?.radarr.address, status.detection?.sonarr.address]
    .filter(Boolean)
    .join(" and ");

  const detectAgain = async () => {
    setDetecting(true);
    // Back to automatic for both kinds, then read Bazarr's settings afresh.
    updateInstance("bazarr", instanceId, {
      linkedRadarrInstanceId: undefined,
      linkedSonarrInstanceId: undefined,
    });
    try {
      const result = await status.redetect();
      const names = (["radarr", "sonarr"] as const)
        .map((k) => {
          const id = result[k].instanceId;
          return id
            ? useConfigStore.getState().serviceInstances[k]?.find((i) => i.id === id)?.name
            : undefined;
        })
        .filter(Boolean);
      toast(
        names.length > 0
          ? `Found ${names.join(" and ")}`
          : "Bazarr isn't connected to any Radarr or Sonarr set up here",
        names.length > 0 ? "success" : "info",
      );
    } catch (err) {
      toastError("Couldn't read Bazarr's settings", err);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <Card className="gap-4 mb-4">
      <View className="gap-1">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Connected apps
        </Text>
        <Text className="text-zinc-500 text-xs">
          Subtitles from this Bazarr show on the movie and series pages of these
          instances.
        </Text>
      </View>

      <LinkSelect
        kind="radarr"
        bazarrId={instanceId}
        bazarrName={instName}
        state={status.radarr}
        detectedId={status.detection?.radarr.instanceId ?? null}
      />
      <LinkSelect
        kind="sonarr"
        bazarrId={instanceId}
        bazarrName={instName}
        state={status.sonarr}
        detectedId={status.detection?.sonarr.instanceId ?? null}
      />

      <View className="flex-row items-center gap-3">
        <Text className="text-zinc-500 text-xs flex-1">
          {status.detectError
            ? "Couldn't read Bazarr's settings. Check the connection above."
            : addresses
              ? `Bazarr reaches ${addresses}`
              : status.detecting
                ? "Reading Bazarr's settings…"
                : "Bazarr has no Radarr or Sonarr set up."}
        </Text>
        <Button
          label={detecting ? "Detecting…" : "Detect again"}
          variant="outline"
          size="sm"
          onPress={detectAgain}
          loading={detecting}
          icon={detecting ? undefined : <Icon icon={ScanSearch} size={14} color="#a1a1aa" />}
        />
      </View>

      <Text className="text-zinc-500 text-xs">
        Detection compares the API key and address Bazarr has for each app with
        the instances on this phone. Nothing else from Bazarr&apos;s settings is
        read or kept.
      </Text>
    </Card>
  );
}

function LinkSelect({
  kind,
  bazarrId,
  bazarrName,
  state,
  detectedId,
}: {
  kind: ArrKind;
  bazarrId: string;
  bazarrName: string;
  state: LinkState;
  detectedId: string | null;
}) {
  const arrs = useEnabledInstances(kind);
  const entries = useBazarrLinkEntries(kind);
  const bazarrs = useConfigStore((s) => s.serviceInstances.bazarr ?? []);
  const updateInstance = useConfigStore((s) => s.updateInstance);
  const stored = useConfigStore(
    (s) => s.serviceInstances.bazarr?.find((b) => b.id === bazarrId)?.[linkField(kind)],
  );
  const label = KIND_LABEL[kind];

  // Another Bazarr already serving this arr, for the "moves the link" hint.
  const ownerOf = (arrId: string) => {
    const owner = entries.find((e) => e.bazarrId !== bazarrId && e.state.arrId === arrId);
    return owner ? bazarrs.find((b) => b.id === owner.bazarrId)?.name : undefined;
  };

  const value =
    state.how === "off"
      ? ARR_LINK_OFF
      : state.how === "stale"
        ? (stored ?? NOT_LINKED)
        : (state.arrId ?? NOT_LINKED);

  const options: SelectOption<string>[] = [
    ...(value === NOT_LINKED
      ? [{ value: NOT_LINKED, label: "Not linked", description: "Nothing detected yet" }]
      : []),
    ...arrs.map((a) => {
      const owner = ownerOf(a.id);
      return {
        value: a.id,
        label: a.name,
        badge:
          a.id === detectedId
            ? "Detected"
            : state.how === "manual" && a.id === state.arrId
              ? "Set by you"
              : undefined,
        description:
          a.id === detectedId
            ? `Same API key Bazarr uses for ${label}`
            : owner
              ? `Linked to ${owner}. Picking it here moves the link.`
              : "Not linked to any Bazarr",
      };
    }),
    ...(state.how === "stale" && stored
      ? [
          {
            value: stored,
            label: "Unavailable instance",
            description: "Deleted or disabled. Pick another one, or None.",
          },
        ]
      : []),
    {
      value: ARR_LINK_OFF,
      label: "None",
      description: `Don't show subtitles on ${label} pages`,
    },
  ];

  const pick = (next: string) => {
    if (next === value) return;
    if (next === ARR_LINK_OFF) {
      updateInstance("bazarr", bazarrId, { [linkField(kind)]: ARR_LINK_OFF });
      toast(`${label} unlinked`);
      return;
    }
    if (next === NOT_LINKED) return;
    if (next === detectedId) {
      // The detected instance is what automatic mode resolves to.
      updateInstance("bazarr", bazarrId, { [linkField(kind)]: undefined });
    } else {
      for (const { bazarrId: id, patch } of moveLinkPatches(kind, bazarrs, bazarrId, next)) {
        updateInstance("bazarr", id, patch);
      }
    }
    toast(`Linked ${arrs.find((a) => a.id === next)?.name ?? label}`);
  };

  return (
    <Select<string>
      label={`${label} for ${bazarrName}`}
      value={value}
      options={options}
      onChange={pick}
      placeholder="Not linked"
    />
  );
}

