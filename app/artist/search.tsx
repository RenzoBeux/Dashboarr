import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mic2 } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddArtistSheet } from "@/components/lidarr/add-artist-sheet";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { LidarrSearchRow } from "@/components/search/lidarr-search-row";
import { useLidarrSearchRows } from "@/hooks/use-arr-search-rows";
import type { LidarrArtistSearchResult } from "@/lib/types";

export default function ArtistSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  // Artists already in Lidarr match locally and render on the keystroke; only the
  // MusicBrainz lookup underneath waits on the network (#304).
  const { rows, isLoading, isError, error } = useLidarrSearchRows(query);
  const [advancedTarget, setAdvancedTarget] = useState<LidarrArtistSearchResult | null>(
    null,
  );

  return (
    <ScreenWrapper>
      <BackHeader title="Search Artists" />

      <TextInput
        placeholder="Search for an artist..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500 mb-3">Searching...</Text>}

      {/* The lookup can fail while library matches still render, so the failure
          needs to be visible rather than read as "no results". */}
      {isError && (
        <ErrorBanner error={error} title="Couldn't search Lidarr" className="mb-4" />
      )}

      {!isLoading && !isError && rows.length === 0 && query.trim().length >= 2 && (
        <EmptyState title="No results" message={`No artists found for "${query}"`} />
      )}

      {rows.length > 0 && (
        <View className="gap-3">
          {rows.map((row) =>
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
        </View>
      )}

      <AddArtistSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}
