import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Film } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddMovieSheet } from "@/components/radarr/add-movie-sheet";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { RadarrSearchRow } from "@/components/search/radarr-search-row";
import { useRadarrSearchRows } from "@/hooks/use-arr-search-rows";
import type { RadarrSearchResult } from "@/lib/types";

export default function MovieSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  // Movies already in Radarr match locally and render on the keystroke; only the
  // TMDB lookup underneath waits on the network (#304).
  const { rows, isLoading, isError, error } = useRadarrSearchRows(query);
  const [advancedTarget, setAdvancedTarget] = useState<RadarrSearchResult | null>(null);

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

      {isLoading && <Text className="text-zinc-500 mb-3">Searching...</Text>}

      {/* The lookup can fail while library matches still render, so the failure
          needs to be visible rather than read as "no results". */}
      {isError && (
        <ErrorBanner error={error} title="Couldn't search Radarr" className="mb-4" />
      )}

      {!isLoading && !isError && rows.length === 0 && query.trim().length >= 2 && (
        <EmptyState title="No results" message={`No movies found for "${query}"`} />
      )}

      {rows.length > 0 && (
        <View className="gap-3">
          {rows.map((row) =>
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
