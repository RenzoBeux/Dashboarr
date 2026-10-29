import type { NotificationCategory, PushEvent } from "../types.js";
import type {
  CleanuparrEventItem,
  CleanuparrWatchedEventType,
} from "../services/cleanuparr.js";

/**
 * Cleanuparr event pushes (#486): which events become pushes, and their copy.
 * Pure (type-only imports, no DB, no env) so it is unit-testable; the
 * seen_state read/write and the dispatch live in transitions.ts.
 *
 * One snapshot per instance and event type holds the ids on the newest page.
 * The first poll only seeds it, so a fresh backend (or a newly added instance)
 * never pushes Cleanuparr's history. Dry-run events never push, matching
 * Cleanuparr's own notifications, which its DryRunInterceptor suppresses.
 */

export const CLEANUPARR_EVENT_CATEGORIES = {
  QueueItemDeleted: "cleanuparrRemoved",
  DownloadCleaned: "cleanuparrCleaned",
} as const satisfies Record<CleanuparrWatchedEventType, NotificationCategory>;

export const CLEANUPARR_WATCHED_EVENT_TYPES = Object.keys(
  CLEANUPARR_EVENT_CATEGORIES,
) as CleanuparrWatchedEventType[];

export interface CleanuparrSnapshot {
  /** Event ids on the last page seen. */
  ids: string[];
  /** Timestamp of the newest event seen so far; null until there is one. */
  newest: string | null;
}

/** More fresh events than this in one poll become a single summary push. */
export const MAX_INDIVIDUAL_PUSHES = 3;

/** Release names quoted in a summary body. */
const SUMMARY_NAMES = 3;

/**
 * Events older than the newest one already seen are skipped (an instance
 * repointed at another Cleanuparr would otherwise push that server's whole
 * page). The slack covers two concurrent jobs committing their events out of
 * timestamp order between two polls.
 */
const OUT_OF_ORDER_SLACK_MS = 5 * 60_000;

const DELETE_REASON_LABELS: Record<string, string> = {
  Stalled: "Stalled",
  FailedImport: "Failed import",
  DownloadingMetadata: "Stuck downloading metadata",
  SlowSpeed: "Slow speed",
  SlowTime: "Too slow to finish",
  AllFilesSkipped: "All files skipped",
  AllFilesSkippedByQBit: "All files skipped in qBittorrent",
  AllFilesBlocked: "All files blocked",
  AtLeastOneFileBlocked: "Blocked file found",
  DownloadFailed: "Download failed",
  Errored: "Errored",
};

const CLEAN_REASON_LABELS: Record<string, string> = {
  MaxRatioReached: "Max ratio reached",
  MaxSeedTimeReached: "Max seed time reached",
};

