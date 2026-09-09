import {
  MAX_TAG_BADGES,
  TAG_BADGE_REM,
  fitTagBadges,
  matchesTags,
  resolveTagIds,
  tagBadgeWidth,
  tagFilterKey,
  tagFilterSummary,
  tagLabelResolver,
} from "./library-tags";
import type { ArrTag } from "@/lib/types";

// The two real layouts usePosterCellLayout produces on a 390pt screen:
//   scale 1.00 -> 3 columns, 113pt cells, 1rem = 14.0pt
//   scale 1.15 -> 2 columns, 172pt cells, 1rem = 16.1pt
const CELL_3UP = 113;
const REM_3UP = 14;
const CELL_2UP = 172;
const REM_2UP = 16.1;

describe("fitTagBadges", () => {
  it("renders nothing for an untagged item", () => {
    expect(fitTagBadges([], CELL_3UP, REM_3UP)).toEqual({
      shown: [],
      overflow: 0,
    });
  });

  it("fits three short tags in a 3-up cell", () => {
    expect(fitTagBadges(["4k", "kids", "anime"], CELL_3UP, REM_3UP)).toEqual({
      shown: ["4k", "kids", "anime"],
      overflow: 0,
    });
  });

  it("drops to two when a fourth tag forces the +N chip in", () => {
    // The case an incremental "add while it fits" loop gets wrong: the first
    // three badges fit on their own (~98.6pt of 113), but adding the "+1" chip
    // pushes them to ~123.5pt, so the answer is two badges and "+2".
    expect(
      fitTagBadges(["4k", "kids", "anime", "french"], CELL_3UP, REM_3UP),
    ).toEqual({ shown: ["4k", "kids"], overflow: 2 });
  });

  it("never loses or invents a label", () => {
    const sets = [
      [],
      ["4k"],
      ["kids", "anime"],
      ["4k", "kids", "anime", "french"],
      ["documentary", "foreign-language", "kids", "4k", "anime", "hdr"],
      ["science-fiction-1980s"],
    ];
    for (const labels of sets) {
      for (const [width, rem] of [
        [CELL_3UP, REM_3UP],
        [CELL_2UP, REM_2UP],
      ]) {
        const { shown, overflow } = fitTagBadges(labels, width, rem);
        expect(shown.length + overflow).toBe(labels.length);
      }
    }
  });

  it("still shows a single over-long tag, with nothing marked hidden", () => {
    // ~125pt estimated against a 113pt cell. It must render (and ellipsize via
    // shrink + numberOfLines) rather than vanish, and overflow must stay 0 —
    // a "+1" here would refer to nothing.
    const fit = fitTagBadges(["science-fiction-1980s"], CELL_3UP, REM_3UP);
    expect(fit.shown).toEqual(["science-fiction-1980s"]);
    expect(fit.overflow).toBe(0);
  });

  it("never shows fewer tags at a larger UI scale", () => {
    // The non-obvious property, and the reason remPx is a separate argument:
    // the column count drops 3 -> 2 at scale >= 1.15, so cells grow faster
    // (1.52x) than the type does (1.15x).
    const labels = ["anime", "french", "action"];
    const small = fitTagBadges(labels, CELL_3UP, REM_3UP);
    const big = fitTagBadges(labels, CELL_2UP, REM_2UP);
    expect(small.shown).toHaveLength(2);
    expect(big.shown.length).toBeGreaterThanOrEqual(small.shown.length);
  });

  it("honours MAX_TAG_BADGES even when more would fit", () => {
    const labels = ["4k", "hd", "sd", "tv", "uk", "us"];
    const fit = fitTagBadges(labels, CELL_2UP, REM_2UP);
    expect(fit.shown).toHaveLength(MAX_TAG_BADGES);
    expect(fit.overflow).toBe(labels.length - MAX_TAG_BADGES);
  });

  it("returns a set that actually fits the cell", () => {
    const labels = ["4k", "kids", "anime", "french"];
    const { shown, overflow } = fitTagBadges(labels, CELL_3UP, REM_3UP);
    const gap = TAG_BADGE_REM.gap * REM_3UP;
    const used =
      shown.reduce((sum, l) => sum + tagBadgeWidth(l, REM_3UP), 0) +
      (shown.length - 1) * gap +
      (overflow > 0 ? gap + tagBadgeWidth(`+${overflow}`, REM_3UP) : 0);
    expect(used).toBeLessThanOrEqual(CELL_3UP);
  });

  it("survives a degenerate width without emptying the row", () => {
    expect(fitTagBadges(["a", "b"], 0, REM_3UP)).toEqual({
      shown: ["a"],
      overflow: 1,
    });
  });
});

