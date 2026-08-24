import { useState } from "react";
import { useRouter } from "expo-router";
import { Music, Mic2 } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { LidarrSearchRow } from "@/components/search/lidarr-search-row";
import { AddArtistSheet } from "@/components/lidarr/add-artist-sheet";
import { useLidarrSearchRows } from "@/hooks/use-arr-search-rows";
import type { LidarrArtistSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;
// See radarr-search-section.tsx for why library rows are capped in the preview.
const LIBRARY_PREVIEW_LIMIT = 3;

/**
 * Music section of global search — library matches first, then the Lidarr artist
 * lookup deduped against them (#304).
 */
export function LidarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { rows, total, isLoading, isError, error } = useLidarrSearchRows(
    query,
    LIBRARY_PREVIEW_LIMIT,
  );
  const [advancedTarget, setAdvancedTarget] =
    useState<LidarrArtistSearchResult | null>(null);

  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Music"
        icon={Music}
        serviceLabel="Lidarr"
        total={total}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={total > preview.length}
        onShowAll={() => router.push({ pathname: "/artist/search", params: { q: query } })}
      >
        {preview.map((row) =>
          row.kind === "library" ? (
            <ArrLibraryRow
              key={row.key}
              serviceId="lidarr"
              fallbackIcon={Mic2}
              display={row.display}
              onOpen={() => router.push(`/artist/${row.id}`)}
            />
          ) : (
            <LidarrSearchRow
              key={row.key}
              result={row.result}
              existingArtistId={row.existingId}
              onAdvanced={() => setAdvancedTarget(row.result)}
              onOpenExisting={() =>
                row.existingId !== undefined && router.push(`/artist/${row.existingId}`)
              }
            />
          ),
        )}
      </SearchSection>

      <AddArtistSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
