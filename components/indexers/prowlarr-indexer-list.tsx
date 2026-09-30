import { useState } from "react";
import { View, Text, Pressable, Platform, ActivityIndicator } from "react-native";
import {
  Power,
  AlertTriangle,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  useProwlarrIndexers,
  useProwlarrIndexerStatuses,
  useTestProwlarrIndexer,
  useToggleIndexer,
} from "@/hooks/use-prowlarr";
import type { ProwlarrIndexer, ProwlarrIndexerTestResult } from "@/lib/types";

// Prowlarr's indexer list: per-indexer health dot (from /indexerstatus), an
// enable/disable toggle, and a Test action (#447). Deliberately NOT shared with
// Jackett — its toggle and status endpoints are cookie-authed, so its list
// (jackett-indexer-list.tsx) has neither the power toggle nor a standing dot.
//
// The power toggle is `indexer.enable`, nothing to do with the backoff the red
// dot reports. Testing is what clears a backoff: a passing test makes Prowlarr
// record a success against the indexer, which is why the dot flips back to
// green after one.
export function ProwlarrIndexerList() {
  const tc = useThemeColor();
  const { data: indexers, isLoading, error } = useProwlarrIndexers();
  const { data: statuses } = useProwlarrIndexerStatuses();
  const toggleIndexer = useToggleIndexer();
  const test = useTestProwlarrIndexer();
  // Per row and local, as in the Jackett list: a test is a point-in-time probe
  // whose verdict should survive testing a second indexer. The standing health
  // dot is the server's view and refreshes on its own.
  const [testResults, setTestResults] = useState<
    Record<number, ProwlarrIndexerTestResult>
  >({});

  const runTest = (indexer: ProwlarrIndexer) => {
    test.mutate(indexer, {
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
    return <EmptyState title="No indexers configured" />;
  }

  const statusMap = new Map(statuses?.map((s) => [s.indexerId, s]) ?? []);

  return (
    <View className="gap-2">
      {indexers.map((indexer) => {
        const status = statusMap.get(indexer.id);
        const isDisabled = !!status?.disabledTill;
        const isEnabled = indexer.enable;
        const testing = test.isPending && test.variables?.id === indexer.id;
        const result = testResults[indexer.id];

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
                  <Icon icon={AlertTriangle} size={14} color="#ef4444" />
                )}
                <Badge
                  label={indexer.protocol}
                  variant={indexer.protocol === "torrent" ? "info" : "default"}
                />
                {/* Fixed box so swapping the icon for its spinner can't
                    reflow the row. */}
                <Pressable
                  onPress={() => runTest(indexer)}
                  disabled={testing}
                  className="w-7 h-7 items-center justify-center active:opacity-70"
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Test ${indexer.name}`}
                >
                  {testing ? (
                    <ActivityIndicator size="small" color={tc("#a1a1aa")} />
                  ) : (
                    <Icon icon={Activity} size={16} color="#a1a1aa" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() =>
                    toggleIndexer.mutate({ indexer, enable: !isEnabled })
                  }
                  className="p-1.5 active:opacity-70"
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${isEnabled ? "Disable" : "Enable"} ${indexer.name}`}
                >
                  <Icon icon={Power}
                    size={16}
                    color={isEnabled ? "#22c55e" : "#71717a"}
                  />
                </Pressable>
              </View>
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
                  {result.ok ? "Working" : result.error}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
