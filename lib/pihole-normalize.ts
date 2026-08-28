import type {
  PiholeCnameConfigResponse,
  PiholeErrorBody,
  PiholeHistoryResponse,
} from "@/lib/types";

/**
 * Pure helpers for the Pi-hole v6 integration.
 *
 * Type-only imports on purpose. lib/http-client.ts's connection probe imports
 * `readFtlError` from here, so a value import back into http-client would be a
 * cycle — and http-client pulls in the config store and AsyncStorage, which
 * would drag React Native shims into what should be a plain unit test.
 *
 * That is why the error helpers duck-type `{ status, body }` instead of doing
 * `err instanceof HttpError`. HttpError satisfies that shape structurally.
 */

// ---------------------------------------------------------------------------
// FTL error envelope
// ---------------------------------------------------------------------------

export interface FtlError {
  key: string;
  message: string;
  hint: string | null;
}

/**
 * Read FTL's `{"error":{"key","message","hint"}}` envelope out of a response
 * body. Returns null for anything that isn't one.
 */
export function readFtlError(body: unknown): FtlError | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as PiholeErrorBody).error;
  if (!err || typeof err !== "object") return null;
  const key = typeof err.key === "string" ? err.key : "";
  const message = typeof err.message === "string" ? err.message : "";
  if (!key && !message) return null;
  return { key, message, hint: typeof err.hint === "string" ? err.hint : null };
}

/**
 * A human-readable message for a failed Pi-hole call.
 *
 * getHttpErrorMessage (lib/http-client.ts) looks for a TOP-LEVEL `message` on
 * the body, and FTL nests its under `error`, so without this every Pi-hole 4xx
 * would surface to the user as the bare "HTTP 400 Bad Request — <url>".
 */
export function piholeErrorMessage(err: unknown): string | undefined {
  const ftl = readFtlError(httpErrorBody(err));
  if (!ftl) return undefined;
  // Seat exhaustion arrives as a 401, exactly like a wrong password. Only the
  // key separates them, and telling someone their password is wrong when the
  // real problem is a full session pool sends them to change a working
  // password — which invalidates every session and makes it worse.
  if (ftl.key === "api_seats_exceeded") return SEATS_EXCEEDED_MESSAGE;
  return ftl.message || undefined;
}

export const SEATS_EXCEEDED_MESSAGE =
  "Pi-hole has no free API sessions left (webserver.api.max_sessions, default 16). Wait for idle sessions to expire, or raise the limit in Pi-hole's settings.";

/** True when a 401 is really "the session pool is full", not "wrong password". */
export function isSeatsExceededError(err: unknown): boolean {
  return readFtlError(httpErrorBody(err))?.key === "api_seats_exceeded";
}

/** Structural read of HttpError.body, without importing the class. */
function httpErrorBody(err: unknown): unknown {
  if (!err || typeof err !== "object") return undefined;
  const candidate = err as { status?: unknown; body?: unknown };
  if (typeof candidate.status !== "number") return undefined;
  return candidate.body;
}

// ---------------------------------------------------------------------------
// Local CNAME records
// ---------------------------------------------------------------------------

export interface PiholeCnameRecord {
  /**
   * The value EXACTLY as FTL stores it.
   *
   * DELETE /api/config/dns/cnameRecords/{value} matches the path against the
   * config array byte-for-byte, so deleting with a re-formatted value (say
   * "a.com,b.com" for a stored "a.com , b.com") 404s while the record stays put.
   * Always delete with this, never with formatCnameRecord() output.
   */
  raw: string;
  cname: string;
  target: string;
  ttl: number | null;
}

/** Dig the array out of FTL's nested config subtree, tolerating a bare array. */
export function readCnameRecords(body: unknown): PiholeCnameRecord[] {
  if (!body) return [];
  const list = Array.isArray(body)
    ? body
    : (body as PiholeCnameConfigResponse)?.config?.dns?.cnameRecords;
  if (!Array.isArray(list)) return [];
  return list
    .filter((v): v is string => typeof v === "string")
    .map(parseCnameRecord)
    .filter((r): r is PiholeCnameRecord => r !== null);
}

/** Parse `"<cname>,<target>[,<ttl>]"`. Returns null for anything else. */
export function parseCnameRecord(raw: string): PiholeCnameRecord | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(",");
  if (parts.length < 2 || parts.length > 3) return null;
  const cname = parts[0]!.trim();
  const target = parts[1]!.trim();
  if (!cname || !target) return null;
  let ttl: number | null = null;
  if (parts.length === 3) {
    const trimmed = parts[2]!.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) return null;
      ttl = parsed;
    }
  }
  return { raw, cname, target, ttl };
}

