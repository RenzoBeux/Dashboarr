import type { SabQueue, SabQueueSlot } from "@/lib/types";

// Jobs per request. A 2,300-job queue answers an unbounded mode=queue with
// about 1.1 MB of JSON (#514), so every read of the queue is one page of this
// size at most.
export const SAB_QUEUE_PAGE_SIZE = 100;

// Optional slice of mode=queue. With none of these SAB answers the whole queue.
// - start/limit: window over the queue in SAB's order. limit 0 = everything.
// - status: SAB-side status filter (internal job status, e.g. "Paused"). Only
//   SAB 4.2+ reads it; older versions ignore it and answer unfiltered.
// - nzoIds: just these jobs (3.x+).
export interface SabQueueQuery {
  start?: number;
  limit?: number;
  status?: string[];
  nzoIds?: string[];
}

export function sabQueuePageRequest(page: number): { start: number; limit: number } {
  return { start: page * SAB_QUEUE_PAGE_SIZE, limit: SAB_QUEUE_PAGE_SIZE };
}

const statusKey = (status: string[] | undefined) => status?.join(",") ?? "all";

// Every polled page of the queue (or of a status filter's matches).
export function sabQueuePagesKey(
  instanceId: string | null | undefined,
  status: string[] | undefined,
) {
  return ["sabnzbd", instanceId, "queue", "page", statusKey(status)] as const;
}

// A polled page of the queue: the first, or one with rows on screen.
export function sabQueuePageKey(
  instanceId: string | null | undefined,
  status: string[] | undefined,
  page: number,
) {
  return [...sabQueuePagesKey(instanceId, status), page] as const;
}

// The whole queue, as one consistent read (SabQueueSnapshot).
export function sabQueueSnapshotKey(
  instanceId: string | null | undefined,
  status: string[] | undefined,
) {
  return ["sabnzbd", instanceId, "queue", "snapshot", statusKey(status)] as const;
}

export interface SabQueueSnapshot {
  // Every job (or every match of a status filter), in SAB's order, from reads
  // that agree with each other. `index` is the job's position.
  slots: SabQueueSlot[];
  // The queue's counts and size when read (see sabQueueSignature).
  signature: string;
}

/**
 * What changes when a job arrives, leaves or changes state anywhere in the
 * queue: `noofslots` is the queue's length (even under a status filter, which
 * `NzbQueue.queue_info` doesn't count), `noofslots_total` the jobs it counts
 * as downloadable, neither paused nor checking, and `mb` their total size.
 * A job's size is set when it is imported and only drops when files are
 * removed from it (NzbObject.add_nzf, NzbQueue.remove_nzf), so `mb` doesn't
 * move with progress, but does when one job leaves and another arrives
 * between two reads, which leaves both counts as they were.
 */
export function sabQueueSignature(queue: SabQueue): string {
  return `${queue.noofslots}/${queue.noofslots_total}/${queue.mb}`;
}

// Whether a read starting at `start` reached the end of the queue (or of a
// status filter's matches, which SAB can't count).
export function sabPageEndsQueue(queue: SabQueue, start: number, statusFiltered: boolean): boolean {
  const received = queue.slots?.length ?? 0;
  if (received < SAB_QUEUE_PAGE_SIZE) return true;
  return !statusFiltered && start + received >= Number(queue.noofslots);
}

const SNAPSHOT_ATTEMPTS = 3;

// Every attempt at reading the whole queue saw it change.
export class SabQueueChangedError extends Error {
  constructor() {
    super("The SABnzbd queue kept changing while it was being read.");
    this.name = "SabQueueChangedError";
  }
}

/**
 * The whole queue, SAB_QUEUE_PAGE_SIZE jobs per request (#514). Jobs shift
 * position as others finish, arrive, are deleted or are moved, so pages read
 * at different times don't line up: a job that crosses a page boundary between
 * two reads is in neither, or in both. Every read after the first therefore
 * starts one job early, on the last job already held, the queue's signature
 * must not change from read to read, and no job may come back. When any check
 * fails the queue moved during the read, and it starts over.
 *
 * Moves alone never change the signature, and two jobs that swap places
 * across a boundary leave the overlapping job where it was too, but the one
 * that moved back is then read twice. With moves only, the reads cover as many
 * positions as the queue has jobs, so when no job repeats, none is missing.
 *
 * `head` is a page-0 read to start from (the list polls it anyway); a stale
 * one fails the first check and costs a fresh read. Once `signal` aborts, no
 * further request goes out.
 */
