import { act, createElement, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDemoResponse } from "@/lib/demo-data";
import {
  SAB_QUEUE_PAGE_SIZE,
  SabQueueChangedError,
  formatSabTimeLeft,
  mergeSabQueue,
  readSabQueueSnapshot,
  sabPageAgrees,
  sabQueuePageKey,
  sabQueuePageRequest,
  sabQueueSignature,
  sabQueueSnapshotKey,
  sabSnapshotNeedsRead,
  type SabPageRead,
  type SabQueueQuery,
} from "@/lib/sab-queue-snapshot";
import { compareAddedDesc, pickLivePages, type UnifiedItem } from "@/lib/usenet-adapter";
import type { SabQueue, SabQueueSlot } from "@/lib/types";
import {
  useSabQueueSnapshot,
  type SabQueueSnapshotView,
} from "@/hooks/use-sab-queue-snapshot";

// Comes with jest-expo, without type declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create } = require("react-test-renderer") as {
  create: (element: ReactElement) => { unmount: () => void };
};

// The hook's SAB instance is whichever FakeSab a test puts here.
const mockSab: { current?: FakeSab } = {};
jest.mock("@/hooks/use-instance-target", () => ({
  useInstanceTarget: () => ({ instanceId: "sab", enabled: true }),
}));
jest.mock("@/services/sabnzbd-api", () => ({
  getSabQueue: (_id: string | undefined, query: SabQueueQuery) => mockSab.current!.read(query),
}));

// --- A queue that answers mode=queue the way SABnzbd 5.1.3 does ------------
// NzbQueue.queue_info: filters narrow the matches, start/limit window them,
// `noofslots` is the queue's length unless nzo_ids is sent, `noofslots_total`
// counts jobs neither paused nor checking, `mb` is their total size, and the
// bytes ahead of the window are every such job before `start`, propagating
// ones included.
// api.py build_queue: inside the window a job adds its bytes to the running
// ETA only when it is Force, or the downloader runs and the job is queued or
// downloading with no propagation delay.

const MEBI = 1024 * 1024;

interface FakeJob {
  nzo_id: string;
  // MiB left, whole or half, so `mbleft` carries them exactly.
  mib: number;
  // MiB in all, `mib` unless the job has started.
  size?: number;
  status?: "Queued" | "Paused" | "Checking";
  priority?: "Force" | "High" | "Normal" | "Low";
  propagating?: boolean;
  time_added?: number;
}

// misc.format_time_left(int(bytes / bps)), written apart from the app's.
function sabTimeLeft(bytes: number, bps: number): string {
  if (bytes <= 0 || bps <= 0) return "0:00:00";
  const total = Math.trunc(bytes / bps);
  const [m, s] = [Math.trunc(total / 60), total % 60];
  const [h, mm] = [Math.trunc(m / 60), m % 60];
  const [d, hh] = [Math.trunc(h / 24), h % 24];
  const two = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return d > 0 ? `${d}:${two(hh)}:${two(mm)}:${two(s)}` : `${hh}:${two(mm)}:${two(s)}`;
}

class FakeSab {
  calls: SabQueueQuery[] = [];
  paused = false;
  bps = MEBI;
  // Runs before the read numbered `n` (0-based) is answered.
  beforeRead?: (n: number) => void;
  // Reads it answers with an error, after counting them.
  failing?: (query: SabQueueQuery) => boolean;

  constructor(public jobs: FakeJob[]) {}

  read = async (query: SabQueueQuery): Promise<SabQueue> => {
    this.beforeRead?.(this.calls.length);
    this.calls.push(query);
    if (this.failing?.(query)) throw new Error("Request timed out");
    return this.answer(query);
  };

