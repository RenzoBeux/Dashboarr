import { useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { TrendingDown, TrendingUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { StatItem } from "@/components/indexers/stat-item";
import { Nzbhydra2ApiGate } from "@/components/indexers/nzbhydra2-api-gate";
import { useNzbhydra2Caps, useNzbhydra2Stats } from "@/hooks/use-nzbhydra2";
import { isStatsApiGated } from "@/lib/nzbhydra2-normalize";
import { lightHaptic } from "@/lib/haptics";

const WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

/**
 * NZBHydra2's aggregate stats.
 *
 * The timeframe is a FilterChip row rather than the FilterSortSheet: it is a
 * single-axis data-window control with three short options and no sort axis at
 * all, which is the Cleanuparr screen's 24h/7d/30d shape. The History sub-tab,
 * which genuinely has both axes, uses the sheet.
 */
export function Nzbhydra2Stats() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, error } = useNzbhydra2Stats(days);
  const caps = useNzbhydra2Caps();
  const appVersion = caps.data?.server?.["@attributes"]?.appversion;

  const shares = data?.indexerDownloadShares ?? [];
  const success = data?.successfulDownloadsPerIndexer ?? [];
  const times = data?.avgResponseTimes ?? [];
  const access = data?.indexerApiAccessStats ?? [];
  const isEmpty =
    !!data && !shares.length && !success.length && !times.length && !access.length;

  const totalGrabs = shares.reduce((n, s) => n + (s.total ?? 0), 0);
  const maxShare = Math.max(...shares.map((s) => s.total), 1);

  return (
    <View>
      {/* Third chip row on this screen — horizontally scrollable so it stays
          reachable at UI scale 1.3. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {WINDOWS.map((w) => (
          <FilterChip
            key={w.days}
            label={w.label}
            selected={days === w.days}
            onPress={() => {
              lightHaptic();
              setDays(w.days);
            }}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <SkeletonCardContent rows={4} />
      ) : error ? (
        isStatsApiGated(error) && caps.isSuccess ? (
          <Nzbhydra2ApiGate subject="stats" />
        ) : (
          <ErrorBanner error={error} title="Failed to load stats" />
        )
      ) : isEmpty ? (
        <EmptyState title="No activity in this window" />
      ) : (
        <View className="gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              {appVersion ? (
                <Text className="text-zinc-500 text-xs">v{appVersion}</Text>
              ) : null}
            </CardHeader>
            {/* numberOfEnabledIndexers / numberOfConfiguredIndexers ride along
                with any stats response, whatever flags were requested. */}
            <View className="flex-row flex-wrap gap-x-6 gap-y-2">
              <StatItem
                label="Enabled"
                value={String(data?.numberOfEnabledIndexers ?? 0)}
              />
              <StatItem
                label="Configured"
                value={String(data?.numberOfConfiguredIndexers ?? 0)}
              />
              <StatItem label="Grabs" value={String(totalGrabs)} />
            </View>
          </Card>

          {shares.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Grabs by indexer</CardTitle>
              </CardHeader>
              <View className="gap-3">
                {[...shares]
                  .sort((a, b) => b.total - a.total)
                  .map((s) => (
                    <StatBarRow
                      key={s.indexerName}
                      name={s.indexerName}
                      value={s.total}
                      max={maxShare}
                      right={`${s.total} · ${formatSharePercent(s.share)}`}
                    />
                  ))}
              </View>
            </Card>
          )}

          {success.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Download success</CardTitle>
              </CardHeader>
              <View className="gap-3">
                {success.map((s) => (
                  <View key={s.indexerName}>
                    <Text
                      className="text-zinc-200 text-sm font-medium mb-1"
                      numberOfLines={1}
                    >
                      {s.indexerName}
                    </Text>
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                      <StatItem label="Total" value={String(s.countAll)} />
                      <StatItem label="OK" value={String(s.countSuccessful)} />
                      <StatItem
                        label="Failed"
                        value={String(s.countError)}
                        danger={s.countError > 0}
                      />
                      <StatItem
                        label="Success"
                        value={formatPercent(s.percentSuccessful)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {times.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Response times</CardTitle>
              </CardHeader>
              <View className="gap-2">
                {times.map((t) => (
                  <ResponseTimeRow key={t.indexer} name={t.indexer} ms={t.avgResponseTime} delta={t.delta} />
                ))}
              </View>
            </Card>
          )}

          {access.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>API access</CardTitle>
              </CardHeader>
              <View className="gap-3">
                {access.map((a) => (
                  <View key={a.indexerName}>
                    <Text
                      className="text-zinc-200 text-sm font-medium mb-1"
                      numberOfLines={1}
                    >
                      {a.indexerName}
                    </Text>
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                      <StatItem
                        label="Successful"
                        value={formatPercent(a.percentSuccessful)}
                      />
                      <StatItem
                        label="Conn. errors"
                        value={formatPercent(a.percentConnectionError)}
                        danger={(a.percentConnectionError ?? 0) > 0}
                      />
                      <StatItem
                        label="Calls/day"
                        value={
                          a.averageAccessesPerDay == null
                            ? "—"
                            : a.averageAccessesPerDay.toFixed(1)
                        }
                      />
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </View>
      )}
    </View>
  );
}

// The bar width is RELATIVE (value / max across the list), NOT the API's own
// `share` field: IndexerDownloadShare.share is a float whose unit the source
// doesn't pin down (0–1 vs 0–100), and a relative bar reads correctly either
// way. The raw share is printed as text beside it.
function StatBarRow({
  name,
  value,
  max,
  right,
}: {
  name: string;
  value: number;
  max: number;
  right: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-zinc-300 text-xs flex-1" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-zinc-400 text-xs">{right}</Text>
      </View>
      <View className="h-1.5 rounded-full bg-surface-light overflow-hidden">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
}

function ResponseTimeRow({
  name,
  ms,
  delta,
}: {
  name: string;
  ms: number;
  delta: number;
}) {
  // Upstream's delta is this indexer's response time minus the average across
  // all of them, so positive is SLOWER than the pack.
  const slower = delta > 0;
  const DeltaIcon = slower ? TrendingUp : TrendingDown;
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text className="text-zinc-300 text-xs flex-1" numberOfLines={1}>
        {name}
      </Text>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-zinc-400 text-xs">{Math.round(ms)}ms</Text>
        {delta !== 0 ? (
          <>
            <Icon
              icon={DeltaIcon}
              size={12}
              color={slower ? "#ef4444" : "#22c55e"}
            />
            <Text
              className={`text-xs ${slower ? "text-danger" : "text-success"}`}
            >
              {slower ? "+" : ""}
              {Math.round(delta)}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

// Tolerates both units: a value at or below 1 is a fraction, anything larger is
// already a percentage.
function formatSharePercent(share: number): string {
  const pct = share <= 1 ? share * 100 : share;
  return `${pct.toFixed(1)}%`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value)}%`;
}
