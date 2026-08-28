import type { ComponentType } from "react";
import {
  AlertTriangle,
  Ban,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Search,
  Tv,
  XCircle,
} from "lucide-react-native";
import { formatEta, formatTimeAgo } from "@/lib/utils";
import type { HistoryTone } from "@/lib/arr-history";
import type {
  Nzbhydra2ApiError,
  Nzbhydra2DownloadStatus,
  Nzbhydra2IndexerState,
  Nzbhydra2SearchItem,
} from "@/lib/types";

// Pure helpers for NZBHydra2's API quirks. Everything here is deliberately
// side-effect free so services/nzbhydra2-api.ts stays a thin request layer and
// the awkward parts are unit-testable without a server (the
// lib/bindery-normalize.ts pattern). The components import from here too — the
// indexer list and the dashboard widget both need the state palette, and a
// component reaching into a request module for a parser would be backwards.

// --- Timestamps ---------------------------------------------------------

// 1e12 SECONDS is the year 33658, so anything at or above it is already
// milliseconds. Purely defensive: it keeps a future upstream switch to ms
// timestamps from pushing every date 1000x into the future.
const MS_THRESHOLD = 1e12;

function secondsToMs(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) >= MS_THRESHOLD ? Math.round(n) : Math.round(n * 1000);
}

/**
 * NZBHydra2 emits THREE shapes for the same timestamp field.
 * application.properties sets write-dates-as-timestamps=false, but upstream's
 * own Angular UI (parseAppTimestamp in core/ui-src/js/indexer-statuses-
 * controller.js) defensively accepts a raw number, a numeric STRING and an
 * ISO-8601 string — so we do the same. Bare numbers are epoch SECONDS, not
 * milliseconds (e.g. 1544551917.589).
 *
 * Every timestamp we read goes through here: `time`, `disabledUntil`,
 * `apiResetTime`, `downloadResetTime`, `firstFound`, `pubDate`. Returns epoch
 * milliseconds, or null. When SENDING (`after`/`before`) always send ISO-8601 —
 * see statsWindow().
 */