  answer(query: SabQueueQuery): SabQueue {
    const start = query.start ?? 0;
    const limit = query.limit ?? 0;
    let qSize = 0;
    let mibTotal = 0;
    let bytesBefore = 0;
    let matched = 0;
    const window: FakeJob[] = [];
    for (const job of this.jobs) {
      const status = job.status ?? "Queued";
      if ((status !== "Paused" && status !== "Checking") || job.priority === "Force") {
        qSize++;
        mibTotal += job.size ?? job.mib;
        if (matched < start) bytesBefore += job.mib * MEBI;
      }
      if (query.status?.length && !query.status.includes(status)) continue;
      if (query.nzoIds?.length && !query.nzoIds.includes(job.nzo_id)) continue;
      if (!limit || (start <= matched && matched < start + limit)) window.push(job);
      matched++;
    }
    let running = bytesBefore;
    const slots = window.map((job, i) => {
      const status = job.status ?? "Queued";
      const apiStatus =
        !this.paused && status !== "Paused"
          ? job.propagating
            ? "Propagating"
            : status === "Checking"
              ? "Checking"
              : "Downloading"
          : job.priority === "Force"
            ? "Downloading"
            : status;
      const active =
        job.priority === "Force" || (!this.paused && !job.propagating && status === "Queued");
      let timeleft = "0:00:00";
      if (active) {
        running += job.mib * MEBI;
        timeleft = sabTimeLeft(running, this.bps);
      }
      return {
        nzo_id: job.nzo_id,
        filename: job.nzo_id,
        cat: "tv",
        status: apiStatus,
        priority: job.priority ?? "Normal",
        mb: (job.size ?? job.mib).toFixed(2),
        mbleft: job.mib.toFixed(2),
        size: `${job.mib} MB`,
        sizeleft: `${job.mib} MB`,
        percentage: "0",
        timeleft,
        index: start + i,
        time_added: job.time_added,
      } as SabQueueSlot;
    });
    return {
      paused: this.paused,
      speed: "1.0 M",
      speedlimit: "0",
      speedlimit_abs: "0",
      size: "",
      sizeleft: "",
      noofslots: query.nzoIds?.length ? matched : this.jobs.length,
      noofslots_total: qSize,
      mb: mibTotal.toFixed(2),
      diskspace1: "",
      diskspace2: "",
      status: "Downloading",
      kbpersec: (this.bps / 1024).toFixed(2),
      slots,
    } as SabQueue;
  }

  page(page: number, readAt: number): SabPageRead {
    return { page, queue: this.answer(sabQueuePageRequest(page)), readAt };
  }

  finish(nzoId: string) {
    this.jobs = this.jobs.filter((j) => j.nzo_id !== nzoId);
  }

  // Two `switch` calls of SAB's that trade the jobs at positions a and b.
  swap(a: number, b: number) {
    [this.jobs[a], this.jobs[b]] = [this.jobs[b], this.jobs[a]];
  }
}

const jobs = (n: number, extra: (k: number) => Partial<FakeJob> = () => ({})): FakeJob[] =>
  Array.from({ length: n }, (_, k) => ({ nzo_id: `job${k}`, mib: 2, ...extra(k) }));
const ids = (slots: SabQueueSlot[]) => slots.map((s) => s.nzo_id);
// 300 jobs added one after another, the last of them paused.
const paused299 = () =>
  jobs(300, (k) => ({ time_added: 1000 + k, ...(k === 299 ? { status: "Paused" as const } : {}) }));

