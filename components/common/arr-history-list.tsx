import { useCallback, useMemo } from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { AlertTriangle, History } from "lucide-react-native";
import type { UseQueryResult } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getQualityColor } from "@/lib/quality-colors";
import { getHttpErrorMessage } from "@/lib/http-client";
import { formatBytes, formatTimeAgo } from "@/lib/utils";
import { lightHaptic } from "@/lib/haptics";
import {
  historyEventMeta,
  HISTORY_TONE_COLOR,
  type ArrHistoryEntry,
} from "@/lib/arr-history";

interface ArrHistoryListProps<T> {
  query: UseQueryResult<T[], Error>;
  normalize: (record: T) => ArrHistoryEntry;
}

function HistoryRow({ entry }: { entry: ArrHistoryEntry }) {
  const meta = historyEventMeta(entry.eventType);
  const toneColor = HISTORY_TONE_COLOR[meta.tone];
  const quality = entry.qualityName ? getQualityColor(entry.qualityName) : null;
  const timeAgo = formatTimeAgo(entry.date);

  const metaParts: string[] = [];
  if (entry.indexer) metaParts.push(entry.indexer);
  if (entry.sizeBytes) metaParts.push(formatBytes(entry.sizeBytes));
  if (entry.downloadClient) metaParts.push(entry.downloadClient);

  return (
    <View className="mx-4 mb-2 rounded-2xl bg-surface border border-border overflow-hidden">
      <View className="flex-row">
        <View className="w-1" style={{ backgroundColor: toneColor }} />
        <View className="flex-1 p-3">
          <View className="flex-row items-center justify-between gap-2 mb-1.5">
            <View className="flex-row items-center gap-1.5">
              <Icon icon={meta.icon} size={14} color={toneColor} />
              <Text
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: toneColor }}
              >
                {meta.label}
              </Text>
            </View>
            {timeAgo ? (
              <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                {timeAgo}
              </Text>
            ) : null}
          </View>

          <Text
            className="text-zinc-100 text-sm font-medium leading-5"
            numberOfLines={2}
          >
            {entry.title}
          </Text>

          {quality || entry.releaseGroup ? (
            <View className="flex-row items-center flex-wrap gap-1.5 mt-2">
              {quality ? (
                <View
                  className="rounded-md px-1.5 py-0.5"
                  style={{ backgroundColor: quality.bg }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: quality.text }}
                  >
                    {entry.qualityName}
                  </Text>
                </View>
              ) : null}
              {entry.releaseGroup ? (
                <Text className="text-xs text-zinc-500" numberOfLines={1}>
                  {entry.releaseGroup}
                </Text>
              ) : null}
            </View>
          ) : null}

          {metaParts.length > 0 ? (
            <Text className="text-zinc-400 text-xs mt-1.5" numberOfLines={1}>
              {metaParts.join("   ·   ")}
            </Text>
          ) : null}

          {entry.reason ? (
            <Text className="text-red-400 text-xs mt-1.5 leading-4" numberOfLines={2}>
              {entry.reason}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// Shared history list for both the movie and episode History screens. Radarr
// and Sonarr records flow through the same `normalize` shape, so this component
// stays service-agnostic. Records arrive pre-sorted date-descending from the API.
export function ArrHistoryList<T>({ query, normalize }: ArrHistoryListProps<T>) {
  const { data, isLoading, isError, error, isFetching, refetch } = query;

  const entries = useMemo(
    () => (data ?? []).map(normalize),
    [data, normalize],
  );

  const handleRefresh = useCallback(() => {
    if (isFetching) return;
    lightHaptic();
    refetch();
  }, [isFetching, refetch]);

  if (isLoading && !data) {
    return (
      <View className="flex-1 gap-2 px-4 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={92} borderRadius={16} />
        ))}
      </View>
    );
  }

  if (isError && !data) {
    return (
      <EmptyState
        icon={<Icon icon={AlertTriangle} size={28} color="#ef4444" />}
        title="Couldn't load history"
        message={getHttpErrorMessage(error) ?? error?.message ?? "Unknown error"}
        action={<Button label="Retry" onPress={handleRefresh} />}
      />
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => String(e.id)}
      renderItem={({ item }) => <HistoryRow entry={item} />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={handleRefresh}
          tintColor="#3b82f6"
          colors={["#3b82f6"]}
          progressBackgroundColor="#18181b"
        />
      }
      ListEmptyComponent={
        <View className="flex-1 justify-center px-4">
          <EmptyState
            icon={<Icon icon={History} size={28} color="#71717a" />}
            title="No history yet"
            message="Nothing has been grabbed or imported for this item yet. Pull to refresh."
          />
        </View>
      }
    />
  );
}
