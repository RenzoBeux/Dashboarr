import {
  buildLibraryIndex,
  matchLibraryItems,
  mergeLibraryFirst,
  normalizeSearchText,
  parseLibraryQuery,
  type LibraryMatchFields,
} from "./library-search";

// The real library items carry dozens of fields the matcher never reads; these
// fixtures stay at the three that actually decide a match.
interface Movie {
  tmdbId: number;
  title: string;
  sortTitle?: string;
  year?: number;
}

function movie(title: string, over: Partial<Movie> = {}): Movie {
  return { tmdbId: over.tmdbId ?? title.length, title, ...over };
}

const fields = (m: Movie): LibraryMatchFields => ({
  title: m.title,
  sortTitle: m.sortTitle,
  year: m.year,
});

const titles = (items: Movie[]) => items.map((m) => m.title);

describe("normalizeSearchText", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeSearchText("Amélie")).toBe("amelie");
    expect(normalizeSearchText("PIÑATA")).toBe("pinata");
  });

  it("collapses punctuation and whitespace to single spaces", () => {
    expect(normalizeSearchText("Marvel's Daredevil")).toBe("marvel s daredevil");
    expect(normalizeSearchText("Spider-Man:  No   Way Home")).toBe(
      "spider man no way home",
    );
  });

  it("keeps non-latin scripts instead of blanking them", () => {
    expect(normalizeSearchText("君の名は。")).toBe("君の名は。");
    expect(normalizeSearchText("Слово")).toBe("слово");
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText("   ")).toBe("");
    expect(() =>
      normalizeSearchText(undefined as unknown as string),
    ).not.toThrow();
    expect(normalizeSearchText(undefined as unknown as string)).toBe("");
  });
});

describe("parseLibraryQuery", () => {
  it("splits a trailing year off the text", () => {
    expect(parseLibraryQuery("inception 2010")).toEqual({
      text: "inception",
      year: 2010,
    });
  });

  it("keeps a bare year as text so the movie '2012' is still findable", () => {
    expect(parseLibraryQuery("2012")).toEqual({ text: "2012" });
  });

  it("ignores an implausible year", () => {
    expect(parseLibraryQuery("blade runner 9999")).toEqual({
      text: "blade runner 9999",
    });
  });

  it("normalizes the query text", () => {
    expect(parseLibraryQuery("  Amélie  ")).toEqual({ text: "amelie" });
  });
});

describe("matchLibraryItems", () => {
  it("ranks exact over prefix over word-boundary over substring (#304)", () => {
    const library = [
      movie("Moonknight Saga"), // substring, mid-word
      movie("The Dark Knight Rises"), // word boundary
      movie("Knight of Cups"), // prefix
      movie("Knight"), // exact
    ];
    expect(titles(matchLibraryItems(library, "knight", fields))).toEqual([
      "Knight",
      "Knight of Cups",
      "The Dark Knight Rises",
      "Moonknight Saga",
    ]);
  });

  it("matches through sortTitle so leading articles don't have to be typed", () => {
    const library = [movie("The Office", { sortTitle: "Office" })];
    expect(titles(matchLibraryItems(library, "office", fields))).toEqual([
      "The Office",
    ]);
  });

  it("matches diacritics typed without accents", () => {
    const library = [movie("Amélie")];
    expect(titles(matchLibraryItems(library, "amelie", fields))).toEqual([
      "Amélie",
    ]);
  });

  it("falls back to out-of-order tokens for multi-word queries", () => {
    const library = [movie("Fear and Loathing in Las Vegas")];
    expect(titles(matchLibraryItems(library, "vegas fear", fields))).toEqual([
      "Fear and Loathing in Las Vegas",
    ]);
  });

  it("does not match a single token that is absent", () => {
    expect(matchLibraryItems([movie("Inception")], "matrix", fields)).toEqual([]);
  });

  it("boosts the year that matches and demotes the one that does not", () => {
    const library = [
      movie("Dune", { tmdbId: 1, year: 1984 }),
      movie("Dune", { tmdbId: 2, year: 2021 }),
    ];
    const out = matchLibraryItems(library, "dune 1984", fields);
    expect(out.map((m) => m.year)).toEqual([1984, 2021]);
  });

  it("breaks score ties with the shorter title first", () => {
    const library = [movie("Alien vs. Predator"), movie("Alien")];
    expect(titles(matchLibraryItems(library, "alien", fields))).toEqual([
      "Alien",
      "Alien vs. Predator",
    ]);
  });

  it("caps the result count at the limit", () => {
    const library = Array.from({ length: 30 }, (_, i) =>
      movie(`Star Trek ${i}`, { tmdbId: i }),
    );
    expect(matchLibraryItems(library, "star trek", fields)).toHaveLength(20);
    expect(matchLibraryItems(library, "star trek", fields, 3)).toHaveLength(3);
    expect(matchLibraryItems(library, "star trek", fields, 0)).toEqual([]);
  });

  it("returns nothing for an empty library or empty query", () => {
    expect(matchLibraryItems([], "dune", fields)).toEqual([]);
    expect(matchLibraryItems(undefined, "dune", fields)).toEqual([]);
    expect(matchLibraryItems([movie("Dune")], "", fields)).toEqual([]);
    expect(matchLibraryItems([movie("Dune")], "   ", fields)).toEqual([]);
  });

  it("does not throw on items with missing optional fields", () => {
    const library = [{ tmdbId: 1, title: "Dune" }];
    expect(() => matchLibraryItems(library, "dune", fields)).not.toThrow();
  });
});

