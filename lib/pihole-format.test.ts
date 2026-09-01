import {
  MAX_DISABLE_SECONDS,
  PIHOLE_DISABLE_PRESETS,
  downsampleHistory,
  formatClockTime,
  formatCountdown,
  formatLogTime,
  formatUnixAgo,
  historyChunkForWidth,
  queryStatusMeta,
  secondsUntilLocalMidnight,
} from "@/lib/pihole-format";
import type { PiholeHistoryPoint } from "@/lib/pihole-normalize";

describe("secondsUntilLocalMidnight", () => {
  it("counts to the next local midnight", () => {
    // 22:00 local -> two hours.
    const now = new Date(2026, 7, 28, 22, 0, 0);
    expect(secondsUntilLocalMidnight(now)).toBe(7200);
  });

  it("returns a full day one second after midnight", () => {
    const now = new Date(2026, 7, 28, 0, 0, 1);
    expect(secondsUntilLocalMidnight(now)).toBe(86399);
  });

  // A timer of 0 risks being read as "permanent", so never return it.
  it("never returns zero, even a hair before midnight", () => {
    const now = new Date(2026, 7, 28, 23, 59, 59, 900);
    expect(secondsUntilLocalMidnight(now)).toBeGreaterThanOrEqual(1);
  });

  it("always lands inside a plausible day, at every hour", () => {
    for (let hour = 0; hour < 24; hour++) {
      const s = secondsUntilLocalMidnight(new Date(2026, 7, 28, hour, 30, 0));
      expect(s).toBeGreaterThan(0);
      // 25h covers a fall-back DST night in any timezone.
      expect(s).toBeLessThanOrEqual(25 * 3600);
    }
  });

  // setHours(24,...) is local-calendar arithmetic, so a DST night is 23h or
  // 25h rather than a flat 86400. `86400 - secondsSinceMidnight` gets both
  // wrong; this locks in the correct behaviour wherever the suite runs.
  it("agrees with an independent local-calendar computation", () => {
    const now = new Date(2026, 2, 29, 13, 17, 42);
    const expected = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    expect(secondsUntilLocalMidnight(now)).toBe(
      Math.round((expected.getTime() - now.getTime()) / 1000),
    );
  });

  it("does not mutate the date it is given", () => {
    const now = new Date(2026, 7, 28, 22, 0, 0);
    const before = now.getTime();
    secondsUntilLocalMidnight(now);
    expect(now.getTime()).toBe(before);
  });
});

describe("formatCountdown", () => {
  it("renders hours, minutes and seconds", () => {
    expect(formatCountdown(3661)).toBe("1:01:01");
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(9)).toBe("9s");
    expect(formatCountdown(0)).toBe("0s");
  });

  // formatEta would show the infinity glyph here, which is exactly wrong for a
  // timer that has just run out.
  it("clamps negatives to zero rather than showing infinity", () => {
    expect(formatCountdown(-5)).toBe("0s");
  });

  it("ticks visibly every second, unlike a minute-floored format", () => {
    expect(formatCountdown(245)).not.toBe(formatCountdown(244));
  });
});

describe("time formatting", () => {
  it("formats a clock time with padding", () => {
    expect(formatClockTime(new Date(2026, 7, 28, 9, 5))).toBe("09:05");
    expect(formatClockTime(new Date(2026, 7, 28, 23, 0))).toBe("23:00");
  });

  it("formats a log time to the second", () => {
    const d = new Date(2026, 7, 28, 14, 3, 7);
    expect(formatLogTime(d.getTime() / 1000)).toBe("14:03:07");
  });

  it("renders relative ages, and 0 as unknown", () => {
    const now = Date.UTC(2026, 7, 28, 12, 0, 0);
    const at = (deltaS: number) => formatUnixAgo(now / 1000 - deltaS, now);
    expect(formatUnixAgo(0, now)).toBe("Unknown");
    expect(at(10)).toBe("just now");
    expect(at(300)).toBe("5m ago");
    expect(at(7200)).toBe("2h ago");
    expect(at(172800)).toBe("2d ago");
  });
});

