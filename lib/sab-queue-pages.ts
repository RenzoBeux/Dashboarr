import type { SabQueue, SabQueueSlot } from "@/lib/types";

// Jobs per request. A 2,300-job queue answers an unbounded mode=queue with
// about 1.1 MB of JSON (#514), so the Downloads list reads the queue one page
// of this size at a time, and every request stays this size however far the
// user scrolls.
export const SAB_QUEUE_PAGE_SIZE = 100;

// Optional slice of mode=queue. With none of these SAB answers the whole queue.
// - start/limit: window over the queue in SAB's order. limit 0 = everything.
// - status: SAB-side status filter (internal job status, e.g. "Paused"). Only
//   SAB 4.2+ reads it; older versions ignore it and answer unfiltered.
// - nzoIds: just these jobs (3.x+). The ETAs of a filtered answer count only
//   the matched jobs, so never read a job's ETA through it (see readSabSlot).
export interface SabQueueQuery {
  start?: number;
  limit?: number;
  status?: string[];
  nzoIds?: string[];
}

export function sabQueuePageRequest(page: number): { start: number; limit: number } {
  return { start: page * SAB_QUEUE_PAGE_SIZE, limit: SAB_QUEUE_PAGE_SIZE };
}

// One cache entry per page, holding the raw SabQueue. Under
// ["sabnzbd", id, "queue"] so queue mutations and pull-to-refresh reach it.
export function sabQueuePageKey(
  instanceId: string | null | undefined,
  status: string[] | undefined,
  page: number,
) {
  return ["sabnzbd", instanceId, "queue", "page", status?.join(",") ?? "all", page] as const;
}

export interface SabQueuePagesInput {
  instanceId: string | null | undefined;
  // The instance is configured and reachable (useInstanceTarget's gate).
  active: boolean;
  // SAB-side status filter, if any.
  status: string[] | undefined;
  // Pages to hold, from the head.
  pages: number;
  // Pages with rows on screen (pickLivePages).
  livePages: readonly number[];
  pollInterval: number;
  read: (query: SabQueueQuery) => Promise<SabQueue>;
}

/**
 * One query per page, SAB_QUEUE_PAGE_SIZE jobs each (#514). The first page
 * always polls: it holds the jobs downloading now and the header's speed and
 * size left. A later page polls while its rows are on screen; off screen it
 * keeps its rows and isn't active, so a mutation or pull-to-refresh only
 * marks it stale, and it refetches once it scrolls back in (TanStack fetches
 * a stale query when `enabled` turns true). A poll so reads at most
 * 1 + livePages.length pages however far the list goes. A page that never
 * loaded fetches once, and not again after failing: the list's Retry does.
 */
export function sabQueuePageQueries(input: SabQueuePagesInput) {
  const { instanceId, active, status, livePages, pollInterval, read } = input;
  return Array.from({ length: Math.max(1, input.pages) }, (_, page) => ({
    queryKey: sabQueuePageKey(instanceId, status, page),
    queryFn: () => read({ ...sabQueuePageRequest(page), status }),
    refetchInterval: pollInterval,
    enabled: (query: { state: { data: unknown; status: string } }) =>
      active &&
      (page === 0 ||
        livePages.includes(page) ||
        (query.state.data === undefined && query.state.status !== "error")),
  }));
}

export interface SabQueuePagesMerge {
  // The first page's answer, for the header fields (speed, size left, paused).
  head: SabQueue;
  // Every loaded job once, in page order, tagged with the page it came from.
  slots: { slot: SabQueueSlot; page: number }[];
  // Jobs exist past the loaded pages. False while the newest page is loading
  // or failed: the list's footer shows that state instead.
  hasMore: boolean;
  // Jobs in the whole queue, when SAB can count them.
  total?: number;
}

/**
 * Joins the loaded pages into one list. Pages are fetched at different
 * times, and a job moves to the previous or next page as jobs ahead of it
 * finish or arrive, so the same job can sit in two pages: the earlier page
 * keeps it.
 *
 * Without a search or nzo_ids filter, `noofslots` is the length of the whole
 * queue, even when a status filter is sent (`NzbQueue.queue_info` overwrites
 * the match count with `len(self.__nzo_list)`). So a status-filtered list can
 * only tell "maybe more" from a full last page.
 */
