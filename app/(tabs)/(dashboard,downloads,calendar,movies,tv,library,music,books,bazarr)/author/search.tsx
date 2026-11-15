import { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { User } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AddAuthorSheet } from "@/components/bindery/add-author-sheet";
import { AddBookSheet } from "@/components/bindery/add-book-sheet";
import { ArrLibraryRow } from "@/components/search/arr-library-row";
import { BinderySearchRow } from "@/components/search/bindery-search-row";
import { BinderyBookSearchRow } from "@/components/search/bindery-book-search-row";
import { BinderySeriesSearchRow } from "@/components/search/bindery-series-search-row";
import { useBinderySearchRows } from "@/hooks/use-arr-search-rows";
import { useBinderyBookSearch, useBinderySeriesSearch } from "@/hooks/use-bindery";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { binderyErrorMessage } from "@/lib/bindery-normalize";
import type { BinderyAuthorSearchResult, BinderyBookSearchResult } from "@/lib/types";

type SearchMode = "authors" | "books" | "series";

const MODES: { value: SearchMode; label: string; placeholder: string }[] = [
  { value: "authors", label: "Authors", placeholder: "Search for an author..." },
  { value: "books", label: "Books", placeholder: "Title, ISBN or ASIN..." },
  { value: "series", label: "Series", placeholder: "Search Hardcover for a series..." },
];

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

export default function AuthorSearchScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const [mode, setMode] = useState<SearchMode>("authors");

  return (
    <ScreenWrapper>
      <BackHeader title="Search Bindery" />

      <SegmentedControl
        options={MODES}
        value={mode}
        onChange={setMode}
        className="mb-3"
      />

      <TextInput
        placeholder={MODES.find((m) => m.value === mode)!.placeholder}
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {mode === "authors" && <AuthorResults query={query} />}
      {mode === "books" && <BookResults query={query} />}
      {mode === "series" && <SeriesResults query={query} />}
    </ScreenWrapper>
  );
}

function AuthorResults({ query }: { query: string }) {
  const router = useRouter();
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
    <>
      <SearchStatus
        query={query}
        noun="authors"
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
      />
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
    </>
  );
}

function BookResults({ query }: { query: string }) {
  const router = useRouter();
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const search = useBinderyBookSearch(debounced);
  const results = debounced.length >= MIN_QUERY ? (search.data ?? []) : [];
  const [selected, setSelected] = useState<BinderyBookSearchResult | null>(null);

  return (
    <>
      <SearchStatus
        query={query}
        noun="books"
        isLoading={isPending(trimmed, debounced, search.isFetching)}
        isError={search.isError}
        error={search.error}
        isEmpty={results.length === 0}
      />
      {results.length > 0 && (
        <View className="gap-3">
          {results.map((result, i) => (
            <BinderyBookSearchRow
              key={`${result.foreignBookId}:${i}`}
              result={result}
              onSelect={() => setSelected(result)}
              onOpenExisting={(bookId) => router.push(`/book/${bookId}`)}
            />
          ))}
        </View>
      )}
      <AddBookSheet
        result={selected}
        visible={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function SeriesResults({ query }: { query: string }) {
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const search = useBinderySeriesSearch(debounced);
  const results = debounced.length >= MIN_QUERY ? (search.data ?? []) : [];

  return (
    <>
      <SearchStatus
        query={query}
        noun="series"
        isLoading={isPending(trimmed, debounced, search.isFetching)}
        isError={search.isError}
        error={search.error}
        isEmpty={results.length === 0}
      />
      {results.length > 0 && (
        <View className="gap-3">
          {results.map((result, i) => (
            <BinderySeriesSearchRow key={`${result.foreignId}:${i}`} result={result} />
          ))}
        </View>
      )}
    </>
  );
}

// A pending debounce counts as loading so the empty state doesn't flash.
function isPending(trimmed: string, debounced: string, isFetching: boolean): boolean {
  return trimmed.length >= MIN_QUERY && (isFetching || debounced !== trimmed);
}

function SearchStatus({
  query,
  noun,
  isLoading,
  isError,
  error,
  isEmpty,
}: {
  query: string;
  noun: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
}) {
  const trimmed = query.trim();
  return (
    <>
      {isLoading && <Text className="text-zinc-500 mb-3">Searching...</Text>}
      {/* The lookup can fail while library matches still render, so the failure
          needs to be visible rather than read as "no results". */}
      {isError && (
        <ErrorBanner
          error={error}
          title={binderyErrorMessage(error) ?? "Couldn't search Bindery"}
          className="mb-4"
        />
      )}
      {!isLoading && !isError && isEmpty && trimmed.length >= MIN_QUERY && (
        <EmptyState title="No results" message={`No ${noun} found for "${trimmed}"`} />
      )}
    </>
  );
}
