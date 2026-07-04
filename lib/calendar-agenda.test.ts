import { buildAgenda, pickRadarrDate } from "@/lib/calendar-agenda";
import { getDateOffset } from "@/lib/utils";
import type { RadarrMovie, SonarrCalendarEntry } from "@/lib/types";

// Episodes key off `airDate` verbatim when `airDateUtc` is absent (see
// airDateKey), so we drive the day-window with getDateOffset — deterministic
// regardless of the machine's real date.
function episode(over: Partial<SonarrCalendarEntry>): SonarrCalendarEntry {
  return {
    id: 1,
    seriesId: 10,
    episodeNumber: 2,
    seasonNumber: 1,
    title: "Pilot",
    airDate: getDateOffset(1),
    hasFile: false,
    monitored: true,
    series: { title: "Show", images: [] },
    ...over,
  } as SonarrCalendarEntry;
}

function movie(over: Partial<RadarrMovie>): RadarrMovie {
  return {
    id: 5,
    title: "Film",
    year: 2024,
    hasFile: false,
    monitored: true,
    status: "released",
    isAvailable: true,
    images: [],
    digitalRelease: getDateOffset(1),
    ...over,
  } as RadarrMovie;
}

const BASE = {
  daysAhead: 7,
  radarrReleaseType: "any" as const,
  maxItems: 8,
};

describe("pickRadarrDate", () => {
  it("'any' waterfalls digital → physical → cinemas", () => {
    expect(
      pickRadarrDate(
        movie({ digitalRelease: "2024-01-03", physicalRelease: "2024-02-01", inCinemas: "2023-12-01" }),
        "any",
      ),
    ).toBe("2024-01-03");
    expect(
      pickRadarrDate(
        movie({ digitalRelease: undefined, physicalRelease: "2024-02-01", inCinemas: "2023-12-01" }),
        "any",
      ),
    ).toBe("2024-02-01");
    expect(
      pickRadarrDate(
        movie({ digitalRelease: undefined, physicalRelease: undefined, inCinemas: "2023-12-01" }),
        "any",
      ),
    ).toBe("2023-12-01");
  });

  it("honors an explicit release type", () => {
    const m = movie({ digitalRelease: "2024-01-03", inCinemas: "2023-12-01" });
    expect(pickRadarrDate(m, "cinemas")).toBe("2023-12-01");
    expect(pickRadarrDate(m, "physical")).toBeNull();
  });
});

describe("buildAgenda", () => {
  it("keeps only items within [today, today + daysAhead]", () => {
    const sonarr = [
      {
        instanceId: "s1",
        entries: [
          episode({ id: 1, airDate: getDateOffset(0), series: { title: "Today", images: [] } as any }),
          episode({ id: 2, airDate: getDateOffset(-2), series: { title: "Past", images: [] } as any }),
          episode({ id: 3, airDate: getDateOffset(9), series: { title: "TooFar", images: [] } as any }),
        ],
      },
    ];
    const items = buildAgenda({ ...BASE, sonarr, radarr: [] });
    expect(items.map((i) => i.title)).toEqual(["Today"]);
  });

  it("merges Sonarr + Radarr, sorted by date then title", () => {
    const sonarr = [
      {
        instanceId: "s1",
        entries: [
          episode({ id: 1, airDate: getDateOffset(2), series: { title: "Bravo", images: [] } as any }),
        ],
      },
    ];
    const radarr = [
      {
        instanceId: "r1",
        entries: [
          movie({ id: 9, title: "Alpha", digitalRelease: getDateOffset(2) }),
          movie({ id: 8, title: "Zeta", digitalRelease: getDateOffset(1) }),
        ],
      },
    ];
    const items = buildAgenda({ ...BASE, sonarr, radarr });
    // Day 1 (Zeta), then day 2 sorted by title (Alpha, Bravo).
    expect(items.map((i) => i.title)).toEqual(["Zeta", "Alpha", "Bravo"]);
    expect(items[0].kind).toBe("movie");
  });

  it("caps to maxItems", () => {
    const entries = Array.from({ length: 12 }, (_, n) =>
      episode({ id: n, airDate: getDateOffset(1), series: { title: `S${n}`, images: [] } as any }),
    );
    const items = buildAgenda({ ...BASE, maxItems: 5, sonarr: [{ instanceId: "s1", entries }], radarr: [] });
    expect(items).toHaveLength(5);
  });

  it("maps subtitle, route, id, and prefers the public remoteUrl poster only", () => {
    const sonarr = [
      {
        instanceId: "s1",
        entries: [
          episode({
            id: 7,
            seriesId: 42,
            seasonNumber: 3,
            episodeNumber: 4,
            title: "Finale",
            airDate: getDateOffset(1),
            series: {
              title: "Show",
              images: [
                { coverType: "poster", url: "/local/proxy.jpg", remoteUrl: "https://image.tmdb.org/t/p/original/x.jpg" },
              ],
            } as any,
          }),
        ],
      },
    ];
    const [item] = buildAgenda({ ...BASE, sonarr, radarr: [] });
    expect(item.subtitle).toBe("S03E04 — Finale");
    expect(item.route).toBe("/series/42?instanceId=s1");
    expect(item.id).toBe("ep-s1-7");
    // remoteUrl downscaled to w500, never the local proxy url.
    expect(item.posterUrl).toBe("https://image.tmdb.org/t/p/w500/x.jpg");
  });

  it("returns null poster when only a local proxy url is present", () => {
    const radarr = [
      {
        instanceId: "r1",
        entries: [
          movie({
            id: 3,
            title: "NoRemote",
            digitalRelease: getDateOffset(1),
            images: [{ coverType: "poster", url: "/local/only.jpg", remoteUrl: "" } as any],
          }),
        ],
      },
    ];
    const [item] = buildAgenda({ ...BASE, sonarr: [], radarr });
    expect(item.posterUrl).toBeNull();
  });
});