describe("reading the whole queue", () => {
  it("reads 2,300 jobs in requests of 100, every job once and in order", async () => {
    const sab = new FakeSab(jobs(2300));
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    expect(ids(snapshot.slots)).toEqual(sab.jobs.map((j) => j.nzo_id));
    expect(snapshot.slots[1500].index).toBe(1500);
    expect(sab.calls.every((c) => c.limit === SAB_QUEUE_PAGE_SIZE)).toBe(true);
    // Each read after the first overlaps the last by one job: 1 + ceil(2200 / 99).
    expect(sab.calls).toHaveLength(24);
  });

  it("starts over when a job finishes mid-read, so the job that moved isn't lost", async () => {
    const sab = new FakeSab(jobs(300));
    // The reviewer's case: the first job finishes after page 1 was read.
    sab.beforeRead = (n) => {
      if (n === 2) sab.finish("job0");
    };
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    expect(ids(snapshot.slots)).toEqual(sab.jobs.map((j) => j.nzo_id));
    expect(snapshot.slots).toHaveLength(299);
  });

  it("starts over when a job is moved to the top mid-read, which no count shows", async () => {
    const sab = new FakeSab(jobs(300));
    sab.beforeRead = (n) => {
      if (n === 2) sab.jobs.unshift(...sab.jobs.splice(250, 1));
    };
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    expect(ids(snapshot.slots)).toEqual(sab.jobs.map((j) => j.nzo_id));
  });

  it("starts over when two jobs trade places across pages mid-read", async () => {
    // The reviewer's case: neither the counts nor the overlapping job change,
    // but job50 would be read twice and job150 not at all.
    const sab = new FakeSab(jobs(300));
    sab.beforeRead = (n) => {
      if (n === 1) sab.swap(50, 150);
    };
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    expect(ids(snapshot.slots)).toEqual(sab.jobs.map((j) => j.nzo_id));
    expect(sab.calls.filter((c) => c.start === 0)).toHaveLength(2);
  });

  it("never loses or repeats a job, however jobs move mid-read", async () => {
    // Seeded (mulberry32), so a failure replays.
    let seed = 514;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (n: number) => Math.floor(random() * n);
    let accepted = 0;
    for (let trial = 0; trial < 300; trial++) {
      const sab = new FakeSab(jobs(150 + pick(300)));
      sab.beforeRead = () => {
        if (random() < 0.7) return;
        const n = sab.jobs.length;
        if (random() < 0.5) sab.swap(pick(n), pick(n));
        else sab.jobs.splice(pick(n), 0, ...sab.jobs.splice(pick(n), 1));
      };
      try {
        const snapshot = await readSabQueueSnapshot(sab.read, undefined);
        expect(ids(snapshot.slots).sort()).toEqual(sab.jobs.map((j) => j.nzo_id).sort());
        accepted++;
      } catch (error) {
        expect(error).toBeInstanceOf(SabQueueChangedError);
      }
    }
    expect(accepted).toBeGreaterThan(200);
  });

  it("starts over when a job arrives or changes state behind the read", async () => {
    const sab = new FakeSab(jobs(300));
    sab.beforeRead = (n) => {
      // Paused in a page already read, and no job moves: only the counts tell.
      if (n === 2) sab.jobs[10].status = "Paused";
    };
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    expect(snapshot.slots[10].status).toBe("Paused");
  });

  it("starts from a fresh first page it is handed, and past a stale one", async () => {
    const sab = new FakeSab(jobs(250));
    const head = sab.answer(sabQueuePageRequest(0));
    await readSabQueueSnapshot(sab.read, undefined, head);
    expect(sab.calls[0]).toEqual({ start: 99, limit: 100, status: undefined });

    const stale = new FakeSab(jobs(250));
    const oldHead = stale.answer(sabQueuePageRequest(0));
    stale.finish("job0");
    const snapshot = await readSabQueueSnapshot(stale.read, undefined, oldHead);
    expect(snapshot.slots).toHaveLength(249);
    expect(ids(snapshot.slots)[0]).toBe("job1");
  });

  it("gives up after three reads that each saw the queue change", async () => {
    const sab = new FakeSab(jobs(300));
    sab.beforeRead = (n) => {
      if (n % 2 === 1) sab.finish(sab.jobs[0].nzo_id);
    };
    await expect(readSabQueueSnapshot(sab.read, undefined)).rejects.toBeInstanceOf(
      SabQueueChangedError,
    );
  });

  it("stops reading once cancelled", async () => {
    const sab = new FakeSab(jobs(2300));
    const abort = new AbortController();
    sab.beforeRead = (n) => {
      if (n === 3) abort.abort();
    };
    await expect(readSabQueueSnapshot(sab.read, undefined, undefined, abort.signal)).rejects.toBeDefined();
    expect(sab.calls).toHaveLength(4);
  });

  it("reads a status filter's matches to their end", async () => {
    const sab = new FakeSab(jobs(500, (k) => (k % 3 === 0 ? { status: "Paused" } : {})));
    const snapshot = await readSabQueueSnapshot(sab.read, ["Paused"]);
    expect(snapshot.slots).toHaveLength(167);
    expect(sab.calls.every((c) => c.status?.[0] === "Paused")).toBe(true);
  });
});

