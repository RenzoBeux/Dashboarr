import { View, Text } from "react-native";
import { useQueries } from "@tanstack/react-query";
import {
  getArrDiskSpace,
  DISK_PATHS_ALL,
  type ArrDiskSpaceService,
  type DiskPathsValue,
} from "@/services/arr-diskspace";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import {
  resolveBoundInstances,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import { SelectRow } from "@/components/dashboard/widget-settings/widget-settings-blocks";
import { POLLING_INTERVALS } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { ArrDiskSpace } from "@/lib/types";

// Re-exported so settings panels can keep importing the value contract from
// the picker they render. Source of truth lives in services/arr-diskspace.
export { DISK_PATHS_ALL, type DiskPathsValue };

interface DiskPathPickerRowProps {
  // Which *arr kind + instances the widget is bound to — candidate mounts are
  // gathered from these hosts.
  source: ArrDiskSpaceService;
  instanceIds: InstanceBindingValue;
  value: DiskPathsValue;
  onChange: (value: DiskPathsValue) => void;
}

/**
 * Lets the Disk Space widget restrict its list to specific mounts, or show
 * every mount the source reports. Candidates are fetched live from the bound
 * instance(s) — *arr's /diskspace often includes docker overlays and system
 * mounts the user doesn't care about — and rendered as a checklist with an
 * "All mounts" default. Selections are stored by path string and applied
 * per-instance.
 */
export function DiskPathPickerRow({
  source,
  instanceIds,
  value,
  onChange,
}: DiskPathPickerRowProps) {
  const allInstances = useEnabledInstances(source);
  const instances = resolveBoundInstances(instanceIds, allInstances);

  // Reuse the same query key the card polls on, so candidates appear
  // instantly when data is already cached.
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: [source, inst.id, "diskspace"] as const,
      queryFn: () => getArrDiskSpace(source, inst.id),
      refetchInterval: POLLING_INTERVALS.diskSpace,
    })),
  });

  // Merge mounts across bound hosts by path (first label wins), sorted by
  // path for a stable order under the user's finger.
  const byPath = new Map<string, ArrDiskSpace>();
  for (const q of queries) {
    if (!q.data) continue;
    for (const disk of q.data) {
      if (!byPath.has(disk.path)) byPath.set(disk.path, disk);
    }
  }
  const merged = Array.from(byPath.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  const isAll = value === DISK_PATHS_ALL;
  const selectedSet = new Set<string>(isAll ? [] : value);

  const toggle = (path: string) => {
    if (isAll) {
      // From "all" → start a fresh explicit subset with just this mount.
      onChange([path]);
      return;
    }
    if (selectedSet.has(path)) {
      const next = (value as string[]).filter((v) => v !== path);
      onChange(next.length === 0 ? DISK_PATHS_ALL : next);
    } else {
      onChange([...(value as string[]), path]);
    }
  };

  return (
    <View>
      <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
        Mounts
      </Text>
      <View className="bg-surface-light rounded-2xl border border-border divide-y divide-border/60 overflow-hidden">
        <SelectRow
          label="All mounts"
          caption="Every mount the server reports — new ones auto-included"
          selected={isAll}
          onPress={() => onChange(DISK_PATHS_ALL)}
        />
        {merged.map((disk) => (
          <SelectRow
            key={disk.path}
            label={disk.label?.trim() || disk.path}
            caption={usageCaption(disk)}
            selected={!isAll && selectedSet.has(disk.path)}
            onPress={() => toggle(disk.path)}
          />
        ))}
      </View>
      {merged.length === 0 ? (
        <Text className="text-zinc-600 text-xs mt-2">
          No mounts reported yet.
        </Text>
      ) : null}
    </View>
  );
}

function usageCaption(disk: ArrDiskSpace): string {
  const used = Math.max(disk.totalSpace - disk.freeSpace, 0);
  if (disk.totalSpace <= 0) return formatBytes(disk.freeSpace) + " free";
  const pct = Math.round((used / disk.totalSpace) * 100);
  return `${formatBytes(used)} / ${formatBytes(disk.totalSpace)} · ${pct}%`;
}
