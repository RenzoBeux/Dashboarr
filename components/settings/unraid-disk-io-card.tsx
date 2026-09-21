import { View, Text } from "react-native";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useConfigStore } from "@/store/config-store";
import { useTargetInstance } from "@/hooks/use-instance-target";
import { useAttachedEnabledInstances } from "@/hooks/use-workspace-instances";
import { sharesHost } from "@/lib/instance-host-match";
import type { ServiceId } from "@/lib/constants";

// Instance ids are non-empty UUIDs, so the empty string safely means "not
// paired" and never collides with a real id.
const NOT_PAIRED = "";

/**
 * Per-instance unRAID → Glances pairing for disk read/write rates (#386).
 *
 * unRAID's own API cannot supply this: its state parser hardcodes
 * numReads/numWrites to 0 for every disk, and the schema has no throughput
 * field at all. The only source of real per-drive I/O is a Glances running on
 * the same machine, which reports it per kernel device name — the same names
 * unRAID uses, so the two join directly.
 *
 * The pairing is explicit rather than inferred. Matching the two instances by
 * URL hostname is tempting and mostly works, but it is not verifiable: one
 * public hostname can forward different ports to different machines, so a
 * hostname match can silently paint another server's disk activity onto these
 * drives — and, because live I/O overrides the standby indicator, misreport a
 * parked disk as awake. Wrong numbers on the wrong drives are worse than none,
 * so unpaired means no chips and no query.
 *
 * Renders nothing for other service kinds so the caller can drop it in
 * unconditionally.
 */
export function UnraidDiskIoCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  if (serviceId !== "unraid") return null;
  return <DiskIoBody instanceId={instanceId} />;
}

function DiskIoBody({ instanceId }: { instanceId: string }) {
  const inst = useTargetInstance("unraid", instanceId);
  const updateInstance = useConfigStore((s) => s.updateInstance);
  const glances = useAttachedEnabledInstances("glances");

  const stored = inst?.diskIoInstanceId;
  const isStale = stored !== undefined && !glances.some((g) => g.id === stored);

  // Same-host candidates are almost always the right answer, so they sort first
  // and say so. This is a hint for the human choosing, never a default: a
  // shared hostname isn't proof of a shared machine, which is exactly why the
  // pairing is stored rather than inferred.
  const sameHost = (g: { localUrl: string; remoteUrl: string }) =>
    sharesHost(inst, g);
  const sorted = [...glances].sort(
    (a, b) => Number(sameHost(b)) - Number(sameHost(a)),
  );

  return (
    <Card className="gap-4 mb-4">
      <View className="gap-1">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Disk activity
        </Text>
        <Text className="text-zinc-500 text-xs">
          Where the read/write rates on this server&apos;s disks come from.
        </Text>
      </View>

      <Select<string>
        label="Disk activity source"
        value={stored ?? NOT_PAIRED}
        // Stays usable with no candidates as long as something is stored:
        // deleting, disabling or detaching the paired Glances would otherwise
        // strand a dangling id with no way to pick "None" and clear it.
        disabled={glances.length === 0 && stored === undefined}
        options={[
          {
            value: NOT_PAIRED,
            label: "None",
            description: "Don't show read/write rates (default)",
          },
          ...sorted.map((g) => ({
            value: g.id,
            label: g.name,
            description: sameHost(g)
              ? "Same host as this server"
              : "Only pick this if it runs on this same machine",
          })),
          ...(isStale
            ? [
                {
                  value: stored,
                  // Covers all three ways a pairing goes stale: the instance
                  // was deleted, disabled, or detached from this dashboard.
                  label: "Unavailable server",
                  description: "Not available on this dashboard anymore",
                },
              ]
            : []),
        ]}
        onChange={(v) =>
          updateInstance("unraid", instanceId, {
            diskIoInstanceId: v === NOT_PAIRED ? undefined : v,
          })
        }
      />

      {isStale ? (
        <Text className="text-zinc-500 text-xs">
          The paired Glances server was deleted, disabled, or removed from this
          dashboard, so no rates are being shown. Pick another one, or choose
          None to clear the pairing.
        </Text>
      ) : glances.length === 0 ? (
        <Text className="text-zinc-500 text-xs">
          No Glances server is set up on this dashboard. Add one running on this
          same machine to see per-disk read and write rates.
        </Text>
      ) : (
        <Text className="text-zinc-500 text-xs">
          Pick the Glances running on this same machine. unRAID&apos;s own API
          always reports zero reads and writes, so Glances is the only source
          for this. Pointing at a different machine would show its disk activity
          on these drives.
        </Text>
      )}
    </Card>
  );
}