export async function readSabQueueSnapshot(
  read: (query: SabQueueQuery) => Promise<SabQueue>,
  status: string[] | undefined,
  head?: SabQueue,
  signal?: AbortSignal,
): Promise<SabQueueSnapshot> {
  const statusFiltered = !!status?.length;
  const readPage = (query: SabQueueQuery) => {
    if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
    return read(query);
  };
  for (let attempt = 0; attempt < SNAPSHOT_ATTEMPTS; attempt++) {
    const first =
      attempt === 0 && head
        ? head
        : await readPage({ start: 0, limit: SAB_QUEUE_PAGE_SIZE, status });
    const signature = sabQueueSignature(first);
    const slots = [...(first.slots ?? [])];
    const held = new Set(slots.map((s) => s.nzo_id));
    let consistent = true;
    let done = sabPageEndsQueue(first, 0, statusFiltered);
    while (!done) {
      const start = slots.length - 1;
      const page = await readPage({ start, limit: SAB_QUEUE_PAGE_SIZE, status });
      const received = page.slots ?? [];
      const added = received.slice(1);
      if (
        sabQueueSignature(page) !== signature ||
        received[0]?.nzo_id !== slots[start].nzo_id ||
        added.some((s) => held.has(s.nzo_id))
      ) {
        consistent = false;
        break;
      }
      for (const s of added) held.add(s.nzo_id);
      slots.push(...added);
      done = received.length <= 1 || sabPageEndsQueue(page, start, statusFiltered);
    }
    if (consistent) {
      return { slots: slots.map((slot, index) => ({ ...slot, index })), signature };
    }
  }
  throw new SabQueueChangedError();
}

/**
 * Whether a newer read of a page tells the same story as the snapshot: the
 * same jobs at the same positions, and nothing arrived, left or changed state
 * anywhere else. Progress, ETAs and speed don't count.
 */
export function sabPageAgrees(snapshot: SabQueueSnapshot, queue: SabQueue, page: number): boolean {
  if (sabQueueSignature(queue) !== snapshot.signature) return false;
  const start = page * SAB_QUEUE_PAGE_SIZE;
  const held = snapshot.slots.slice(start, start + SAB_QUEUE_PAGE_SIZE);
  const received = queue.slots ?? [];
  return received.length === held.length && received.every((s, i) => s.nzo_id === held[i].nzo_id);
}

// A polled page and when it was read (dataUpdatedAt).
export interface SabPageRead {
  page: number;
  queue: SabQueue;
  readAt: number;
}

// A re-read of a queue of P pages waits at least P times this long after the
// previous attempt: a busy 2,300-job queue is read whole at most every 46 s,
// against every 5 s before #514, and a one-page queue at every poll.
export const SAB_SNAPSHOT_GAP_PER_PAGE_MS = 2000;

// Some changes show in no poll: a paused job replaced by another paused job
// off screen leaves the counts, the size (which leaves paused jobs out) and
// the polled pages as they were, and SAB's queue has no version or change
// counter. So the whole queue is also read once it is P times this old: every
// 30 s for 300 jobs, every 3 min 50 s for 2,300: about 10 jobs a second.
export const SAB_SNAPSHOT_MAX_AGE_PER_PAGE_MS = 10_000;

/**
 * Whether to read the whole queue (again), and when, after the last attempt,
 * good or failed (`failedAt`, 0 for none):
 * - the last attempt failed (a refresh, or the first read): after the gap, so
 *   a failing read is tried again no more often than a changing queue is read;
 * - a page polled since the last good read disagrees with it (sabPageAgrees):
 *   after the gap;
 * - otherwise, once it reaches the max age, for the changes no poll shows.
 */
export function sabSnapshotNeedsRead(
  snapshot: SabQueueSnapshot | undefined,
  readAt: number,
  failedAt: number,
  pages: readonly SabPageRead[],
  now: number,
): boolean {
  const failed = failedAt > readAt;
  if (!snapshot && !failed) return false;
  const changed =
    !!snapshot && pages.some((p) => p.readAt > readAt && !sabPageAgrees(snapshot, p.queue, p.page));
  const jobs = snapshot
    ? snapshot.slots.length
    : Number(pages.find((p) => p.page === 0)?.queue.noofslots) || 0;
  const pageCount = Math.max(1, Math.ceil(jobs / SAB_QUEUE_PAGE_SIZE));
  const wait =
    failed || changed ? SAB_SNAPSHOT_GAP_PER_PAGE_MS : SAB_SNAPSHOT_MAX_AGE_PER_PAGE_MS;
  return now - Math.max(readAt, failedAt) >= pageCount * wait;
}