export function mergeSabQueuePages(
  pages: readonly (SabQueue | undefined)[],
  statusFiltered: boolean,
): SabQueuePagesMerge | undefined {
  const head = pages[0];
  if (!head) return undefined;
  const seen = new Set<string>();
  const slots: SabQueuePagesMerge["slots"] = [];
  let loaded = 0;
  for (; loaded < pages.length; loaded++) {
    const queue = pages[loaded];
    if (!queue) break;
    for (const slot of queue.slots ?? []) {
      if (seen.has(slot.nzo_id)) continue;
      seen.add(slot.nzo_id);
      slots.push({ slot, page: loaded });
    }
  }
  const total = statusFiltered ? undefined : Number(head.noofslots) || 0;
  const last = pages[loaded - 1];
  const hasMore =
    loaded === pages.length &&
    (total === undefined
      ? (last?.slots?.length ?? 0) >= SAB_QUEUE_PAGE_SIZE
      : loaded * SAB_QUEUE_PAGE_SIZE < total);
  return { head, slots, hasMore, total };
}

// The unfiltered window the job detail reads around the job's last known
// index: a few jobs before it, for the jobs ahead that finish between polls.
const SLOT_WINDOW_LEAD = 5;
const SLOT_WINDOW_SIZE = 20;

/**
 * One job, with the ETA SAB shows in its queue: the time to download every
 * active job ahead of it plus this one. SAB sums the bytes ahead only over the
 * jobs a request matches (`queue_info` counts `bytes_left_previous_page` up to
 * `start` among matches, then `build_queue` adds each slot's own bytes), so
 * an nzo_ids read of a job deep in the queue reports its own download time
 * alone. The job is therefore read from an unfiltered window: around `near`,
 * its last known index, then page by page from the head. An nzo_ids read sits
 * between the two so a job that just finished doesn't cost a walk through the
 * whole queue.
 *
 * Answers the queue read narrowed to that job; `slots` is empty once the job
 * has left the queue. Every request is at most SAB_QUEUE_PAGE_SIZE jobs.
 */
export async function readSabSlot(
  nzoId: string,
  near: number | undefined,
  read: (query: SabQueueQuery) => Promise<SabQueue>,
): Promise<SabQueue> {
  const only = (queue: SabQueue, slot?: SabQueueSlot): SabQueue => ({
    ...queue,
    slots: slot ? [slot] : [],
  });
  const find = (queue: SabQueue) => queue.slots?.find((s) => s.nzo_id === nzoId);

  if (near !== undefined && near >= 0) {
    const queue = await read({ start: Math.max(0, near - SLOT_WINDOW_LEAD), limit: SLOT_WINDOW_SIZE });
    const slot = find(queue);
    if (slot) return only(queue, slot);
  }

  const byId = await read({ nzoIds: [nzoId] });
  const matched = find(byId);
  if (!matched) return only(byId);

  for (let start = 0; ; start += SAB_QUEUE_PAGE_SIZE) {
    const queue = await read({ start, limit: SAB_QUEUE_PAGE_SIZE });
    const slot = find(queue);
    if (slot) return only(queue, slot);
    const received = queue.slots?.length ?? 0;
    if (received < SAB_QUEUE_PAGE_SIZE || start + received >= Number(queue.noofslots)) break;
  }
  // It moved past the walk while it ran. Keep the job, without the filtered
  // read's ETA and index, which leave out every job ahead of it.
  return only(byId, { ...matched, timeleft: "", index: -1 });
}

/**
 * The job's index in the queue as an already cached read saw it: the list's
 * unfiltered pages, or the whole queue the dashboard widget polls. A hint for
 * readSabSlot's first window; a wrong one only costs the fallback.
 */
export function cachedSabSlotIndex(
  entries: readonly (readonly [readonly unknown[], unknown])[],
  nzoId: string,
): number | undefined {
  for (const [key, data] of entries) {
    const unfiltered = key.length === 3 || (key[3] === "page" && key[4] === "all");
    if (!unfiltered) continue;
    const slots = (data as SabQueue | undefined)?.slots;
    const slot = slots?.find((s) => s.nzo_id === nzoId);
    if (slot && slot.index >= 0) return slot.index;
  }
  return undefined;
}
