import { useState } from "react";
import { useRouter } from "expo-router";
import { BookOpen, User } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { BinderySearchRow } from "@/components/search/bindery-search-row";
import { AddAuthorSheet } from "@/components/bindery/add-author-sheet";
import { useBinderySearchRows } from "@/hooks/use-arr-search-rows";
import type { BinderyAuthorSearchResult } from "@/lib/types";

const PREVIEW_LIMIT = 5;
// See radarr-search-section.tsx for why library rows are capped in the preview.
const LIBRARY_PREVIEW_LIMIT = 3;

/**
 * Books section of global search — library matches first, then the Bindery
 * author lookup deduped against them (#304).
 */
export function BinderySearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { rows, total, isLoading, isError, error } = useBinderySearchRows(
    query,
    LIBRARY_PREVIEW_LIMIT,
  );
  const [advancedTarget, setAdvancedTarget] =
    useState<BinderyAuthorSearchResult | null>(null);

  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Books"
        icon={BookOpen}
        serviceLabel="Bindery"
        total={total}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={total > preview.length}
        onShowAll={() => router.push({ pathname: "/author/search", params: { q: query } })}
      >
        {preview.map((row) =>
          row.kind === "library" ? (
            <ArrLibraryRow
              key={row.key}
              serviceId="bindery"
              fallbackIcon={User}
              display={row.display}
              onOpen={() => router.push(`/author/${row.id}`)}
            />
          ) : (
            <BinderySearchRow
              key={row.key}
              result={row.result}
              existingAuthorId={row.existingId}
              onAdvanced={() => setAdvancedTarget(row.result)}
              onOpenExisting={() =>
                row.existingId !== undefined && router.push(`/author/${row.existingId}`)
              }
            />
          ),
        )}
      </SearchSection>

      <AddAuthorSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </>
  );
}
