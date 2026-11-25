jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));

import { serviceRequest } from "@/lib/http-client";
import { sabQueueMoveTarget } from "@/lib/sab-queue-move";
import { findSabSlotPosition, moveSabSlot } from "@/services/sabnzbd-api";

const request = serviceRequest as jest.Mock;

describe("sabQueueMoveTarget", () => {
  it("maps each move to an index", () => {
    expect(sabQueueMoveTarget("top", 5, 10)).toBe(0);
    expect(sabQueueMoveTarget("up", 5, 10)).toBe(4);
    expect(sabQueueMoveTarget("down", 5, 10)).toBe(6);
    expect(sabQueueMoveTarget("bottom", 5, 10)).toBe(9);
  });

  it("is null when the job is already there", () => {
    expect(sabQueueMoveTarget("top", 0, 10)).toBeNull();
    expect(sabQueueMoveTarget("up", 0, 10)).toBeNull();
    expect(sabQueueMoveTarget("down", 9, 10)).toBeNull();
    expect(sabQueueMoveTarget("bottom", 9, 10)).toBeNull();
    expect(sabQueueMoveTarget("down", 0, 1)).toBeNull();
  });
});

const page = (ids: string[], noofslots: number) => ({
  queue: { noofslots, slots: ids.map((nzo_id) => ({ nzo_id })) },
});
const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `job${from + i}`);

describe("findSabSlotPosition", () => {
  beforeEach(() => request.mockReset());

  it("finds a job on the first page with one request", async () => {
    request.mockResolvedValueOnce(page(ids(0, 200), 450));
    await expect(findSabSlotPosition("job3")).resolves.toEqual({ position: 3, length: 450 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][2].params).toEqual({ mode: "queue", start: 0, limit: 200 });
  });

  it("pages until the job turns up", async () => {
    request
      .mockResolvedValueOnce(page(ids(0, 200), 450))
      .mockResolvedValueOnce(page(ids(200, 200), 450))
      .mockResolvedValueOnce(page(ids(400, 50), 450));
    await expect(findSabSlotPosition("job420")).resolves.toEqual({ position: 420, length: 450 });
    expect(request.mock.calls.map((c) => c[2].params.start)).toEqual([0, 200, 400]);
  });

  it("is null once the queue runs out", async () => {
    request.mockResolvedValueOnce(page(ids(0, 30), 30));
    await expect(findSabSlotPosition("gone")).resolves.toBeNull();
  });
});

describe("moveSabSlot", () => {
  beforeEach(() => request.mockReset());

  it("sends mode=switch with the target index and returns SAB's answer", async () => {
    request.mockResolvedValueOnce({ result: { position: 0, priority: 1 } });
    await expect(moveSabSlot("job5", 0)).resolves.toEqual({ position: 0, priority: 1 });
    expect(request.mock.calls[0][2].params).toEqual({
      mode: "switch",
      value: "job5",
      value2: 0,
    });
  });

  it("reads a missing result as nothing moved", async () => {
    request.mockResolvedValueOnce({ status: true });
    await expect(moveSabSlot("job5", 0)).resolves.toEqual({ position: -1, priority: 0 });
  });
});
