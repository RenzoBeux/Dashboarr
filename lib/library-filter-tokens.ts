/**
 * Applied-filter tokens for a library screen: one removable chip per filter or
 * sort that differs from its default, shown under the library search field.
 * Pure, so the Movies and TV screens build them the same way and the rules are
 * unit-tested.
 */

export interface FilterToken {
  key: string;
  /** Visible chip text. */
  label: string;
  /** Screen-reader name of the chip's button, e.g. "Remove filter: Missing". */
  a11yLabel: string;
  onRemove: () => void;
}

interface ChoiceOption<K extends string> {
  key?: K;
  value?: K;
  label: string;
}

/**
 * A single-choice filter (or the sort) as a token, or null at its default.
 * Options may name their value `key` (FilterSortSheet options) or `value`
 * (MONITOR_FILTER_OPTIONS); both are accepted so callers pass them as they are.
 */
export function choiceToken<K extends string>(o: {
  key: string;
  value: K;
  defaultValue: K;
  options: readonly ChoiceOption<K>[];
  /** "sort" chips read "Sorted by …" and reset instead of remove. */
  kind?: "filter" | "sort";
  reset: () => void;
}): FilterToken | null {
  if (o.value === o.defaultValue) return null;
  const label =
    o.options.find((opt) => (opt.key ?? opt.value) === o.value)?.label ??
    o.value;
  return o.kind === "sort"
    ? {
        key: o.key,
        label: `Sorted by ${label}`,
        a11yLabel: `Reset sort: ${label}`,
        onRemove: o.reset,
      }
    : {
        key: o.key,
        label,
        a11yLabel: `Remove filter: ${label}`,
        onRemove: o.reset,
      };
}

/**
 * The tag filter as a token, from useLibraryTagFilter's summary ("4K",
 * "2 tags") and its section's clear. null when no tag is selected or the
 * instance has no tags to clear.
 */
export function tagToken(
  summary: string | null,
  clear: (() => void) | undefined,
): FilterToken | null {
  if (!summary || !clear) return null;
  return {
    key: "tags",
    label: summary,
    a11yLabel: `Remove tag filter: ${summary}`,
    onRemove: clear,
  };
}

/** Drops the nulls, keeping the caller's order. */
export function filterTokens(parts: (FilterToken | null)[]): FilterToken[] {
  return parts.filter((t): t is FilterToken => t !== null);
}

/** Name of the search field's filter button, with how many choices are set. */
export function filterSortA11yLabel(activeCount: number): string {
  return activeCount > 0
    ? `Filter and sort, ${activeCount} active`
    : "Filter and sort";
}

/**
 * How many items match the search but are kept out by the screen's other
 * filters: the "N more hidden by filters" hint. 0 without a search.
 */
export function countHiddenMatches<T>(
  items: readonly T[] | undefined,
  search: ((item: T) => boolean) | undefined,
  scope: (item: T) => boolean,
): number {
  if (!search || !Array.isArray(items)) return 0;
  let n = 0;
  for (const item of items) if (search(item) && !scope(item)) n++;
  return n;
}
