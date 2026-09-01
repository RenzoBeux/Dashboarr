import { getDemoResponse } from "@/lib/demo-data";
import {
  classifyQueryStatus,
  parseGravityOutput,
  readCnameRecords,
  toHistorySeries,
} from "@/lib/pihole-normalize";
import type { PiholeQueriesResponse, PiholeSummary } from "@/lib/types";

/**
 * Demo mode is a first-class path — it is what store screenshots use and what a
 * user sees before configuring anything. These push the fixtures through the
 * REAL parsers, so a drifted fixture cannot make demo mode look right while the
 * live integration breaks.
 */

const demo = (path: string, params?: Record<string, string | number | boolean>, body?: string, method?: string) =>
  getDemoResponse("pihole", path, params, body, method);

describe("routing", () => {
  const PATHS = [
    "/dns/blocking",
    "/action/gravity",
    "/stats/summary",
    "/stats/top_domains",
    "/stats/top_clients",
    "/stats/upstreams",
    "/stats/recent_blocked",
    "/history",
    "/queries",
    "/queries/suggestions",
    "/config/dns/cnameRecords",
    "/info/version",
    "/info/login",
    "/padd",
    "/auth",
  ];

  it("answers every path the API module calls", () => {
    for (const path of PATHS) {
      expect(demo(path)).toBeDefined();
    }
  });

  it("does not leak into another service", () => {
    expect(getDemoResponse("radarr", "/dns/blocking")).toBeUndefined();
  });
});

describe("blocking", () => {
  it("rests on enabled with no timer", () => {
    expect(demo("/dns/blocking")).toEqual({ blocking: "enabled", timer: null });
  });

  // Without this the demo toggle would snap back and look broken.
  it("echoes a POSTed disable so the toggle visibly flips", () => {
    expect(
      demo("/dns/blocking", undefined, JSON.stringify({ blocking: false, timer: 300 }), "POST"),
    ).toEqual({ blocking: "disabled", timer: 300 });
  });

  it("echoes a POSTed enable", () => {
    expect(
      demo("/dns/blocking", undefined, JSON.stringify({ blocking: true, timer: null }), "POST"),
    ).toEqual({ blocking: "enabled", timer: null });
  });

  it("falls back to the resting state for an unparseable body", () => {
    expect(demo("/dns/blocking", undefined, "not json", "POST")).toEqual({
      blocking: "enabled",
      timer: null,
    });
  });
});

describe("summary", () => {
  it("is internally consistent", () => {
    const s = demo("/stats/summary") as PiholeSummary;
    expect(s.queries.forwarded + s.queries.cached).toBeLessThanOrEqual(s.queries.total);
    expect(s.queries.blocked).toBeLessThan(s.queries.total);
    // percent_blocked is a percentage, not a fraction.
    expect(s.queries.percent_blocked).toBeGreaterThan(1);
    expect(s.queries.percent_blocked).toBeCloseTo(
      (s.queries.blocked / s.queries.total) * 100,
      0,
    );
    expect(s.clients.active).toBeLessThanOrEqual(s.clients.total);
    // 0 would render as "unknown"; a real timestamp exercises the age display.
    expect(s.gravity.last_update).toBeGreaterThan(0);
  });
});

describe("history", () => {
  it("parses into 144 ten-minute buckets", () => {
    const series = toHistorySeries(demo("/history"));
    expect(series).toHaveLength(144);
    expect(series[1]!.timestampMs - series[0]!.timestampMs).toBe(600_000);
  });

  // The chart stacks blocked against (total - blocked), so a fixture where
  // total is not the sum would render bars that overflow the plot.
  it("keeps total as the sum of the three parts", () => {
    for (const p of toHistorySeries(demo("/history"))) {
      expect(p.cached + p.blocked + p.forwarded).toBe(p.total);
      expect(p.blocked).toBeLessThanOrEqual(p.total);
    }
  });

  it("has something to draw", () => {
    const series = toHistorySeries(demo("/history"));
    expect(Math.max(...series.map((p) => p.total))).toBeGreaterThan(0);
  });
});

