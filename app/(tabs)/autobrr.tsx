import { useState } from "react";
import { View, Text, Pressable, ScrollView, Linking } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter as FilterIcon,
  Radio,
  RotateCw,
  Zap,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { TextInput } from "@/components/ui/text-input";
import { Toggle } from "@/components/ui/toggle";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionSheet } from "@/components/ui/action-sheet";
import { toast, toastError } from "@/components/ui/toast";
import {
  useAutobrrFilters,
  useAutobrrIrc,
  useAutobrrReleases,
  useAutobrrStats,
  useRestartAutobrrIrc,
  useRetryAutobrrPush,
  useToggleAutobrrFilter,
} from "@/hooks/use-autobrr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { lightHaptic } from "@/lib/haptics";
import { formatBytes, formatTimeAgo } from "@/lib/utils";
import type {
  AutobrrActionStatus,
  AutobrrIrcNetwork,
  AutobrrPushStatus,
  AutobrrRelease,
} from "@/lib/types";

// The push-status chips drive autobrr's server-side `push_status` filter;
// "all" omits the param entirely (an empty value would 400).
const STATUS_CHIPS: { label: string; value: AutobrrPushStatus | null }[] = [
  { label: "All", value: null },
  { label: "Approved", value: "PUSH_APPROVED" },
  { label: "Rejected", value: "PUSH_REJECTED" },
  { label: "Error", value: "PUSH_ERROR" },
];

// A release carries one action_status per filter action that fired. The row's
// badge summarizes the LATEST attempt; older entries stay reachable through
// the row's action sheet (each rejected/errored one gets its own retry entry).
function latestActionStatus(release: AutobrrRelease): AutobrrActionStatus | null {
  if (release.action_status.length === 0) return null;
  return [...release.action_status].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )[0];
}

function statusBadge(status: string | null): { label: string; variant: "success" | "error" | "default" | "paused" } {
  switch (status) {
    case "PUSH_APPROVED":
      return { label: "Approved", variant: "success" };
    case "PUSH_ERROR":
      return { label: "Error", variant: "error" };
    case "PUSH_REJECTED":
      return { label: "Rejected", variant: "default" };
    case "PENDING":
      return { label: "Pending", variant: "paused" };
    default:
      // Matched a filter but ran no action (informational entry).
      return { label: "Filtered", variant: "default" };
  }
}

function isRetryable(status: string): boolean {
  return status === "PUSH_ERROR" || status === "PUSH_REJECTED";
}

export default function AutobrrScreen() {
  return (
    <WorkspaceServiceGuard kinds={["autobrr"]}>
      <AutobrrScreenInner />
    </WorkspaceServiceGuard>
  );
}

function AutobrrScreenInner() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["autobrr"]]);
  const autobrrHealth = healthData?.find((s) => s.id === "autobrr");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Autobrr" online={autobrrHealth?.online} serviceId="autobrr" />
      <CachedDataBanner serviceId="autobrr" label="Autobrr" />
      <View className="gap-4">
        <StatsCard />
        <ReleasesCard />
        <FiltersCard />
        <IrcCard />
      </View>
    </ScreenWrapper>
  );
}

function StatsCard() {
  const { data: stats, isLoading } = useAutobrrStats();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      {isLoading ? (
        <SkeletonCardContent rows={1} />
      ) : !stats ? (
        <EmptyState title="No data" />
      ) : (
        <View className="flex-row flex-wrap gap-x-6 gap-y-1">
          <StatItem label="Approved" value={stats.push_approved_count} className="text-success" />
          <StatItem label="Rejected" value={stats.push_rejected_count} className="text-zinc-300" />
          <StatItem
            label="Errors"
            value={stats.push_error_count}
            className={stats.push_error_count > 0 ? "text-red-400" : "text-zinc-300"}
          />
          <StatItem label="Total" value={stats.total_count} className="text-zinc-300" />
        </View>
      )}
    </Card>
  );
}

