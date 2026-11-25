import { getDemoResponse } from "@/lib/demo-data";
import {
  SAB_QUEUE_PAGE_SIZE,
  sabQueueHasMore,
  sabQueueWindowRequest,
} from "@/lib/sab-queue-window";
import type { SabQueue } from "@/lib/types";

const slots = (n: number) => Array.from({ length: n }, () => ({}));

describe("sabQueueWindowRequest", () => {
  it("reads the head of the queue by default", () => {
    expect(sabQueueWindowRequest(SAB_QUEUE_PAGE_SIZE, false, 2300)).toEqual({
      start: 0,
      limit: 100,
    });
  });

  it("reads the tail for newest first", () => {
    expect(sabQueueWindowRequest(200, true, 2300)).toEqual({ start: 2100, limit: 200 });
  });

  it("starts at 0 when the window covers the whole queue", () => {
    expect(sabQueueWindowRequest(100, true, 40)).toEqual({ start: 0, limit: 100 });
  });

  it("falls back to the head when the queue length is unknown", () => {
    expect(sabQueueWindowRequest(100, true)).toEqual({ start: 0, limit: 100 });
  });
});

describe("sabQueueHasMore", () => {
  it("has more after a full head window of a longer queue", () => {
    expect(
      sabQueueHasMore({ noofslots: 2300, slots: slots(100) as never }, { start: 0, limit: 100 }, false),
    ).toBe(true);
  });

  it("is done when the head window holds the whole queue", () => {
    expect(
      sabQueueHasMore({ noofslots: 40, slots: slots(40) as never }, { start: 0, limit: 100 }, false),
    ).toBe(false);
  });

  it("has more while a tail window starts past the head", () => {
    expect(
      sabQueueHasMore({ noofslots: 2300, slots: slots(100) as never }, { start: 2200, limit: 100 }, false),
    ).toBe(true);
    expect(
      sabQueueHasMore({ noofslots: 90, slots: slots(90) as never }, { start: 0, limit: 100 }, false),
    ).toBe(false);
  });

  it("can only tell from a full answer under a status filter", () => {
    // noofslots is the whole queue's length even when filtered.
    expect(
      sabQueueHasMore({ noofslots: 2300, slots: slots(12) as never }, { start: 0, limit: 100 }, true),
    ).toBe(false);
    expect(
      sabQueueHasMore({ noofslots: 2300, slots: slots(100) as never }, { start: 0, limit: 100 }, true),
    ).toBe(true);
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
