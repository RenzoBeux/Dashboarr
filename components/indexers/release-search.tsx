import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { ReleaseCard } from "@/components/indexers/release-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { IndexerSearchAdapter, UnifiedRelease } from "@/lib/indexer-adapter";

// One indexer the search is pinned to, set by the per-indexer Search button in
// the indexer list (#315). Null searches every configured indexer.
export interface SearchScope {
  id: string;
  name: string;
}

// Shared release-search sub-tab of the Indexers screen. The adapter supplies
// the search hook and the (self-contained) grab flow, so this view has no
// kind-specific branches.
export function ReleaseSearch({
  adapter,
  scope,
  onClearScope,
}: {
  adapter: IndexerSearchAdapter;
  scope?: SearchScope | null;
  onClearScope?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingGrab, setPendingGrab] = useState<UnifiedRelease | null>(null);
  // Un-debounced, every keystroke started a fresh all-indexers fan-out under its
  // own queryKey, so nothing deduped or cancelled and the slowest one won — the
  // "searches as soon as you type, then sits on Searching..." report in #314.
  // 300ms matches global search (app/search.tsx).
  const debounced = useDebouncedValue(query.trim(), 300);
  const { data: results, isLoading, isError, error } = adapter.useSearch(debounced, {
    indexerId: scope?.id,
  });

  return (
    <View>
      <TextInput
        placeholder={scope ? `Search ${scope.name}...` : "Search all indexers..."}
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {scope && (
        <Pressable
          onPress={onClearScope}
          hitSlop={6}
          className="flex-row items-center gap-1.5 self-start mb-4 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/40 active:opacity-70"
        >
          <Text className="text-primary text-xs font-medium">
            Only {scope.name}
          </Text>
          <Icon icon={X} size={12} color="#3b82f6" />
        </Pressable>
      )}

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {isError && (
        <ErrorBanner
          error={error}
          title={`Couldn't search ${scope?.name ?? adapter.displayName}`}
        />
      )}

      {!isError && results && results.length === 0 && debounced.length >= 2 && (
        <EmptyState title="No results" message={adapter.emptyResultsHint} />
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
