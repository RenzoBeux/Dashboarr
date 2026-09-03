import { View, Text } from "react-native";
import { ArrowUp, Film, Layers, Trash2, TriangleAlert, Tv } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import {
  useMaintainerrCollections,
  useMaintainerrHealth,
  useMaintainerrVersion,
} from "@/hooks/use-maintainerr";
import { maintainerrActionLabel, summarizeCollections } from "@/services/maintainerr-api";
import type { MaintainerrCollection } from "@/lib/types";

export default function MaintainerrScreen() {
  return (
    <WorkspaceServiceGuard kinds={["maintainerr"]}>
      <MaintainerrScreenInner />
    </WorkspaceServiceGuard>
  );
}

function MaintainerrScreenInner() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["maintainerr"]]);
  const online = healthData?.find((s) => s.id === "maintainerr")?.online;

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Maintainerr" online={online} serviceId="maintainerr" />
      <CachedDataBanner serviceId="maintainerr" label="Maintainerr" />

      <View className="gap-4">
        <OverviewCard />
        <CollectionsCard />
      </View>
    </ScreenWrapper>
  );
}

function OverviewCard() {
  const { data: version } = useMaintainerrVersion();
  const { data: health } = useMaintainerrHealth();
  const { data: collections } = useMaintainerrCollections();

  const summary = collections ? summarizeCollections(collections) : null;
  const degraded = health?.status === "degraded" || health?.database === "unreachable";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        {version?.version ? (
          <View className="flex-row items-center gap-1">
            {version.updateAvailable ? <Icon icon={ArrowUp} size={14} color="#22c55e" /> : null}
            <Text className="text-zinc-500 text-xs">v{version.version}</Text>
          </View>
        ) : null}
      </CardHeader>

      <View className="gap-4">
        <View className="flex-row flex-wrap gap-x-8 gap-y-2">
          <StatItem
            label="Scheduled"
            sub="media items"
            value={summary ? String(summary.totalScheduled) : "—"}
            className="text-red-400"
          />
          <StatItem
            label="Active"
            sub="collections"
            value={summary ? String(summary.activeCollections) : "—"}
            className="text-zinc-200"
          />
        </View>

        {degraded ? (
          <View className="flex-row items-center gap-2">
            <Icon icon={TriangleAlert} size={14} color="#f59e0b" />
            <Text className="text-amber-400 text-xs">
              {health?.database === "unreachable" ? "Database unreachable" : "Service degraded"}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function CollectionsCard() {
  const { data: collections, isLoading } = useMaintainerrCollections();

  // Active first, then the fullest collections: what's actually being managed
  // and where the most media sits float to the top.
  const sorted = collections
    ? [...collections].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || b.mediaCount - a.mediaCount,
      )
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collections</CardTitle>
        {collections ? <Text className="text-zinc-500 text-xs tabular-nums">{collections.length}</Text> : null}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : !collections ? (
        <EmptyState title="Could not load collections" />
      ) : collections.length === 0 ? (
        <EmptyState title="No collections yet" />
      ) : (
        <View className="gap-3">
          {sorted.map((collection) => (
            <CollectionRow key={collection.id} collection={collection} />
          ))}
        </View>
      )}
    </Card>
  );
}

const TYPE_ICON: Record<string, LucideIcon> = { movie: Film, show: Tv };

function CollectionRow({ collection }: { collection: MaintainerrCollection }) {
  const TypeIcon = TYPE_ICON[collection.type] ?? Layers;
  const retention =
    maintainerrActionLabel(collection.arrAction, collection.deleteAfterDays) ??
    "No automatic action";

  return (
    <View className="flex-row items-start gap-3">
      <Icon icon={TypeIcon} size={18} color="#a1a1aa" />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-zinc-100 text-sm font-medium shrink" numberOfLines={1}>
            {collection.title}
          </Text>
          {!collection.isActive ? <Badge label="Inactive" variant="paused" /> : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          <Icon icon={Trash2} size={12} color="#71717a" />
          <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
            {retention}
          </Text>
        </View>
      </View>
      <View className="items-end">
        <Text className="text-zinc-200 text-sm font-semibold tabular-nums">{collection.mediaCount}</Text>
        <Text className="text-zinc-500 text-[0.7rem]">item{collection.mediaCount === 1 ? "" : "s"}</Text>
      </View>
    </View>
  );
}

function StatItem({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <View>
      <Text className={`text-2xl font-semibold tabular-nums ${className}`}>{value}</Text>
      <Text className="text-zinc-500 text-xs">
        {label}
        {sub ? ` · ${sub}` : ""}
      </Text>
    </View>
  );
}