describe("keeping it current", () => {
  async function setup(n = 300) {
    const sab = new FakeSab(jobs(n));
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    return { sab, snapshot };
  }

  it("reads a queue that didn't change again only at its max age, whatever its values do", async () => {
    const { sab, snapshot } = await setup();
    Object.assign(sab.jobs[0], { size: 2, mib: 1 });
    const head = sab.page(0, 5000);
    expect(sabPageAgrees(snapshot, head.queue, 0)).toBe(true);
    // Three pages: 30 s after the last read.
    expect(sabSnapshotNeedsRead(snapshot, 1000, 0, [head], 30_999)).toBe(false);
    expect(sabSnapshotNeedsRead(snapshot, 1000, 0, [head], 31_000)).toBe(true);
    // The rows take the newer values.
    expect(mergeSabQueue(snapshot, 1000, [head], false)!.queue.slots[0].mbleft).toBe("1.00");
  });

  it("loses no job between a change and the next read, then reads again", async () => {
    // The reviewer's case: 300 jobs read, the first one finishes, pages 1 and
    // 3 are polled again while page 2 isn't.
    const { sab, snapshot } = await setup();
    sab.finish("job0");
    const polled = [sab.page(0, 5000), sab.page(2, 5000)];

    const shown = mergeSabQueue(snapshot, 1000, polled, false)!.queue.slots;
    expect(shown).toHaveLength(300);
    expect(ids(shown)).toContain("job200");

    // Three pages: no sooner than 6 s after the last read.
    expect(sabSnapshotNeedsRead(snapshot, 1000, 0, polled, 6999)).toBe(false);
    expect(sabSnapshotNeedsRead(snapshot, 1000, 0, polled, 7000)).toBe(true);
    const next = await readSabQueueSnapshot(sab.read, undefined);
    expect(ids(mergeSabQueue(next, 8000, polled, false)!.queue.slots)).toEqual(
      sab.jobs.map((j) => j.nzo_id),
    );
  });

  it("notices a change no polled page shows, through the queue's counts", async () => {
    const { sab, snapshot } = await setup();
    sab.jobs.push({ nzo_id: "late", mib: 2 });
    expect(sabPageAgrees(snapshot, sab.page(0, 5000).queue, 0)).toBe(false);
  });

  it("notices one job leaving and another arriving, through the queue's size", async () => {
    const { sab, snapshot } = await setup();
    // On a page nobody polls, between two polls: both counts stay as they were.
    sab.jobs.splice(150, 1, { nzo_id: "new", mib: 3 });
    const head = sab.page(0, 5000).queue;
    expect([head.noofslots, head.noofslots_total]).toEqual([300, 300]);
    expect(sabPageAgrees(snapshot, head, 0)).toBe(false);
    // Progress alone leaves it as it was.
    Object.assign(sab.jobs[0], { size: 2, mib: 1 });
    sab.jobs.splice(150, 1, { nzo_id: "job150", mib: 2 });
    expect(sabPageAgrees(snapshot, sab.page(0, 6000).queue, 0)).toBe(true);
  });

  it("tries a failed read again, no sooner than a changing queue is read", async () => {
    const { sab, snapshot } = await setup();
    sab.jobs.push({ nzo_id: "late", mib: 2 });
    const polled = [sab.page(0, 5000)];
    // The read that change set off failed at 8 s: three pages wait 6 s from there.
    expect(sabSnapshotNeedsRead(snapshot, 1000, 8000, polled, 13_999)).toBe(false);
    expect(sabSnapshotNeedsRead(snapshot, 1000, 8000, polled, 14_000)).toBe(true);
  });

  it("finds a change no poll shows by its max age", async () => {
    // The reviewer's case: a paused job at the tail is replaced by a newer
    // paused job of another size. Paused jobs count toward neither
    // noofslots_total nor mb, and the first page stays as it was.
    const sab = new FakeSab(paused299());
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    sab.jobs.splice(299, 1, { nzo_id: "newer", mib: 5, status: "Paused", time_added: 5000 });
    const head = sab.page(0, 5000);
    expect(sabQueueSignature(head.queue)).toBe(snapshot.signature);
    expect(sabPageAgrees(snapshot, head.queue, 0)).toBe(true);
    expect(sabSnapshotNeedsRead(snapshot, 1000, 0, [head], 30_999)).toBe(false);
    expect(sabSnapshotNeedsRead(snapshot, 1000, 0, [head], 31_000)).toBe(true);
  });

  it("tries a failed refresh again when no poll shows a change", async () => {
    // The reviewer's case: a pull to refresh fails past the first page at
    // 8 s, and the queue stays as it was.
    const { sab, snapshot } = await setup();
    const head = [sab.page(0, 9000)];
    expect(sabSnapshotNeedsRead(snapshot, 1000, 8000, head, 13_999)).toBe(false);
    expect(sabSnapshotNeedsRead(snapshot, 1000, 8000, head, 14_000)).toBe(true);
  });

  it("tries a failed first read again, sized by the first page's count", () => {
    const head = [new FakeSab(jobs(300)).page(0, 1000)];
    expect(sabSnapshotNeedsRead(undefined, 0, 0, head, 60_000)).toBe(false);
    expect(sabSnapshotNeedsRead(undefined, 0, 2000, head, 7999)).toBe(false);
    expect(sabSnapshotNeedsRead(undefined, 0, 2000, head, 8000)).toBe(true);
  });

  it("shows a one-page queue straight from its polled first page", async () => {
    const sab = new FakeSab(jobs(40));
    const merged = mergeSabQueue(undefined, 0, [sab.page(0, 5000)], false)!;
    expect(merged).toMatchObject({ complete: true });
    expect(merged.queue.slots).toHaveLength(40);
  });

  it("shows the first page while the rest is read", async () => {
    const sab = new FakeSab(jobs(300));
    const merged = mergeSabQueue(undefined, 0, [sab.page(0, 5000)], false)!;
    expect(merged).toMatchObject({ complete: false });
    expect(merged.queue.slots).toHaveLength(100);
  });
});

