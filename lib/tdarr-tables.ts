import { fmt } from "@/lib/tdarr-format";
import type {
  TdarrStatistics, TdarrStatusTableId, TdarrStatusTablePage, TdarrStatusTableRow,
} from "@/lib/types";

// Table ids, titles and per-row actions were copied from the Tdarr web UI
// bundle (its status-tables column builder), not from the public API docs,
// which don't describe /client/status-tables at all.
export interface TdarrTableDef {
  id: TdarrStatusTableId;
  label: string;
  shortLabel: string;
  kind: "transcode" | "health" | "hold";
  /** A "finished" table, which has a completion timestamp column. */
  done: boolean;
  countKey: keyof TdarrStatistics;
}

export interface TdarrRowAction {
  key: "bump" | "skip" | "requeue" | "ignore" | "unhold";
  label: string;
  updatedObj: Record<string, unknown>;
}

export const TDARR_TABLES: readonly TdarrTableDef[] = [
  { id: "table1", label: "Transcode queue", shortLabel: "Transcode Q", kind: "transcode", done: false, countKey: "table1Count" },
  { id: "table2", label: "Transcode: Success/Not required", shortLabel: "Success", kind: "transcode", done: true, countKey: "table2Count" },
  { id: "table3", label: "Transcode: Error/Cancelled", shortLabel: "Error", kind: "transcode", done: true, countKey: "table3Count" },
  { id: "table4", label: "Health check queue", shortLabel: "Health Q", kind: "health", done: false, countKey: "table4Count" },
  { id: "table5", label: "Health check: Healthy", shortLabel: "Healthy", kind: "health", done: true, countKey: "table5Count" },
  { id: "table6", label: "Health check: Error/Cancelled", shortLabel: "Unhealthy", kind: "health", done: true, countKey: "table6Count" },
  { id: "table0", label: "Hold", shortLabel: "Hold", kind: "hold", done: false, countKey: "table0Count" },
];

export function getTableDef(id: string): TdarrTableDef | undefined {
  return TDARR_TABLES.find((t) => t.id === id);
}

export function tableCount(
  stats: TdarrStatistics | undefined,
  id: TdarrStatusTableId,
): number | null {
  const def = getTableDef(id);
  const v = def && stats ? stats[def.countKey] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const BUMP: TdarrRowAction = { key: "bump", label: "Bump", updatedObj: { bumped: true } };

const ACTIONS: Record<TdarrStatusTableId, TdarrRowAction[]> = {
  table0: [{ key: "unhold", label: "Unhold", updatedObj: { TranscodeDecisionMaker: "Queued", HealthCheck: "Queued" } }],
  table1: [BUMP, { key: "skip", label: "Skip", updatedObj: { TranscodeDecisionMaker: "Not required" } }],
  table2: [{ key: "requeue", label: "Requeue", updatedObj: { TranscodeDecisionMaker: "Queued" } }],
  table3: [
    { key: "requeue", label: "Requeue", updatedObj: { TranscodeDecisionMaker: "Queued" } },
    { key: "ignore", label: "Ignore", updatedObj: { TranscodeDecisionMaker: "Not required" } },
  ],
  table4: [BUMP, { key: "skip", label: "Skip", updatedObj: { HealthCheck: "Success" } }],
  table5: [{ key: "requeue", label: "Requeue", updatedObj: { HealthCheck: "Queued" } }],
  table6: [
    { key: "requeue", label: "Requeue", updatedObj: { HealthCheck: "Queued" } },
    { key: "ignore", label: "Ignore", updatedObj: { HealthCheck: "Success" } },
  ],
};

export function rowActions(id: TdarrStatusTableId): TdarrRowAction[] {
  return ACTIONS[id] ?? [];
}

const gb = (n: number) => `${fmt(n, 2)} GB`;

// Units: file_size is MB; oldSize/newSize are GB; newVsOldRatio is a percent.
// The web UI falls back to file_size when oldSize is 0/missing.
export function rowSizeLine(row: TdarrStatusTableRow, id: TdarrStatusTableId): string {
  const old = typeof row.oldSize === "number" && row.oldSize > 0
    ? row.oldSize
    : (row.file_size ?? 0) / 1024;
  const isTranscodeDone = id === "table2" || id === "table3";
  const hasNew = typeof row.newSize === "number" && row.newSize > 0;
  if (isTranscodeDone && hasNew) {
    return `${gb(old)} → ${gb(row.newSize!)} (${fmt(row.newVsOldRatio, 0)}%)`;
  }
  return gb(old);
}

export function rowTimestamp(
  row: TdarrStatusTableRow,
  id: TdarrStatusTableId,
): number | undefined {
  const def = getTableDef(id);
  if (!def?.done) return undefined;
  const t = def.kind === "health" ? row.lastHealthCheckDate : row.lastTranscodeDate;
  // Past ±8.64e15 ms a Date is invalid and toISOString() throws.
  return typeof t === "number" && t > 0 && Number.isFinite(new Date(t).getTime())
    ? t
    : undefined;
}

export const TDARR_TABLE_PAGE_SIZE = 25;

// Offset pagination. Stop on totalCount (so a last page that is exactly full
// doesn't trigger one more empty fetch) and on an empty page (totalCount can
// move between requests as the queue drains).
export function nextStatusTableStart(
  lastPage: TdarrStatusTablePage,
  allPages: TdarrStatusTablePage[],
): number | undefined {
  if (!lastPage.array?.length) return undefined;
  const loaded = allPages.reduce((n, p) => n + (p.array?.length ?? 0), 0);
  return loaded < (lastPage.totalCount ?? 0) ? loaded : undefined;
}

/**
 * Concatenate infinite-query pages into one row list. The queue shifts while
 * paging, so a row can land on two pages; the first occurrence wins.
 */
export function flattenStatusPages(
  pages: readonly TdarrStatusTablePage[] | undefined,
): TdarrStatusTableRow[] {
  const seen = new Set<string>();
  const out: TdarrStatusTableRow[] = [];
  for (const p of pages ?? []) {
    for (const r of p?.array ?? []) {
      if (seen.has(r._id)) continue;
      seen.add(r._id);
      out.push(r);
    }
  }
  return out;
}

/**
 * Reflect a successful row action in the cached pages without a refetch. Bump
 * keeps the file in its table (flagged); every other action moves it to a
 * different table, so it is dropped here and the total shrinks with it, which
 * keeps the next page's offset (the loaded row count) in step with the server.
 */
export function applyRowAction<T extends { pages: TdarrStatusTablePage[] }>(
  data: T | undefined,
  fileIds: readonly string[],
  action: TdarrRowAction,
): T | undefined {
  if (!data) return data;
  const ids = new Set(fileIds);
  if (action.key === "bump") {
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        array: (p.array ?? []).map((r) => (ids.has(r._id) ? { ...r, bumped: true } : r)),
      })),
    };
  }
  let removed = 0;
  const pages = data.pages.map((p) => {
    const array = (p.array ?? []).filter((r) => !ids.has(r._id));
    removed += (p.array?.length ?? 0) - array.length;
    return { ...p, array };
  });
  return {
    ...data,
    pages: pages.map((p) => ({ ...p, totalCount: Math.max(0, (p.totalCount ?? 0) - removed) })),
  };
}

