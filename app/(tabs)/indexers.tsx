import { useState } from "react";
import { View, Text, Pressable, Alert, Platform } from "react-native";
import { toast } from "@/components/ui/toast";
import { Search, Power, AlertTriangle, CheckCircle, XCircle } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import {
  useProwlarrIndexers,
  useProwlarrIndexerStatuses,
  useProwlarrStats,
  useProwlarrSearch,
  useToggleIndexer,
  useGrabRelease,
} from "@/hooks/use-prowlarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatBytes } from "@/lib/utils";
import type { ProwlarrIndexer, ProwlarrSearchResult } from "@/lib/types";

type Tab = "indexers" | "search" | "stats";

export default function IndexersScreen() {
  const [tab, setTab] = useState<Tab>("indexers");
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["prowlarr"]]);

  const prowlarrHealth = healthData?.find((s) => s.id === "prowlarr");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Indexers" online={prowlarrHealth?.online} />

      <View className="flex-row gap-2 mb-4">
        {(["indexers", "search", "stats"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </View>

      {tab === "indexers" && <IndexerList />}
      {tab === "search" && <IndexerSearch />}
      {tab === "stats" && <IndexerStats />}
    </ScreenWrapper>
  );
}

function IndexerList() {
  const { data: indexers, isLoading } = useProwlarrIndexers();
  const { data: statuses } = useProwlarrIndexerStatuses();
  const toggleIndexer = useToggleIndexer();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (!indexers?.length) {
    return <EmptyState title="No indexers configured" />;
  }

  const statusMap = new Map(statuses?.map((s) => [s.indexerId, s]) ?? []);

  return (
    <View className="gap-2">
      {indexers.map((indexer) => {
        const status = statusMap.get(indexer.id);
        const isDisabled = !!status?.disabledTill;
        const isEnabled = indexer.enable;

        return (
          <Card key={indexer.id}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <View
                  className={`w-2.5 h-2.5 rounded-full ${
                    !isEnabled
                      ? "bg-zinc-600"
                      : isDisabled
                        ? "bg-danger"
                        : "bg-success"
                  }`}
                  style={Platform.OS === "ios" && isEnabled ? {
                    shadowColor: isDisabled ? "#ef4444" : "#22c55e",
                    shadowRadius: 6,
                    shadowOpacity: 0.6,
                    shadowOffset: { width: 0, height: 0 },
                  } : undefined}
                />
                <View className="flex-1">
                  <Text className="text-zinc-200 text-sm font-medium">
                    {indexer.name}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {indexer.protocol} · Priority {indexer.priority}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                {isDisabled && (
                  <AlertTriangle size={14} color="#ef4444" />
                )}
                <Badge
                  label={indexer.protocol}
                  variant={indexer.protocol === "torrent" ? "downloading" : "default"}
                />
                <Pressable
                  onPress={() =>
                    toggleIndexer.mutate({ indexer, enable: !isEnabled })
                  }
                  className="p-1.5 active:opacity-70"
                  hitSlop={6}
                >
                  <Power
                    size={16}
                    color={isEnabled ? "#22c55e" : "#71717a"}
                  />
                </Pressable>
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

function IndexerSearch() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useProwlarrSearch(query);
  const grabRelease = useGrabRelease();

  const handleGrab = (result: ProwlarrSearchResult) => {
    Alert.alert("Grab Release", `Send "${result.title}" to download client?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Grab",
        onPress: () =>
          grabRelease.mutate(
            { guid: result.guid, indexerId: result.indexerId },
            {
              onSuccess: () => toast("Sent to download client"),
              onError: () => toast("Failed to grab release", "error"),
            },
          ),
      },
    ]);
  };

  return (
    <View>
      <TextInput
        placeholder="Search all indexers..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" />
      )}

      {results && results.length > 0 && (
        <View className="gap-2">
          {results.slice(0, 50).map((result) => (
            <Card key={result.guid}>
              <Pressable onPress={() => handleGrab(result)} className="active:opacity-80">
                <Text className="text-zinc-200 text-sm" numberOfLines={2}>
                  {result.title}
                </Text>
                <View className="flex-row items-center gap-3 mt-1.5">
                  <Text className="text-zinc-500 text-xs">
                    {formatBytes(result.size)}
                  </Text>
                  <Text className="text-zinc-500 text-xs">{result.indexer}</Text>
                  {result.seeders !== undefined && (
                    <Text className="text-success text-xs">
                      S:{result.seeders}
                    </Text>
                  )}
                  {result.leechers !== undefined && (
                    <Text className="text-danger text-xs">
                      L:{result.leechers}
                    </Text>
                  )}
                  <Badge label={result.protocol} variant={result.protocol === "torrent" ? "downloading" : "default"} />
                </View>
              </Pressable>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

function IndexerStats() {
  const { data: stats, isLoading } = useProwlarrStats();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (!stats?.indexers?.length) {
    return <EmptyState title="No stats available" />;
  }

  return (
    <View className="gap-2">
      {stats.indexers.map((indexer) => (
        <Card key={indexer.indexerId}>
          <Text className="text-zinc-200 text-sm font-medium mb-2">
            {indexer.indexerName}
          </Text>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            <StatItem label="Queries" value={String(indexer.numberOfQueries)} />
            <StatItem label="Grabs" value={String(indexer.numberOfGrabs)} />
            <StatItem label="Failures" value={String(indexer.numberOfFailures)} danger={indexer.numberOfFailures > 0} />
            <StatItem label="Avg Response" value={`${indexer.averageResponseTime}ms`} />
          </View>
        </Card>
      ))}
    </View>
  );
}

function StatItem({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View>
      <Text className="text-zinc-500 text-[10px]">{label}</Text>
      <Text className={`text-sm font-medium ${danger ? "text-danger" : "text-zinc-300"}`}>
        {value}
      </Text>
    </View>
  );
}