describe("queue-wide ETAs", () => {
  // 250 jobs of 2 MiB at 1 MiB/s; job 120 waits out a propagation delay.
  const withPropagating = () =>
    new FakeSab(jobs(250, (k) => (k === 120 ? { propagating: true, mib: 1000 } : {})));

  it("match a single read of the whole queue for every job", async () => {
    const sab = withPropagating();
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    const shown = mergeSabQueue(snapshot, 1000, [sab.page(0, 500)], false)!.queue.slots;
    const reference = sab.answer({}).slots;
    expect(shown.map((s) => s.timeleft)).toEqual(reference.map((s) => s.timeleft));
  });

  it("don't take SAB's number for a window that starts past a propagating job", async () => {
    const sab = withPropagating();
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    const shown = mergeSabQueue(snapshot, 1000, [sab.page(0, 500)], false)!.queue.slots;
    // job200 has 200 jobs of 2 MiB up to it, the propagating one aside.
    expect(shown[200].timeleft).toBe("0:06:40");
    const window = sab.answer({ start: 195, limit: 20 }).slots.find((s) => s.nzo_id === "job200")!;
    expect(window.timeleft).toBe("0:23:20");
  });

  it("count only Force jobs while the downloader is paused", async () => {
    const sab = new FakeSab(jobs(150, (k) => (k === 130 ? { priority: "Force" } : {})));
    sab.paused = true;
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    const shown = mergeSabQueue(snapshot, 1000, [sab.page(0, 500)], false)!.queue.slots;
    expect(shown.map((s) => s.timeleft)).toEqual(sab.answer({}).slots.map((s) => s.timeleft));
    expect(shown[130].timeleft).toBe("0:00:02");
  });

  it("format days the way SAB does", () => {
    expect(formatSabTimeLeft(100 * 3600 * MEBI + 5 * MEBI, MEBI)).toBe("4:04:00:05");
    expect(formatSabTimeLeft(0, MEBI)).toBe("0:00:00");
    expect(formatSabTimeLeft(MEBI, 0)).toBe("0:00:00");
  });
});

