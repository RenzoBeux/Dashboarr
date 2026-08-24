import { useState } from "react";
import { useRouter } from "expo-router";
import { Film } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { RadarrSearchRow } from "@/components/search/radarr-search-row";
import { AddMovieSheet } from "@/components/radarr/add-movie-sheet";
import { useRadarrSearchRows } from "@/hooks/use-arr-search-rows";
import type { RadarrSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;
// Cap on promoted library rows so a settled lookup always has room in the
// preview. The dedicated screen behind "Show all" uses the full limit.
const LIBRARY_PREVIEW_LIMIT = 3;

/**
 * Movies section of global search — library matches first, then the Radarr
 * lookup deduped against them (#304). Takes the raw query and debounces the
 * lookup internally, so library hits track the keystrokes.
 */
export function RadarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { rows, total, isLoading, isError, error } = useRadarrSearchRows(
    query,
    LIBRARY_PREVIEW_LIMIT,
  );
  const [advancedTarget, setAdvancedTarget] = useState<RadarrSearchResult | null>(null);

  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Movies"
        icon={Film}
        serviceLabel="Radarr"
        total={total}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={total > preview.length}
        onShowAll={() => router.push({ pathname: "/movie/search", params: { q: query } })}
      >
        {preview.map((row) =>
          row.kind === "library" ? (
            <ArrLibraryRow
              key={row.key}
              serviceId="radarr"
              fallbackIcon={Film}
              display={row.display}
              onOpen={() => router.push(`/movie/${row.id}`)}
            />
          ) : (
            <RadarrSearchRow
              key={row.key}
              result={row.result}
              existingMovieId={row.existingId}
              onAdvanced={() => setAdvancedTarget(row.result)}
              onOpenExisting={() =>
                row.existingId !== undefined && router.push(`/movie/${row.existingId}`)
              }
            />
          ),
        )}
      </SearchSection>

      <AddMovieSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
