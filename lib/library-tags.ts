import type { ArrTag } from "@/lib/types";

/**
 * *arr library tags (issue #343) — the pure half of showing tag badges on the
 * poster grid and filtering the grid by tag. Everything here is free of React
 * and of Tailwind class strings: `tailwind.config.ts` only scans app/ and
 * components/, so a className authored in lib/ would never be generated.
 */

// --- Badge geometry ---------------------------------------------------------

/** Hard cap on badges before the +N chip, whatever the cell width allows. */
export const MAX_TAG_BADGES = 3;

/**
 * Badge geometry in REM, mirroring the Tailwind classes on `PosterTagBadges`
 * in components/common/monitored-library-grid.tsx:
 *
 *   text-[0.65rem]  -> fontSize
 *   px-1.5          -> paddingX (0.375rem)
 *   gap-1 (the row) -> gap      (0.25rem)
 *
 * These stay in rem, never points. `inlineRem: false` (metro.config.js) keeps
 * rem a runtime descriptor, so the rendered badge grows with the UI scale —
 * baking a 14pt base in here would fit correctly at scale 1.0 and wrongly at
 * 1.15 / 1.3. Change a class above and you must change the number here, or the
 * arithmetic drifts from what actually renders.
 */
export const TAG_BADGE_REM = {
  fontSize: 0.65,
  paddingX: 0.375,
  gap: 0.25,
} as const;

/**
 * Average advance width of one Latin character as a fraction of the font size,
 * for the system UI font (SF Pro Text / Roboto — the app loads no custom font).
 *
 * The true lowercase average is ~0.52em and *arr lowercases tag labels, so 0.52
 * would be the "accurate" number. 0.6 is deliberate headroom for uppercase- and
 * digit-heavy labels ("4K HDR", "UHD") and for font-medium, because the two
 * failure directions are not symmetric: over-estimating costs one extra "+N",
 * under-estimating overflows the cell.
 */
const AVG_CHAR_EM = 0.6;

/**
 * CJK / Kana / Hangul are full-width, roughly 2x a Latin character. U+2E80 is
 * the first CJK-adjacent block (CJK Radicals Supplement); treating everything
 * from there up as wide also covers emoji, which sit far above it.
 */
const WIDE_CHAR_EM = 1;
const WIDE_CHAR_MIN_CODEPOINT = 0x2e80;

/** Shared reference: untagged items allocate nothing and stay memo-friendly. */
const EMPTY_LABELS: readonly string[] = Object.freeze([]);

function labelWidthEm(label: string): number {
  let em = 0;
  // for..of iterates CODE POINTS, so an emoji counts once. `label.length` would
  // count its surrogate pair twice, and would count a full-width CJK glyph as
  // one narrow character — wrong in the direction that overflows.
  for (const ch of label) {
    em +=
      (ch.codePointAt(0) ?? 0) >= WIDE_CHAR_MIN_CODEPOINT
        ? WIDE_CHAR_EM
        : AVG_CHAR_EM;
  }
  return em;
}

/**
 * Estimated rendered width of one badge, in points.
 *
 * `remPx` is the CURRENT point size of 1rem — `BASE_REM * useUiScale()`, as
 * documented on BASE_REM in hooks/use-ui-scale.ts. It is not redundant with the
 * available width: usePosterCellLayout's cell width is NOT linear in the UI
 * scale (it subtracts a fixed screen width and drops 3 columns to 2 at >= 1.15),
 * so the ratio of cell width to badge width genuinely changes with scale — a
 * 2-up cell at 1.15 fits MORE badges than a 3-up cell at 1.0.
 */
export function tagBadgeWidth(label: string, remPx: number): number {
  const { fontSize, paddingX } = TAG_BADGE_REM;
  return remPx * (labelWidthEm(label) * fontSize + 2 * paddingX);
}

export interface FittedTagBadges {
  /** Labels to render, in the given order. Never empty for a non-empty input. */
  shown: string[];
  /** How many labels were dropped. 0 => render no +N chip. */
  overflow: number;
}

/**
 * The largest prefix of `labels` that fits `availableWidth`, plus the count of
 * the rest. Invariant: `shown.length + overflow === labels.length`.
 *
 * Widths are ESTIMATED, not measured: measuring would mean an onLayout
 * round-trip per cell inside a virtualized FlatList with removeClippedSubviews
 * — two passes, visible reflow, and re-measurement on every recycle, for a
 * decoration. The badge's own `shrink` + numberOfLines is the safety net for
 * what no character average can model.
 */