/** "SlowSpeed" -> "Slow speed", the app's humanizeEnumName. */
function humanizeEnumName(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Human label for the event's DeleteReason / CleanReason. "None", null or a
 * missing field give undefined; a reason newer than the maps above is
 * humanized rather than dropped.
 */
export function cleanuparrReasonLabel(
  eventType: CleanuparrWatchedEventType,
  item: CleanuparrEventItem,
): string | undefined {
  const [raw, labels] =
    eventType === "QueueItemDeleted"
      ? [item.deleteReason, DELETE_REASON_LABELS]
      : [item.cleanReason, CLEAN_REASON_LABELS];
  if (!raw || raw === "None") return undefined;
  return labels[raw] ?? humanizeEnumName(raw);
}

function itemName(item: CleanuparrEventItem): string {
  return item.itemTitle?.trim() || "Unknown download";
}

interface PushCopy {
  /** Title with a single instance of the kind. */
  single: string;
  /** Title after the "<instance name>: " prefix. */
  prefixed: string;
  /** `n` is a count, or a lower bound like "50+" when the page overflowed. */
  summary: (n: string) => string;
  prefixedSummary: (n: string) => string;
}

const COPY: Record<CleanuparrWatchedEventType, PushCopy> = {
  QueueItemDeleted: {
    single: "Cleanuparr removed a download",
    prefixed: "Download removed",
    summary: (n) => `Cleanuparr removed ${n} downloads`,
    prefixedSummary: (n) => `${n} downloads removed`,
  },
  DownloadCleaned: {
    single: "Cleanuparr cleaned a download",
    prefixed: "Download cleaned",
    summary: (n) => `Cleanuparr cleaned ${n} downloads`,
    prefixedSummary: (n) => `${n} downloads cleaned`,
  },
};

export interface CleanuparrPushContext {
  instanceId: string;
  instanceName: string;
  /** Prefix titles with the instance name, as every poller does with 2+ of a kind. */
  multipleOfKind: boolean;
  eventType: CleanuparrWatchedEventType;
  /**
   * The page's totalCount. When the server holds more events than the page
   * returned and none of the seen ids is on it, the fresh events may run past
   * the page, so the summary count becomes a lower bound ("50+").
   */
  totalCount?: number;
}

function parseTime(value: string | null | undefined): number {
  return value ? Date.parse(value) : Number.NaN;
}

/**
 * Diffs one poll's page against the previous snapshot. Returns the snapshot to
 * persist (before dispatching) and the pushes to send, oldest first so the
 * newest lands on top of the notification shade.
 */
export function planCleanuparrPushes(
  prev: CleanuparrSnapshot | null,
  items: readonly CleanuparrEventItem[],
  ctx: CleanuparrPushContext,
): { next: CleanuparrSnapshot; pushes: PushEvent[] } {
  // Upstream ignores an eventType it can't parse and returns every event, so
  // the request's filter alone can't be trusted.
  const matching = items.filter((i) => i.eventType === ctx.eventType && typeof i.id === "string");
  const next: CleanuparrSnapshot = {
    ids: matching.map((i) => i.id),
    newest: matching[0]?.timestamp ?? prev?.newest ?? null,
  };
  if (!prev) return { next, pushes: [] };

  const seen = new Set(prev.ids);
  const overflowed =
    typeof ctx.totalCount === "number" &&
    ctx.totalCount > items.length &&
    !matching.some((i) => seen.has(i.id));
  const floor = parseTime(prev.newest) - OUT_OF_ORDER_SLACK_MS;
  const fresh = matching
    .filter((i) => !seen.has(i.id))
    .filter((i) => i.isDryRun !== true)
    .filter((i) => {
      const at = parseTime(i.timestamp);
      return Number.isNaN(at) || Number.isNaN(floor) || at >= floor;
    })
    .reverse();
  if (fresh.length === 0) return { next, pushes: [] };

  const category = CLEANUPARR_EVENT_CATEGORIES[ctx.eventType];
  const copy = COPY[ctx.eventType];
  const prefix = ctx.multipleOfKind ? `${ctx.instanceName}: ` : "";
  const baseData = { type: "cleanuparr", instanceId: ctx.instanceId, eventType: ctx.eventType };
  const keyBase = `cleanuparr:${ctx.instanceId}:${ctx.eventType}`;

  if (fresh.length <= MAX_INDIVIDUAL_PUSHES) {
    const pushes = fresh.map((item): PushEvent => {
      const name = itemName(item);
      const reason = cleanuparrReasonLabel(ctx.eventType, item);
      return {
        category,
        title: ctx.multipleOfKind ? `${prefix}${copy.prefixed}` : copy.single,
        body: reason ? `${name} · ${reason}` : name,
        data: { ...baseData, eventId: item.id },
        dedupeKey: `${keyBase}:${item.id}`,
      };
    });
    return { next, pushes };
  }

  // A burst (a QueueCleaner run can remove dozens) is one push naming the
  // most recent few.
  const n = fresh.length;
  const newest = fresh[n - 1]!;
  const names = fresh.slice(-SUMMARY_NAMES).reverse().map(itemName);
  const rest = n - names.length;
  const plus = overflowed ? "+" : "";
  const count = `${n}${plus}`;
  return {
    next,
    pushes: [
      {
        category,
        title: ctx.multipleOfKind ? `${prefix}${copy.prefixedSummary(count)}` : copy.summary(count),
        body: rest > 0 ? `${names.join(", ")} and ${rest}${plus} more` : names.join(", "),
        data: { ...baseData, eventId: newest.id },
        dedupeKey: `${keyBase}:batch:${newest.id}`,
      },
    ],
  };
}
