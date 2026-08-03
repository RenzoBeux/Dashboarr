import { useState } from "react";
import { View, Text } from "react-native";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { ReleaseCard } from "@/components/indexers/release-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { IndexerSearchAdapter, UnifiedRelease } from "@/lib/indexer-adapter";

// Shared release-search sub-tab of the Indexers screen. The adapter supplies
// the search hook and the (self-contained) grab flow, so this view has no
// kind-specific branches.
export function ReleaseSearch({ adapter }: { adapter: IndexerSearchAdapter }) {
  const [query, setQuery] = useState("");
  const [pendingGrab, setPendingGrab] = useState<UnifiedRelease | null>(null);
  // Un-debounced, every keystroke started a fresh all-indexers fan-out under its
  // own queryKey, so nothing deduped or cancelled and the slowest one won — the
  // "searches as soon as you type, then sits on Searching..." report in #314.
  // 300ms matches global search (app/search.tsx).
  const debounced = useDebouncedValue(query.trim(), 300);
  const { data: results, isLoading, isError, error } = adapter.useSearch(debounced);

  return (
    <View>
      <TextInput
        placeholder="Search all indexers..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {isError && (
        <ErrorBanner
          error={error}
          title={`Couldn't search ${adapter.displayName}`}
        />
      )}

      {!isError && results && results.length === 0 && debounced.length >= 2 && (
        <EmptyState title="No results" />
      )}

      {results && results.length > 0 && (
        <View className="gap-2">
          {results.slice(0, 50).map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              onPress={() => setPendingGrab(release)}
            />
          ))}
        </View>
      )}

      <adapter.GrabFlow release={pendingGrab} onClose={() => setPendingGrab(null)} />
    </View>
  );
}
