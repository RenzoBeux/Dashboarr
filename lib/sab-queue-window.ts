import type { SabQueue } from "@/lib/types";

// Jobs per page of the Downloads list. A 2,300-job queue answers an unbounded
// mode=queue with about 1.1 MB of JSON every poll (#514), so the list fetches
// a window that grows by this much as the user scrolls.
export const SAB_QUEUE_PAGE_SIZE = 100;

export interface SabQueueWindowRequest {
  start: number;
  limit: number;
}

/**
 * The slice to ask SAB for. SAB only pages from the head of the queue, so
 * reading the newest jobs (`fromEnd`) needs the queue length up front.
 */
export function sabQueueWindowRequest(
  limit: number,
  fromEnd: boolean,
  queueLength?: number,
): SabQueueWindowRequest {
  if (!fromEnd || queueLength === undefined) return { start: 0, limit };
  return { start: Math.max(0, queueLength - limit), limit };
}

/**
 * Whether SAB holds jobs outside the window it answered.
 *
 * Without a search or nzo_ids filter, `noofslots` is the length of the whole
 * queue, even when a status filter is sent (`NzbQueue.queue_info` overwrites
 * the match count with `len(self.__nzo_list)`). So a status-filtered window can
 * only tell "maybe more" by coming back full.
 */
export function sabQueueHasMore(
  queue: Pick<SabQueue, "noofslots" | "slots">,
  request: SabQueueWindowRequest,
  statusFiltered: boolean,
): boolean {
  const received = queue.slots.length;
  if (statusFiltered) return received >= request.limit;
  return request.start > 0 || request.start + received < queue.noofslots;
}