function StatItem({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-base font-bold ${className}`}>{value}</Text>
    </View>
  );
}

function ReleasesCard() {
  const [searchInput, setSearchInput] = useState("");
  const [pushStatus, setPushStatus] = useState<AutobrrPushStatus | null>(null);
  const q = useDebouncedValue(searchInput.trim(), 400);
  const { data, isLoading } = useAutobrrReleases({ q: q || undefined, pushStatus: pushStatus ?? undefined });
  const [sheetRelease, setSheetRelease] = useState<AutobrrRelease | null>(null);

  const retry = useRetryAutobrrPush();
  const releases = data?.data ?? [];

  const retryPush = (release: AutobrrRelease, action: AutobrrActionStatus) => {
    retry.mutate(
      { releaseId: release.id, actionStatusId: action.id },
      {
        onSuccess: () => toast(`Retrying push to ${action.client || action.action}`),
        onError: (err) => toastError("Couldn't retry push", err),
      },
    );
  };

  const sheetActions = sheetRelease
    ? [
        ...sheetRelease.action_status.filter((a) => isRetryable(a.status)).map((a) => ({
          label: `Retry ${a.action}${a.client ? ` (${a.client})` : ""}`,
          icon: <Icon icon={RotateCw} size={18} color="#3b82f6" />,
          onPress: () => retryPush(sheetRelease, a),
        })),
        ...(sheetRelease.info_url
          ? [
              {
                label: "Open info page",
                icon: <Icon icon={ExternalLink} size={18} color="#3b82f6" />,
                onPress: () => {
                  Linking.openURL(sheetRelease.info_url).catch(() => {});
                },
              },
            ]
          : []),
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Releases</CardTitle>
      </CardHeader>

      <TextInput
        placeholder="Search releases…"
        value={searchInput}
        onChangeText={setSearchInput}
        autoCapitalize="none"
        autoCorrect={false}
        containerClassName="mb-3"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {STATUS_CHIPS.map((chip) => (
          <FilterChip
            key={chip.label}
            label={chip.label}
            selected={pushStatus === chip.value}
            onPress={() => {
              lightHaptic();
              setPushStatus(chip.value);
            }}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <SkeletonCardContent rows={4} />
      ) : releases.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Zap} size={32} color="#71717a" />}
          title={q || pushStatus ? "No matching releases" : "No releases yet"}
        />
      ) : (
        <View className="gap-3">
          {releases.map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              onPress={() => setSheetRelease(release)}
            />
          ))}
        </View>
      )}

      <ActionSheet
        visible={sheetRelease !== null}
        onClose={() => setSheetRelease(null)}
        title={sheetRelease?.name}
        subtitle={sheetRelease ? sheetRelease.indexer.name || sheetRelease.indexer.identifier : undefined}
        actions={sheetActions}
      />
    </Card>
  );
}

function ReleaseRow({ release, onPress }: { release: AutobrrRelease; onPress: () => void }) {
  const latest = latestActionStatus(release);
  const badge = statusBadge(latest?.status ?? null);
  // Only open the sheet when it has something to offer (a retry or a link).
  const hasSheetContent =
    release.action_status.some((a) => isRetryable(a.status)) || !!release.info_url;

  return (
    <Pressable
      onPress={
        hasSheetContent
          ? () => {
              lightHaptic();
              onPress();
            }
          : undefined
      }
      className={hasSheetContent ? "active:opacity-70" : undefined}
    >
      <View className="flex-row items-center gap-2 mb-0.5">
        <Text className="text-zinc-200 text-sm font-medium flex-1" numberOfLines={1}>
          {release.name}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>
      <View className="flex-row items-center gap-2 flex-wrap">
        <Text className="text-zinc-500 text-xs" numberOfLines={1}>
          {release.indexer.name || release.indexer.identifier}
        </Text>
        {release.filter ? (
          <Text className="text-zinc-600 text-xs" numberOfLines={1}>
            {release.filter}
          </Text>
        ) : null}
        {release.size > 0 && (
          <Text className="text-zinc-600 text-xs">{formatBytes(release.size)}</Text>
        )}
        <Text className="text-zinc-600 text-xs">{formatTimeAgo(release.timestamp)}</Text>
      </View>
    </Pressable>
  );
}

function FiltersCard() {
  const { data: filters, isLoading } = useAutobrrFilters();
  const [expanded, setExpanded] = useState(false);
  const toggle = useToggleAutobrrFilter();

  const enabledCount = filters?.filter((f) => f.enabled).length ?? 0;
  // Show the target value on the pending row so the switch doesn't snap back
  // while the slice invalidation refetches the list.
  const pending = toggle.isPending ? toggle.variables : null;

  return (
    <Card>
      <Pressable
        onPress={() => {
          lightHaptic();
          setExpanded(!expanded);
        }}
        className="flex-row items-center justify-between active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={FilterIcon} size={18} color="#a1a1aa" />
          <CardTitle>Filters</CardTitle>
        </View>
        <View className="flex-row items-center gap-2">
          {filters && (
            <Text className="text-zinc-500 text-xs">
              {enabledCount}/{filters.length} enabled
            </Text>
          )}
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={18} color="#71717a" />
        </View>
      </Pressable>

      {isLoading ? (
        <View className="mt-4">
          <SkeletonCardContent rows={2} />
        </View>
      ) : expanded ? (
        <Animated.View entering={FadeIn.duration(150)} className="mt-2">
          {!filters || filters.length === 0 ? (
            <EmptyState title="No filters" />
          ) : (
            filters.map((f) => (
              <Toggle
                key={f.id}
                label={f.name}
                value={pending?.filterId === f.id ? pending.enabled : f.enabled}
                disabled={toggle.isPending}
                onValueChange={(enabled) => {
                  toggle.mutate(
                    { filterId: f.id, enabled },
                    {
                      onError: (err) => toastError(`Couldn't update ${f.name}`, err),
                    },
                  );
                }}
              />
            ))
          )}
        </Animated.View>
      ) : null}
    </Card>
  );
}