describe("top lists", () => {
  it("splits on the blocked flag", () => {
    const blocked = demo("/stats/top_domains", { blocked: true }) as { domains: unknown[] };
    const permitted = demo("/stats/top_domains", { blocked: false }) as { domains: unknown[] };
    expect(blocked.domains).not.toEqual(permitted.domains);
    expect(blocked.domains).toHaveLength(10);
    expect(permitted.domains).toHaveLength(10);
  });

  // buildUrl stringifies params, so the demo router sees "true", not true.
  it("honours a stringified blocked flag", () => {
    expect(demo("/stats/top_domains", { blocked: "true" })).toEqual(
      demo("/stats/top_domains", { blocked: true }),
    );
  });

  it("returns clients with at least one unresolved name", () => {
    const { clients } = demo("/stats/top_clients") as {
      clients: { name: string | null }[];
    };
    expect(clients.length).toBeGreaterThan(0);
    expect(clients.some((c) => c.name === null)).toBe(true);
  });

  it("respects the recent_blocked count", () => {
    expect((demo("/stats/recent_blocked", { count: 3 }) as { blocked: string[] }).blocked)
      .toHaveLength(3);
  });
});

describe("query log", () => {
  const page = (params?: Record<string, string | number | boolean>) =>
    demo("/queries", params) as PiholeQueriesResponse;

  it("returns a full first page with a cursor", () => {
    const first = page({ length: 100 });
    expect(first.queries).toHaveLength(100);
    expect(first.cursor).not.toBeNull();
  });

  // The three getNextPageParam stop conditions all need to be reachable here,
  // or demo mode would page forever.
  it("terminates with a short final page and a null cursor", () => {
    const first = page({ length: 100 });
    const second = page({ length: 100, cursor: first.cursor! });
    expect(second.queries.length).toBeLessThan(100);
    expect(second.queries.length).toBeGreaterThan(0);
    expect(second.cursor).toBeNull();
  });

  it("does not repeat rows across pages", () => {
    const first = page({ length: 100 });
    const second = page({ length: 100, cursor: first.cursor! });
    const ids = new Set([...first.queries, ...second.queries].map((q) => q.id));
    expect(ids.size).toBe(first.queries.length + second.queries.length);
  });

  it("filters by domain", () => {
    const filtered = page({ length: 100, domain: "ads.example-network.com" });
    expect(filtered.queries.length).toBeGreaterThan(0);
    expect(filtered.queries.every((q) => q.domain === "ads.example-network.com")).toBe(true);
    expect(filtered.recordsFiltered).toBeLessThan(filtered.recordsTotal);
  });

  // A typo'd status would silently render every row as the neutral "other"
  // colour forever, which is exactly the kind of thing nobody notices.
  it("uses only statuses the classifier recognises", () => {
    for (const q of page({ length: 100 }).queries) {
      expect(classifyQueryStatus(q.status)).not.toBe("other");
    }
  });

  it("covers blocked, cached and forwarded verdicts", () => {
    const verdicts = new Set(
      page({ length: 100 }).queries.map((q) => classifyQueryStatus(q.status)),
    );
    expect(verdicts).toContain("blocked");
    expect(verdicts).toContain("cached");
    expect(verdicts).toContain("forwarded");
  });

  it("includes a CNAME-blocked row so that row variant renders", () => {
    expect(page({ length: 100 }).queries.some((q) => q.cname !== null)).toBe(true);
  });

  it("is ordered newest first", () => {
    const rows = page({ length: 100 }).queries;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.time).toBeLessThanOrEqual(rows[i - 1]!.time);
    }
  });
});

describe("CNAME records", () => {
  it("parses into a wildcard record and a TTL record", () => {
    const records = readCnameRecords(demo("/config/dns/cnameRecords"));
    expect(records).toHaveLength(3);
    expect(records.some((r) => r.cname.startsWith("*."))).toBe(true);
    expect(records.some((r) => r.ttl !== null)).toBe(true);
  });

  // getDemoResponse short-circuits DELETE globally, but not PUT — without the
  // explicit route a demo add would return the whole record list as its result.
  it("returns nothing for an add or a delete", () => {
    expect(demo("/config/dns/cnameRecords/a.com%2Cb.com", undefined, undefined, "PUT")).toBeUndefined();
    expect(demo("/config/dns/cnameRecords/a.com%2Cb.com", undefined, undefined, "DELETE")).toBeUndefined();
  });
});

describe("gravity", () => {
  it("parses as a clean success with a domain count", () => {
    const result = parseGravityOutput(demo("/action/gravity") as string);
    expect(result.status).toBe("success");
    expect(result.domainCount).toBe(219727);
    expect(result.failures).toEqual([]);
  });
});

describe("padd", () => {
  it("carries the fields the dashboard widget reads", () => {
    const padd = demo("/padd") as Record<string, unknown>;
    for (const key of ["blocking", "gravity_size", "active_clients", "queries"]) {
      expect(padd[key]).toBeDefined();
    }
  });
});
