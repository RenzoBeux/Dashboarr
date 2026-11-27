import type { ComponentType } from "react";
import type {
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import type { ServiceId } from "@/lib/constants";
import type { DownloadBadgeVariant } from "@/lib/download-status";

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
  // When the job was added, epoch seconds, if the service says (SAB 5.0+).
  // Newest First uses it over `index`: queue order isn't add order.
  addedAt?: number;
  // The polled page of the queue the row sits in, for adapters that poll the
  // queue by page (see UsenetQueueView).
  page?: number;
}

export interface UsenetQueueState {
  items: UnifiedItem[];
  paused: boolean;
  // Pre-formatted speed string (e.g. "1.2 MB/s") if the service exposes one
  // cheaply; otherwise omit and the shared header just shows nothing.
  speedLabel?: string;
  sizeLeftLabel?: string;
}

// What the Downloads list needs from the queue. Adapters that read the whole
// queue in one request (NZBGet's listgroups) ignore it.
export interface UsenetQueueView {
  // Only the header (speed, size left), for the History filters.
  headerOnly?: boolean;
  // Narrow to this status on the server when the service can.
  status?: UsenetStatus;
  // Pages with rows on screen (see pickLivePages). They poll along with the
  // first page.
  livePages: readonly number[];
}

// The queue as the Downloads list reads it: one or more requests behind it.
export interface UsenetQueueList {
  data?: UsenetQueueState;
  // The first read failed. The list shows it only when it has no rows.
  error: Error | null;
  // Nothing to show yet.
  isLoading: boolean;
  // The rows don't cover the whole queue yet: the rest is on its way, or its
  // read failed (readError). Sorts and filters see only what's there.
  partial: boolean;
  readError: Error | null;
  retryRead: () => void;
  refetch: () => Promise<unknown>;
}

// A single-request queue as a UsenetQueueList.
export function wholeQueueList(query: UseQueryResult<UsenetQueueState>): UsenetQueueList {
  return {
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    partial: false,
    readError: null,
    retryRead: () => {},
    refetch: query.refetch,
  };
}

// Pages that keep polling besides the first. Bounds a poll to three requests
// of a page each, however the rows on screen are sorted.
export const MAX_LIVE_PAGES = 2;

/**
 * The pages to keep live, from the pages of the rows on screen: the ones with
 * the most rows there, the first page aside (it always polls).
 */
export function pickLivePages(
  visiblePages: readonly number[],
  max = MAX_LIVE_PAGES,
): number[] {
  const counts = new Map<number, number>();
  for (const page of visiblePages) {
    if (page > 0) counts.set(page, (counts.get(page) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, max)
    .map(([page]) => page)
    .sort((a, b) => a - b);
}

/**
 * Newest First. Queue order isn't add order (SAB slots a new job by priority,
 * so a Force job lands on top of older ones), so the add time decides where
 * the service gives one; otherwise the higher index (later in the queue) wins.
 */
export function compareAddedDesc(a: UnifiedItem, b: UnifiedItem): number {
  return a.addedAt && b.addedAt ? b.addedAt - a.addedAt : b.index - a.index;
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

  useQueue: (instanceId?: string, view?: UsenetQueueView) => UsenetQueueList;
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
  // Upload a local .nzb picked with the document picker. `fileUri` is the
  // picker's cache-copy URI; `fileName` is the original filename (services
  // need it — SAB names the multipart file part, NZBGet can't derive a name
  // from base64 content).
  useAddFile: (
    instanceId?: string,
  ) => UseMutationResult<
    unknown,
    Error,
    { fileUri: string; fileName: string; category?: string }
  >;
  usePauseAll: (instanceId?: string) => UseMutationResult<unknown, Error, void>;
  useResumeAll: (instanceId?: string) => UseMutationResult<unknown, Error, void>;

  // Optional self-contained speed-limits header control (a button + sheet that
  // owns its own client-specific hooks). Rendered in the speed row of the shared
  // downloads view when present. Keeping the client-specific speed-limit hooks
  // inside the control keeps the shared view free of any optional-hook hazard.
  SpeedLimitsControl?: ComponentType;
}

export function usenetBadgeVariant(status: UsenetStatus): DownloadBadgeVariant {
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
