import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import {
  Activity,
  HeartPulse,
  ListChecks,
  Play,
  Timer,
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
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { toast, toastError } from "@/components/ui/toast";
import {
  useCleanuparrEvents,
  useCleanuparrJobs,
  useCleanuparrStats,
  useTriggerCleanuparrJob,
} from "@/hooks/use-cleanuparr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { humanizeEnumName } from "@/services/cleanuparr-api";
import { lightHaptic } from "@/lib/haptics";
import { formatEta, formatTimeAgo } from "@/lib/utils";
import type {
  CleanuparrClientHealth,
  CleanuparrEvent,
  CleanuparrJob,
  CleanuparrJobType,
} from "@/lib/types";

const TIMEFRAMES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
] as const;

// Skip "Test" — it only appears when the user fires Cleanuparr's own
// notification test and would be an always-empty chip for most installs.
const SEVERITY_CHIPS = [
  { label: "All", value: null },
  { label: "Info", value: "Information" },
  { label: "Warning", value: "Warning" },
  { label: "Important", value: "Important" },
  { label: "Error", value: "Error" },
] as const;

function severityBadge(severity: string): { label: string; variant: "info" | "warning" | "wanted" | "error" | "default" } {
  switch (severity) {
    case "Information":
      return { label: "Info", variant: "info" };
    case "Warning":
      return { label: "Warning", variant: "warning" };
    case "Important":
      return { label: "Important", variant: "wanted" };
    case "Error":
      return { label: "Error", variant: "error" };
    default:
      return { label: severity, variant: "default" };
  }
}

export default function CleanuparrScreen() {
  return (
    <WorkspaceServiceGuard kinds={["cleanuparr"]}>
      <CleanuparrScreenInner />
    </WorkspaceServiceGuard>
  );
}

function CleanuparrScreenInner() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["cleanuparr"]]);
  const cleanuparrHealth = healthData?.find((s) => s.id === "cleanuparr");
  const [hours, setHours] = useState<number>(168);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Cleanuparr" online={cleanuparrHealth?.online} serviceId="cleanuparr" />
      <CachedDataBanner serviceId="cleanuparr" label="Cleanuparr" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {TIMEFRAMES.map((tf) => (
          <FilterChip
            key={tf.hours}
            label={tf.label}
            selected={hours === tf.hours}
            onPress={() => {
              lightHaptic();
              setHours(tf.hours);
            }}
          />
        ))}
      </ScrollView>

      <View className="gap-4">
        <OverviewCard hours={hours} />
        <JobsCard />
        <ClientsCard hours={hours} />
        <EventsCard />
      </View>
    </ScreenWrapper>
  );
}

