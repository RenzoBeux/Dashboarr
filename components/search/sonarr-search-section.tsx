import { useState } from "react";
import { useRouter } from "expo-router";
import { Tv } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { SonarrSearchRow } from "@/components/search/sonarr-search-row";
import { AddSeriesSheet } from "@/components/sonarr/add-series-sheet";
import { useSonarrSearchRows } from "@/hooks/use-arr-search-rows";
import type { SonarrSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;
// See radarr-search-section.tsx for why library rows are capped in the preview.
const LIBRARY_PREVIEW_LIMIT = 3;

/**
 * TV section of global search — library matches first, then the Sonarr lookup
 * deduped against them (#304).
 */
export function SonarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { rows, total, isLoading, isError, error } = useSonarrSearchRows(
    query,
    LIBRARY_PREVIEW_LIMIT,
  );
  const [advancedTarget, setAdvancedTarget] = useState<SonarrSearchResult | null>(null);

  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="TV Shows"
        icon={Tv}
        serviceLabel="Sonarr"
        total={total}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={total > preview.length}
        onShowAll={() => router.push({ pathname: "/series/search", params: { q: query } })}
      >
        {preview.map((row) =>
          row.kind === "library" ? (
            <ArrLibraryRow
              key={row.key}
              serviceId="sonarr"
              fallbackIcon={Tv}
              display={row.display}
              onOpen={() => router.push(`/series/${row.id}`)}
            />
          ) : (
            <SonarrSearchRow
              key={row.key}
              result={row.result}
              existingSeriesId={row.existingId}
              onAdvanced={() => setAdvancedTarget(row.result)}
              onOpenExisting={() =>
                row.existingId !== undefined && router.push(`/series/${row.existingId}`)
              }
            />
          ),
        )}
      </SearchSection>

      <AddSeriesSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