describe("tagBadgeWidth", () => {
  it("counts full-width characters as wider than latin ones", () => {
    expect(tagBadgeWidth("日本語", REM_3UP)).toBeGreaterThan(
      tagBadgeWidth("abc", REM_3UP),
    );
  });

  it("counts an emoji once, not as its surrogate pair", () => {
    // "🎬".length is 2; iterating code points is what keeps this honest.
    expect(tagBadgeWidth("🎬", REM_3UP)).toBe(tagBadgeWidth("日", REM_3UP));
  });

  it("fits fewer full-width labels than latin ones of the same length", () => {
    // Same character count on both sides — only the per-glyph width differs, so
    // three latin badges fit a 3-up cell where the CJK set is cut to one.
    const latin = fitTagBadges(["kids", "film", "teen"], CELL_3UP, REM_3UP);
    const cjk = fitTagBadges(["子供向け", "映画作品", "青春物語"], CELL_3UP, REM_3UP);
    expect(latin.shown).toHaveLength(3);
    expect(cjk.shown.length).toBeLessThan(latin.shown.length);
  });
});

describe("tagLabelResolver", () => {
  const tags: ArrTag[] = [
    { id: 1, label: "kids" },
    { id: 2, label: "anime" },
  ];

  it("maps ids to labels in the item's own order", () => {
    const resolve = tagLabelResolver(tags);
    expect(resolve({ tags: [2, 1] })).toEqual(["anime", "kids"]);
  });

  it("drops ids whose tag no longer exists", () => {
    const resolve = tagLabelResolver(tags);
    expect(resolve({ tags: [1, 99] })).toEqual(["kids"]);
  });

  it("reuses one array reference for items with no resolvable tags", () => {
    // The memo-friendliness contract: a refactor to .map().filter() would
    // silently allocate per item per render across the whole grid.
    const resolve = tagLabelResolver(tags);
    expect(resolve({})).toBe(resolve({ tags: [] }));
    expect(resolve({ tags: [99] })).toBe(resolve({}));
  });

  it("resolves nothing while the tag list is still unknown", () => {
    expect(tagLabelResolver(undefined)({ tags: [1] })).toEqual([]);
  });
});

describe("tagFilterKey", () => {
  it("scopes a selection to one service and instance", () => {
    expect(tagFilterKey("radarr", "abc")).toBe("radarr:abc");
    expect(tagFilterKey("sonarr", "abc")).not.toBe(tagFilterKey("radarr", "abc"));
  });

  it("falls back to a stable bucket with no active instance", () => {
    expect(tagFilterKey("radarr", null)).toBe("radarr:default");
  });
});

describe("resolveTagIds", () => {
  const tags: ArrTag[] = [
    { id: 1, label: "kids" },
    { id: 2, label: "anime" },
  ];

  it("drops ids for tags deleted upstream", () => {
    expect(resolveTagIds([1, 99], tags)).toEqual([1]);
  });

  it("keeps the selection while the tag list is still unknown", () => {
    // A pending or failed /tag fetch must not read as "the user cleared it".
    expect(resolveTagIds([1, 99], undefined)).toEqual([1, 99]);
  });

  it("clears the selection when the instance has no tags at all", () => {
    expect(resolveTagIds([1], [])).toEqual([]);
  });

  it("keeps the same reference when nothing was dropped", () => {
    const stored = [1, 2];
    expect(resolveTagIds(stored, tags)).toBe(stored);
  });
});

describe("tagFilterSummary", () => {
  const tags: ArrTag[] = [{ id: 1, label: "kids" }];

  it("contributes nothing when no tag is selected", () => {
    expect(tagFilterSummary([], tags)).toBeNull();
  });

  it("names a single selected tag", () => {
    expect(tagFilterSummary([1], tags)).toBe("kids");
  });

  it("collapses several to a count so the pill stays one line", () => {
    expect(tagFilterSummary([1, 2, 3], tags)).toBe("3 tags");
  });

  it("stays readable when the label has not loaded yet", () => {
    expect(tagFilterSummary([1], undefined)).toBe("1 tag");
  });
});

describe("matchesTags", () => {
  const selected = new Set([1, 2]);

  it("matches an item carrying any selected tag", () => {
    expect(matchesTags({ tags: [2] }, selected)).toBe(true);
    expect(matchesTags({ tags: [5, 1] }, selected)).toBe(true);
  });

  it("rejects an item carrying none of them", () => {
    expect(matchesTags({ tags: [5] }, selected)).toBe(false);
  });

  it("rejects untagged items rather than treating them as a wildcard", () => {
    expect(matchesTags({ tags: [] }, selected)).toBe(false);
    expect(matchesTags({}, selected)).toBe(false);
  });
});
