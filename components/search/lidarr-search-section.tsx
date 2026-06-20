import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Music } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { LidarrSearchRow } from "@/components/search/lidarr-search-row";
import { AddArtistSheet } from "@/components/lidarr/add-artist-sheet";
import { useLidarrSearch, useLidarrArtists } from "@/hooks/use-lidarr";
import type { LidarrArtistSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;

/** Music section of global search — Lidarr artist lookup, dedup by foreignArtistId. */
export function LidarrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { data: results, isLoading, isError, error } = useLidarrSearch(query);
  const { data: existing } = useLidarrArtists();
  const [advancedTarget, setAdvancedTarget] =
    useState<LidarrArtistSearchResult | null>(null);

  const existingByForeignId = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of existing ?? []) {
      map.set(a.foreignArtistId, a.id);
    }
    return map;
  }, [existing]);

  const all = results ?? [];
  const preview = all.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Music"
        icon={Music}
        serviceLabel="Lidarr"
        total={all.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={all.length > preview.length}
        onShowAll={() => router.push({ pathname: "/artist/search", params: { q: query } })}
      >
        {preview.map((result) => {
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
      </SearchSection>

      <AddArtistSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
