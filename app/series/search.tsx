import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSeriesSheet } from "@/components/sonarr/add-series-sheet";
import { SonarrSearchRow } from "@/components/search/sonarr-search-row";
import { useSonarrSearch, useSonarrSeries } from "@/hooks/use-sonarr";
import type { SonarrSearchResult } from "@/lib/types";

export default function SeriesSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const { data: results, isLoading } = useSonarrSearch(query);
  const { data: existing } = useSonarrSeries();
  const [advancedTarget, setAdvancedTarget] = useState<SonarrSearchResult | null>(null);

  const existingByTvdbId = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of existing ?? []) {
      map.set(s.tvdbId, s.id);
    }
    return map;
  }, [existing]);

  return (
    <ScreenWrapper>
      <BackHeader title="Search TV Shows" />

      <TextInput
        placeholder="Search for a show..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" message={`No shows found for "${query}"`} />
      )}

      {results && results.length > 0 && (
        <View className="gap-3">
          {results.map((result) => {
            const existingId = existingByTvdbId.get(result.tvdbId);
            return (
              <SonarrSearchRow
                key={result.tvdbId}
                result={result}
                existingSeriesId={existingId}
                onAdvanced={() => setAdvancedTarget(result)}
                onOpenExisting={() =>
                  existingId !== undefined && router.push(`/series/${existingId}`)
                }
              />
            );
          })}
        </View>
      )}

      <AddSeriesSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}
