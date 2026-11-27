import { getDemoResponse } from "@/lib/demo-data";
import {
  SAB_QUEUE_PAGE_SIZE,
  formatSabTimeLeft,
  mergeSabQueue,
  readSabQueueSnapshot,
  sabPageAgrees,
  sabQueuePageKey,
  sabQueuePageRequest,
  sabQueueSnapshotKey,
  sabSnapshotNeedsRead,
  type SabPageRead,
  type SabQueueQuery,
} from "@/lib/sab-queue-snapshot";
import { compareAddedDesc, pickLivePages, type UnifiedItem } from "@/lib/usenet-adapter";
import type { SabQueue, SabQueueSlot } from "@/lib/types";

// --- A queue that answers mode=queue the way SABnzbd 5.1.3 does ------------
// NzbQueue.queue_info: filters narrow the matches, start/limit window them,
// `noofslots` is the queue's length unless nzo_ids is sent, `noofslots_total`
// counts jobs neither paused nor checking, and the bytes ahead of the window
// are every such job before `start`, propagating ones included.
// api.py build_queue: inside the window a job adds its bytes to the running
// ETA only when it is Force, or the downloader runs and the job is queued or
// downloading with no propagation delay.

const MEBI = 1024 * 1024;

interface FakeJob {
  nzo_id: string;
  // Whole MiB, so `mbleft` carries them exactly.
  mib: number;
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

  constructor(public jobs: FakeJob[]) {}

  read = async (query: SabQueueQuery): Promise<SabQueue> => {
    this.beforeRead?.(this.calls.length);
    this.calls.push(query);
    return this.answer(query);
  };

  answer(query: SabQueueQuery): SabQueue {
    const start = query.start ?? 0;
    const limit = query.limit ?? 0;
    let qSize = 0;
    let bytesBefore = 0;
    let matched = 0;
    const window: FakeJob[] = [];
    for (const job of this.jobs) {
      const status = job.status ?? "Queued";
      if ((status !== "Paused" && status !== "Checking") || job.priority === "Force") {
        qSize++;
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
        mb: job.mib.toFixed(2),
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
}

const jobs = (n: number, extra: (k: number) => Partial<FakeJob> = () => ({})): FakeJob[] =>
  Array.from({ length: n }, (_, k) => ({ nzo_id: `job${k}`, mib: 2, ...extra(k) }));
const ids = (slots: SabQueueSlot[]) => slots.map((s) => s.nzo_id);

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
    await expect(readSabQueueSnapshot(sab.read, undefined)).rejects.toThrow(/changed during every read/);
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

  it("never reads a queue that didn't change again, whatever its values do", async () => {
    const { sab, snapshot } = await setup();
    sab.jobs[0].mib = 1;
    const head = sab.page(0, 5000);
    expect(sabPageAgrees(snapshot, head.queue, 0)).toBe(true);
    expect(sabSnapshotNeedsRead(snapshot, 1000, [head], 3_600_000)).toBe(false);
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
    expect(sabSnapshotNeedsRead(snapshot, 1000, polled, 6999)).toBe(false);
    expect(sabSnapshotNeedsRead(snapshot, 1000, polled, 7000)).toBe(true);
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
