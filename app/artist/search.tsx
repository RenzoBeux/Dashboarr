import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddArtistSheet } from "@/components/lidarr/add-artist-sheet";
import { LidarrSearchRow } from "@/components/search/lidarr-search-row";
import { useLidarrSearch, useLidarrArtists } from "@/hooks/use-lidarr";
import type { LidarrArtistSearchResult } from "@/lib/types";

export default function ArtistSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const { data: results, isLoading } = useLidarrSearch(query);
  const { data: existing } = useLidarrArtists();
  const [advancedTarget, setAdvancedTarget] = useState<LidarrArtistSearchResult | null>(
    null,
  );

  const existingByForeignId = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of existing ?? []) {
      map.set(a.foreignArtistId, a.id);
    }
    return map;
  }, [existing]);

  return (
    <ScreenWrapper>
      <BackHeader title="Search Artists" />

      <TextInput
        placeholder="Search for an artist..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" message={`No artists found for "${query}"`} />
      )}

      {results && results.length > 0 && (
        <View className="gap-3">
          {results.map((result) => {
            const existingId = existingByForeignId.get(result.foreignArtistId);
            return (
              <LidarrSearchRow
                key={result.foreignArtistId}
                result={result}
                existingArtistId={existingId}
                onAdvanced={() => setAdvancedTarget(result)}
                onOpenExisting={() =>
                  existingId !== undefined && router.push(`/artist/${existingId}`)
                }
              />
            );
          })}
        </View>
      )}

      <AddArtistSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}