export function parseHydraTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return secondsToMs(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return secondsToMs(Number(trimmed));
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * ISO string, so the formatters in lib/utils.ts (which take date strings) work
 * unchanged on NZBHydra2 data.
 */
export function hydraTimestampToIso(value: unknown): string | undefined {
  const ms = parseHydraTimestamp(value);
  return ms === null ? undefined : new Date(ms).toISOString();
}

/**
 * "in 12m" for a future timestamp, "3h ago" for a past one, null when absent.
 * disabledUntil / apiResetTime / downloadResetTime are all future-dated, and
 * formatTimeAgo clamps anything in the future to "just now" — hence the split.
 *
 * `now` governs the future/past decision only; the past branch delegates to
 * formatTimeAgo, which reads the real clock. That is exactly what the callers
 * want (both are Date.now() in production) but it means an injected `now`
 * cannot be used to fake a relative past label in a test.
 */
export function formatHydraCountdown(
  value: unknown,
  now = Date.now(),
): string | null {
  const ms = parseHydraTimestamp(value);
  if (ms === null) return null;
  const delta = ms - now;
  if (delta > 0) return `in ${formatEta(Math.round(delta / 1000))}`;
  return formatTimeAgo(new Date(ms).toISOString()) || null;
}

/** StatsRequest.after/before are Instants — send ISO-8601, never epoch. */
export function statsWindow(
  days: number,
  now = Date.now(),
): { after: string; before: string } {
  return {
    after: new Date(now - days * 86_400_000).toISOString(),
    before: new Date(now).toISOString(),
  };
}

// --- Indexer state ------------------------------------------------------

export interface HydraStateMeta {
  label: string;
  // Tailwind bg class for a plain status dot. StatusDot is deliberately not
  // used here: its only neutral state ("checking") pulses, which would read as
  // activity on an indexer the user disabled on purpose.
  dotClass: string;
  badgeVariant: "success" | "warning" | "error" | "default";
}

// Labels are upstream's own (formatState in indexer-statuses-controller.js),
// and the severities follow its getLabelClass.
const STATE_META: Record<Nzbhydra2IndexerState, HydraStateMeta> = {
  ENABLED: { label: "Enabled", dotClass: "bg-success", badgeVariant: "success" },
  DISABLED_SYSTEM_TEMPORARY: {
    label: "Temporarily disabled",
    dotClass: "bg-warning",
    badgeVariant: "warning",
  },
  DISABLED_SYSTEM: {
    label: "Disabled by system",
    dotClass: "bg-danger",
    badgeVariant: "error",
  },
  DISABLED_USER: {
    label: "Disabled by user",
    dotClass: "bg-zinc-600",
    badgeVariant: "default",
  },
};

export function hydraStateMeta(state: string): HydraStateMeta {
  return (
    STATE_META[state as Nzbhydra2IndexerState] ?? {
      label: state || "Unknown",
      dotClass: "bg-zinc-600",
      badgeVariant: "default",
    }
  );
}

// --- VIP expiry ---------------------------------------------------------

// Upstream warns when VIP access expires within a week.
export const VIP_WARN_DAYS = 7;

export interface HydraVipInfo {
  label: string;
  expiring: boolean;
}

/** `vipExpirationDate` is "YYYY-MM-DD" or the literal string "Lifetime". */
export function hydraVipInfo(
  value: string | null | undefined,
  now = Date.now(),
): HydraVipInfo | null {
  if (!value) return null;
  if (value.toLowerCase() === "lifetime") {
    return { label: "VIP · lifetime", expiring: false };
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return { label: `VIP · ${value}`, expiring: false };
  const days = Math.floor((ms - now) / 86_400_000);
  if (days < 0) return { label: `VIP expired ${value}`, expiring: true };
  return { label: `VIP until ${value}`, expiring: days <= VIP_WARN_DAYS };
}

// --- Download history statuses ------------------------------------------

export interface HydraDownloadStatusMeta {
  label: string;
  // Reuses the five-tone palette from lib/arr-history.ts. The colour
  // vocabulary is the genuinely shared part between *arr history and this one;
  // the row layout and the field names are not (see nzbhydra2-history.tsx).
  tone: HistoryTone;
  // ComponentType<any>, never ElementType — the latter permits `string` and
  // breaks the <Icon> wrapper's prop type.
  icon: ComponentType<any>;
}

const DOWNLOAD_STATUS_META: Record<
  Nzbhydra2DownloadStatus,
  HydraDownloadStatusMeta
> = {
  NONE: { label: "None", tone: "muted", icon: Clock },
  REQUESTED: { label: "Requested", tone: "info", icon: Clock },
  INTERNAL_ERROR: { label: "Internal error", tone: "danger", icon: XCircle },
  NZB_DOWNLOAD_SUCCESSFUL: {
    label: "NZB downloaded",
    tone: "success",
    icon: CheckCircle2,
  },
  NZB_DOWNLOAD_ERROR: {
    label: "NZB download failed",
    tone: "danger",
    icon: XCircle,
  },
  NZB_ADDED: { label: "Added to client", tone: "grab", icon: Download },
  NZB_NOT_ADDED: { label: "Not added", tone: "muted", icon: Ban },
  NZB_ADD_ERROR: { label: "Add failed", tone: "danger", icon: XCircle },
  NZB_ADD_REJECTED: {
    label: "Rejected by client",
    tone: "danger",
    icon: Ban,
  },
  CONTENT_DOWNLOAD_SUCCESSFUL: {
    label: "Download successful",
    tone: "success",
    icon: CheckCircle2,
  },
  CONTENT_DOWNLOAD_ERROR: {
    label: "Download error",
    tone: "danger",
    icon: XCircle,
  },
  CONTENT_DOWNLOAD_WARNING: {
    label: "Download warning",
    tone: "info",
    icon: AlertTriangle,
  },
};

export function hydraDownloadStatusMeta(
  status: string,
): HydraDownloadStatusMeta {
  return (
    DOWNLOAD_STATUS_META[status as Nzbhydra2DownloadStatus] ?? {
      label: status || "Unknown",
      tone: "muted",
      icon: Clock,
    }
  );
}

const SEARCH_TYPE_ICON: Record<string, ComponentType<any>> = {
  TVSEARCH: Tv,
  MOVIE: Film,
  BOOK: BookOpen,
};

export function hydraSearchTypeIcon(searchType: string): ComponentType<any> {
  return SEARCH_TYPE_ICON[searchType] ?? Search;
}

// --- Sort columns -------------------------------------------------------

// sortModel.column is interpolated straight into native SQL by
// History.getHistory, so only ever send a name from these lists — anything
// else 500s.
export const NZBHYDRA2_SEARCH_SORT_COLUMNS = [
  "time",
  "query",
  "source",
  "username",
  "ip",
] as const;

export const NZBHYDRA2_DOWNLOAD_SORT_COLUMNS = [
  "time",
  "name",
  "title",
  "status",
  "access_source",
  "age",
  "username",
  "ip",
] as const;

// --- allowApiStats gate -------------------------------------------------

/**
 * /api/stats, /api/stats/indexers and /api/history/* are gated by NZBHydra2's
 * own `auth.allowApiStats` config flag (default on). With it off, all four
 * reject a perfectly valid API key while t=caps — and therefore searching —
 * keeps working. A failure THERE, paired with a caps query we know succeeded,
 * means "the user turned the stats API off", not "wrong API key", and the UI
 * must say so rather than sending them off to re-paste a good key.
 *
 * Read structurally rather than with `instanceof HttpError`: importing
 * lib/http-client here would drag the config store, demo data and url-builder
 * into what is meant to stay a pure, trivially-testable module.
 */
export function isStatsApiGated(err: unknown): boolean {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return status === 401 || status === 403 || status === 404;
}

// --- Newznab search results ---------------------------------------------

/**
 * Pull one newznab <attr name= value=> out of a search item.
 *
 * The holder key is "@attributes", NOT "attributes" — every newznab JSON DTO
 * upstream carries @JsonProperty("@attributes"). Reading `.attributes` instead
 * type-checks fine and fails silently, leaving every indexer name and size
 * blank, so this lookup lives in one tested place.
 */
export function hydraAttr(
  item: Nzbhydra2SearchItem,
  name: string,
): string | undefined {
  for (const entry of item.attr ?? []) {
    const attrs = entry?.["@attributes"];
    if (!attrs || attrs.name !== name) continue;
    const value = attrs.value;
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Coerce a newznab size (string or number) to bytes; 0 when unusable. */
export function hydraBytes(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The newznab error envelope, as JSON. Flat —
 * {"code":"100","description":"Wrong api key"} — but an { error: {...} }
 * wrapper is accepted too so a shape change degrades to a readable message
 * rather than "unrecognized response".
 *
 * Exported so the connection probe in lib/http-client.ts reuses it instead of
 * re-deriving the "HTTP 200 means nothing" rule.
 */
export function readHydraJsonError(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const node: Nzbhydra2ApiError | undefined =
    "code" in record || "description" in record
      ? (record as Nzbhydra2ApiError)
      : record.error && typeof record.error === "object"
        ? (record.error as Nzbhydra2ApiError)
        : undefined;
  if (!node) return undefined;
  const { code, description } = node;
  if (code === undefined && description === undefined) return undefined;
  const text = description ? description : "NZBHydra2 rejected the request";
  return code === undefined ? text : `${text} (code ${code})`;
}

/**
 * `<error code="100" description="Wrong api key"/>`.
 *
 * `o=json` picks the format of the SUCCESS path only — the error path still
 * content-negotiates, so the same request can answer with XML. Matched with a
 * regex rather than fast-xml-parser: the document is a single self-closing
 * element with two attributes, and this keeps the module dependency-free and
 * synchronous for the connection probe.
 */
export function readHydraXmlError(xml: string): string | undefined {
  if (!/<error\b/i.test(xml)) return undefined;
  const code = /<error\b[^>]*\bcode="([^"]*)"/i.exec(xml)?.[1];
  const description = /<error\b[^>]*\bdescription="([^"]*)"/i.exec(xml)?.[1];
  if (code === undefined && description === undefined) {
    return "NZBHydra2 rejected the request";
  }
  const text = description ? description : "NZBHydra2 rejected the request";
  return code === undefined ? text : `${text} (code ${code})`;
}
