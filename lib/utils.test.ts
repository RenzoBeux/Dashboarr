import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatProgress,
  truncateText,
  formatEpisodeCode,
  relativeDate,
  formatAudioChannels,
  formatResolution,
} from "./utils";

describe("formatBytes", () => {
  it("returns '0 B' for 0", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats 1024 as '1.0 KB' (binary k=1024 with KB label)", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats 1.5 GiB as '1.5 GB'", () => {
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("respects the decimals parameter", () => {
    expect(formatBytes(1024, 0)).toBe("1 KB");
    expect(formatBytes(1024 * 1024, 3)).toBe("1.000 MB");
  });
});

describe("formatSpeed", () => {
  it("returns '0 B/s' for 0", () => {
    expect(formatSpeed(0)).toBe("0 B/s");
  });

  it("appends '/s' to the formatted byte count", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1.0 MB/s");
  });
});

describe("formatEta", () => {
  it("returns infinity for 0", () => {
    expect(formatEta(0)).toBe("∞");
  });

  it("returns infinity for negative values", () => {
    expect(formatEta(-1)).toBe("∞");
  });

  it("returns infinity for the qBittorrent magic number 8640000", () => {
    expect(formatEta(8640000)).toBe("∞");
  });

  it("formats <60 seconds as 'Ns'", () => {
    expect(formatEta(30)).toBe("30s");
  });

  it("formats minutes-only", () => {
    expect(formatEta(90)).toBe("1m");
    expect(formatEta(59 * 60)).toBe("59m");
  });

  it("formats hours-only when minutes-component is zero", () => {
    expect(formatEta(2 * 3600)).toBe("2h");
  });

  it("formats hours plus minutes", () => {
    expect(formatEta(2 * 3600 + 15 * 60)).toBe("2h 15m");
  });
});

describe("formatProgress", () => {
  it("formats 0 as '0.0%'", () => {
    expect(formatProgress(0)).toBe("0.0%");
  });

  it("formats 0.452 as '45.2%'", () => {
    expect(formatProgress(0.452)).toBe("45.2%");
  });

  it("formats 1 as '100.0%'", () => {
    expect(formatProgress(1)).toBe("100.0%");
  });
});

describe("truncateText", () => {
  it("returns the original text when shorter than maxLength", () => {
    expect(truncateText("hi", 10)).toBe("hi");
  });

  it("ellipsizes when too long", () => {
    expect(truncateText("hello world", 5)).toBe("hell…");
  });
});

describe("formatEpisodeCode", () => {
  it("zero-pads season and episode", () => {
    expect(formatEpisodeCode(1, 5)).toBe("S01E05");
    expect(formatEpisodeCode(12, 100)).toBe("S12E100");
  });
});

describe("relativeDate", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("returns 'Today' for today's date", () => {
    expect(relativeDate("2026-04-27T08:00:00Z")).toBe("Today");
  });

  it("returns 'Tomorrow' for +1 day", () => {
    expect(relativeDate("2026-04-28T08:00:00Z")).toBe("Tomorrow");
  });

  it("returns 'Yesterday' for -1 day", () => {
    expect(relativeDate("2026-04-26T08:00:00Z")).toBe("Yesterday");
  });

  it("returns a formatted weekday for +3 days", () => {
    const result = relativeDate("2026-04-30T08:00:00Z");
    expect(result).toMatch(/^[A-Za-z]{3},?\s[A-Za-z]{3}\s\d+$/);
    expect(result).toContain("Apr");
    expect(result).toContain("30");
  });
});

describe("formatAudioChannels", () => {
  it("maps 8 to 7.1", () => {
    expect(formatAudioChannels(8)).toBe("7.1");
  });

  it("maps 6 to 5.1", () => {
    expect(formatAudioChannels(6)).toBe("5.1");
  });

  it("maps 2 to 2.0", () => {
    expect(formatAudioChannels(2)).toBe("2.0");
  });

  it("returns the raw number for mono", () => {
    expect(formatAudioChannels(1)).toBe("1");
  });
});

describe("formatResolution", () => {
  it("maps 3840x2160 to 4K", () => {
    expect(formatResolution("3840x2160")).toBe("4K");
  });

  it("maps 1920x1080 to 1080p", () => {
    expect(formatResolution("1920x1080")).toBe("1080p");
  });

  it("maps 1280x720 to 720p", () => {
    expect(formatResolution("1280x720")).toBe("720p");
  });

  it("returns the raw resolution for sub-480p", () => {
    expect(formatResolution("320x240")).toBe("320x240");
  });
});
