import { useState } from "react";
import { useRouter } from "expo-router";
import { Radar } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { ReleaseCard } from "@/components/indexers/release-card";
import type { IndexerSearchAdapter, UnifiedRelease } from "@/lib/indexer-adapter";

const PREVIEW_LIMIT = 5;

/**
 * Releases section of global search, one instance per attached indexer proxy
 * (Prowlarr, Jackett). The adapter supplies the search hook and the grab flow,
 * so the section has no kind-specific branches. Collapsed by default since
 * interactive indexer searches are the slowest and the noisiest.
 */
export function ReleaseSearchSection({
  adapter,
  query,
}: {
  adapter: IndexerSearchAdapter;
  query: string;
}) {
  const router = useRouter();
  const { data: results, isLoading, isError, error } = adapter.useSearch(query);
  const [pendingGrab, setPendingGrab] = useState<UnifiedRelease | null>(null);

  const all = results ?? [];
  const preview = all.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Releases"
        icon={Radar}
        serviceLabel={adapter.displayName}
        total={all.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={all.length > preview.length}
        onShowAll={() => router.push(`/indexers?source=${adapter.serviceId}`)}
        defaultExpanded={false}
      >
        {preview.map((release) => (
          <ReleaseCard
            key={release.id}
            release={release}
            onPress={() => setPendingGrab(release)}
          />
        ))}
      </SearchSection>

      <adapter.GrabFlow release={pendingGrab} onClose={() => setPendingGrab(null)} />
    </>
  );
}
