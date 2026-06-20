import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Radar } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toast, toastError } from "@/components/ui/toast";
import { useProwlarrSearch, useGrabRelease } from "@/hooks/use-prowlarr";
import { formatBytes } from "@/lib/utils";
import type { ProwlarrSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;

/**
 * Releases section of global search — Prowlarr indexer search. Reuses the dense
 * release card + ConfirmModal grab flow from the Indexers tab. Collapsed by
 * default since interactive indexer searches are the slowest and the noisiest.
 */
export function ProwlarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { data: results, isLoading, isError, error } = useProwlarrSearch(query);
  const grabRelease = useGrabRelease();
  const [pendingGrab, setPendingGrab] = useState<ProwlarrSearchResult | null>(null);

  const all = results ?? [];
  const preview = all.slice(0, PREVIEW_LIMIT);

  const confirmGrab = () => {
    if (!pendingGrab) return;
    grabRelease.mutate(
      { guid: pendingGrab.guid, indexerId: pendingGrab.indexerId },
      {
        onSuccess: () => toast("Sent to download client"),
        onError: (err) => toastError("Failed to grab release", err),
      },
    );
    setPendingGrab(null);
  };

  return (
    <>
      <SearchSection
        title="Releases"
        icon={Radar}
        serviceLabel="Prowlarr"
        total={all.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={all.length > preview.length}
        onShowAll={() => router.push("/indexers")}
        defaultExpanded={false}
      >
        {preview.map((result) => (
          <Card key={result.guid}>
            <Pressable
              onPress={() => setPendingGrab(result)}
              className="active:opacity-80"
            >
              <Text className="text-zinc-200 text-sm" numberOfLines={2}>
                {result.title}
              </Text>
              <View className="flex-row items-center gap-3 mt-1.5">
                <Text className="text-zinc-500 text-xs">
                  {formatBytes(result.size)}
                </Text>
                <Text className="text-zinc-500 text-xs">{result.indexer}</Text>
                {result.seeders !== undefined && (
                  <Text className="text-success text-xs">S:{result.seeders}</Text>
                )}
                {result.leechers !== undefined && (
                  <Text className="text-danger text-xs">L:{result.leechers}</Text>
                )}
                <Badge
                  label={result.protocol}
                  variant={result.protocol === "torrent" ? "downloading" : "default"}
                />
              </View>
            </Pressable>
          </Card>
        ))}
      </SearchSection>

      <ConfirmModal
        visible={pendingGrab !== null}
        title="Grab Release"
        message={
          pendingGrab ? `Send "${pendingGrab.title}" to download client?` : ""
        }
        confirmLabel="Grab"
        onConfirm={confirmGrab}
        onCancel={() => setPendingGrab(null)}
      />
    </>
  );
}
