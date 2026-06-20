import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Film } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { RadarrSearchRow } from "@/components/search/radarr-search-row";
import { AddMovieSheet } from "@/components/radarr/add-movie-sheet";
import { useRadarrSearch, useRadarrMovies } from "@/hooks/use-radarr";
import type { RadarrSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;

/** Movies section of global search — Radarr lookup, library dedup by tmdbId. */
export function RadarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { data: results, isLoading, isError, error } = useRadarrSearch(query);
  const { data: existing } = useRadarrMovies();
  const [advancedTarget, setAdvancedTarget] = useState<RadarrSearchResult | null>(null);

  const existingByTmdbId = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of existing ?? []) {
      map.set(m.tmdbId, m.id);
    }
    return map;
  }, [existing]);

  const all = results ?? [];
  const preview = all.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Movies"
        icon={Film}
        serviceLabel="Radarr"
        total={all.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={all.length > preview.length}
        onShowAll={() => router.push({ pathname: "/movie/search", params: { q: query } })}
      >
        {preview.map((result) => {
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
      </SearchSection>

      <AddMovieSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
