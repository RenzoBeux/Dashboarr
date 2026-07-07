// Locks down the request shapes for the usenet download speed-limit setters.
// The correctness-critical bit is SAB's unit convention: a bare `value` is a
// PERCENTAGE of the configured line speed, so an absolute KB/s limit MUST carry
// a `K` suffix. NZBGet's `rate` takes KB/s directly (0 = unlimited). We mock the
// transport (serviceRequest) to capture the exact params/body each builds.

jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { setSabSpeedLimit } from "@/services/sabnzbd-api";
import { setNzbgetRate } from "@/services/nzbget-api";

const mockServiceRequest = serviceRequest as jest.MockedFunction<
  typeof serviceRequest
>;

function lastCall() {
  const calls = mockServiceRequest.mock.calls;
  return calls[calls.length - 1]!;
}

beforeEach(() => {
  mockServiceRequest.mockReset();
  mockServiceRequest.mockResolvedValue({ status: true } as never);
});

describe("setSabSpeedLimit", () => {
  it("sends an absolute KB/s value with the load-bearing K suffix", async () => {
    await setSabSpeedLimit(5120);
    const [service, path, opts] = lastCall();
    expect(service).toBe("sabnzbd");
    expect(path).toBe("");
    expect((opts as { params: Record<string, unknown> }).params).toEqual({
      mode: "config",
      name: "speedlimit",
      // "5120K" — NOT "5120", which SAB would read as 5120%.
      value: "5120K",
    });
  });

  it("sends '0' (no suffix) for unlimited", async () => {
    await setSabSpeedLimit(0);
    const opts = lastCall()[2] as { params: Record<string, unknown> };
    expect(opts.params.value).toBe("0");
  });

  it("rounds fractional KB/s before appending K", async () => {
    await setSabSpeedLimit(1536.7);
    const opts = lastCall()[2] as { params: Record<string, unknown> };
    expect(opts.params.value).toBe("1537K");
  });

  it("passes the instanceId through", async () => {
    await setSabSpeedLimit(1024, "sab-2");
    const opts = lastCall()[2] as { instanceId?: string };
    expect(opts.instanceId).toBe("sab-2");
  });
});

describe("setNzbgetRate", () => {
  function bodyOf(call: unknown[]): { method: string; params: unknown[] } {
    return JSON.parse((call[2] as { body: string }).body);
  }

  it("calls the rate method with the KB/s value as a positional param", async () => {
    await setNzbgetRate(5120);
    const [service, , opts] = lastCall();
    expect(service).toBe("nzbget");
    const body = bodyOf(lastCall());
    expect(body.method).toBe("rate");
    expect(body.params).toEqual([5120]);
    expect((opts as { instanceId?: string }).instanceId).toBeUndefined();
  });

  it("sends 0 for unlimited and clamps negatives to 0", async () => {
    await setNzbgetRate(0);
    expect(bodyOf(lastCall()).params).toEqual([0]);
    await setNzbgetRate(-50);
    expect(bodyOf(lastCall()).params).toEqual([0]);
  });

  it("rounds fractional KB/s", async () => {
    await setNzbgetRate(2048.4);
    expect(bodyOf(lastCall()).params).toEqual([2048]);
  });
});
