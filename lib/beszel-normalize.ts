import type {
  BeszelContainerStatsPoint,
  BeszelContainerStatsRecord,
  BeszelInfoWire,
  BeszelStatsWire,
  BeszelSystem,
  BeszelSystemRecord,
  BeszelStatsPoint,
  BeszelSystemStatsRecord,
} from "@/lib/types";

/**
 * Beszel's `systems.info` and `system_stats.stats` JSON columns store a
 * space-optimized wire format (single/double-letter keys, verified against
 * henrygd/beszel@main's `json:` struct tags AND a live v0.19.0 hub — see the
 * "--- Beszel Types ---" section in lib/types.ts). Nothing outside this file
 * should touch a raw `mp`/`dp`/`la`/`cpu` key: every read goes through
 * normalizeBeszelSystem / normalizeBeszelStatsPoint so a future wire-shape
 * change has exactly one place to fix.
 */

export function normalizeBeszelInfo(info: BeszelInfoWire | undefined | null): Omit<
  BeszelSystem,
  "id" | "name" | "status" | "host"
> {
  const i = info ?? ({} as BeszelInfoWire);
  return {
    cpuPct: i.cpu ?? 0,
    memPct: i.mp ?? 0,
    diskPct: i.dp ?? 0,
    gpuPct: i.g,
    uptimeSeconds: i.u ?? 0,
    loadAvg: i.la,
    agentVersion: i.v ?? "",
    dashboardTempC: i.dt,
    hostname: i.h,
  };
}

export function normalizeBeszelSystem(record: BeszelSystemRecord): BeszelSystem {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    host: record.host,
    ...normalizeBeszelInfo(record.info),
  };
}

/** Beszel uptimes commonly run into days/weeks, unlike torrent ETAs. */
export function formatBeszelUptime(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** A byte array wins when the agent sent one; an all-zero array means "not reported". */
function pair(arr: [number, number] | undefined, i: 0 | 1, legacy: number | undefined, legacyScale: number) {
  if (arr && (arr[0] || arr[1])) return arr[i];
  return legacy === undefined ? undefined : legacy * legacyScale;
}

function scaled(v: number | undefined, scale: number) {
  return v === undefined ? undefined : v * scale;
}

export function normalizeBeszelStatsPoint(record: BeszelSystemStatsRecord): BeszelStatsPoint {
  const s: BeszelStatsWire = record.stats ?? {};
  const hasMemBytes = !!s.mem && s.mem[0] > 0;
  const gpus: Record<string, number> = {};
  for (const [id, g] of Object.entries(s.g ?? {})) gpus[g.n || id] = g.u;
  return {
    createdAt: record.created,
    cpuPct: s.cpu,
    memPct: s.mp,
    memUsedBytes: hasMemBytes ? s.mem![1] : scaled(s.mu, GiB),
    memTotalBytes: hasMemBytes ? s.mem![0] : scaled(s.m, GiB),
    diskPct: s.dp,
    diskUsedBytes: scaled(s.du, GiB),
    diskTotalBytes: scaled(s.d, GiB),
    diskReadBps: pair(s.dio, 0, s.dr, MiB),
    diskWriteBps: pair(s.dio, 1, s.dw, MiB),
    netSentBps: pair(s.b, 0, s.ns, MiB),
    netRecvBps: pair(s.b, 1, s.nr, MiB),
    load: s.la,
    temps: { ...(s.t ?? {}) },
    gpus,
    swapUsedBytes: s.swap && s.swap[0] > 0 ? s.swap[1] : scaled(s.su, GiB),
  };
}

export function normalizeBeszelContainerStatsPoint(
  record: BeszelContainerStatsRecord,
): BeszelContainerStatsPoint {
  const containers: BeszelContainerStatsPoint["containers"] = {};
  for (const c of record.stats ?? []) {
    const legacy = c.ns === undefined && c.nr === undefined ? undefined : ((c.ns ?? 0) + (c.nr ?? 0)) * MiB;
    containers[c.n] = {
      cpuPct: c.c,
      memBytes: c.m * MiB,
      netBps: c.b && (c.b[0] || c.b[1]) ? c.b[0] + c.b[1] : legacy,
    };
  }
  return { createdAt: record.created, containers };
}
