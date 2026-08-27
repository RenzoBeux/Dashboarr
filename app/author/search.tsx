import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { User } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { AddAuthorSheet } from "@/components/bindery/add-author-sheet";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { BinderySearchRow } from "@/components/search/bindery-search-row";
import { useBinderySearchRows } from "@/hooks/use-arr-search-rows";
import type { BinderyAuthorSearchResult } from "@/lib/types";

export default function AuthorSearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  // Authors already in Bindery match locally and render on the keystroke; only
  // the metadata-provider lookup underneath waits on the network (#304). The
  // shared hook also handles the dedupe Bindery's API can't: its search
  // response has no "already added" flag and every stub comes back with id 0,
  // so library membership is resolved by matching foreignAuthorId.
  const { rows, isLoading, isError, error } = useBinderySearchRows(query);
  const [advancedTarget, setAdvancedTarget] = useState<BinderyAuthorSearchResult | null>(
    null,
  );

  return (
    <ScreenWrapper>
      <BackHeader title="Search Authors" />

      <TextInput
        placeholder="Search for an author..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500 mb-3">Searching...</Text>}

      {/* The lookup can fail while library matches still render, so the failure
          needs to be visible rather than read as "no results". */}
      {isError && (
        <ErrorBanner error={error} title="Couldn't search Bindery" className="mb-4" />
      )}

      {!isLoading && !isError && rows.length === 0 && query.trim().length >= 2 && (
        <EmptyState title="No results" message={`No authors found for "${query}"`} />
      )}

      {rows.length > 0 && (
        <View className="gap-3">
          {rows.map((row) =>
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
        </View>
      )}

      <AddAuthorSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}
