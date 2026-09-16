import { classifyQueryReason, queryReasonLabel } from "@/lib/adguard-normalize";

/**
 * Presentation helpers for the AdGuard Home screens.
 *
 * Split from lib/adguard-normalize.ts on purpose: that module is the wire
 * format, this one is how we choose to draw it. Both are pure and unit-tested.
 *
 * UNIT WARNING: every duration here is MILLISECONDS. AGH's
 * `POST /control/protection` takes `duration` in ms and its
 * `protection_disabled_duration` answers in ms — unlike Pi-hole's `timer`,
 * which is SECONDS. Mixing the two up silently disables protection for
 * 1000x too long or too short.
 */

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

/** The preset disable durations, in the order the action sheet shows them. */
export const ADGUARD_DISABLE_PRESETS = [
  { label: "1 minute", ms: 60_000 },
  { label: "5 minutes", ms: 300_000 },
  { label: "30 minutes", ms: 1_800_000 },
  { label: "1 hour", ms: 3_600_000 },
] as const;

/** Seven days, matching the custom-duration cap. */
export const MAX_DISABLE_MS = 604_800_000;

/**
 * Milliseconds from now until the device's next local midnight.
 *
 * `setHours(24, 0, 0, 0)` is local-calendar arithmetic, so a spring-forward
 * night correctly yields 23 hours and a fall-back night 25. Do NOT compute
 * this as `86400000 - msSinceMidnight`, which is wrong on both.
 *
 * AGH's `duration` is a length it counts down from receipt, not an absolute
 * instant, so a clock offset between phone and server does not matter here —
 * only request latency, hence the rounding and the 1ms floor (a duration of 0
 * risks being read as "indefinite" — see setProtection's own contract).
 */
export function msUntilLocalMidnight(now: Date = new Date()): number {
  const midnight = new Date(now.getTime());
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - now.getTime());
}

/**
 * `H:MM:SS` / `M:SS` / `Ns` for a live countdown, given MILLISECONDS.
 *
 * Not formatEta: that floors to whole minutes, so a "4m" that sits unchanged
 * for sixty seconds reads as a frozen UI, and it renders <= 0 as an infinity
 * glyph, which is exactly wrong for a timer about to expire.
 */
export function formatCountdown(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  if (minutes > 0) return `${minutes}:${pad(seconds)}`;
  return `${seconds}s`;
}

/** "23:00" for a Date or ms timestamp, in the device's timezone. */
export function formatClockTime(value: Date | number): string {
  const d = typeof value === "number" ? new Date(value) : value;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "Sep 15" for a Date or ms timestamp, in the device's timezone. */
export function formatShortDate(value: Date | number): string {
  const d = typeof value === "number" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "14:03:27" from the query log's ISO 8601 timestamp string. */
export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Compact relative age for an ISO 8601 timestamp string. */
export function formatIsoAgo(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "Unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown";
  const deltaS = Math.max(0, Math.round((now - then) / 1000));
  if (deltaS < 60) return "just now";
  if (deltaS < 3600) return `${Math.floor(deltaS / 60)}m ago`;
  if (deltaS < 86400) return `${Math.floor(deltaS / 3600)}h ago`;
  return `${Math.floor(deltaS / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Query-log presentation
// ---------------------------------------------------------------------------

export interface QueryReasonMeta {
  label: string;
  verdict: ReturnType<typeof classifyQueryReason>;
  blocked: boolean;
  /** Tailwind class for the leading dot. */
  dotClass: string;
  /** components/ui/badge.tsx variant. */
  badgeVariant: "error" | "info" | "success" | "warning" | "default";
}

/**
 * Colour and label for one query's filtering reason.
 *
 * An unrecognized reason lands on the neutral zinc default via
 * classifyQueryReason's "other" — never on an allowed-looking colour. AGH adds
 * reasons across releases, and a new block type rendering green would be
 * worse than rendering grey.
 */
export function queryReasonMeta(reason: string | null | undefined): QueryReasonMeta {
  const verdict = classifyQueryReason(reason);
  const label = queryReasonLabel(reason);
  switch (verdict) {
    case "blocked":
      return { label, verdict, blocked: true, dotClass: "bg-danger", badgeVariant: "error" };
    case "rewritten":
      return { label, verdict, blocked: false, dotClass: "bg-primary", badgeVariant: "info" };
    case "allowed":
      return { label, verdict, blocked: false, dotClass: "bg-success", badgeVariant: "success" };
    default:
      return { label, verdict, blocked: false, dotClass: "bg-zinc-600", badgeVariant: "default" };
  }
}
