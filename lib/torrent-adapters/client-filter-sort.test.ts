import { applyFilterSort } from "@/lib/torrent-adapters/client-filter-sort";
import type { TorrentStatus, UnifiedTorrent } from "@/lib/torrent-adapter";

// applyFilterSort is the shared client-side filter+sort for every torrent
// client whose API hands back the whole library in one call (rtorrent's
// d.multicall2, Transmission's torrent-get, Deluge's core.get_torrents_status).
// Those three adapters do no filtering of their own, so this pure function IS
// the Downloads list's behaviour for all of them.

function t(over: Partial<UnifiedTorrent> & { name: string }): UnifiedTorrent {
  return {
    hash: over.name.toLowerCase(),
    sizeBytes: 0,
    progress: 0,
    dlSpeed: 0,
    upSpeed: 0,
    eta: 0,
    ratio: 0,
    status: "other" as TorrentStatus,
    statusLabel: "Other",
    label: "",
    tags: "",
    addedOn: 0,
    savePath: "/downloads",
    amountLeft: 0,
    downloaded: 0,
    uploaded: 0,
    ...over,
  };
}

const DOWNLOADING = t({ name: "downloading", status: "downloading", progress: 0.4 });
const STALLED = t({ name: "stalled", status: "stalled", progress: 0.1 });
const SEEDING = t({ name: "seeding", status: "seeding", progress: 1 });
const PAUSED_PARTIAL = t({ name: "paused-partial", status: "paused", progress: 0.5 });
const PAUSED_DONE = t({ name: "paused-done", status: "paused", progress: 1 });
const ERRORED = t({ name: "errored", status: "errored", progress: 0.9 });

const ALL = [DOWNLOADING, STALLED, SEEDING, PAUSED_PARTIAL, PAUSED_DONE, ERRORED];

const names = (list: UnifiedTorrent[]) => list.map((x) => x.name);

describe("applyFilterSort — filters", () => {
  it("passes everything through on 'all'", () => {
    expect(names(applyFilterSort(ALL, { filter: "all", sort: "added-desc" }))).toEqual(
      names(ALL),
    );
  });

  it("counts stalled torrents as downloading", () => {
    // Deliberate: a started torrent with no peers is still the user's idea of
    // "downloading", and rtorrent/Transmission/Deluge all report that as a
    // separate state rather than a zero-rate download.
    expect(
      names(applyFilterSort(ALL, { filter: "downloading", sort: "added-desc" })),
    ).toEqual(["downloading", "stalled"]);
  });

  it("filters seeding by status, not by progress", () => {
    // paused-done is at 100% but stopped — it must not show up under Seeding.
    expect(names(applyFilterSort(ALL, { filter: "seeding", sort: "added-desc" }))).toEqual(
      ["seeding"],
    );
  });

  it("filters completed by progress, not by status", () => {
    // Mirror image of the above: a paused 100% torrent IS completed.
    expect(
      names(applyFilterSort(ALL, { filter: "completed", sort: "added-desc" })),
    ).toEqual(["seeding", "paused-done"]);
  });

  it("filters paused by status regardless of progress", () => {
    expect(names(applyFilterSort(ALL, { filter: "paused", sort: "added-desc" }))).toEqual(
      ["paused-partial", "paused-done"],
    );
  });
});

describe("applyFilterSort — sorts", () => {
  const list = [
    t({ name: "beta", progress: 0.2, sizeBytes: 300, addedOn: 20 }),
    t({ name: "alpha", progress: 0.9, sizeBytes: 100, addedOn: 30 }),
    t({ name: "gamma", progress: 0.5, sizeBytes: 200, addedOn: 10 }),
  ];

  it("sorts by progress descending", () => {
    expect(names(applyFilterSort(list, { filter: "all", sort: "progress-desc" }))).toEqual(
      ["alpha", "gamma", "beta"],
    );
  });

  it("sorts by progress ascending", () => {
    expect(names(applyFilterSort(list, { filter: "all", sort: "progress-asc" }))).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
  });

  it("sorts by name ascending", () => {
    expect(names(applyFilterSort(list, { filter: "all", sort: "name-asc" }))).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("sorts by size descending", () => {
    expect(names(applyFilterSort(list, { filter: "all", sort: "size-desc" }))).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
  });

  it("sorts by added date descending", () => {
    expect(names(applyFilterSort(list, { filter: "all", sort: "added-desc" }))).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("never sorts the caller's array in place", () => {
    // The adapters pass the React Query cache entry straight in; an in-place
    // sort would mutate cached data other observers are still rendering.
    const input = [...list];
    applyFilterSort(input, { filter: "all", sort: "name-asc" });
    expect(names(input)).toEqual(["beta", "alpha", "gamma"]);
  });
});
