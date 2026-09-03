import {
  compareDownloads,
  hasEta,
  qbSortParams,
  type SortableDownload,
} from "./downloads-sort";

const QB_ETA_UNKNOWN = 8640000;

function row(over: Partial<SortableDownload> = {}): SortableDownload {
  return {
    progress: 0.5,
    dlSpeed: 0,
    upSpeed: 0,
    eta: 60,
    addedOn: 1_700_000_000,
    ...over,
  };
}

function order(
  rows: (SortableDownload & { name: string })[],
  sortBy: Parameters<typeof compareDownloads>[2],
  reverse: boolean,
): string[] {
  return [...rows]
    .sort((a, b) => compareDownloads(a, b, sortBy, reverse))
    .map((r) => r.name);
}

describe("hasEta", () => {
  // qBittorrent reports no estimate as 8640000 seconds, rtorrent as -1,
  // Transmission as -1 or -2, and Deluge as 0 or -1.
  it("rejects every client's no-estimate value", () => {
    expect(hasEta({ eta: 300 })).toBe(true);
    expect(hasEta({ eta: QB_ETA_UNKNOWN })).toBe(false);
    expect(hasEta({ eta: 0 })).toBe(false);
    expect(hasEta({ eta: -1 })).toBe(false);
    expect(hasEta({ eta: -2 })).toBe(false);
  });
});

describe("compareDownloads", () => {
  it("puts the fastest first, and the slowest first when reversed", () => {
    const fast = { ...row({ dlSpeed: 900, upSpeed: 100 }), name: "fast" };
    const slow = { ...row({ dlSpeed: 10, upSpeed: 0 }), name: "slow" };
    expect(order([slow, fast], "speed", false)).toEqual(["fast", "slow"]);
    expect(order([slow, fast], "speed", true)).toEqual(["slow", "fast"]);
  });

  it("reverses progress", () => {
    const nearly = { ...row({ progress: 0.9 }), name: "nearly" };
    const barely = { ...row({ progress: 0.1 }), name: "barely" };
    expect(order([barely, nearly], "progress", false)).toEqual(["nearly", "barely"]);
    expect(order([barely, nearly], "progress", true)).toEqual(["barely", "nearly"]);
  });

  it("reverses added-on", () => {
    const older = { ...row({ addedOn: 1 }), name: "older" };
    const newer = { ...row({ addedOn: 2 }), name: "newer" };
    expect(order([older, newer], "added", false)).toEqual(["newer", "older"]);
    expect(order([older, newer], "added", true)).toEqual(["older", "newer"]);
  });

  it("sorts by soonest ETA, and by longest when reversed", () => {
    const soon = { ...row({ eta: 60 }), name: "soon" };
    const later = { ...row({ eta: 6000 }), name: "later" };
    expect(order([later, soon], "eta", false)).toEqual(["soon", "later"]);
    expect(order([later, soon], "eta", true)).toEqual(["later", "soon"]);
  });

  // Reversing "soonest first" must not promote every paused and stalled
  // torrent to the top of the widget.
  it("keeps torrents with no estimate last in both directions", () => {
    const known = { ...row({ eta: 300 }), name: "known" };
    const qb = { ...row({ eta: QB_ETA_UNKNOWN }), name: "qb" };
    const transmission = { ...row({ eta: -1 }), name: "transmission" };
    for (const reverse of [false, true]) {
      const result = order([qb, transmission, known], "eta", reverse);
      expect(result[0]).toBe("known");
      expect(result.slice(1).sort()).toEqual(["qb", "transmission"]);
    }
  });

  it("treats two unknown estimates as equal rather than NaN", () => {
    const a = row({ eta: QB_ETA_UNKNOWN });
    const b = row({ eta: -1 });
    expect(compareDownloads(a, b, "eta", false)).toBe(0);
    expect(compareDownloads(a, b, "eta", true)).toBe(0);
  });
});

describe("qbSortParams", () => {
  it("asks for the same order the merged list uses", () => {
    expect(qbSortParams("speed")).toEqual({ sort: "dlspeed", reverse: true });
    expect(qbSortParams("progress")).toEqual({ sort: "progress", reverse: true });
    expect(qbSortParams("added")).toEqual({ sort: "added_on", reverse: true });
    expect(qbSortParams("eta")).toEqual({ sort: "eta", reverse: false });
  });

  // The widget slices a capped page out of what qBittorrent returns, so the
  // server-side direction has to flip with the client-side one. Left alone it
  // would show the slowest of the fastest hundred.
  it("flips the server-side direction when the widget is reversed", () => {
    expect(qbSortParams("speed", true)).toEqual({ sort: "dlspeed", reverse: false });
    expect(qbSortParams("added", true)).toEqual({ sort: "added_on", reverse: false });
    expect(qbSortParams("progress", true)).toEqual({ sort: "progress", reverse: false });
  });

  // 8640000 is the top of the ETA axis, so a descending fetch would return a
  // page of nothing but no-estimate torrents and the ones with a real estimate
  // would never arrive.
  it("never flips ETA, whose far end is the no-estimate sentinel", () => {
    expect(qbSortParams("eta", true)).toEqual({ sort: "eta", reverse: false });
  });
});
