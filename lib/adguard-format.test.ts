import {
  ADGUARD_DISABLE_PRESETS,
  MAX_DISABLE_MS,
  formatClockTime,
  formatCountdown,
  formatIsoAgo,
  formatLogTime,
  formatShortDate,
  msUntilLocalMidnight,
  queryReasonMeta,
} from "@/lib/adguard-format";

describe("msUntilLocalMidnight", () => {
  it("counts to the next local midnight", () => {
    const now = new Date(2026, 7, 28, 22, 0, 0);
    expect(msUntilLocalMidnight(now)).toBe(2 * 3600 * 1000);
  });

  it("returns just under a full day one millisecond after midnight", () => {
    const now = new Date(2026, 7, 28, 0, 0, 0, 1);
    expect(msUntilLocalMidnight(now)).toBe(86_400_000 - 1);
  });

  it("never returns zero, even a hair before midnight", () => {
    const now = new Date(2026, 7, 28, 23, 59, 59, 999);
    expect(msUntilLocalMidnight(now)).toBeGreaterThanOrEqual(1);
  });

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
    expect(msUntilLocalMidnight(now)).toBe(expected.getTime() - now.getTime());
  });
});

describe("formatCountdown", () => {
  it("renders seconds only under a minute", () => {
    expect(formatCountdown(45_000)).toBe("45s");
  });

  it("renders M:SS under an hour", () => {
    expect(formatCountdown(125_000)).toBe("2:05");
  });

  it("renders H:MM:SS at an hour or more", () => {
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
  });

  it("floors instead of showing an infinity glyph at/under zero", () => {
    expect(formatCountdown(0)).toBe("0s");
    expect(formatCountdown(-5000)).toBe("0s");
  });
});

describe("formatClockTime", () => {
  it("pads to HH:MM", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
  });
});

describe("formatShortDate", () => {
  // Exists because the chart's x-axis labels collapsed when `time_units` is
  // "days": every daily bucket went through formatClockTime and printed the
  // same HH:MM. The property that matters is that adjacent days differ, in
  // whatever locale the device runs.
  it("renders adjacent days as distinct labels", () => {
    const a = formatShortDate(new Date(2026, 8, 15, 4, 0));
    const b = formatShortDate(new Date(2026, 8, 16, 4, 0));
    expect(a).not.toBe(b);
    expect(a).toContain("15");
    expect(b).toContain("16");
  });

  it("accepts a ms timestamp as well as a Date", () => {
    const d = new Date(2026, 8, 15, 4, 0);
    expect(formatShortDate(d.getTime())).toBe(formatShortDate(d));
  });
});

describe("formatLogTime", () => {
  it("extracts HH:MM:SS from an ISO timestamp", () => {
    expect(formatLogTime("2018-11-26T14:03:27+00:00")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("falls back to a placeholder for an invalid string", () => {
    expect(formatLogTime("not-a-date")).toBe("--:--:--");
  });
});

describe("formatIsoAgo", () => {
  it("says 'just now' inside a minute", () => {
    const now = Date.now();
    expect(formatIsoAgo(new Date(now - 5000).toISOString(), now)).toBe("just now");
  });

  it("returns 'Unknown' for a missing or invalid timestamp", () => {
    expect(formatIsoAgo(undefined)).toBe("Unknown");
    expect(formatIsoAgo("not-a-date")).toBe("Unknown");
  });
});

describe("ADGUARD_DISABLE_PRESETS / MAX_DISABLE_MS", () => {
  it("are all well under the 7-day cap", () => {
    for (const preset of ADGUARD_DISABLE_PRESETS) {
      expect(preset.ms).toBeLessThan(MAX_DISABLE_MS);
    }
  });
});

describe("queryReasonMeta", () => {
  it("marks a blocked reason as blocked, red, and an error badge", () => {
    const meta = queryReasonMeta("FilteredBlackList");
    expect(meta).toEqual({
      label: "Blocklist",
      verdict: "blocked",
      blocked: true,
      dotClass: "bg-danger",
      badgeVariant: "error",
    });
  });

  it("never marks an unrecognized reason as blocked or allowed-green", () => {
    const meta = queryReasonMeta("SomeFutureReason");
    expect(meta.blocked).toBe(false);
    expect(meta.dotClass).toBe("bg-zinc-600");
    expect(meta.badgeVariant).toBe("default");
  });
});
