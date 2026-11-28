import { normalizeBeszelContainerStatsPoint, normalizeBeszelStatsPoint } from "@/lib/beszel-normalize";
import type {
  BeszelContainerStatWire,
  BeszelContainerStatsPoint,
  BeszelStatsPoint,
  BeszelStatsWire,
} from "@/lib/types";

/** Points kept in the Live view: 60 one-second updates, like the hub's 1-minute chart. */
export const LIVE_WINDOW = 60;

/**
 * The PocketBase realtime topic the hub web UI subscribes to for one system.
 * Encoded exactly like the JS SDK's subscribe(topic, cb, { query }): the hub
 * reads `options.query.system` (internal/hub/systems/system_realtime.go).
 */
export function beszelRealtimeTopic(systemId: string): string {
  return "rt_metrics?options=" + encodeURIComponent(JSON.stringify({ query: { system: systemId } }));
}

/**
 * One rt_metrics message (`system.CombinedData`: {stats, info, container}) as
 * chart points. Realtime payloads carry no timestamp, so the receive time
 * stands in for `created`, as the hub web UI does.
 */
export function normalizeRealtimeMessage(
  data: unknown,
  now: number,
): { stats: BeszelStatsPoint; containers: BeszelContainerStatsPoint | null } | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as { stats?: BeszelStatsWire; container?: BeszelContainerStatWire[] | null };
  if (!msg.stats || typeof msg.stats !== "object") return null;
  const created = new Date(now).toISOString();
  const base = { id: "", system: "", type: "1m" as const, created };
  return {
    stats: normalizeBeszelStatsPoint({ ...base, stats: msg.stats }),
    containers:
      Array.isArray(msg.container) && msg.container.length > 0
        ? normalizeBeszelContainerStatsPoint({ ...base, stats: msg.container })
        : null,
  };
}

export function appendWindow<T>(buf: T[], item: T, max = LIVE_WINDOW): T[] {
  const next = buf.length >= max ? buf.slice(buf.length - max + 1) : buf.slice();
  next.push(item);
  return next;
}

const BACKOFF = [1000, 2000, 5000, 10_000];

/** Delay before reconnect attempt `attempt` (0-based). */
export function realtimeBackoffMs(attempt: number): number {
  return BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
}

/** Realtime needs a running agent ≥ 0.13.0 — the hub web UI hides its 1m view otherwise. */
export function liveSupported(system: { status: string; agentVersion: string }): boolean {
  if (system.status !== "up") return false;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(system.agentVersion.trim());
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 0 || minor >= 13;
}

/**
 * Whether the Live stream stays open in this AppState. iOS reports
 * "inactive" for Control Center, the notification shade, the app switcher and
 * Face ID prompts; closing on those would wipe the window and re-authenticate
 * for a glance. Only a real background closes it.
 */
export function appStateKeepsLive(state: string): boolean {
  return state !== "background";
}
