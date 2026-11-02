import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Tv } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSeriesSheet } from "@/components/sonarr/add-series-sheet";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { SonarrSearchRow } from "@/components/search/sonarr-search-row";
import { useSonarrSearchRows } from "@/hooks/use-arr-search-rows";
import type { SonarrSearchResult } from "@/lib/types";

export default function SeriesSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  // Shows already in Sonarr match locally and render on the keystroke; only the
  // TVDB lookup underneath waits on the network (#304).
  const { rows, isLoading, isError, error } = useSonarrSearchRows(query);
  const [advancedTarget, setAdvancedTarget] = useState<SonarrSearchResult | null>(null);

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

      {isLoading && <Text className="text-zinc-500 mb-3">Searching...</Text>}

      {/* The lookup can fail while library matches still render, so the failure
          needs to be visible rather than read as "no results". */}
      {isError && (
        <ErrorBanner error={error} title="Couldn't search Sonarr" className="mb-4" />
      )}

      {!isLoading && !isError && rows.length === 0 && query.trim().length >= 2 && (
        <EmptyState title="No results" message={`No shows found for "${query}"`} />
      )}

      {rows.length > 0 && (
        <View className="gap-3">
          {rows.map((row) =>
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
