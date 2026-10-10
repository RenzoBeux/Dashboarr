import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import {
  SearchResultsList,
  type SearchResultsLabels,
} from "@/components/common/search-results-list";
import {
  SubtitleResultItem,
  resultKey,
} from "@/components/subtitles/subtitle-result-item";
import { SubtitleResultDetailSheet } from "@/components/subtitles/subtitle-result-detail-sheet";
import { toast, toastError } from "@/components/ui/toast";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useBazarrManualSearch,
  useBazarrSubtitleMutation,
} from "@/hooks/use-bazarr-subtitles";
import { downloadSubtitleResult } from "@/services/bazarr-api";
import { normalizeLanguage } from "@/lib/language-codes";
import { lightHaptic } from "@/lib/haptics";
import type { SubtitleTarget } from "@/lib/bazarr-subtitle-tools";
import type { BazarrSubtitleResult } from "@/lib/types";

type SortKey = "score" | "provider";

const LABELS: SearchResultsLabels = {
  searching: "Searching providers…",
  searchingHint: "Bazarr asks every subtitle provider in turn. This can take a minute.",
  longSearchingHint:
    "Still searching. Some providers are slow or rate-limited; Bazarr keeps going even if you leave.",
  timedOut: "The search timed out. Providers may be slow or rate-limited. Try again.",
  emptyTitle: "No subtitles found",
  emptyMessage: "No provider had a match for this file's languages. Pull to search again.",
  filteredEmptyTitle: "No results in this language",
};

/**
 * Bazarr's manual subtitle search for one movie or episode. Bazarr searches
 * every language in the item's profile at once, so the language is a filter
 * on the results, not a search parameter. Picking a result opens its details;
 * Download hands it to Bazarr and returns to the page it came from.
 */
export function SubtitleResultsPicker({
  bazarrId,
  target,
}: {
  bazarrId: string;
  target: SubtitleTarget;
}) {
  const query = useBazarrManualSearch(bazarrId, target);
  const flow = useModalFlow<{ detail: BazarrSubtitleResult }>();
  const [language, setLanguage] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [sheetOpen, setSheetOpen] = useState(false);

  const download = useBazarrSubtitleMutation(
    bazarrId,
    (r: BazarrSubtitleResult, id) => downloadSubtitleResult(target, r, id),
    () => target,
  );

  const results = query.data;
  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results ?? []) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
    return [...counts.entries()].map(([code2, count]) => ({
      code2,
      count,
      name: normalizeLanguage(code2)?.name ?? code2,
    }));
  }, [results]);

  const items = useMemo(() => {
    const list = (results ?? []).filter((r) => language === "all" || r.language === language);
    return [...list].sort((a, b) =>
      sort === "score"
        ? b.score - a.score
        : a.provider.localeCompare(b.provider) || b.score - a.score,
    );
  }, [results, language, sort]);

  // Stable identity keeps the memoized rows from re-rendering on every tick.
  const handleSelect = useCallback(
    (r: BazarrSubtitleResult) => flow.open("detail", r),
    [flow],
  );
  const renderItem = useCallback(
    ({ item }: { item: BazarrSubtitleResult }) => (
      <SubtitleResultItem result={item} onSelect={handleSelect} />
    ),
    [handleSelect],
  );

  const languageName =
    language === "all" ? "All languages" : (languages.find((l) => l.code2 === language)?.name ?? language);

  return (
    <View className="flex-1">
      <SearchResultsList
        query={query}
        items={items}
        keyOf={resultKey}
        renderItem={renderItem}
        labels={LABELS}
        skeletonHeight={96}
        onClearFilters={() => setLanguage("all")}
        filterSort={
          <FilterSortButton
            summary={`${languageName} · ${sort === "score" ? "Best match" : "Provider"}`}
            active={language !== "all" || sort !== "score"}
            onPress={() => {
              lightHaptic();
              setSheetOpen(true);
            }}
          />
        }
      />

      <FilterSortSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter & sort subtitles"
        filterLabel="Language"
        filterOptions={[
          { key: "all", label: `All languages (${results?.length ?? 0})` },
          ...languages.map((l) => ({ key: l.code2, label: `${l.name} (${l.count})` })),
        ]}
        filterValue={language}
        onFilterChange={setLanguage}
        sortOptions={[
          { key: "score", label: "Best match" },
          { key: "provider", label: "Provider" },
        ]}
        sortValue={sort}
        onSortChange={(v) => setSort(v as SortKey)}
      />

      <SubtitleResultDetailSheet
        result={flow.isOpen("detail") ? (flow.payload("detail") ?? null) : null}
        downloading={download.isPending}
        onClose={flow.close}
        onClosed={flow.onClosed}
        onDownload={(r) =>
          download.mutate(r, {
            onSuccess: () => {
              const name = normalizeLanguage(r.language)?.name ?? r.language;
              toast(`Downloading ${name} subtitle…`, "info");
              flow.close();
              // Back to the page the search came from, once the sheet is gone.
              flow.back();
            },
            onError: (err) => toastError("Couldn't download the subtitle", err),
          })
        }
      />
    </View>
  );
}