describe("queryStatusMeta", () => {
  it("colours blocked statuses red", () => {
    const meta = queryStatusMeta("GRAVITY");
    expect(meta).toMatchObject({
      blocked: true,
      dotClass: "bg-danger",
      badgeVariant: "error",
      label: "Blocklist",
    });
  });

  it("separates cached from forwarded", () => {
    expect(queryStatusMeta("CACHE").badgeVariant).toBe("success");
    expect(queryStatusMeta("FORWARDED").badgeVariant).toBe("info");
  });

  it("treats CACHE_STALE as a cache hit, not a block", () => {
    expect(queryStatusMeta("CACHE_STALE")).toMatchObject({
      blocked: false,
      badgeVariant: "success",
    });
  });

  it("marks transient states amber", () => {
    expect(queryStatusMeta("RETRIED").badgeVariant).toBe("warning");
    expect(queryStatusMeta("IN_PROGRESS").badgeVariant).toBe("warning");
  });

  // The important one: a status Pi-hole adds later must not render as allowed.
  it("falls back to neutral, never to an allowed colour", () => {
    const meta = queryStatusMeta("SOME_FUTURE_BLOCK_REASON");
    expect(meta.blocked).toBe(false);
    expect(meta.badgeVariant).toBe("default");
    expect(meta.dotClass).toBe("bg-zinc-600");
    expect(meta.label).toBe("SOME_FUTURE_BLOCK_REASON");
  });

  it("handles a null status", () => {
    expect(queryStatusMeta(null).label).toBe("Unknown");
  });
});

describe("downsampleHistory", () => {
  const points: PiholeHistoryPoint[] = Array.from({ length: 12 }, (_, i) => ({
    timestampMs: i * 600_000,
    total: 10,
    cached: 2,
    blocked: 3,
    forwarded: 5,
  }));

  it("sums each bucket and anchors on its first timestamp", () => {
    const out = downsampleHistory(points, 3);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({
      timestampMs: 0,
      total: 30,
      cached: 6,
      blocked: 9,
      forwarded: 15,
    });
    expect(out[1]!.timestampMs).toBe(3 * 600_000);
  });

  it("preserves the grand total", () => {
    const out = downsampleHistory(points, 5);
    expect(out.reduce((a, p) => a + p.total, 0)).toBe(120);
  });

  it("keeps a trailing partial bucket rather than dropping data", () => {
    const out = downsampleHistory(points, 5);
    expect(out).toHaveLength(3);
    expect(out[2]!.total).toBe(20); // the last 2 points
  });

  it("is a passthrough at chunk 1 and for junk chunks", () => {
    expect(downsampleHistory(points, 1)).toEqual(points);
    expect(downsampleHistory(points, 0)).toEqual(points);
    expect(downsampleHistory([], 3)).toEqual([]);
  });
});

describe("historyChunkForWidth", () => {
  // ~326dp of plot on a 390dp phone: 144 points would be 2.26dp per bar.
  it("folds a phone-width 24h chart into readable bars", () => {
    const chunk = historyChunkForWidth(144, 326);
    expect(chunk).toBe(3);
    const bars = Math.ceil(144 / chunk);
    expect(326 / bars).toBeGreaterThanOrEqual(6);
  });

  it("shows more detail on a wider plot", () => {
    expect(historyChunkForWidth(144, 700)).toBeLessThan(
      historyChunkForWidth(144, 326),
    );
  });

  it("never returns less than one bar per point, or a zero chunk", () => {
    expect(historyChunkForWidth(144, 5000)).toBe(1);
    expect(historyChunkForWidth(144, 0)).toBe(1);
    expect(historyChunkForWidth(0, 326)).toBe(1);
  });

  it("keeps every bar above the legibility floor at common widths", () => {
    for (const width of [280, 326, 390, 520, 700, 900]) {
      const bars = Math.ceil(144 / historyChunkForWidth(144, width));
      expect(width / bars).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("presets", () => {
  it("offers ascending durations inside the custom cap", () => {
    const seconds = PIHOLE_DISABLE_PRESETS.map((p) => p.seconds);
    expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
    for (const s of seconds) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(MAX_DISABLE_SECONDS);
    }
  });
});
