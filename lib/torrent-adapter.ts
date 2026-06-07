import type {
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import type { ComponentType } from "react";
import type { ServiceId } from "@/lib/constants";
import type { DownloadsSortKey } from "@/store/sort-store";

// Normalized status surface shared by every torrent component (the downloads
// view, the dashboard download card). Each adapter maps its client-specific
// states (qBittorrent's big TorrentState union, rtorrent's d.state/is_active/
// complete flags) into this union so filtering + badge color live in one place.
export type TorrentStatus =
  | "downloading"
  | "seeding"
  | "paused"
  | "stalled"
  | "checking"
  | "queued"
  | "errored"
  | "other";

// One normalized torrent row. Superset covering the list row AND the dashboard
// cards. Fields a client can't supply cheaply default to neutral values
// (0 / "" / undefined) rather than being optional everywhere.
export interface UnifiedTorrent {
  hash: string;
  name: string;
  sizeBytes: number;
  progress: number; // 0..1
  dlSpeed: number; // bytes/s
  upSpeed: number; // bytes/s
  // Seconds remaining. qBittorrent uses 8640000 as its "unknown" sentinel; the
  // shared row treats eta <= 0 or >= 8640000 as "no ETA".
  eta: number;
  ratio: number; // share ratio as a float
  status: TorrentStatus;
  // Display label for the badge (the raw-ish client status string). `status`
  // drives logic; this drives what the badge shows.
  statusLabel: string;
  // Optional badge-color override. When set the shared row uses it verbatim;
  // otherwise it falls back to torrentBadgeVariant(status). qBittorrent sets
  // this to preserve its exact per-state colors (e.g. stalledUP stays green);
  // rtorrent omits it and uses the normalized default.
  badgeVariant?: "downloading" | "seeding" | "paused" | "error" | "default";
  // Category (qBittorrent) / custom1 label (rtorrent). Single string.
  label: string;
  tags: string; // qBittorrent comma tags; rtorrent ""
  addedOn: number; // unix seconds
  completedOn?: number; // unix seconds; undefined when the client doesn't expose it
  savePath: string;
  amountLeft: number; // bytes remaining
  downloaded: number; // bytes
  uploaded: number; // bytes
  errorMessage?: string; // non-empty rtorrent d.message; undefined for qBittorrent
}

// Global transfer stats for the downloads header + the dashboard speed widget.
// Producers fill what their source exposes cheaply: the per-tab header reads
// current speeds; the speed-stats card reads speeds + lifetime totals. Fields a
// given producer can't supply are left at 0.
export interface TorrentGlobalStats {
  dlSpeed: number; // bytes/s now
  upSpeed: number; // bytes/s now
  dlTotalLifetime: number; // bytes
  upTotalLifetime: number; // bytes
  dlLimit: number; // bytes/s, 0 = unlimited
  upLimit: number; // bytes/s, 0 = unlimited
}

// Capability flags so the shared downloads view conditionally renders features
// one client has and the other lacks.
export interface TorrentCapabilities {
  // Alternative ("turtle") speed-limit mode toggle — qBittorrent only.
  altSpeed: boolean;
  // Per-torrent share/ratio limits sheet — qBittorrent only for v1.
  shareLimits: boolean;
  // List hook returns real pagination (hasNextPage / fetchNextPage). qBittorrent
  // pages server-side; rtorrent fetches everything in one multicall.
  serverSidePaging: boolean;
  // Files/trackers detail screen — qBittorrent only for v1 (rtorrent rows don't
  // drill in).
  perTorrentFiles: boolean;
  // Global download/upload speed-limit controls (both clients).
  globalSpeedLimits: boolean;
  // Multiple categories + tags (qBittorrent) vs a single label (rtorrent).
  categories: boolean;
  // Delete-with-data only takes effect when ruTorrent's erasedata plugin is
  // installed; the delete sheet surfaces a caveat when this is set (rtorrent).
  deleteWithDataCaveat?: boolean;
}

// Tab filter — same vocabulary the FilterSortSheet already shows for downloads.
export type TorrentFilterType =
  | "all"
  | "downloading"
  | "seeding"
  | "completed"
  | "paused";

// Options the shared view passes to the list hook. qBittorrent maps these to
// server-side params; rtorrent applies them client-side.
export interface TorrentListFilter {
  filter: TorrentFilterType;
  sort: DownloadsSortKey;
  // Category filter (qBittorrent only — clients without `capabilities.categories`
  // ignore it). undefined → all categories, "" → uncategorized, name → that
  // category. The view maps its "all" sentinel to undefined before passing.
  category?: string;
}

// Uniform list result. THE abstraction that hides server-vs-client pagination:
// qBittorrent wraps useInfiniteQuery (real pages); rtorrent wraps useQuery
// (fetch-all, hasNextPage:false, fetchNextPage no-op). The view reads
// `torrents` and renders without knowing which client it's on.
export interface TorrentListResult {
  torrents: UnifiedTorrent[];
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  refetch: () => Promise<unknown>;
}

// Shared adapter: each torrent client implements one of these and the shared
// downloads view branches on no client-specific knowledge beyond what the
// adapter + capability flags expose.
export interface TorrentAdapter {
  serviceId: ServiceId;
  displayName: string;
  capabilities: TorrentCapabilities;

  // Detail-screen deep-link for a single torrent (only used when
  // capabilities.perTorrentFiles is true).
  detailRoute: (hash: string) => string;

  // The list hook — abstracts server-vs-client pagination (see TorrentListResult).
  useTorrents: (opts: TorrentListFilter, instanceId?: string) => TorrentListResult;

  // Category names for the category filter. Always called by the shared view
  // (so it must be a stable hook), but only surfaced when
  // capabilities.categories is true. Clients without categories return []. The
  // returned names map 1:1 onto the values the view passes back via
  // TorrentListFilter.category.
  useCategories: (instanceId?: string) => string[];

  // Global transfer stats for the per-tab speed header.
  useGlobalStats: (instanceId?: string) => UseQueryResult<TorrentGlobalStats>;

  // Per-instance query options for `useQueries` fan-outs in dashboard widgets
  // that aggregate across every enabled instance. `select` already maps to the
  // normalized shape.
  globalStatsQueryOptions: (
    instanceId: string,
  ) => UseQueryOptions<unknown, Error, TorrentGlobalStats>;
  torrentsQueryOptions: (
    instanceId: string,
  ) => UseQueryOptions<unknown, Error, UnifiedTorrent[]>;

  usePauseTorrent: (instanceId?: string) => UseMutationResult<unknown, Error, string[]>;
  useResumeTorrent: (instanceId?: string) => UseMutationResult<unknown, Error, string[]>;
  useDeleteTorrent: (
    instanceId?: string,
  ) => UseMutationResult<unknown, Error, { hashes: string[]; deleteFiles?: boolean }>;
  useAddTorrent: (
    instanceId?: string,
  ) => UseMutationResult<unknown, Error, { uri: string; label?: string; savePath?: string }>;

  // Assign/clear a torrent's category (qBittorrent only — gated by
  // capabilities.categories). category "" clears it. Always called by the
  // shared view (like useCategories), so clients without categories return a
  // stub mutation that's never invoked.
  useSetCategory: (
    instanceId?: string,
  ) => UseMutationResult<unknown, Error, { hashes: string[]; category: string }>;

  // Optional self-contained speed-limits header control (button + sheet + its
  // own hooks). Rendered in the speed-summary row when present. Owning all the
  // client-specific speed-limit hooks here keeps the shared view free of any
  // optional-hook (rules-of-hooks) hazard.
  SpeedLimitsControl?: ComponentType;
}

// Maps a normalized status to the shared Badge component's variant vocabulary —
// mirrors usenetBadgeVariant.
export function torrentBadgeVariant(
  status: TorrentStatus,
): "downloading" | "seeding" | "paused" | "error" | "default" {
  switch (status) {
    case "downloading":
      return "downloading";
    case "seeding":
      return "seeding";
    case "paused":
      return "paused";
    case "errored":
      return "error";
    case "stalled":
    case "checking":
    case "queued":
    case "other":
      return "default";
  }
}
