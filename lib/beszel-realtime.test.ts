import {
  appStateKeepsLive,
  appendWindow,
  beszelRealtimeTopic,
  liveSupported,
  normalizeRealtimeMessage,
  realtimeBackoffMs,
} from "@/lib/beszel-realtime";

describe("beszelRealtimeTopic", () => {
  it("encodes the system query exactly like the PocketBase JS SDK", () => {
    expect(beszelRealtimeTopic("abc")).toBe("rt_metrics?options=%7B%22query%22%3A%7B%22system%22%3A%22abc%22%7D%7D");
  });
});

describe("normalizeRealtimeMessage", () => {
  const now = Date.UTC(2026, 10, 28, 10, 0, 5);

  it("normalizes stats and containers, stamping the receive time", () => {
    const out = normalizeRealtimeMessage(
      { stats: { cpu: 12, mp: 40, b: [10, 20] }, info: {}, container: [{ n: "plex", c: 3, m: 100 }] },
      now,
    )!;
    expect(out.stats.createdAt).toBe("2026-11-28T10:00:05.000Z");
    expect(out.stats.cpuPct).toBe(12);
    expect(out.stats.netRecvBps).toBe(20);
    expect(out.containers!.containers.plex.cpuPct).toBe(3);
  });

  it("returns null containers when the agent reports none", () => {
    expect(normalizeRealtimeMessage({ stats: { cpu: 1 }, container: null }, now)!.containers).toBeNull();
    expect(normalizeRealtimeMessage({ stats: { cpu: 1 }, container: [] }, now)!.containers).toBeNull();
  });

  it("rejects a malformed payload", () => {
    expect(normalizeRealtimeMessage(null, now)).toBeNull();
    expect(normalizeRealtimeMessage({ info: {} }, now)).toBeNull();
  });
});

describe("appendWindow", () => {
  it("caps the buffer, dropping the oldest", () => {
    const full = Array.from({ length: 60 }, (_, i) => i);
    const next = appendWindow(full, 60);
    expect(next).toHaveLength(60);
    expect(next[0]).toBe(1);
    expect(next[59]).toBe(60);
  });

  it("does not mutate the input", () => {
    const buf = [1];
    appendWindow(buf, 2);
    expect(buf).toEqual([1]);
  });
});

describe("realtimeBackoffMs", () => {
  it("backs off 1s, 2s, 5s, then 10s forever", () => {
    expect([0, 1, 2, 3, 4, 9].map(realtimeBackoffMs)).toEqual([1000, 2000, 5000, 10000, 10000, 10000]);
  });
});

describe("liveSupported", () => {
  it("needs an up system on agent 0.13.0 or newer", () => {
    expect(liveSupported({ status: "up", agentVersion: "0.13.0" })).toBe(true);
    expect(liveSupported({ status: "up", agentVersion: "0.21.2" })).toBe(true);
    expect(liveSupported({ status: "up", agentVersion: "1.0.0" })).toBe(true);
    expect(liveSupported({ status: "up", agentVersion: "0.12.9" })).toBe(false);
    expect(liveSupported({ status: "up", agentVersion: "" })).toBe(false);
    expect(liveSupported({ status: "down", agentVersion: "0.21.2" })).toBe(false);
  });
});

describe("appStateKeepsLive", () => {
  it("keeps streaming through iOS's transient inactive state, stops in the background", () => {
    expect(appStateKeepsLive("active")).toBe(true);
    expect(appStateKeepsLive("inactive")).toBe(true);
    expect(appStateKeepsLive("background")).toBe(false);
  });
});
