import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddMovieSheet } from "@/components/radarr/add-movie-sheet";
import { RadarrSearchRow } from "@/components/search/radarr-search-row";
import { useRadarrSearch, useRadarrMovies } from "@/hooks/use-radarr";
import type { RadarrSearchResult } from "@/lib/types";

export default function MovieSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const { data: results, isLoading } = useRadarrSearch(query);
  const { data: existing } = useRadarrMovies();
  const [advancedTarget, setAdvancedTarget] = useState<RadarrSearchResult | null>(null);

  const existingByTmdbId = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of existing ?? []) {
      map.set(m.tmdbId, m.id);
    }
    return map;
  }, [existing]);

  return (
    <ScreenWrapper>
      <BackHeader title="Search Movies" />

      <TextInput
        placeholder="Search for a movie..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" message={`No movies found for "${query}"`} />
      )}

      {results && results.length > 0 && (
        <View className="gap-3">
          {results.map((result) => {
            const existingId = existingByTmdbId.get(result.tmdbId);
            return (
              <RadarrSearchRow
                key={result.tmdbId}
                result={result}
                existingMovieId={existingId}
                onAdvanced={() => setAdvancedTarget(result)}
                onOpenExisting={() =>
                  existingId !== undefined && router.push(`/movie/${existingId}`)
                }
              />
            );
          })}
        </View>
      )}

      <AddMovieSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}