function ircDotClass(network: AutobrrIrcNetwork): string {
  if (!network.enabled) return "bg-zinc-600";
  return network.healthy ? "bg-success" : "bg-red-500";
}

function IrcCard() {
  const { data: networks, isLoading } = useAutobrrIrc();
  const [expanded, setExpanded] = useState(false);
  // Target and visibility are separate so the modal's message doesn't flash to
  // the fallback while it fades out after confirm/cancel.
  const [confirmTarget, setConfirmTarget] = useState<AutobrrIrcNetwork | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const restart = useRestartAutobrrIrc();

  const enabledNetworks = networks?.filter((n) => n.enabled) ?? [];
  const healthyCount = enabledNetworks.filter((n) => n.healthy).length;

  const confirmRestart = () => {
    const target = confirmTarget;
    setConfirmVisible(false);
    if (!target) return;
    restart.mutate(target.id, {
      onSuccess: () => toast(`${target.name} restarting`),
      onError: (err) => toastError(`Couldn't restart ${target.name}`, err),
    });
  };

  return (
    <Card>
      <Pressable
        onPress={() => {
          lightHaptic();
          setExpanded(!expanded);
        }}
        className="flex-row items-center justify-between active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={Radio} size={18} color="#a1a1aa" />
          <CardTitle>IRC</CardTitle>
        </View>
        <View className="flex-row items-center gap-2">
          {networks && enabledNetworks.length > 0 && (
            <Text
              className={`text-xs ${
                healthyCount < enabledNetworks.length ? "text-red-400" : "text-zinc-500"
              }`}
            >
              {healthyCount}/{enabledNetworks.length} healthy
            </Text>
          )}
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={18} color="#71717a" />
        </View>
      </Pressable>

      {isLoading ? (
        <View className="mt-4">
          <SkeletonCardContent rows={2} />
        </View>
      ) : expanded ? (
        <Animated.View entering={FadeIn.duration(150)} className="gap-3 mt-4">
          {!networks || networks.length === 0 ? (
            <EmptyState title="No IRC networks" />
          ) : (
            networks.map((network) => (
              <IrcRow
                key={network.id}
                network={network}
                busy={restart.isPending && restart.variables === network.id}
                onRestart={() => {
                  setConfirmTarget(network);
                  setConfirmVisible(true);
                }}
              />
            ))
          )}
        </Animated.View>
      ) : null}

      <ConfirmModal
        visible={confirmVisible}
        title="Restart network"
        message={`Restart ${confirmTarget?.name ?? "this network"}? Autobrr will briefly disconnect from its channels and miss announces until it rejoins.`}
        icon={RotateCw}
        confirmLabel="Restart"
        onConfirm={confirmRestart}
        onCancel={() => setConfirmVisible(false)}
      />
    </Card>
  );
}

function IrcRow({
  network,
  busy,
  onRestart,
}: {
  network: AutobrrIrcNetwork;
  busy: boolean;
  onRestart: () => void;
}) {
  const monitoredCount = network.channels.filter((c) => c.monitoring).length;

  return (
    <View className="flex-row items-center gap-3">
      <View className={`w-2 h-2 rounded-full ${ircDotClass(network)}`} />
      <View className="flex-1 mr-2">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {network.name}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-zinc-600 text-xs" numberOfLines={1}>
            {network.server}
          </Text>
          <Text className="text-zinc-500 text-xs">
            {monitoredCount}/{network.channels.length}{" "}
            {network.channels.length === 1 ? "channel" : "channels"}
          </Text>
          {!network.enabled && <Text className="text-zinc-500 text-xs">disabled</Text>}
        </View>
        {network.connection_errors.length > 0 && (
          <Text className="text-red-400 text-xs mt-0.5" numberOfLines={2}>
            {network.connection_errors[network.connection_errors.length - 1]}
          </Text>
        )}
      </View>
      {network.enabled && (
        <Pressable
          onPress={() => {
            lightHaptic();
            onRestart();
          }}
          disabled={busy}
          className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
          hitSlop={6}
        >
          <Icon icon={RotateCw} size={16} color="#3b82f6" />
        </Pressable>
      )}
    </View>
  );
}
