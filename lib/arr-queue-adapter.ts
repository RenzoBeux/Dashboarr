import type { LucideIcon } from "lucide-react-native";
import type { ServiceId } from "@/lib/constants";

// A single queue row, normalized so the shared ArrQueueCard renders with no
// service-specific knowledge. Radarr/Sonarr/Lidarr adapters map their raw
// queue records (movies / episodes / albums) into this shape.
export interface ArrQueueItem {
  // Queue record id — unique within its instance, used for the React key.
  id: number;
  posterUrl: string | null;
  title: string;
  subtitle?: string;
  // Corner badge text (the release quality, e.g. "WEBDL-1080p").
  qualityLabel: string;
  // Download progress, 0..1.
  progress: number;
  // Detail-screen deep link already carrying `?instanceId=`, or null when the
  // underlying media record id is unavailable (then the tile doesn't navigate).
  detailPath: string | null;
}

// Shared adapter: every *arr service that exposes a download queue implements
// one of these, and ArrQueueCard branches on nothing beyond what it exposes.
// Mirrors the UsenetAdapter pattern used by the SABnzbd/NZBGet queue widget.
//
// `fetchQueue`/`fetchWanted` return the RAW service responses and cache under
// the SAME keys the per-service hooks (useRadarrQueue etc.) use, so the widget
// shares their cache entry instead of issuing a duplicate request. The card
// then normalizes via `toItems`/`wantedCount` — normalization must stay OUT of
// the queryFn, or the cached shape would diverge from those shared consumers.
export interface ArrQueueAdapter {
  serviceId: ServiceId;
  // Used for the card title (`${displayName} Queue`) and empty-state copy.
  displayName: string;
  // Tab route for the header link + the trailing "View All" tile.
  listRoute: string;
  // Empty-queue copy, e.g. "No movies in queue".
  emptyQueueLabel: string;
  // Corner badge background — each service gets its own accent.
  badgeColor: string;
  // Poster fallback hint for MediaPosterTile. Radarr → "movie", Sonarr → "tv".
  mediaType?: "movie" | "tv";
  // Explicit poster fallback icon (Lidarr uses Disc3 since it isn't movie/tv).
  fallbackIcon?: LucideIcon;

  queueQueryKey: (instanceId: string) => readonly unknown[];
  wantedQueryKey: (instanceId: string) => readonly unknown[];

  // Fetch the raw service queue response (same shape the per-service hook
  // caches under the shared key).
  fetchQueue: (instanceId: string) => Promise<unknown>;
  // Normalize a cached raw queue response into display rows.
  toItems: (data: unknown, instanceId: string) => ArrQueueItem[];

  // Fetch the raw wanted/missing response; the header badge reads its total.
  fetchWanted: (instanceId: string) => Promise<unknown>;
  wantedCount: (data: unknown) => number;
}
