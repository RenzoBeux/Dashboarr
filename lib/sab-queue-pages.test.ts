import { QueriesObserver, QueryClient } from "@tanstack/query-core";
import { getDemoResponse } from "@/lib/demo-data";
import {
  SAB_QUEUE_PAGE_SIZE,
  cachedSabSlotIndex,
  mergeSabQueuePages,
  readSabSlot,
  sabQueuePageKey,
  sabQueuePageQueries,
  sabQueuePageRequest,
  type SabQueueQuery,
} from "@/lib/sab-queue-pages";
import { compareAddedDesc, pickLivePages, type UnifiedItem } from "@/lib/usenet-adapter";
import type { SabQueue, SabQueueSlot } from "@/lib/types";

// --- A queue that answers mode=queue the way SAB 5.1.3 does ---------------
// NzbQueue.queue_info + api.py build_queue: filters narrow the match count,
// start/limit window the matches, bytes ahead of the window are summed only
// while fewer than `start` jobs have matched, and each active slot's ETA is
// the running byte total over the speed.

interface FakeJob {
  nzo_id: string;
  remaining: number;
  paused?: boolean;
}

const BPS = 1_000_000;
const pad = (n: number) => String(n).padStart(2, "0");
const hms = (s: number) =>
  `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(Math.floor(s % 60))}`;

function fakeSab(jobs: FakeJob[]) {
  const calls: SabQueueQuery[] = [];
  const read = async (query: SabQueueQuery): Promise<SabQueue> => {
    calls.push(query);
    const start = query.start ?? 0;
    const limit = query.limit ?? 0;
    let matched = 0;
    let bytesBefore = 0;
    const window: FakeJob[] = [];
    for (const job of jobs) {
      if (!job.paused && matched < start) bytesBefore += job.remaining;
      if (query.nzoIds?.length && !query.nzoIds.includes(job.nzo_id)) continue;
      if (!limit || (start <= matched && matched < start + limit)) window.push(job);
      matched++;
    }
    let running = bytesBefore;
    const slots = window.map((job, i) => {
      let timeleft = "0:00:00";
      if (!job.paused) {
        running += job.remaining;
        timeleft = hms(running / BPS);
      }
      return { nzo_id: job.nzo_id, index: start + i, timeleft } as SabQueueSlot;
    });
    return {
      noofslots: query.nzoIds?.length ? matched : jobs.length,
      slots,
    } as SabQueue;
  };
  return { read, calls };
}

// 250 jobs of 1 MB at 1 MB/s: job k finishes k + 1 seconds from now.
const JOBS: FakeJob[] = Array.from({ length: 250 }, (_, k) => ({
  nzo_id: `job${k}`,
  remaining: 1_000_000,
}));

const page = (n: number, from = 0): SabQueue =>
  ({
    noofslots: 250,
    paused: false,
    speed: "1.0 M",
    sizeleft: "250 MB",
    slots: Array.from({ length: n }, (_, i) => ({ nzo_id: `job${from + i}`, index: from + i })),
  }) as unknown as SabQueue;

