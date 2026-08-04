import { useState } from "react";
import { View, Text } from "react-native";
import { Search, CheckCircle2, XCircle, Activity } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { useJackettIndexers, useTestJackettIndexer } from "@/hooks/use-jackett";
import type { JackettIndexer, JackettIndexerTestResult } from "@/lib/types";

// Jackett's per-indexer toggle/config REST endpoints require the admin-password
// cookie, so unlike Prowlarr's list there is no enable/disable here and no
// standing health dot — the list is what the Torznab t=indexers meta endpoint
// reports about the configured set, plus the two actions Jackett's own web UI
// puts on each row and the apikey can still reach (#315): search this tracker,
// and test it (see testIndexer in services/jackett-api.ts).
export function JackettIndexerList({
  onSearch,
}: {
  onSearch?: (indexer: JackettIndexer) => void;
}) {
  const { data: indexers, isLoading, error } = useJackettIndexers();
  const test = useTestJackettIndexer();
  // Results are per row and deliberately local: a test is a point-in-time probe,
  // not cached server state, and it should survive testing a second indexer.
  const [testResults, setTestResults] = useState<
    Record<string, JackettIndexerTestResult>
  >({});

  const runTest = (indexer: JackettIndexer) => {
    test.mutate(indexer.id, {
      onSuccess: (result) => {
        setTestResults((prev) => ({ ...prev, [indexer.id]: result }));
        if (result.ok) toast(`${indexer.name} is working`);
        else toast(`${indexer.name}: ${result.error}`, "error");
      },
      onError: (err) => {
        setTestResults((prev) => ({
          ...prev,
          [indexer.id]: {
            ok: false,
            results: 0,
            error: err instanceof Error ? err.message : "Test failed",
          },
        }));
        toastError(`Couldn't test ${indexer.name}`, err);
      },
    });
  };

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load indexers" />;
  }
  if (!indexers?.length) {
    return (
      <EmptyState
        title="No indexers configured"
        message="Add indexers in Jackett's web UI — they'll show up here."
      />
    );
  }

  return (
    <View className="gap-2">
      {indexers.map((indexer) => {
        const testing = test.isPending && test.variables === indexer.id;
        const result = testResults[indexer.id];

        return (
          <Card key={indexer.id}>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="text-zinc-200 text-sm font-medium">
                  {indexer.name}
                </Text>
                {indexer.description ? (
                  <Text className="text-zinc-500 text-xs" numberOfLines={2}>
                    {indexer.description}
                  </Text>
                ) : null}
              </View>
              <Badge
                label={indexer.type}
                variant={indexer.type === "public" ? "default" : "seeding"}
              />
            </View>

            {result && !testing ? (
              <View className="flex-row items-start gap-1.5 mt-3">
                <Icon
                  icon={result.ok ? CheckCircle2 : XCircle}
                  size={14}
                  color={result.ok ? "#22c55e" : "#ef4444"}
                />
                <Text
                  className={`flex-1 text-xs ${result.ok ? "text-success" : "text-danger"}`}
                >
                  {result.ok
                    ? `Working · ${result.results} result${result.results === 1 ? "" : "s"}` +
                      (result.elapsedMs ? ` in ${result.elapsedMs}ms` : "")
                    : result.error}
                </Text>
              </View>
            ) : null}

            {/* flex-1 on both so swapping the Test label for its spinner can't
                resize the row. */}
            <View className="flex-row gap-2 mt-3">
              <Button
                label="Search"
                variant="outline"
                size="sm"
                className="flex-1"
                onPress={() => onSearch?.(indexer)}
                disabled={!onSearch}
                icon={<Icon icon={Search} size={14} color="#a1a1aa" />}
              />
              <Button
                label="Test"
                variant="outline"
                size="sm"
                className="flex-1"
                loading={testing}
                onPress={() => runTest(indexer)}
                icon={<Icon icon={Activity} size={14} color="#a1a1aa" />}
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}
