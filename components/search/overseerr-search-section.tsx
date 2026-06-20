import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Inbox } from "lucide-react-native";
import { SearchSection } from "@/components/search/search-section";
import { PosterCard } from "@/components/overseerr/poster-card";
import { MediaDetailModal } from "@/components/overseerr/media-detail-modal";
import { usePosterCellWidth } from "@/hooks/use-poster-cell";
import { useOverseerrSearch } from "@/hooks/use-overseerr";
import type { OverseerrMediaResult } from "@/lib/types";

// One full grid row at default scale (3 columns) and three rows at Large+ (2
// columns) — a tidy preview either way.
const PREVIEW_LIMIT = 6;

/**
 * Requests section of global search — Seerr media lookup. Reuses the poster grid
 * + MediaDetailModal from the Requests tab; PosterCard already surfaces the
 * available / pending availability indicator, so users see what they own.
 */
export function OverseerrSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const cellWidth = usePosterCellWidth();
  const { data, isLoading, isError, error } = useOverseerrSearch(query);
  const [selected, setSelected] = useState<OverseerrMediaResult | null>(null);

  const all = data?.results ?? [];
  const preview = all.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <SearchSection
        title="Requests"
        icon={Inbox}
        serviceLabel="Seerr"
        total={all.length}
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasMore={all.length > preview.length}
        onShowAll={() => router.push({ pathname: "/requests", params: { tab: "search" } })}
      >
        <View className="flex-row flex-wrap gap-3">
          {preview.map((item) => (
            <PosterCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              onPress={setSelected}
              widthOverride={cellWidth}
            />
          ))}
        </View>
      </SearchSection>

      <MediaDetailModal
        item={selected}
        visible={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