describe("SAB queue pages", () => {
  it("reads every page with one bounded request", () => {
    expect(sabQueuePageRequest(0)).toEqual({ start: 0, limit: 100 });
    expect(sabQueuePageRequest(22)).toEqual({ start: 2200, limit: 100 });
  });

  it("keys pages per instance, filter and index under the queue key", () => {
    expect(sabQueuePageKey("i1", undefined, 3)).toEqual(["sabnzbd", "i1", "queue", "page", "all", 3]);
    expect(sabQueuePageKey("i1", ["Paused"], 0)).toEqual([
      "sabnzbd",
      "i1",
      "queue",
      "page",
      "Paused",
      0,
    ]);
  });

  it("joins pages in order, tags each job with its page, and has more while short of the total", () => {
    const merged = mergeSabQueuePages([page(100), page(100, 100)], false)!;
    expect(merged.slots).toHaveLength(200);
    expect(merged.slots[150]).toMatchObject({ page: 1, slot: { nzo_id: "job150" } });
    expect(merged.hasMore).toBe(true);
    expect(merged.total).toBe(250);
    expect(mergeSabQueuePages([page(100), page(100, 100), page(50, 200)], false)!.hasMore).toBe(
      false,
    );
  });

  it("keeps a job that two pages caught once, from the earlier page", () => {
    // job99 shifted to page 1 after page 0 was read.
    const merged = mergeSabQueuePages([page(100), page(100, 99)], false)!;
    expect(merged.slots.filter((s) => s.slot.nzo_id === "job99")).toEqual([
      expect.objectContaining({ page: 0 }),
    ]);
    expect(merged.slots).toHaveLength(199);
  });

  it("keeps the loaded jobs while the newest page is loading or failed", () => {
    const merged = mergeSabQueuePages([page(100), page(100, 100), undefined], false)!;
    expect(merged.slots).toHaveLength(200);
    expect(merged.hasMore).toBe(false);
    expect(mergeSabQueuePages([undefined], false)).toBeUndefined();
  });

  it("can only tell more from a full last page under a status filter", () => {
    // noofslots is the whole queue's length even when filtered.
    expect(mergeSabQueuePages([page(12)], true)).toMatchObject({ hasMore: false, total: undefined });
    expect(mergeSabQueuePages([page(SAB_QUEUE_PAGE_SIZE)], true)!.hasMore).toBe(true);
  });
});

// The page queries under TanStack's own observer and timers, against a
// 2,300-job queue (#514's size): what each poll actually requests.
describe("polling the queue pages", () => {
  const BIG: FakeJob[] = Array.from({ length: 2300 }, (_, k) => ({
    nzo_id: `job${k}`,
    remaining: 1_000_000,
  }));
  const POLL = 5000;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(failPage?: number) {
    const sab = fakeSab(BIG);
    let failing = failPage;
    // Every request is recorded, failed ones included.
    const read = async (query: SabQueueQuery) => {
      const answer = sab.read(query);
      if (failing !== undefined && query.start === failing * SAB_QUEUE_PAGE_SIZE) {
        throw new Error("timeout");
      }
      return answer;
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: POLL } } });
    const queries = (pages: number, livePages: number[] = []) =>
      sabQueuePageQueries({
        instanceId: "i1",
        active: true,
        status: undefined,
        pages,
        livePages,
        pollInterval: POLL,
        read,
      });
    const observer = new QueriesObserver<SabQueue[]>(client, queries(1));
    const unsubscribe = observer.subscribe(() => {});
    const rowsSince = (from: number) =>
      sab.calls.slice(from).reduce((n, c) => n + (c.limit ?? BIG.length), 0);
    return {
      sab,
      client,
      observer,
      unsubscribe,
      rowsSince,
      show: (pages: number, livePages?: number[]) => observer.setQueries(queries(pages, livePages)),
      heal: () => {
        failing = undefined;
      },
    };
  }

  it("requests one page per scroll step and polls only the first page after", async () => {
    const s = setup();
    for (let pages = 2; pages <= 23; pages++) {
      await jest.advanceTimersByTimeAsync(0);
      s.show(pages, [pages - 1]);
    }
    await jest.advanceTimersByTimeAsync(0);
    // Scrolling the whole queue in: 23 requests of 100, not 100 + 200 + ... + 2,300.
    expect(s.sab.calls.every((c) => c.limit === SAB_QUEUE_PAGE_SIZE)).toBe(true);
    expect(new Set(s.sab.calls.map((c) => c.start)).size).toBe(23);

    // Back at the top of the fully loaded list: a poll is the first page.
    s.show(23, []);
    const before = s.sab.calls.length;
    await jest.advanceTimersByTimeAsync(POLL);
    expect(s.sab.calls.slice(before)).toEqual([{ start: 0, limit: 100, status: undefined }]);
    expect(s.rowsSince(before)).toBe(100);

    // Deep in the list: the first page plus the pages on screen.
    s.show(23, [14, 15]);
    const deep = s.sab.calls.length;
    await jest.advanceTimersByTimeAsync(POLL);
    const starts = s.sab.calls.slice(deep).map((c) => c.start ?? 0);
    expect(starts.sort((a, b) => a - b)).toEqual([0, 1400, 1500]);
    expect(s.rowsSince(deep)).toBe(300);
    s.unsubscribe();
  });

  it("refetches an off-screen page when it scrolls back in, once stale", async () => {
    const s = setup();
    s.show(2, [1]);
    await jest.advanceTimersByTimeAsync(0);
    s.show(2, []);
    await jest.advanceTimersByTimeAsync(3 * POLL);
    const before = s.sab.calls.length;
    s.show(2, [1]);
    await jest.advanceTimersByTimeAsync(0);
    expect(s.sab.calls.slice(before)).toEqual([{ start: 100, limit: 100, status: undefined }]);
    s.unsubscribe();
  });

  it("keeps the loaded pages when the next one fails, and leaves it to Retry", async () => {
    const s = setup(2);
    s.show(2, [1]);
    await jest.advanceTimersByTimeAsync(0);
    s.show(3, [1]);
    await jest.advanceTimersByTimeAsync(0);

    const results = s.observer.getCurrentResult();
    expect(results[2].status).toBe("error");
    const merged = mergeSabQueuePages(
      results.map((r) => r.data as SabQueue | undefined),
      false,
    )!;
    expect(merged.slots).toHaveLength(200);
    expect(merged.hasMore).toBe(false);

    // Polls go on for the loaded pages without retrying the failed one.
    const before = s.sab.calls.length;
    await jest.advanceTimersByTimeAsync(2 * POLL);
    expect(s.sab.calls.slice(before).some((c) => c.start === 200)).toBe(false);

    // Retry loads it.
    s.heal();
    await s.observer.getObservers()[2].refetch();
    expect((s.observer.getCurrentResult()[2].data as SabQueue).slots).toHaveLength(100);
    s.unsubscribe();
  });
});