/** Build the wire value for a NEW record. Never use this to delete one. */
export function formatCnameRecord(r: {
  cname: string;
  target: string;
  ttl?: number | null;
}): string {
  const base = `${r.cname.trim().toLowerCase()},${r.target.trim().toLowerCase()}`;
  return r.ttl == null ? base : `${base},${r.ttl}`;
}

/**
 * Percent-encode a record for the {value} path segment.
 *
 * buildUrl (lib/url-builder.ts) encodes query params but concatenates the path
 * verbatim, so this has to happen at the call site. The comma must become %2C;
 * `*` is legal in a path segment and is left alone so wildcard records stay
 * readable in logs.
 */
export function encodeCnameValue(value: string): string {
  return encodeURIComponent(value).replace(/%2A/gi, "*");
}

const MAX_TTL = 604_800; // 7 days
// Labels 1-63 chars, no leading/trailing hyphen, 253 total, no trailing dot.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * True for a hostname, optionally with a leading `*.` wildcard label.
 *
 * Wildcards are a first-class Pi-hole feature — `*.example.com,default.example.com`
 * is the example in FTL's own API spec — but only on the left-hand side: the
 * target has to be a name the resolver can actually answer with.
 */
function isValidCnameSource(value: string): boolean {
  const bare = value.startsWith("*.") ? value.slice(2) : value;
  return bare.length > 0 && HOSTNAME_RE.test(bare);
}

export interface CnameValidationErrors {
  cname?: string;
  target?: string;
  ttl?: string;
}

/**
 * Validate the add-record form. Returns a field -> message map; empty is valid.
 * `existing` is the current raw record list, used for the duplicate check.
 */
