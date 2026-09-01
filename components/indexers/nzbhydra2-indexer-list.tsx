import { View, Text } from "react-native";
import { AlertTriangle, Crown, Search } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { Nzbhydra2ApiGate } from "@/components/indexers/nzbhydra2-api-gate";
import {
  useNzbhydra2Caps,
  useNzbhydra2IndexerStatuses,
} from "@/hooks/use-nzbhydra2";
import {
  formatHydraCountdown,
  hydraStateMeta,
  hydraVipInfo,
  isStatsApiGated,
} from "@/lib/nzbhydra2-normalize";
import type { Nzbhydra2IndexerStatus, Nzbhydra2Timestamp } from "@/lib/types";

// NZBHydra2's indexer list. Read-only on purpose: enable/disable and the
// per-indexer connection test are /internalapi routes, which need a session
// cookie rather than the API key, so there is no power toggle like Prowlarr's
// and no Test button like Jackett's. In exchange the API key sees more than
// either sibling exposes — the disable REASON, the backoff level, live
// API/grab counters against each tracker's own limits, and VIP expiry.
export function Nzbhydra2IndexerList({
  onSearch,
}: {
  onSearch?: (indexer: { id: string; name: string }) => void;
}) {
  const { data, isLoading, error } = useNzbhydra2IndexerStatuses();
  const caps = useNzbhydra2Caps();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (error) {
    // A caps query that succeeded proves the key is good, so a failure here is
    // the allowApiStats gate rather than bad credentials.
    return isStatsApiGated(error) && caps.isSuccess ? (
      <Nzbhydra2ApiGate subject="indexer status" />
    ) : (
      <ErrorBanner error={error} title="Failed to load indexers" />
    );
  }
  if (!data?.length) {
    return (
      <EmptyState
        title="No indexers configured"
        message="Add indexers in NZBHydra2's web UI — they'll show up here."
      />
    );
  }

  return (
    <View className="gap-2">
      {/* `indexer` (the display name) is the identity — this endpoint exposes
          no id, which is also why the search scope below passes the name. */}
      {data.map((indexer) => (
        <IndexerCard
          key={indexer.indexer}
          indexer={indexer}
          onSearch={onSearch}
        />
      ))}
    </View>
  );
}

function IndexerCard({
  indexer,
  onSearch,
}: {
  indexer: Nzbhydra2IndexerStatus;
  onSearch?: (indexer: { id: string; name: string }) => void;
}) {
  const meta = hydraStateMeta(indexer.state);
  const vip = hydraVipInfo(indexer.vipExpirationDate);
  const retry = formatHydraCountdown(indexer.disabledUntil);

  return (
    <Card>
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-row items-center gap-3 flex-1">
          {/* A plain dot rather than StatusDot: its only neutral state
              ("checking") pulses, which would read as activity on an indexer
              the user disabled on purpose. The colour comes from
              hydraStateMeta so this and the dashboard widget can't drift. */}
          <View className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
          <View className="flex-1">
            <Text
              className="text-zinc-200 text-sm font-medium"
              numberOfLines={1}
            >
              {indexer.indexer}
            </Text>
            {indexer.level > 0 ? (
              <Text className="text-zinc-500 text-xs">
                Backoff level {indexer.level}
              </Text>
            ) : null}
          </View>
        </View>
        <Badge label={meta.label} variant={meta.badgeVariant} />
      </View>

      {retry ? (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Icon icon={AlertTriangle} size={12} color="#f59e0b" />
          <Text className="text-amber-400 text-xs">Retrying {retry}</Text>
        </View>
      ) : null}

      {indexer.lastError ? (
        <Text className="text-danger text-xs mt-2 leading-4" numberOfLines={3}>
          {indexer.lastError}
        </Text>
      ) : null}

      <View className="gap-2 mt-3">
        <HitMeter
          label="API hits"
          hits={indexer.apiHits}
          limit={indexer.apiHitLimit}
          resetAt={indexer.apiResetTime}
        />
        <HitMeter
          label="Grabs"
          hits={indexer.downloadHits}
          limit={indexer.downloadHitLimit}
          resetAt={indexer.downloadResetTime}
        />
      </View>

      {vip ? (
        <View className="flex-row items-center gap-1.5 mt-3">
          <Icon icon={Crown} size={12} color={vip.expiring ? "#f59e0b" : "#71717a"} />
          <Text
            className={`text-xs ${vip.expiring ? "text-amber-400" : "text-zinc-500"}`}
          >
            {vip.label}
          </Text>
        </View>
      ) : null}

      {onSearch ? (
        <View className="mt-3">
          <Button
            label="Search"
            variant="outline"
            size="sm"
            onPress={() =>
              onSearch({ id: indexer.indexer, name: indexer.indexer })
            }
            icon={<Icon icon={Search} size={14} color="#a1a1aa" />}
          />
        </View>
      ) : null}
    </Card>
  );
}

// Renders nothing when the tracker publishes no limit — most public indexers
// report a null hitLimit, and an empty bar would imply a cap that isn't there.
function HitMeter({
  label,
  hits,
  limit,
  resetAt,
}: {
  label: string;
  hits: number | null;
  limit: number | null;
  resetAt: Nzbhydra2Timestamp;
}) {
  if (limit == null || limit <= 0) return null;
  const used = hits ?? 0;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const reset = formatHydraCountdown(resetAt);

  return (
    <View>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-zinc-500 text-xs">{label}</Text>
        <Text className="text-zinc-400 text-xs">
          {used}/{limit}
          {reset ? ` · resets ${reset}` : ""}
        </Text>
      </View>
      {/* h-1.5 is rem-based so the bar thickens with the UI scale; the fill is
          a percentage string, never a pixel number. */}
      <View className="h-1.5 rounded-full bg-surface-light mt-1 overflow-hidden">
        <View
          className={`h-full rounded-full ${
            pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
}