export function fitTagBadges(
  labels: string[],
  availableWidth: number,
  remPx: number,
): FittedTagBadges {
  const n = labels.length;
  if (n === 0) return { shown: [], overflow: 0 };

  const gap = TAG_BADGE_REM.gap * remPx;
  const widths = labels.map((l) => tagBadgeWidth(l, remPx));

  // Walk DOWN from the cap, never up: dropping a badge ADDS the +N chip, so a
  // set that fits on its own can stop fitting once the chip appears (and the
  // chip itself widens as the count rolls 9 -> 10). An incremental "keep adding
  // while it fits" loop gets this wrong — see the 4-tag case in the tests.
  const start = Math.min(n, MAX_TAG_BADGES);
  let run = 0;
  for (let i = 0; i < start; i++) run += widths[i];

  for (let k = start; k >= 1; k--) {
    const hidden = n - k;
    const used =
      run +
      (k - 1) * gap +
      (hidden > 0 ? gap + tagBadgeWidth(`+${hidden}`, remPx) : 0);
    if (used <= availableWidth) {
      return { shown: labels.slice(0, k), overflow: hidden };
    }
    run -= widths[k - 1]; // prefix sum for the next, shorter k — keeps this O(n)
  }

  // Even one badge over-runs the cell (a single very long tag). Show it anyway
  // and let shrink + numberOfLines ellipsize it: an item that HAS tags must
  // never render an empty row. Note overflow counts only what is truly hidden,
  // so a lone long tag yields 0 — a "+1" there would refer to nothing.
  return { shown: labels.slice(0, 1), overflow: n - 1 };
}

/**
 * Build the grid's `renderTags` from an *arr /tag list. Radarr, Sonarr and
 * Lidarr all model tags the same way — `number[]` on the item plus a flat
 * {id,label} lookup — so every call site shares this instead of re-deriving the
 * O(tags) `.find()` the detail screens use, which would run per visible cell
 * per render here.
 *
 * Unknown ids are dropped, mirroring the detail screens' `.filter(Boolean)`: a
 * tag deleted server-side while the library response is still cached must not
 * render as "undefined".
 */
export function tagLabelResolver<T extends { tags?: number[] }>(
  tagList: ArrTag[] | undefined,
): (item: T) => string[] {
  if (!tagList?.length) return () => EMPTY_LABELS as string[];
  const byId = new Map(tagList.map((t) => [t.id, t.label] as const));
  return (item) => {
    const ids = item.tags;
    if (!ids?.length) return EMPTY_LABELS as string[];
    const out: string[] = [];
    for (const id of ids) {
      const label = byId.get(id);
      if (label) out.push(label);
    }
    // Same shared reference when nothing resolved, so an item whose tags were
    // all deleted stays as memo-friendly as an untagged one.
    return out.length ? out : (EMPTY_LABELS as string[]);
  };
}

// --- Filter logic -----------------------------------------------------------

/**
 * Storage key for one instance's tag selection. Tag ids are a per-instance
 * auto-increment, so a global list would apply the wrong filter after an
 * instance switch — the same reasoning store/releases-filter-store.ts spells
 * out for saved custom filters.
 */
export function tagFilterKey(
  service: string,
  instanceId: string | null,
): string {
  return `${service}:${instanceId ?? "default"}`;
}

/** Shared reference for "nothing selected", so callers keep memo identity. */
const NO_IDS: number[] = [];

/**
 * Project the persisted ids onto the tags the server actually has right now, so
 * a tag deleted upstream silently drops out instead of filtering on a dead id.
 *
 * Pending and failed are deliberately NOT the same case:
 *
 * - While the fetch is in flight the stored ids pass through unchanged. An
 *   item's `tags` array carries ids whether or not we know their labels yet, so
 *   a persisted filter applies on the first frame instead of flashing the
 *   unfiltered library and then snapping.
 * - Once the fetch has actually failed we fail OPEN and drop the selection for
 *   this render. Nothing is written to storage, so it returns intact when the
 *   fetch recovers. Without this the grid stays filtered by ids whose labels
 *   never arrive, while the Tags section — which owns the only Clear action —
 *   is hidden for having no options, leaving the user behind an invisible
 *   filter they cannot see or remove.
 */
export function resolveTagIds(
  stored: number[],
  tags: ArrTag[] | undefined,
  tagsFailed = false,
): number[] {
  if (tagsFailed) return NO_IDS;
  if (!tags) return stored;
  const known = new Set(tags.map((t) => t.id));
  const next = stored.filter((id) => known.has(id));
  // Keep the same reference when nothing was dropped — this feeds a memo chain
  // that ends at the grid's `sorted`, which must not re-sort on every render.
  return next.length === stored.length ? stored : next;
}

/**
 * Filter-summary fragment for the FilterSortButton pill. One tag shows its
 * label (the most information in the least space); several collapse to a count,
 * because concatenating labels blows the pill's numberOfLines={1} at UI scale
 * 1.3. null when nothing is selected, so the caller can .filter(Boolean) it out
 * of the "·"-joined summary.
 */
export function tagFilterSummary(
  ids: number[],
  tags: ArrTag[] | undefined,
): string | null {
  if (ids.length === 0) return null;
  if (ids.length > 1) return `${ids.length} tags`;
  return tags?.find((t) => t.id === ids[0])?.label ?? "1 tag";
}

/**
 * OR across the selection: an item matches if it carries ANY selected tag.
 * That is how *arr's own tag filter behaves, and AND would return zero for
 * almost any two-tag selection.
 *
 * An item with no tags never matches. `tags` is optional on our types purely
 * defensively (*arr always sends at least []); treating undefined as "matches
 * everything" would silently disable the filter against a server that omitted
 * the field, which is the worse failure.
 */
export function matchesTags(
  item: { tags?: number[] },
  selected: Set<number>,
): boolean {
  const own = item.tags;
  if (!own?.length) return false;
  return own.some((id) => selected.has(id));
}
