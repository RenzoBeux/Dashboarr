import { BESZEL_RANGE_ORDER, BESZEL_RANGES, beszelSinceFilter } from "@/lib/beszel-ranges";

describe("BESZEL_RANGES", () => {
  it("maps each range to the hub's rollup type", () => {
    expect(BESZEL_RANGES["1h"].rollup).toBe("1m");
    expect(BESZEL_RANGES["12h"].rollup).toBe("10m");
    expect(BESZEL_RANGES["24h"].rollup).toBe("20m");
    expect(BESZEL_RANGES["1w"].rollup).toBe("120m");
    expect(BESZEL_RANGES["30d"].rollup).toBe("480m");
  });

  it("polls no faster than once a minute, and no faster than the rollup lands", () => {
    expect(BESZEL_RANGES["1h"].pollMs).toBe(60_000);
    expect(BESZEL_RANGES["1w"].pollMs).toBe(7_200_000);
  });

  it("uses day labels only for the week/month ranges", () => {
    expect(BESZEL_RANGES["24h"].longFormat).toBe(false);
    expect(BESZEL_RANGES["1w"].longFormat).toBe(true);
  });

  it("lists ranges shortest first", () => {
    expect(BESZEL_RANGE_ORDER).toEqual(["1h", "12h", "24h", "1w", "30d"]);
  });
});

describe("beszelSinceFilter", () => {
  it("formats now minus the range as a PocketBase UTC datetime", () => {
    expect(beszelSinceFilter("1h", Date.UTC(2026, 10, 28, 10, 0, 0))).toBe("2026-11-28 09:00:00");
    expect(beszelSinceFilter("30d", Date.UTC(2026, 10, 28, 10, 0, 0))).toBe("2026-10-29 10:00:00");
  });
});
