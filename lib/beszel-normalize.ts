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

/**
 * Rate pairs (`b`, `dio`) are serialised with omitzero, and current agents no
 * longer send the legacy MB/s scalars, so an idle link or disk arrives as no
 * key at all: absence on an existing record means 0, not "not reported".
 */
function pair(arr: [number, number] | undefined, i: 0 | 1, legacy: number | undefined, legacyScale: number) {
  if (arr) return arr[i];
  return (legacy ?? 0) * legacyScale;
}

/** Keys GPUs by model name, adding the GPU id only when two cards share a name. */
function gpuReadings(g: BeszelStatsWire["g"]): Record<string, number> {
  const entries = Object.entries(g ?? {});
  const counts = new Map<string, number>();
  for (const [id, r] of entries) counts.set(r.n || id, (counts.get(r.n || id) ?? 0) + 1);
  const out: Record<string, number> = {};
  for (const [id, r] of entries) {
    const name = r.n || id;
    out[(counts.get(name) ?? 0) > 1 ? `${name} #${id}` : name] = r.u;
  }
  return out;
}

function scaled(v: number | undefined, scale: number) {
  return v === undefined ? undefined : v * scale;
}

export function normalizeBeszelStatsPoint(record: BeszelSystemStatsRecord): BeszelStatsPoint {
  const s: BeszelStatsWire = record.stats ?? {};
  const hasMemBytes = !!s.mem && s.mem[0] > 0;
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
    // `la` is a fixed-length array upstream (never omitted); agents without a
    // load average (Windows) send [0,0,0], which would chart as a flat line.
    load: s.la && (s.la[0] || s.la[1] || s.la[2]) ? s.la : undefined,
    temps: { ...(s.t ?? {}) },
    gpus: gpuReadings(s.g),
    swapUsedBytes: s.swap && s.swap[0] > 0 ? s.swap[1] : scaled(s.su, GiB),
  };
}

export function normalizeBeszelContainerStatsPoint(
  record: BeszelContainerStatsRecord,
): BeszelContainerStatsPoint {
  const containers: BeszelContainerStatsPoint["containers"] = {};
  for (const c of record.stats ?? []) {
    containers[c.n] = {
      cpuPct: c.c,
      memBytes: c.m * MiB,
      // `b` is omitzero like the system pair: missing on an idle container.
      netBps: c.b ? c.b[0] + c.b[1] : ((c.ns ?? 0) + (c.nr ?? 0)) * MiB,
    };
  }
  return { createdAt: record.created, containers };
}
