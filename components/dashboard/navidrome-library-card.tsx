import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { StatItem } from "@/components/ui/stat-item";
import { getOverview } from "@/services/navidrome-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import {
  NAVIDROME_LIBRARY_DEFAULT_SETTINGS,
  type NavidromeLibrarySettingsValue,
} from "@/components/dashboard/widget-settings/navidrome-library-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import { POLLING_INTERVALS } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Library size at a glance, summed across the bound Navidrome instances.
//
// Total size and the missing-file count come from the admin-only /api/library
// route, so a non-admin account reports them as null rather than 0 — the card
// omits those tiles instead of claiming an empty library. Track/artist/album
// counts work for everyone (Subsonic getScanStatus + getArtists).
export function NavidromeLibraryCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<NavidromeLibrarySettingsValue>(
    slotId,
    NAVIDROME_LIBRARY_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("navidrome", settings.instanceIds);
  const router = useRouter();

  // Same ["navidrome", id, "overview"] key useNavidromeOverview uses, so the
  // widget and the Navidrome tab share one fetch.
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["navidrome", inst.id, "overview"] as const,
      queryFn: () => getOverview(inst.id),
      refetchInterval: POLLING_INTERVALS.serviceHealth,
    })),
  });

  const { isInitialLoading } = aggregateMultiInstanceState(queries);

  // `null` means "this account can't see it", which has to survive the sum: one
  // admin instance plus one non-admin instance still reports a partial total,
  // so the number is only shown when at least one instance could report it.
  const totals = queries.reduce(
    (acc, q) => {
      const summary = q.data?.summary;
      if (!summary) return acc;
      acc.artists += summary.artists ?? 0;
      acc.albums += summary.albums ?? 0;
      acc.songs += summary.songs ?? 0;
      if (summary.sizeBytes !== null) acc.sizeBytes = (acc.sizeBytes ?? 0) + summary.sizeBytes;
      if (summary.missing !== null) acc.missing = (acc.missing ?? 0) + summary.missing;
      if (summary.scanning) acc.scanning = true;
      return acc;
    },
    {
      artists: 0,
      albums: 0,
      songs: 0,
      sizeBytes: null as number | null,
      missing: null as number | null,
      scanning: false,
    },
  );

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || totals.songs === 0,
    isLoading: isInitialLoading,
  });

  const showMissing = settings.showMissing && totals.missing !== null && totals.missing > 0;

  return (
    <Card onPress={() => router.push("/(tabs)/navidrome")}>
      <CardHeader>
        <CardTitle>Navidrome</CardTitle>
        {totals.scanning ? (
          <Badge label="Scanning" variant="warning" />
        ) : showMissing ? (
          <Badge label={`${totals.missing} missing`} variant="error" />
        ) : null}
      </CardHeader>

      {instances.length === 0 ? (
        <EmptyState compact title="No Navidrome instances enabled" />
      ) : isInitialLoading ? (
        <SkeletonCardContent rows={1} />
      ) : (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <StatItem label="Artists" value={totals.artists.toLocaleString()} />
          <StatItem label="Albums" value={totals.albums.toLocaleString()} />
          <StatItem label="Tracks" value={totals.songs.toLocaleString()} />
          {totals.sizeBytes !== null && (
            <StatItem label="Size" value={formatBytes(totals.sizeBytes)} />
          )}
          {showMissing && (
            <StatItem label="Missing" value={String(totals.missing)} danger />
          )}
        </View>
      )}
    </Card>
  );
}