describe("pickLivePages", () => {
  it("leaves out the first page, which always polls", () => {
    expect(pickLivePages([0, 0, 0])).toEqual([]);
    expect(pickLivePages([0, 0, 1])).toEqual([1]);
  });

  it("keeps the two pages with the most rows on screen", () => {
    // A name sort can put rows of many pages on screen.
    expect(pickLivePages([5, 7, 7, 3, 7, 5, 9])).toEqual([5, 7]);
    expect(pickLivePages([4, 9, 2])).toEqual([2, 4]);
  });
});

describe("readSabSlot", () => {
  it("gives the queue's ETA, which an nzo_ids read can't", async () => {
    const sab = fakeSab(JOBS);
    expect((await sab.read({ nzoIds: ["job180"] })).slots[0].timeleft).toBe("0:00:01");
    expect((await sab.read({ start: 100, limit: 100 })).slots[80].timeleft).toBe("0:03:01");

    const fresh = fakeSab(JOBS);
    const queue = await readSabSlot("job180", undefined, fresh.read);
    expect(queue.slots).toEqual([expect.objectContaining({ nzo_id: "job180", index: 180, timeleft: "0:03:01" })]);
  });

  it("reads a small window around the job's last index", async () => {
    const sab = fakeSab(JOBS);
    const queue = await readSabSlot("job180", 182, sab.read);
    expect(queue.slots[0]).toMatchObject({ index: 180, timeleft: "0:03:01" });
    expect(sab.calls).toEqual([{ start: 177, limit: 20 }]);
  });

  it("walks from the head in pages once the job left its window", async () => {
    const sab = fakeSab(JOBS);
    const queue = await readSabSlot("job180", 10, sab.read);
    expect(queue.slots[0]).toMatchObject({ index: 180, timeleft: "0:03:01" });
    expect(sab.calls).toEqual([
      { start: 5, limit: 20 },
      { nzoIds: ["job180"] },
      { start: 0, limit: 100 },
      { start: 100, limit: 100 },
    ]);
    expect(sab.calls.every((c) => (c.limit ?? 1) <= SAB_QUEUE_PAGE_SIZE)).toBe(true);
  });

  it("doesn't walk the queue for a job that left it", async () => {
    const sab = fakeSab(JOBS);
    const queue = await readSabSlot("gone", 40, sab.read);
    expect(queue.slots).toEqual([]);
    expect(sab.calls).toEqual([{ start: 35, limit: 20 }, { nzoIds: ["gone"] }]);
  });

  it("drops the filtered ETA when the walk misses a job that moved during it", async () => {
    // The job is matched by nzo_ids, then gone from every unfiltered page.
    const sab = fakeSab(JOBS);
    const read = async (query: SabQueueQuery) => {
      const queue = await sab.read(query);
      return query.nzoIds ? queue : { ...queue, slots: queue.slots.filter((s) => s.nzo_id !== "job7") };
    };
    const queue = await readSabSlot("job7", undefined, read);
    expect(queue.slots[0]).toMatchObject({ nzo_id: "job7", timeleft: "", index: -1 });
  });
});

