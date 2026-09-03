import type { QBTorrent } from "@/lib/types";

export type DownloadsSortBy = "speed" | "progress" | "eta" | "added";

/** qBittorrent reports "no estimate" as this many seconds rather than null. */
const ETA_UNKNOWN = 8640000;

/** The fields the ordering reads. Every client's display row satisfies it. */
export interface SortableDownload {
  progress: number;
  dlSpeed: number;
  upSpeed: number;
  eta: number;
  addedOn: number;
}

/** qBittorrent uses 8640000; rtorrent -1; Transmission -1/-2; Deluge 0 or -1. */
export function hasEta(row: Pick<SortableDownload, "eta">): boolean {
  return row.eta > 0 && row.eta < ETA_UNKNOWN;
}

const QB_SORT: Record<
  DownloadsSortBy,
  { sort: keyof QBTorrent; reverse: boolean }
> = {
  speed: { sort: "dlspeed", reverse: true },
  progress: { sort: "progress", reverse: true },
  eta: { sort: "eta", reverse: false },
  added: { sort: "added_on", reverse: true },
};

// Rows with no estimate stay last in both directions, so reversing "soonest
// first" does not fill the widget with every paused and stalled torrent.
export function compareDownloads(
  a: SortableDownload,
  b: SortableDownload,
  sortBy: DownloadsSortBy,
  reverse = false,
): number {
  if (sortBy === "eta" && !(hasEta(a) && hasEta(b))) {
    if (hasEta(a)) return -1;
    if (hasEta(b)) return 1;
    return 0;
  }
  const direction = reverse ? -1 : 1;
  switch (sortBy) {
    case "speed":
      return direction * (b.dlSpeed + b.upSpeed - (a.dlSpeed + a.upSpeed));
    case "progress":
      return direction * (b.progress - a.progress);
    case "eta":
      return direction * (a.eta - b.eta);
    case "added":
      return direction * (b.addedOn - a.addedOn);
  }
}

// The matching sort for qBittorrent's own `/torrents/info`, which the widget
// slices a capped page out of. ETA never flips: 8640000 is the top of that
// axis, so a descending fetch would be a page of nothing but no-estimate rows.
export function qbSortParams(
  sortBy: DownloadsSortBy,
  reverse = false,
): { sort: keyof QBTorrent; reverse: boolean } {
  const base = QB_SORT[sortBy];
  if (sortBy === "eta") return { ...base };
  return { sort: base.sort, reverse: reverse ? !base.reverse : base.reverse };
}
