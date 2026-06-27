import type { TorrentListFilter, UnifiedTorrent } from "@/lib/torrent-adapter";

// Client-side filter + sort for torrent clients whose API returns the whole
// library in one call with no server-side paging/sort/filter (rtorrent's
// d.multicall2, Transmission's torrent-get). qBittorrent does these server-side
// instead. Shared so both client-side adapters stay in lockstep.
export function applyFilterSort(
  list: UnifiedTorrent[],
  opts: TorrentListFilter,
): UnifiedTorrent[] {
  let out = list;
  if (opts.filter !== "all") {
    out = out.filter((t) => {
      switch (opts.filter) {
        case "downloading":
          return t.status === "downloading" || t.status === "stalled";
        case "seeding":
          return t.status === "seeding";
        case "completed":
          return t.progress >= 1;
        case "paused":
          return t.status === "paused";
        default:
          return true;
      }
    });
  }
  const sorted = [...out];
  switch (opts.sort) {
    case "progress-desc":
      sorted.sort((a, b) => b.progress - a.progress);
      break;
    case "progress-asc":
      sorted.sort((a, b) => a.progress - b.progress);
      break;
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "size-desc":
      sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
      break;
    case "added-desc":
      sorted.sort((a, b) => b.addedOn - a.addedOn);
      break;
  }
  return sorted;
}
