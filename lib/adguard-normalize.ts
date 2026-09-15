import type { AdguardTopArrayEntry } from "@/lib/types";

/**
 * Pure helpers for the AdGuard Home integration.
 *
 * Split from services/adguard-api.ts on purpose: that module is the wire
 * format, this one is how we choose to draw it. Both are pure and unit-tested.
 *
 * Unlike Pi-hole, AdGuard Home's control endpoints answer errors as PLAIN TEXT
 * (Go's http.Error), not a JSON envelope — AdguardHttpError already carries
 * that text verbatim as its Error.message, so there is no equivalent of
 * piholeErrorMessage here: components/ui/toast.tsx's toastError falls through
 * to `err.message` on its own and gets the right string for free.
 */

// ---------------------------------------------------------------------------
// Top lists
// ---------------------------------------------------------------------------

export interface AdguardTopListRow {
  title: string;
  count: number;
}

/**
 * Flatten /control/stats's `top_*` arrays. Each entry is a single-key object
 * (`{"example.com": 42}`), not a `{name, count}` row — anything else (an empty
 * object, or more than one key) is skipped rather than guessed at.
 */
export function toTopListRows(
  entries: readonly AdguardTopArrayEntry[] | undefined,
): AdguardTopListRow[] {
  if (!Array.isArray(entries)) return [];
  const rows: AdguardTopListRow[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const keys = Object.keys(entry);
    if (keys.length !== 1) continue;
    const title = keys[0]!;
    const count = Number(entry[title]);
    if (!title || !Number.isFinite(count)) continue;
    rows.push({ title, count });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Query-log reason classification
// ---------------------------------------------------------------------------

export type AdguardQueryVerdict = "blocked" | "rewritten" | "allowed" | "other";

/**
 * Every value of AGH's Reason enum (internal/filtering/reason.go), verified
 * against source rather than the (sparse) public docs. The wire string is NOT
 * always the Go constant name — Rewrite/RewriteEtcHosts/RewriteRule in
 * particular have no "Filtered"/"NotFiltered" prefix.
 */
export const ADGUARD_BLOCKED_REASONS: ReadonlySet<string> = new Set([
  "FilteredBlackList",
  "FilteredSafeBrowsing",
  "FilteredParental",
  "FilteredInvalid",
  "FilteredSafeSearch",
  "FilteredBlockedService",
]);

export const ADGUARD_REWRITTEN_REASONS: ReadonlySet<string> = new Set([
  "Rewrite",
  "RewriteEtcHosts",
  "RewriteRule",
]);

export const ADGUARD_ALLOWED_REASONS: ReadonlySet<string> = new Set([
  "NotFilteredNotFound",
  "NotFilteredWhiteList",
  "NotFilteredError",
]);

export function isBlockedReason(reason: string | null | undefined): boolean {
  return !!reason && ADGUARD_BLOCKED_REASONS.has(reason);
}

/**
 * Bucket a reason for colouring. Unrecognized values fall to "other", never to
 * an allowed-looking verdict — AGH has added reasons across releases, and a
 * new block type rendering as "allowed" would be worse than rendering neutral.
 */
export function classifyQueryReason(
  reason: string | null | undefined,
): AdguardQueryVerdict {
  if (!reason) return "other";
  if (ADGUARD_BLOCKED_REASONS.has(reason)) return "blocked";
  if (ADGUARD_REWRITTEN_REASONS.has(reason)) return "rewritten";
  if (ADGUARD_ALLOWED_REASONS.has(reason)) return "allowed";
  return "other";
}

const REASON_LABELS: Record<string, string> = {
  NotFilteredNotFound: "Not filtered",
  NotFilteredWhiteList: "Allowlisted",
  NotFilteredError: "Not filtered",
  FilteredBlackList: "Blocklist",
  FilteredSafeBrowsing: "Safe Browsing",
  FilteredParental: "Parental control",
  FilteredInvalid: "Invalid request",
  FilteredSafeSearch: "Safe Search",
  FilteredBlockedService: "Blocked service",
  Rewrite: "Rewritten",
  RewriteEtcHosts: "Rewritten (/etc/hosts)",
  RewriteRule: "Rewritten (rule)",
};

export function queryReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Unknown";
  return REASON_LABELS[reason] ?? reason;
}

// ---------------------------------------------------------------------------
// DNS rewrites (custom records)
// ---------------------------------------------------------------------------

// Labels 1-63 chars, no leading/trailing hyphen, 253 total, no trailing dot.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
// Deliberately permissive (hex groups + optional "::" once) — this only guards
// the form, not full RFC 4291 correctness; the server is the final arbiter.
const IPV6_RE = /^[0-9a-f:]+:[0-9a-f:]*$/i;

function isValidRewriteDomain(value: string): boolean {
  const bare = value.startsWith("*.") ? value.slice(2) : value;
  return bare.length > 0 && HOSTNAME_RE.test(bare);
}

/**
 * An "answer" is either an IP (A/AAAA-style rewrite) or another hostname
 * (CNAME-style rewrite) — unlike Pi-hole's CNAME records, where the target is
 * always a name. internal/filtering/rewrite/item.go accepts both.
 */
function isValidRewriteAnswer(value: string): boolean {
  return IPV4_RE.test(value) || IPV6_RE.test(value) || HOSTNAME_RE.test(value);
}

export interface RewriteValidationErrors {
  domain?: string;
  answer?: string;
}

/**
 * Validate the add-record form. Returns a field -> message map; empty is valid.
 * `existing` is the current entry list, used for the duplicate check (AGH
 * allows multiple answers per domain, e.g. round-robin A records, but the app
 * only offers to add one at a time and warns before creating a second).
 */
export function validateRewriteInput(
  domain: string,
  answer: string,
  existing: readonly { domain: string; answer: string }[] = [],
): RewriteValidationErrors {
  const errors: RewriteValidationErrors = {};
  const d = domain.trim();
  const a = answer.trim();

  if (!d) errors.domain = "Enter a hostname";
  else if (/\s/.test(d)) errors.domain = "No spaces allowed";
  else if (!isValidRewriteDomain(d)) errors.domain = "Enter a valid hostname";

  if (!a) errors.answer = "Enter an IP address or hostname";
  else if (/\s/.test(a)) errors.answer = "No spaces allowed";
  else if (!isValidRewriteAnswer(a)) errors.answer = "Enter a valid IP address or hostname";

  if (!errors.domain && !errors.answer) {
    const clash = existing.some(
      (r) => r.domain.toLowerCase() === d.toLowerCase() && r.answer.toLowerCase() === a.toLowerCase(),
    );
    if (clash) errors.domain = "This exact record already exists";
  }

  return errors;
}
