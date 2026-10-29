import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

/**
 * Cleanuparr's event feed (#486). `GET /api/events` is `[Authorize]`, so the
 * X-Api-Key default in applyAuth covers it. The api base is "" (the anonymous
 * /health ping is root-mounted), so the path spells `/api` itself.
 *
 * JSON is camelCase properties with PascalCase enum strings ("QueueItemDeleted",
 * "SlowSpeed"). Items come newest first (Timestamp DESC, then Id DESC). Only
 * the fields the push copy needs are typed; the nullable ones may be null or
 * absent.
 */
export interface CleanuparrEventItem {
  /** Guid (v7, time-ordered). */
  id: string;
  /** ISO-8601 DateTimeOffset. */
  timestamp: string;
  eventType: string;
  message?: string;
  severity?: string;
  isDryRun?: boolean;
  /** The download name, i.e. the release name. */
  itemTitle?: string | null;
  itemHash?: string | null;
  /** DeleteReason on QueueItemDeleted. */
  deleteReason?: string | null;
  removeFromClient?: boolean | null;
  /** CleanReason on DownloadCleaned. */
  cleanReason?: string | null;
  cleanedCategory?: string | null;
}

export interface CleanuparrEventPage {
  items: CleanuparrEventItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** The event types the backend pushes for. */
export type CleanuparrWatchedEventType = "QueueItemDeleted" | "DownloadCleaned";

/**
 * Newest page of one event type. Upstream silently ignores an eventType it
 * can't parse and returns every event, so callers must refilter by type.
 */
export function getCleanuparrEvents(
  config: StoredServiceConfig,
  eventType: CleanuparrWatchedEventType,
  pageSize = 50,
): Promise<CleanuparrEventPage> {
  return serviceFetch<CleanuparrEventPage>(config, "/api/events", {
    params: { page: 1, pageSize, eventType },
  });
}