describe("Newest First", () => {
  const item = (index: number, addedAt?: number) => ({ index, addedAt }) as UnifiedItem;

  it("finds the newest job wherever it sits in the queue", async () => {
    // The reviewer's case: the newest of 300 jobs is the last one.
    const sab = new FakeSab(jobs(300, (k) => ({ time_added: 1000 + k })));
    const snapshot = await readSabQueueSnapshot(sab.read, undefined);
    const items = snapshot.slots.map((s) => item(s.index, s.time_added));
    expect(items.sort(compareAddedDesc)[0].index).toBe(299);
  });

  it("puts a job slotted at the head by priority first when it was added last", () => {
    const sorted = [item(0, 300), item(1, 100), item(2, 200)].sort(compareAddedDesc);
    expect(sorted.map((i) => i.index)).toEqual([0, 2, 1]);
  });

  it("falls back to queue order without add times (SAB before 5.0)", () => {
    const sorted = [item(0), item(1), item(2, 0)].sort(compareAddedDesc);
    expect(sorted.map((i) => i.index)).toEqual([2, 1, 0]);
  });
});

describe("the list and a job's detail, mounted together", () => {
  let now = 1_000_000;
  // Unmounted after each test, passed or not, so no poll outlives it.
  let unmounts: (() => void)[] = [];
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => {
    unmounts.forEach((unmount) => unmount());
    unmounts = [];
    jest.restoreAllMocks();
  });

  // One screen per list of pages on screen, each with its own useSabQueueSnapshot.
  function mount(...livePages: number[][]) {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const views: SabQueueSnapshotView[] = [];
    function Screen({ i, pages }: { i: number; pages: number[] }) {
      views[i] = useSabQueueSnapshot(undefined, { livePages: pages });
      return null;
    }
    let root: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(
          QueryClientProvider,
          { client },
          ...livePages.map((pages, i) => createElement(Screen, { key: i, i, pages })),
        ),
      );
    });
    unmounts.push(() => {
      act(() => root.unmount());
      client.clear();
    });
    return {
      views,
      // A poll of one page, `ms` after the last thing that happened.
      poll: async (page: number, ms: number) => {
        now += ms;
        await act(() =>
          client.refetchQueries({ queryKey: sabQueuePageKey("sab", undefined, page) }),
        );
      },
    };
  }

  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  async function until(check: () => boolean) {
    for (let i = 0; i < 100 && !check(); i++) await settle();
    expect(check()).toBe(true);
  }

  it("read again after a failed refresh, and say it failed meanwhile", async () => {
    const sab = (mockSab.current = new FakeSab(jobs(300)));
    const { views, poll } = mount([]);
    await until(() => views[0].complete && views[0].queue?.slots.length === 300);

    // The reviewer's case: a job arrives, and reads past the first page fail.
    sab.jobs.push({ nzo_id: "late", mib: 2 });
    sab.failing = (query) => (query.start ?? 0) > 0;
    await poll(0, 7000);
    await until(() => !!views[0].readError && !views[0].reading);
    expect(views[0].complete).toBe(true);
    expect(views[0].queue!.slots).toHaveLength(300);

    // Not again straight away: only the first page is read.
    const wholeReads = () => sab.calls.filter((c) => (c.start ?? 0) > 0).length;
    const before = wholeReads();
    await poll(0, 5000);
    await settle();
    expect(wholeReads()).toBe(before);

    // Then on its own, with no pull to refresh.
    sab.failing = undefined;
    await poll(0, 5000);
    await until(() => views[0].queue?.slots.length === 301);
    expect(views[0].readError).toBeNull();
  });

  it("clear a failed refresh on their own once reads work again", async () => {
    const sab = (mockSab.current = new FakeSab(jobs(300)));
    const { views, poll } = mount([]);
    await until(() => views[0].complete && views[0].queue?.slots.length === 300);

    // The reviewer's case: a pull to refresh while reads past the first page
    // fail, then they work again, and the queue never changes.
    sab.failing = (query) => (query.start ?? 0) > 0;
    now += 1000;
    await act(async () => {
      await views[0].refetch();
    });
    await until(() => !!views[0].readError && !views[0].reading);
    sab.failing = undefined;
    await poll(0, 7000);
    await until(() => !views[0].reading && views[0].readError === null);
  });

  it("find a change no poll shows by the queue's max age", async () => {
    // The reviewer's case: the paused job at the tail is replaced by a newer
    // paused job of another size, off screen.
    const sab = (mockSab.current = new FakeSab(paused299()));
    const { views, poll } = mount([]);
    await until(() => views[0].complete);
    sab.jobs.splice(299, 1, { nzo_id: "newer", mib: 5, status: "Paused", time_added: 5000 });
    const shown = (id: string) => views[0].queue!.slots.some((s) => s.nzo_id === id);

    await poll(0, 29_000);
    await settle();
    expect(shown("newer")).toBe(false);
    // Three pages: read again 30 s after the last read.
    await poll(0, 1000);
    await until(() => shown("newer"));
    expect(shown("job299")).toBe(false);
  });

  it("show the same ETAs, whichever pages each polls", async () => {
    // The reviewer's case: the list has page 3 on screen, the detail is for
    // job450 on page 4, and job350, ahead of it, makes progress that only the
    // list's poll sees. 500 jobs of 2 MiB at 1 MiB/s.
    const sab = (mockSab.current = new FakeSab(jobs(500)));
    const { views, poll } = mount([3], [4]);
    await until(() => views.length === 2 && views.every((v) => v.complete));
    const eta = (v: SabQueueSnapshotView) =>
      v.queue!.slots.find((s) => s.nzo_id === "job450")!.timeleft;
    expect(views.map(eta)).toEqual(["0:15:02", "0:15:02"]);

    Object.assign(sab.jobs[350], { size: 2, mib: 1 });
    await poll(3, 5000);
    await until(() => eta(views[0]) === "0:15:01");
    await settle();
    expect(views.map(eta)).toEqual(["0:15:01", "0:15:01"]);
    expect(sab.answer({}).slots[450].timeleft).toBe("0:15:01");
  });
});

describe("keys and live pages", () => {
  it("keys polled pages and the whole-queue read under the instance's queue", () => {
    expect(sabQueuePageKey("i1", undefined, 3)).toEqual(["sabnzbd", "i1", "queue", "page", "all", 3]);
    expect(sabQueueSnapshotKey("i1", ["Paused"])).toEqual([
      "sabnzbd",
      "i1",
      "queue",
      "snapshot",
      "Paused",
    ]);
  });

  it("polls at most two pages on screen besides the first", () => {
    expect(pickLivePages([0, 0, 0])).toEqual([]);
    expect(pickLivePages([0, 0, 1])).toEqual([1]);
    // A name sort can put rows of many pages on screen.
    expect(pickLivePages([5, 7, 7, 3, 7, 5, 9])).toEqual([5, 7]);
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
