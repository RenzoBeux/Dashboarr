import {
  isEveryReleaseKind,
  pickRadarrReleaseDate,
  radarrPendingTime,
  radarrReleaseTime,
  RADARR_RELEASE_KINDS,
} from "@/lib/radarr-release-date";
import type { RadarrMovie } from "@/lib/types";

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
    ...over,
  } as RadarrMovie;
}

const ALL = [...RADARR_RELEASE_KINDS];
const iso = (d: string) => new Date(d).getTime();

describe("pickRadarrReleaseDate", () => {
  const full = movie({
    inCinemas: "2024-01-01",
    digitalRelease: "2024-03-01",
    physicalRelease: "2024-04-01",
  });

  it("waterfalls digital → physical → cinemas within the selection", () => {
    expect(pickRadarrReleaseDate(full, ALL)).toBe("2024-03-01");
    expect(pickRadarrReleaseDate(full, ["physical", "cinemas"])).toBe("2024-04-01");
    expect(pickRadarrReleaseDate(full, ["cinemas"])).toBe("2024-01-01");
  });

  it("skips a selected kind the movie doesn't have", () => {
    const m = movie({ inCinemas: "2024-01-01", physicalRelease: "2024-04-01" });
    expect(pickRadarrReleaseDate(m, ["digital", "physical"])).toBe("2024-04-01");
    expect(pickRadarrReleaseDate(m, ["digital", "cinemas"])).toBe("2024-01-01");
  });

  it("returns null when the movie has none of the selected dates", () => {
    const m = movie({ inCinemas: "2024-01-01" });
    expect(pickRadarrReleaseDate(m, ["digital"])).toBeNull();
    expect(pickRadarrReleaseDate(m, ["digital", "physical"])).toBeNull();
  });
});

describe("isEveryReleaseKind", () => {
  it("is true only when all three kinds are present", () => {
    expect(isEveryReleaseKind(ALL)).toBe(true);
    expect(isEveryReleaseKind(["physical", "digital", "cinemas"])).toBe(true);
    expect(isEveryReleaseKind(["digital", "physical"])).toBe(false);
    expect(isEveryReleaseKind([])).toBe(false);
  });
});

describe("radarrPendingTime", () => {
  // A cinema-only-available movie: Radarr dates it from its theatrical run,
  // which is the "overdue weeks early" complaint behind issue #355.
  const inCinemasNow = movie({
    minimumAvailability: "inCinemas",
    releaseDate: "2024-01-01",
    inCinemas: "2024-01-01",
    digitalRelease: "2024-03-01",
  });

  it("defers to Radarr's own release date when every kind is selected", () => {
    expect(radarrPendingTime(inCinemasNow, ALL)).toBe(iso("2024-01-01"));
    expect(radarrPendingTime(inCinemasNow, ALL)).toBe(
      radarrReleaseTime(inCinemasNow),
    );
  });

  it("treats an empty selection as 'any' rather than hiding everything", () => {
    expect(radarrPendingTime(inCinemasNow, [])).toBe(
      radarrReleaseTime(inCinemasNow),
    );
  });

  it("uses the picked kind's date when the selection is narrowed", () => {
    expect(radarrPendingTime(inCinemasNow, ["digital"])).toBe(iso("2024-03-01"));
    expect(radarrPendingTime(inCinemasNow, ["cinemas"])).toBe(iso("2024-01-01"));
  });

  it("drops a movie missing every picked kind", () => {
    expect(radarrPendingTime(inCinemasNow, ["physical"])).toBeNull();
    expect(
      radarrPendingTime(movie({ releaseDate: "2024-01-01" }), ["digital"]),
    ).toBeNull();
  });

  it("ignores unparsable dates", () => {
    const m = movie({ digitalRelease: "not-a-date" });
    expect(radarrPendingTime(m, ["digital"])).toBeNull();
  });
});