/**
 * The queue to show. The jobs and their order come from one read that agrees
 * with itself: the snapshot, or the first page when it holds the whole queue
 * or no snapshot is there yet. Each job then takes its values from the newest
 * read that has it, so polled pages keep the rows on screen live without
 * moving any job. A job that finished stays until the next snapshot rather
 * than a job that only moved going missing. The header (speed, size left,
 * paused) is the newest page's.
 */
export function mergeSabQueue(
  snapshot: SabQueueSnapshot | undefined,
  snapshotReadAt: number,
  pages: readonly SabPageRead[],
  statusFiltered: boolean,
): { queue: SabQueue; complete: boolean } | undefined {
  const head = pages.find((p) => p.page === 0);
  if (!head) return undefined;
  const headIsWhole = sabPageEndsQueue(head.queue, 0, statusFiltered);
  const useSnapshot = !!snapshot && !(headIsWhole && head.readAt >= snapshotReadAt);
  const base = useSnapshot ? snapshot!.slots : (head.queue.slots ?? []);

  const newest = new Map<string, { slot: SabQueueSlot; readAt: number }>();
  for (const p of pages) {
    if (useSnapshot && p.readAt <= snapshotReadAt) continue;
    for (const slot of p.queue.slots ?? []) {
      const seen = newest.get(slot.nzo_id);
      if (!seen || seen.readAt < p.readAt) newest.set(slot.nzo_id, { slot, readAt: p.readAt });
    }
  }
  const header = pages.reduce((a, b) => (b.readAt > a.readAt ? b : a)).queue;
  const slots = base.map((slot, index) => ({ ...(newest.get(slot.nzo_id)?.slot ?? slot), index }));
  return {
    queue: { ...header, slots: statusFiltered ? slots : withSabQueueEtas(slots, header) },
    complete: useSnapshot || headIsWhole,
  };
}

const ACTIVE_STATUSES = new Set(["Downloading", "Fetching", "Queued"]);
const MEBI = 1024 * 1024;
const pad = (n: number) => String(n).padStart(2, "0");

// misc.format_time_left: [D:]H:MM:SS.
export function formatSabTimeLeft(bytes: number, bps: number): string {
  const total = bytes > 0 && bps > 0 ? Math.floor(bytes / bps) : 0;
  if (total <= 0) return "0:00:00";
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;
  const time = `${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  return days > 0 ? `${days}:${pad(hours)}:${time}` : `${hours}:${time}`;
}

/**
 * Each job's ETA as SAB gives it in a read from the head of the queue
 * (api.py build_queue, unchanged since 4.0): the bytes left of every active
 * job up to and including this one, over the current speed. A job is active
 * when it has Force priority, or when the downloader isn't paused (the
 * header's `paused` covers the post-processing pause too) and the job is
 * downloading, fetching or queued, not waiting out a propagation delay.
 *
 * SAB's own per-read numbers can't be stitched together: `queue_info` sums
 * every unpaused job before `start` into the first slot's ETA, propagating
 * ones included, while inside the read it skips them, so the same job reads
 * differently from different windows. Recomputing over the whole list gives
 * every row the number a single full read would.
 *
 * Bytes come from `mbleft` (2 decimals of a MiB), so a job deep in the queue
 * can be a second or so off SAB's own figure.
 */
export function withSabQueueEtas(slots: SabQueueSlot[], header: SabQueue): SabQueueSlot[] {
  const bps = (parseFloat(header.kbpersec) || 0) * 1024;
  let running = 0;
  return slots.map((slot) => {
    const active =
      slot.priority === "Force" || (!header.paused && ACTIVE_STATUSES.has(slot.status));
    if (!active) return { ...slot, timeleft: "0:00:00" };
    running += (parseFloat(slot.mbleft) || 0) * MEBI;
    return { ...slot, timeleft: formatSabTimeLeft(running, bps) };
  });
}