export function validateCnameInput(
  cname: string,
  target: string,
  ttl: string,
  existing: readonly string[] = [],
): CnameValidationErrors {
  const errors: CnameValidationErrors = {};
  const c = cname.trim();
  const t = target.trim();

  // A comma in either field would corrupt the record's own encoding — FTL
  // splits on commas, so "a,b.com" silently becomes a different record.
  if (!c) errors.cname = "Enter a hostname";
  else if (/[,\s]/.test(c)) errors.cname = "No commas or spaces allowed";
  else if (!isValidCnameSource(c)) errors.cname = "Enter a valid hostname";

  if (!t) errors.target = "Enter a hostname";
  else if (/[,\s]/.test(t)) errors.target = "No commas or spaces allowed";
  else if (!HOSTNAME_RE.test(t)) errors.target = "Enter a valid hostname";

  // Pointing a name at itself makes the resolver loop.
  if (!errors.cname && !errors.target && c.toLowerCase() === t.toLowerCase()) {
    errors.target = "A record can't point at itself";
  }

  const ttlTrimmed = ttl.trim();
  if (ttlTrimmed !== "") {
    const parsed = Number(ttlTrimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TTL) {
      errors.ttl = "Whole number of seconds, 0 to 604800";
    }
  }

  // Pi-hole would happily store two records for one name and resolve them
  // unpredictably, so catch it here rather than letting the user create it.
  if (!errors.cname) {
    const lower = c.toLowerCase();
    const clash = existing.some(
      (raw) => parseCnameRecord(raw)?.cname.toLowerCase() === lower,
    );
    if (clash) errors.cname = "A record for this name already exists";
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Query-log status classification
// ---------------------------------------------------------------------------

export type PiholeQueryVerdict = "blocked" | "cached" | "forwarded" | "other";

/**
 * Statuses that mean the query was blocked (FTL src/datastructure.c).
 *
 * CACHE_STALE is deliberately absent — it is a cache hit, not a block.
 */
export const PIHOLE_BLOCKED_STATUSES: ReadonlySet<string> = new Set([
  "GRAVITY",
  "REGEX",
  "DENYLIST",
  "EXTERNAL_BLOCKED_IP",
  "EXTERNAL_BLOCKED_NULL",
  "EXTERNAL_BLOCKED_NXRA",
  "EXTERNAL_BLOCKED_EDE15",
  "GRAVITY_CNAME",
  "REGEX_CNAME",
  "DENYLIST_CNAME",
  "SPECIAL_DOMAIN",
]);

export function isBlockedStatus(status: string | null | undefined): boolean {
  return !!status && PIHOLE_BLOCKED_STATUSES.has(status);
}

/**
 * Bucket a status for colouring.
 *
 * Anything unrecognized falls through to "other", never to an allowed verdict:
 * Pi-hole adds status codes across point releases, and a new block reason must
 * not render as if the query sailed through.
 */
export function classifyQueryStatus(
  status: string | null | undefined,
): PiholeQueryVerdict {
  if (!status) return "other";
  if (PIHOLE_BLOCKED_STATUSES.has(status)) return "blocked";
  if (status === "CACHE" || status === "CACHE_STALE") return "cached";
  if (status === "FORWARDED") return "forwarded";
  return "other";
}

const STATUS_LABELS: Record<string, string> = {
  GRAVITY: "Blocklist",
  REGEX: "Regex",
  DENYLIST: "Denylist",
  EXTERNAL_BLOCKED_IP: "Upstream",
  EXTERNAL_BLOCKED_NULL: "Upstream",
  EXTERNAL_BLOCKED_NXRA: "Upstream",
  EXTERNAL_BLOCKED_EDE15: "Upstream",
  GRAVITY_CNAME: "Blocklist (CNAME)",
  REGEX_CNAME: "Regex (CNAME)",
  DENYLIST_CNAME: "Denylist (CNAME)",
  SPECIAL_DOMAIN: "Special domain",
  FORWARDED: "Forwarded",
  CACHE: "Cached",
  CACHE_STALE: "Cached (stale)",
  RETRIED: "Retried",
  RETRIED_DNSSEC: "Retried (DNSSEC)",
  IN_PROGRESS: "In progress",
  DBBUSY: "DB busy",
  UNKNOWN: "Unknown",
};

export function queryStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return STATUS_LABELS[status] ?? status;
}

// ---------------------------------------------------------------------------
// Activity history
// ---------------------------------------------------------------------------

export interface PiholeHistoryPoint {
  timestampMs: number;
  total: number;
  cached: number;
  blocked: number;
  forwarded: number;
}

/**
 * Normalize GET /api/history into chart-ready points.
 *
 * `total` is the SUM of cached + blocked + forwarded (plus a remainder for
 * uncategorized statuses) — it is NOT a fourth independent series, so chart
 * code must stack blocked against (total - blocked), never all four.
 *
 * The newest bucket is partial by definition, so a chart that renders every
 * point dips at the right edge on every refresh.
 */
export function toHistorySeries(body: unknown): PiholeHistoryPoint[] {
  const list = (body as PiholeHistoryResponse | undefined)?.history;
  if (!Array.isArray(list)) return [];
  const out: PiholeHistoryPoint[] = [];
  for (const b of list) {
    const ts = Number(b?.timestamp);
    if (!Number.isFinite(ts)) continue;
    out.push({
      timestampMs: Math.round(ts * 1000),
      total: num(b?.total),
      cached: num(b?.cached),
      blocked: num(b?.blocked),
      forwarded: num(b?.forwarded),
    });
  }
  return out;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Gravity output
// ---------------------------------------------------------------------------

export interface PiholeGravityResult {
  status: "success" | "partial" | "failed";
  /** Lines upstream marked [✗] — almost always one unreachable blocklist. */
  failures: string[];
  domainCount: number | null;
  log: string;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

const COMPLETION_MARKERS = [
  "Number of gravity domains",
  "Swapping databases",
  "Pi-hole blocking is",
];

/**
 * Turn `pihole -g`'s console output into a verdict.
 *
 * Tri-state on purpose. A [✗] line almost always means one blocklist was
 * unreachable, not that the run failed — gravity still swaps the database and
 * still bumps gravity.last_update. Reporting that as an outright failure would
 * train people to ignore a real one.
 */
export function parseGravityOutput(raw: string): PiholeGravityResult {
  const log = stripAnsi(typeof raw === "string" ? raw : "");
  const failures: string[] = [];
  for (const line of log.split("\n")) {
    const m = /^\s*\[[✗x]\]\s*(.+?)\s*$/.exec(line);
    if (m?.[1]) failures.push(m[1]);
  }

  let domainCount: number | null = null;
  const countMatch = /Number of gravity domains:\s*([\d,]+)/.exec(log);
  if (countMatch?.[1]) {
    const parsed = Number(countMatch[1].replace(/,/g, ""));
    if (Number.isFinite(parsed)) domainCount = parsed;
  }

  const completed =
    domainCount !== null || COMPLETION_MARKERS.some((m) => log.includes(m));
  if (!completed) return { status: "failed", failures, domainCount, log };
  return {
    status: failures.length ? "partial" : "success",
    failures,
    domainCount,
    log,
  };
}
