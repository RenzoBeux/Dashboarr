import { useCallback, useMemo } from "react";
import { useArrTags } from "@/hooks/use-arr-tags";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useLibraryTagFilterStore } from "@/store/library-tag-filter-store";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import {
  matchesTags,
  resolveTagIds,
  tagFilterKey,
  tagFilterSummary,
} from "@/lib/library-tags";
import type { SheetMultiSection } from "@/components/common/filter-sort-sheet";
import type { ArrTagService } from "@/services/arr-tags";

export interface LibraryTagFilter {
  /**
   * Multi-select section to append to FilterSortSheet's `extraSections`. null
   * when the instance has no tags at all — an empty section is a dead control
   * that reads as "something failed", so it's hidden entirely (the same call
   * the downloads view makes for qBittorrent categories).
   */
  section: SheetMultiSection | null;
  /**
   * For MonitoredLibraryGrid's `extraFilter`. Deliberately `undefined` rather
   * than an always-true function when nothing is selected, so the grid keeps
   * its "No X in library" empty state instead of flipping to "No X match
   * filters". Memo-stable, so the grid's `sorted` memo survives.
   */
  predicate: ((item: { tags?: number[] }) => boolean) | undefined;
  /** Fragment for the FilterSortButton pill ("Anime" / "3 tags"), or null. */
  summary: string | null;
  /** Whether the pill should read as filtered. */
  active: boolean;
}

// Module-level, not an inline []: a fresh array from the selector on every call
// is the classic zustand v5 / useSyncExternalStore re-render loop, and it would
// also invalidate every memo below on each render.
const NO_TAGS: number[] = [];

/**
 * Tag filtering for one *arr library grid (issue #343). Owns the tag query, the
 * persisted per-instance selection, the sheet section, the summary fragment and
 * the grid predicate, so the three views wire it identically instead of
 * re-deriving the same five pieces each.
 *
 * Call this in the view that renders the FilterSortSheet, and pass `predicate`
 * down to the child that renders the grid.
 */
export function useLibraryTagFilter(service: ArrTagService): LibraryTagFilter {
  // Bare target: the library grids follow state.activeInstance[kind], one
  // instance at a time and never aggregated, so this resolves the same instance
  // whose items the grid is showing.
  const { instanceId } = useInstanceTarget(service);
  const tagsQuery = useArrTags(service);
  const { data: tags } = tagsQuery;

  // Whether /tag has actually failed, as opposed to merely not having answered
  // yet — the two must not be conflated, or a persisted selection keeps
  // filtering the grid behind a Tags section that is hidden for having no
  // options, with no Clear to reach. Reuses the aggregate helper because it
  // already encodes the subtle part: TanStack resets a data-less query to
  // "pending" the moment a retry starts, so `isError` alone reads as a first
  // load between attempts.
  const tagsFailed = aggregateMultiInstanceState([tagsQuery]).isAllErrored;

  const key = tagFilterKey(service, instanceId);
  // Subscribe to one bucket, not the whole record: the combined Library tab
  // keeps both MoviesView and TvView mounted, and a zustand subscription
  // bypasses their memo(), so a broader selector would re-render the off-screen
  // sibling on every toggle.
  const storedIds = useLibraryTagFilterStore(
    (s) => s.tagFilters[key] ?? NO_TAGS,
  );
  const setTags = useLibraryTagFilterStore((s) => s.setTags);
  const toggleTag = useLibraryTagFilterStore((s) => s.toggleTag);

  const selectedIds = useMemo(
    () => resolveTagIds(storedIds, tags, tagsFailed),
    [storedIds, tags, tagsFailed],
  );

  const predicate = useMemo(() => {
    if (selectedIds.length === 0) return undefined;
    const set = new Set(selectedIds);
    return (item: { tags?: number[] }) => matchesTags(item, set);
  }, [selectedIds]);

  // Toggling off `selectedIds` rather than the raw stored array is what
  // garbage-collects ids whose tag was deleted upstream, without a destructive
  // background write.
  const onToggle = useCallback(
    (k: string) => toggleTag(key, Number(k), selectedIds),
    [toggleTag, key, selectedIds],
  );
  const onClear = useCallback(() => setTags(key, []), [setTags, key]);

  const section = useMemo<SheetMultiSection | null>(() => {
    if (!tags?.length) return null;
    return {
      multi: true,
      label: "Tags",
      options: tags.map((t) => ({ key: String(t.id), label: t.label })),
      values: selectedIds.map(String),
      onToggle,
      onClear,
    };
  }, [tags, selectedIds, onToggle, onClear]);

  const summary = useMemo(
    () => tagFilterSummary(selectedIds, tags),
    [selectedIds, tags],
  );

  return { section, predicate, summary, active: selectedIds.length > 0 };
}
