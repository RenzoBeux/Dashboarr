import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Tv } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { SonarrSearchRow } from "@/components/search/sonarr-search-row";
import { AddSeriesSheet } from "@/components/sonarr/add-series-sheet";
import { useSonarrSearch, useSonarrSeries } from "@/hooks/use-sonarr";
import type { SonarrSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;

/** TV section of global search — Sonarr lookup, library dedup by tvdbId. */
export function SonarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { data: results, isLoading, isError, error } = useSonarrSearch(query);
  const { data: existing } = useSonarrSeries();
  const [advancedTarget, setAdvancedTarget] = useState<SonarrSearchResult | null>(null);

  const existingByTvdbId = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of existing ?? []) {
      map.set(s.tvdbId, s.id);
    }
    return map;
  }, [existing]);

  const all = results ?? [];
  const preview = all.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="TV Shows"
        icon={Tv}
        serviceLabel="Sonarr"
        total={all.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={all.length > preview.length}
        onShowAll={() => router.push({ pathname: "/series/search", params: { q: query } })}
      >
        {preview.map((result) => {
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
      </SearchSection>

      <AddSeriesSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