describe("buildLibraryIndex", () => {
  it("pre-normalizes both haystacks", () => {
    const [entry] = buildLibraryIndex(
      [movie("The Office", { sortTitle: "Office, The" })],
      fields,
    );
    expect(entry.title).toBe("the office");
    expect(entry.sortTitle).toBe("office the");
  });

  it("returns an empty index for undefined data (cold cache)", () => {
    expect(buildLibraryIndex(undefined, fields)).toEqual([]);
  });
});

describe("mergeLibraryFirst", () => {
  const libraryKey = (m: Movie) => m.tmdbId;
  const lookupKey = (r: { tmdbId: number }) => r.tmdbId;

  it("puts library matches first and drops their duplicate lookup rows", () => {
    const rows = mergeLibraryFirst({
      libraryMatches: [movie("Dune", { tmdbId: 1 })],
      lookupResults: [{ tmdbId: 1 }, { tmdbId: 2 }],
      libraryKey,
      lookupKey,
    });
    expect(rows.map((r) => r.kind)).toEqual(["library", "lookup"]);
    expect(rows.map((r) => (r.kind === "library" ? r.item.tmdbId : r.item.tmdbId))).toEqual([
      1, 2,
    ]);
  });

  it("keeps the lookup row for a library item cut by the match limit", () => {
    const cut = movie("Dune Part Two", { tmdbId: 2 });
    const shown = matchLibraryItems(
      [movie("Dune", { tmdbId: 1 }), cut],
      "dune",
      fields,
      1,
    );
    const rows = mergeLibraryFirst({
      libraryMatches: shown,
      lookupResults: [{ tmdbId: 1 }, { tmdbId: 2 }],
      libraryKey,
      lookupKey,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("library");
    expect(rows[1]).toEqual({ kind: "lookup", item: { tmdbId: 2 } });
  });

  it("passes lookup results through untouched when nothing matched locally", () => {
    const rows = mergeLibraryFirst({
      libraryMatches: [],
      lookupResults: [{ tmdbId: 7 }],
      libraryKey,
      lookupKey,
    });
    expect(rows).toEqual([{ kind: "lookup", item: { tmdbId: 7 } }]);
  });

  it("renders library matches while the lookup is still undefined", () => {
    const rows = mergeLibraryFirst({
      libraryMatches: [movie("Dune", { tmdbId: 1 })],
      lookupResults: undefined,
      libraryKey,
      lookupKey,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("library");
  });
});
