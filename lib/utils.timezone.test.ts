import { airDateKey, releaseDateKey } from "./utils";

// Instants below are built from LOCAL components (new Date(y, m, d, h)) so
// these tests are deterministic in any host timezone. Runtime process.env.TZ
// changes are NOT honored by V8's cached timezone inside Jest workers, so we
// can't pin a named zone per-suite; pin one for the whole run from the CLI
// instead (e.g. `TZ=Asia/Tokyo pnpm test`).

describe("airDateKey", () => {
  it("places an episode on the local day of airDateUtc, not the network airDate", () => {
    // Regression for issue #86: a show airing 01:00 local on Jan 7 carries
    // the previous day's network airDate for viewers east of the network
    // (e.g. a European or Asian viewer of a US show). Sonarr web shows
    // Jan 7; grouping by airDate showed Jan 6 — one day early.
    const airsEarlyLocal = new Date(2026, 0, 7, 1, 0, 0);
    expect(
      airDateKey({
        airDate: "2026-01-06",
        airDateUtc: airsEarlyLocal.toISOString(),
      }),
    ).toBe("2026-01-07");
  });

  it("keeps an episode on the airDate day when it airs within that local day", () => {
    // Parity with the #77/#100/#103 behavior for viewers in the network's
    // timezone (e.g. US viewer + US show): Tuesday evening stays Tuesday.
    const airsSameLocalDay = new Date(2026, 0, 6, 23, 0, 0);
    expect(
      airDateKey({
        airDate: "2026-01-06",
        airDateUtc: airsSameLocalDay.toISOString(),
      }),
    ).toBe("2026-01-06");
  });

  it("falls back to airDate when airDateUtc is missing", () => {
    expect(airDateKey({ airDate: "2026-01-06" })).toBe("2026-01-06");
  });

  it("falls back to airDate when airDateUtc is unparsable", () => {
    expect(
      airDateKey({ airDate: "2026-01-06", airDateUtc: "not-a-date" }),
    ).toBe("2026-01-06");
  });

  it("returns null when neither field is usable", () => {
    expect(airDateKey({})).toBeNull();
    expect(airDateKey({ airDateUtc: "garbage" })).toBeNull();
  });
});

describe("releaseDateKey", () => {
  it("returns the local day of an ISO datetime", () => {
    // For any non-UTC host at least one of these crosses the UTC day
    // boundary, where the old `.split("T")[0]` returned the wrong day.
    const lateEvening = new Date(2026, 0, 6, 23, 0, 0);
    expect(releaseDateKey(lateEvening.toISOString())).toBe("2026-01-06");
    const earlyMorning = new Date(2026, 0, 7, 1, 0, 0);
    expect(releaseDateKey(earlyMorning.toISOString())).toBe("2026-01-07");
  });

  it("returns date-only strings verbatim", () => {
    expect(releaseDateKey("2026-01-06")).toBe("2026-01-06");
  });

  it("returns null for missing or unparsable input", () => {
    expect(releaseDateKey(undefined)).toBeNull();
    expect(releaseDateKey(null)).toBeNull();
    expect(releaseDateKey("garbage")).toBeNull();
  });
});