describe("cachedSabSlotIndex", () => {
  const slots = (...entries: [string, number][]) => ({
    slots: entries.map(([nzo_id, index]) => ({ nzo_id, index })),
  });

  it("takes the index from the whole queue or an unfiltered page", () => {
    expect(cachedSabSlotIndex([[["sabnzbd", "i1", "queue"], slots(["a", 4])]], "a")).toBe(4);
    expect(
      cachedSabSlotIndex([[["sabnzbd", "i1", "queue", "page", "all", 2], slots(["a", 230])]], "a"),
    ).toBe(230);
  });

  it("ignores filtered reads, whose index counts matches only", () => {
    expect(
      cachedSabSlotIndex(
        [
          [["sabnzbd", "i1", "queue", "page", "Paused", 0], slots(["a", 0])],
          [["sabnzbd", "i1", "queue", "slot", "a"], slots(["a", 0])],
        ],
        "a",
      ),
    ).toBeUndefined();
  });
});

describe("Newest First", () => {
  const item = (index: number, addedAt?: number) => ({ index, addedAt }) as UnifiedItem;

  it("puts a job slotted at the head by priority first when it was added last", () => {
    // SAB inserts a Force job at index 0 (NzbQueue.add).
    const sorted = [item(0, 300), item(1, 100), item(2, 200)].sort(compareAddedDesc);
    expect(sorted.map((i) => i.index)).toEqual([0, 2, 1]);
  });

  it("falls back to queue order without add times (SAB before 5.0)", () => {
    const sorted = [item(0), item(1), item(2, 0)].sort(compareAddedDesc);
    expect(sorted.map((i) => i.index)).toEqual([2, 1, 0]);
  });
});

describe("demo SAB queue", () => {
  const queue = (params: Record<string, string | number>) =>
    (getDemoResponse("sabnzbd", "", { mode: "queue", ...params }) as { queue: SabQueue }).queue;

  it("answers the whole queue without a window", () => {
    const q = queue({});
    expect(q.slots).toHaveLength(3);
    expect(q.noofslots).toBe(3);
  });

  it("windows with start/limit and counts index from start", () => {
    const q = queue({ start: 1, limit: 1 });
    expect(q.slots.map((s) => [s.nzo_id, s.index])).toEqual([["SABnzbd_nzo_demo02", 1]]);
    expect(q.noofslots).toBe(3);
  });

  it("filters by status and nzo_ids", () => {
    expect(queue({ status: "Queued" }).slots.map((s) => s.nzo_id)).toEqual([
      "SABnzbd_nzo_demo03",
    ]);
    const one = queue({ nzo_ids: "SABnzbd_nzo_demo02" });
    expect(one.slots.map((s) => s.nzo_id)).toEqual(["SABnzbd_nzo_demo02"]);
    expect(one.noofslots).toBe(1);
  });

  it("answers queue actions with a status, not the queue", () => {
    expect(
      getDemoResponse("sabnzbd", "", { mode: "queue", name: "pause", value: "x" }),
    ).toEqual({ status: true });
  });
});
