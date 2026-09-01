import {
  classifyQueryStatus,
  queryStatusLabel,
  type PiholeHistoryPoint,
  type PiholeQueryVerdict,
} from "@/lib/pihole-normalize";

/**
 * Presentation helpers for the Pi-hole screens.
 *
 * Split from lib/pihole-normalize.ts on purpose: that module is the wire
 * format, this one is how we choose to draw it. Both are pure and unit-tested.
 */

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

/** The preset disable durations, in the order the action sheet shows them. */
export const PIHOLE_DISABLE_PRESETS = [
  { label: "1 minute", seconds: 60 },
  { label: "5 minutes", seconds: 300 },
  { label: "30 minutes", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
] as const;

/** Seven days, matching the custom-duration cap. */
export const MAX_DISABLE_SECONDS = 604_800;

/**
 * Seconds from now until the device's next local midnight.
 *
 * `setHours(24, 0, 0, 0)` is local-calendar arithmetic, so a spring-forward
 * night correctly yields 23 hours and a fall-back night 25. Do NOT compute this
 * as `86400 - secondsSinceMidnight`, which is wrong on both.
 *
 * Pi-hole's `timer` is a DURATION it counts down from receipt, not an absolute
 * instant, so a clock offset between phone and server does not matter here —
 * only request latency, hence the rounding and the 1-second floor (a timer of 0
 * risks being read as "permanent").
 *
 * The duration is derived from the DEVICE's calendar. If the Pi-hole runs in
 * another timezone, "until tomorrow" still means the user's tomorrow, which is
 * the intent — the sheet states the resulting wall-clock time so there is no
 * ambiguity.
 */
export function secondsUntilLocalMidnight(now: Date = new Date()): number {
  const midnight = new Date(now.getTime());
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((midnight.getTime() - now.getTime()) / 1000));
}

/**
 * `H:MM:SS` / `M:SS` / `Ns` for a live countdown.
 *
 * Not formatEta: that floors to whole minutes, so a "4m" that sits unchanged
 * for sixty seconds reads as a frozen UI, and it renders <= 0 as an infinity
 * glyph, which is exactly wrong for a timer about to expire.
 */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
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

/** "14:03:27" — a live log wants exact times, not "2m ago". */
export function formatLogTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Compact relative age for a unix-seconds timestamp. 0 means "never". */
export function formatUnixAgo(unixSeconds: number, now: number = Date.now()): string {
  if (!unixSeconds) return "Unknown";
  const deltaS = Math.max(0, Math.round(now / 1000 - unixSeconds));
  if (deltaS < 60) return "just now";
  if (deltaS < 3600) return `${Math.floor(deltaS / 60)}m ago`;
  if (deltaS < 86400) return `${Math.floor(deltaS / 3600)}h ago`;
  return `${Math.floor(deltaS / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Query-log presentation
// ---------------------------------------------------------------------------

export interface QueryStatusMeta {
  label: string;
  verdict: PiholeQueryVerdict;
  blocked: boolean;
  /** Tailwind class for the leading dot. */
  dotClass: string;
  /** components/ui/badge.tsx variant. */
  badgeVariant: "error" | "info" | "success" | "warning" | "default";
}

/**
 * Colour and label for one query status.
 *
 * An unrecognized status lands on the neutral zinc default via
 * classifyQueryStatus's "other" — never on an allowed-looking colour. Pi-hole
 * adds status codes across point releases, and a new block reason rendering
 * green would be worse than rendering grey.
 */
export function queryStatusMeta(status: string | null | undefined): QueryStatusMeta {
  const verdict = classifyQueryStatus(status);
  const label = queryStatusLabel(status);
  switch (verdict) {
    case "blocked":
      return { label, verdict, blocked: true, dotClass: "bg-danger", badgeVariant: "error" };
    case "cached":
      return { label, verdict, blocked: false, dotClass: "bg-success", badgeVariant: "success" };
    case "forwarded":
      return { label, verdict, blocked: false, dotClass: "bg-primary", badgeVariant: "info" };
    default:
      return {
        label,
        verdict,
        blocked: false,
        // RETRIED / IN_PROGRESS / DBBUSY are transient rather than wrong, so
        // amber; everything genuinely unknown stays grey.
        dotClass:
          status === "RETRIED" || status === "RETRIED_DNSSEC" || status === "IN_PROGRESS"
            ? "bg-warning"
            : "bg-zinc-600",
        badgeVariant:
          status === "RETRIED" || status === "RETRIED_DNSSEC" || status === "IN_PROGRESS"
            ? "warning"
            : "default",
      };
  }
}

// ---------------------------------------------------------------------------
// Chart shaping
// ---------------------------------------------------------------------------

/**
 * Sum consecutive history points into `chunk`-sized buckets.
 *
 * 144 ten-minute points across a phone-width card is ~2 dp per bar, which
 * aliases into mush, so the chart aggregates to fit its MEASURED width rather
 * than a hardcoded count (tablets and landscape then get finer resolution).
 *
 * The first point's timestamp anchors each bucket, so labels stay aligned to
 * real clock times rather than drifting to the bucket's midpoint.
 */
export function downsampleHistory(
  points: readonly PiholeHistoryPoint[],
  chunk: number,
): PiholeHistoryPoint[] {
  const size = Math.max(1, Math.floor(chunk));
  if (size === 1) return [...points];
  const out: PiholeHistoryPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    if (!slice.length) continue;
    out.push({
      timestampMs: slice[0]!.timestampMs,
      total: sum(slice, "total"),
      cached: sum(slice, "cached"),
      blocked: sum(slice, "blocked"),
      forwarded: sum(slice, "forwarded"),
    });
  }
  return out;
}

function sum(
  points: readonly PiholeHistoryPoint[],
  key: "total" | "cached" | "blocked" | "forwarded",
): number {
  return points.reduce((acc, p) => acc + p[key], 0);
}

/** Legibility floor, in dp, for one bar plus its gap. */
export const MIN_CHART_SLOT_DP = 6;

/**
 * How many source points to fold into each bar, given the plot width.
 *
 * Deliberately NOT scaled by uiScale: bars are graphics, not type, so growing
 * them at a higher scale would only show the user less of their own data.
 */
export function historyChunkForWidth(pointCount: number, width: number): number {
  if (pointCount <= 0 || width <= 0) return 1;
  const target = Math.max(24, Math.min(pointCount, Math.floor(width / MIN_CHART_SLOT_DP)));
  return Math.max(1, Math.ceil(pointCount / target));
}
