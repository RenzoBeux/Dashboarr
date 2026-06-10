import { View, Text } from "react-native";
import { ServerCrash } from "lucide-react-native";
import { useQueries } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { DiskUsageRow } from "@/components/dashboard/disk-usage-row";
import { getArrDiskSpace, selectDiskSpace } from "@/services/arr-diskspace";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import {
  useAttachedEnabledInstances,
  useWorkspaceScopedInstances,
} from "@/hooks/use-workspace-instances";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { POLLING_INTERVALS, SERVICE_DEFAULTS } from "@/lib/constants";
import {
  DISK_SPACE_DEFAULT_SETTINGS,
  resolveDiskSpaceSource,
  diskSpaceBindingFor,
  type DiskSpaceSettingsValue,
} from "@/components/dashboard/widget-settings/disk-space-settings";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function DiskSpaceCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<DiskSpaceSettingsValue>(
    slotId,
    DISK_SPACE_DEFAULT_SETTINGS,
  );

  // Workspace-scoped availability drives the source-forcing decision so a
  // Sonarr-only dashboard renders Sonarr disks without the user ever opening
  // the settings (#148 pattern; mirrors speed-stats).
  const wsRadarr = useAttachedEnabledInstances("radarr");
  const wsSonarr = useAttachedEnabledInstances("sonarr");
  const wsLidarr = useAttachedEnabledInstances("lidarr");
  const source = resolveDiskSpaceSource(settings.source, {
    radarr: wsRadarr.length > 0,
    sonarr: wsSonarr.length > 0,
    lidarr: wsLidarr.length > 0,
  });
  const sourceName = SERVICE_DEFAULTS[source].name;

  const instances = useWorkspaceScopedInstances(
    source,
    diskSpaceBindingFor(settings, source),
  );

  // Fan out across the bound instances; each keeps its own cache slot via the
  // [serviceId, instanceId, endpoint] key shape (shared with the path picker).
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: [source, inst.id, "diskspace"] as const,
      queryFn: () => getArrDiskSpace(source, inst.id),
      refetchInterval: POLLING_INTERVALS.diskSpace,
    })),
  });
  const { isInitialLoading, isAllErrored } = aggregateMultiInstanceState(queries);

  // Unlike speed-stats' self-explanatory pills, a bare mount list needs
  // context — always render a header.
  const title = settings.title.trim() || "Disk Space";
  const header = (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
  );

  if (instances.length === 0) {
    return (
      <Card>
        {header}
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ServerCrash} size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">
            No {sourceName} instances enabled
          </Text>
        </View>
      </Card>
    );
  }

  // Every bound instance errored without ever returning data — surface that
  // instead of an empty card that reads as "no disks".
  if (isAllErrored) {
    return (
      <Card>
        {header}
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ServerCrash} size={16} color="#71717a" />
          <Text className="text-zinc-500 text-sm">
            Could not reach {sourceName}
          </Text>
        </View>
      </Card>
    );
  }

  if (isInitialLoading) {
    return (
      <Card>
        {header}
        <SkeletonCardContent rows={2} />
      </Card>
    );
  }

  const sections = instances.map((inst, i) => {
    const q = queries[i];
    const disks = selectDiskSpace(q?.data, settings.paths);
    return { inst, q, disks };
  });
  const allFilteredOut =
    sections.every((s) => s.disks.length === 0) &&
    sections.some((s) => (s.q?.data?.length ?? 0) > 0);

  return (
    <Card>
      {header}
      {allFilteredOut ? (
        <Text className="text-zinc-500 text-sm py-1">
          All mounts hidden — adjust paths in the widget settings.
        </Text>
      ) : (
        <View className="gap-4">
          {sections.map(({ inst, q, disks }) => (
            <View key={inst.id} className="gap-2">
              {instances.length > 1 && (
                <Text className="text-zinc-400 text-xs uppercase tracking-wider">
                  {inst.name}
                </Text>
              )}
              {q?.isError && !q.data ? (
                <View className="flex-row items-center gap-2">
                  <Icon icon={ServerCrash} size={16} color="#71717a" />
                  <Text className="text-zinc-500 text-sm">
                    Could not reach {inst.name}
                  </Text>
                </View>
              ) : (
                disks.map((disk) => (
                  <DiskUsageRow
                    key={disk.path}
                    label={disk.label?.trim() || disk.path}
                    percent={
                      disk.totalSpace > 0
                        ? ((disk.totalSpace - disk.freeSpace) / disk.totalSpace) * 100
                        : 0
                    }
                    used={Math.max(disk.totalSpace - disk.freeSpace, 0)}
                    total={disk.totalSpace}
                  />
                ))
              )}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
