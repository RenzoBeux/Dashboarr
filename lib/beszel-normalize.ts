import type {
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

export function normalizeBeszelStatsPoint(
  record: BeszelSystemStatsRecord,
): BeszelStatsPoint {
  const s: BeszelStatsWire = record.stats;
  return {
    createdAt: record.created,
    cpuPct: s.cpu ?? 0,
    memPct: s.mp ?? 0,
    diskPct: s.dp ?? 0,
    loadAvg1: s.la?.[0],
  };
}