function OverviewCard({ hours }: { hours: number }) {
  const { data: stats, isLoading } = useCleanuparrStats(hours);

  const isEmpty =
    !!stats &&
    stats.strikes.total === 0 &&
    stats.removals.total === 0 &&
    stats.cleaned.total === 0 &&
    stats.searches.total === 0;

  // Zero-activity keys are omitted upstream, so iterating renders only the
  // reasons that actually happened.
  const breakdown = stats
    ? [
        ...Object.entries(stats.removals.byReason).map(([k, v]) => ({
          key: `removal-${k}`,
          label: `Removed: ${humanizeEnumName(k).toLowerCase()}`,
          count: v,
        })),
        ...Object.entries(stats.strikes.byType).map(([k, v]) => ({
          key: `strike-${k}`,
          label: `Strikes: ${humanizeEnumName(k).toLowerCase()}`,
          count: v,
        })),
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        <View className="flex-row items-center gap-1">
          <Icon icon={Activity} size={14} color="#71717a" />
          <Text className="text-zinc-500 text-xs">last {hours >= 168 ? `${hours / 24}d` : `${hours}h`}</Text>
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !stats ? (
        <EmptyState title="No data" />
      ) : isEmpty ? (
        <EmptyState title="No activity in this window" />
      ) : (
        <View className="gap-4">
          <View className="flex-row flex-wrap gap-x-6 gap-y-2">
            <StatItem
              label="Strikes"
              value={String(stats.strikes.total)}
              sub={stats.strikes.recovered > 0 ? `${stats.strikes.recovered} recovered` : undefined}
              className="text-amber-400"
            />
            <StatItem label="Removed" value={String(stats.removals.total)} className="text-red-400" />
            <StatItem label="Cleaned" value={String(stats.cleaned.total)} className="text-success" />
            <StatItem
              label="Searches"
              value={String(stats.searches.total)}
              sub={stats.searches.grabbed > 0 ? `${stats.searches.grabbed} grabbed` : undefined}
              className="text-zinc-300"
            />
          </View>

          {breakdown.length > 0 && (
            <View className="gap-1">
              {breakdown.map((row) => (
                <View key={row.key} className="flex-row items-center justify-between">
                  <Text className="text-zinc-500 text-xs">{row.label}</Text>
                  <Text className="text-zinc-400 text-xs font-medium">{row.count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function StatItem({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className: string;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text className={`text-base font-bold ${className}`}>{value}</Text>
      {sub ? <Text className="text-zinc-600 text-xs">{sub}</Text> : null}
    </View>
  );
}

function JobsCard() {
  const { data: jobs, isLoading } = useCleanuparrJobs();
  // Target and visibility are separate so the modal's message doesn't flash to
  // the fallback while it fades out after confirm/cancel.
  const [confirmTarget, setConfirmTarget] = useState<CleanuparrJob | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const trigger = useTriggerCleanuparrJob();

  const confirmTrigger = () => {
    const target = confirmTarget;
    setConfirmVisible(false);
    if (!target) return;
    trigger.mutate(target.jobType as CleanuparrJobType, {
      onSuccess: () => toast(`${target.name} triggered`),
      onError: (err) => toastError(`Couldn't trigger ${target.name}`, err),
    });
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Timer} size={18} color="#a1a1aa" />
          <CardTitle>Jobs</CardTitle>
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : !jobs || jobs.length === 0 ? (
        <EmptyState title="No scheduled jobs" />
      ) : (
        <View className="gap-3">
          {jobs.map((job) => (
            <JobRow
              key={job.jobType}
              job={job}
              busy={trigger.isPending && trigger.variables === job.jobType}
              onTrigger={() => {
                setConfirmTarget(job);
                setConfirmVisible(true);
              }}
            />
          ))}
        </View>
      )}

      <ConfirmModal
        visible={confirmVisible}
        title="Run job now"
        message={`Run ${confirmTarget?.name ?? "this job"} now, outside its schedule?`}
        icon={Play}
        confirmLabel="Run"
        onConfirm={confirmTrigger}
        onCancel={() => setConfirmVisible(false)}
      />
    </Card>
  );
}

function JobRow({
  job,
  busy,
  onTrigger,
}: {
  job: CleanuparrJob;
  busy: boolean;
  onTrigger: () => void;
}) {
  const nextMs = job.nextRunTime ? new Date(job.nextRunTime).getTime() - Date.now() : null;
  // Seeker refuses manual triggers upstream (400), so it gets no button.
  const triggerable = job.jobType !== "Seeker";

  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 mr-2">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {job.name || humanizeEnumName(job.jobType)}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          {nextMs !== null && nextMs > 0 && (
            <Text className="text-zinc-500 text-xs">Next in {formatEta(Math.round(nextMs / 1000))}</Text>
          )}
          {job.previousRunTime ? (
            <Text className="text-zinc-600 text-xs">Last {formatTimeAgo(job.previousRunTime)}</Text>
          ) : null}
        </View>
      </View>
      {triggerable && (
        <Pressable
          onPress={() => {
            lightHaptic();
            onTrigger();
          }}
          disabled={busy}
          className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
          hitSlop={6}
        >
          <Icon icon={Play} size={16} color="#3b82f6" />
        </Pressable>
      )}
    </View>
  );
}

function ClientsCard({ hours }: { hours: number }) {
  const { data: stats, isLoading } = useCleanuparrStats(hours);
  const clients = stats ? [...stats.health.downloadClients, ...stats.health.arrInstances] : [];
  const healthyCount = clients.filter((c) => c.isHealthy).length;

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={HeartPulse} size={18} color="#a1a1aa" />
          <CardTitle>Connected</CardTitle>
        </View>
        {clients.length > 0 && (
          <Text
            className={`text-xs ${healthyCount < clients.length ? "text-red-400" : "text-zinc-500"}`}
          >
            {healthyCount}/{clients.length} healthy
          </Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : clients.length === 0 ? (
        <EmptyState title="No clients configured" />
      ) : (
        <View className="gap-3">
          {clients.map((client) => (
            <ClientRow key={client.id} client={client} />
          ))}
        </View>
      )}
    </Card>
  );
}

function ClientRow({ client }: { client: CleanuparrClientHealth }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className={`w-2 h-2 rounded-full ${client.isHealthy ? "bg-success" : "bg-red-500"}`} />
      <View className="flex-1 mr-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-zinc-200 text-sm font-medium shrink" numberOfLines={1}>
            {client.name}
          </Text>
          <Text className="text-zinc-600 text-xs">{client.type}</Text>
        </View>
        {client.errorMessage ? (
          <Text className="text-red-400 text-xs" numberOfLines={2}>
            {client.errorMessage}
          </Text>
        ) : typeof client.responseTimeMs === "number" ? (
          <Text className="text-zinc-600 text-xs">{Math.round(client.responseTimeMs)}ms</Text>
        ) : null}
      </View>
    </View>
  );
}

function EventsCard() {
  const [severity, setSeverity] = useState<string | null>(null);
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useCleanuparrEvents(severity ?? undefined);

  const events = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={ListChecks} size={18} color="#a1a1aa" />
          <CardTitle>Events</CardTitle>
        </View>
      </CardHeader>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {SEVERITY_CHIPS.map((chip) => (
          <FilterChip
            key={chip.label}
            label={chip.label}
            selected={severity === chip.value}
            onPress={() => {
              lightHaptic();
              setSeverity(chip.value);
            }}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <SkeletonCardContent rows={4} />
      ) : events.length === 0 ? (
        <EmptyState title={severity ? "No matching events" : "No events yet"} />
      ) : (
        <View className="gap-3">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}

          {hasNextPage && (
            <Pressable
              onPress={() => {
                lightHaptic();
                fetchNextPage();
              }}
              disabled={isFetchingNextPage}
              className="items-center py-2 active:opacity-70"
            >
              {isFetchingNextPage ? (
                <Spinner size={18} />
              ) : (
                <Text className="text-primary text-sm font-medium">Load more</Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

function EventRow({ event }: { event: CleanuparrEvent }) {
  const badge = severityBadge(event.severity);

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-0.5">
        <Text className="text-zinc-200 text-sm flex-1" numberOfLines={2}>
          {event.message}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>
      <View className="flex-row items-center gap-2 flex-wrap">
        {event.itemTitle ? (
          <Text className="text-zinc-500 text-xs shrink" numberOfLines={1}>
            {event.itemTitle}
          </Text>
        ) : null}
        <Text className="text-zinc-600 text-xs">{formatTimeAgo(event.timestamp)}</Text>
        {event.isDryRun && (
          <View className="bg-surface-light rounded-full px-2 py-0.5">
            <Text className="text-zinc-400 text-xs">Dry run</Text>
          </View>
        )}
      </View>
    </View>
  );
}
