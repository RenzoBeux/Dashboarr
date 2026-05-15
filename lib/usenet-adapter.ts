import type {
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import type { ServiceId } from "@/lib/constants";

// Normalized status surface used by every shared Usenet component (downloads
// view, dashboard widget, settings sheet). Adapters map their service-specific
// status strings into this union so filtering/badge-color/classification logic
// lives in one place.
export type UsenetStatus =
  | "downloading"
  | "paused"
  | "queued"
  | "completed"
  | "failed"
  | "other";

// A single row that can come from either the active queue or the history list.
// Adapters convert their raw slot/group/history-item shapes into this for the
// shared renderer.
export interface UnifiedItem {
  id: string;
  name: string;
  category: string;
  status: UsenetStatus;
  // Display label for the badge (the raw service-side status string, e.g.
  // "Downloading", "Verifying", "SUCCESS"). The normalized `status` drives
  // logic; this drives what the badge shows.
  statusLabel: string;
  progress: number;
  sizeLabel: string;
  timeleft?: string;
  source: "queue" | "history";
  // Raw byte count for size-sort across queue + history.
  bytes: number;
  // Stable-ish ordering value. For queue items this is the service's
  // queue index; for history items it's the negative array index so newest
  // history sorts highest.
  index: number;
}

export interface UsenetQueueState {
  items: UnifiedItem[];
  paused: boolean;
  // Pre-formatted speed string (e.g. "1.2 MB/s") if the service exposes one
  // cheaply; otherwise omit and the shared header just shows nothing.
  speedLabel?: string;
  sizeLeftLabel?: string;
}

export interface UsenetHistoryState {
  items: UnifiedItem[];
}

// Shared adapter: every Usenet service implements one of these and the
// shared components branch on no service-specific knowledge beyond what
// the adapter exposes.
export interface UsenetAdapter {
  serviceId: ServiceId;
  displayName: string;
  // Detail-screen deep-link target for a single download (used by row taps and
  // notification deep-links). Receives the slot id and the originating instance.
  detailRoute: (id: string, instanceId?: string) => string;

  useQueue: (instanceId?: string) => UseQueryResult<UsenetQueueState>;
  useHistory: (limit: number, instanceId?: string) => UseQueryResult<UsenetHistoryState>;

  // Per-instance query options (for `useQueries` fan-outs in dashboard widgets
  // that aggregate across every enabled instance). Returns the options object
  // ready to pass into useQueries, with select already mapping to the
  // normalized UsenetQueueState shape.
  queueQueryOptions: (instanceId: string) => UseQueryOptions<
    unknown,
    Error,
    UsenetQueueState
  >;

  usePauseSlot: (instanceId?: string) => UseMutationResult<unknown, Error, string>;
  useResumeSlot: (instanceId?: string) => UseMutationResult<unknown, Error, string>;
  useDeleteSlot: (
    instanceId?: string,
  ) => UseMutationResult<unknown, Error, { id: string; deleteFiles?: boolean }>;
  useDeleteHistorySlot: (
    instanceId?: string,
  ) => UseMutationResult<unknown, Error, { id: string; deleteFiles?: boolean }>;
  useAddUrl: (
    instanceId?: string,
  ) => UseMutationResult<unknown, Error, { url: string; category?: string }>;
  usePauseAll: (instanceId?: string) => UseMutationResult<unknown, Error, void>;
  useResumeAll: (instanceId?: string) => UseMutationResult<unknown, Error, void>;
}

export function usenetBadgeVariant(
  status: UsenetStatus,
): "downloading" | "seeding" | "paused" | "error" | "default" {
  switch (status) {
    case "paused":
      return "paused";
    case "failed":
      return "error";
    case "completed":
      return "seeding";
    case "queued":
    case "other":
      return "default";
    case "downloading":
      return "downloading";
  }
}
