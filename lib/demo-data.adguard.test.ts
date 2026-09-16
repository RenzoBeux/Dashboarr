import { getDemoResponse } from "@/lib/demo-data";
import { classifyQueryReason, toTopListRows } from "@/lib/adguard-normalize";
import type {
  AdguardFilterStatus,
  AdguardQueryLogResponse,
  AdguardRewriteEntry,
  AdguardServerStatus,
  AdguardStats,
} from "@/lib/types";

/**
 * Demo mode is a first-class path — it is what store screenshots use and what
 * a user sees before configuring anything. These push the fixtures through
 * the REAL parsers, so a drifted fixture cannot make demo mode look right
 * while the live integration breaks.
 */

const demo = (path: string) => getDemoResponse("adguard", path);

describe("routing", () => {
  const PATHS = [
    "/status",
    "/stats",
    "/filtering/status",
    "/filtering/refresh",
    "/rewrite/list",
    "/querylog",
  ];

  it("answers every path the API module calls", () => {
    for (const path of PATHS) {
      expect(demo(path)).toBeDefined();
    }
  });

  it("does not leak into another service", () => {
    expect(getDemoResponse("radarr", "/status")).toBeUndefined();
  });
});

describe("status", () => {
  it("reports protection enabled with no timer", () => {
    const status = demo("/status") as AdguardServerStatus;
    expect(status.protection_enabled).toBe(true);
    expect(status.protection_disabled_duration).toBe(0);
    expect(typeof status.version).toBe("string");
  });
});

describe("stats", () => {
  it("is internally consistent", () => {
    const s = demo("/stats") as AdguardStats;
    expect(s.num_blocked_filtering).toBeLessThan(s.num_dns_queries);
    expect(s.dns_queries).toHaveLength(24);
    expect(s.blocked_filtering).toHaveLength(24);
    // Every hourly bucket's blocked count fits inside that hour's total.
    for (let i = 0; i < s.dns_queries.length; i++) {
      expect(s.blocked_filtering[i]!).toBeLessThanOrEqual(s.dns_queries[i]!);
    }
  });

  it("has top lists the flattener can read", () => {
    const s = demo("/stats") as AdguardStats;
    const domains = toTopListRows(s.top_queried_domains);
    const blocked = toTopListRows(s.top_blocked_domains);
    const clients = toTopListRows(s.top_clients);
    expect(domains.length).toBeGreaterThan(0);
    expect(blocked.length).toBeGreaterThan(0);
    expect(clients.length).toBeGreaterThan(0);
    expect(domains).not.toEqual(blocked);
  });

  it("has something to draw", () => {
    const s = demo("/stats") as AdguardStats;
    expect(Math.max(...s.dns_queries)).toBeGreaterThan(0);
  });
});

describe("query log", () => {
  const page = (query = "") => demo(`/querylog${query}`) as AdguardQueryLogResponse;

  it("returns a full first page with an 'oldest' cursor", () => {
    const first = page("?limit=100");
    expect(first.data).toHaveLength(100);
    expect(first.oldest).toBeDefined();
  });

  // The three getNextPageParam stop conditions all need to be reachable here,
  // or demo mode would page forever.
  it("terminates with a short final page and no cursor", () => {
    const first = page("?limit=100");
    const second = page(`?limit=100&older_than=${encodeURIComponent(first.oldest!)}`);
    expect(second.data.length).toBeLessThan(100);
    expect(second.data.length).toBeGreaterThan(0);
    expect(second.oldest).toBeUndefined();
  });

  it("does not repeat rows across pages", () => {
    const first = page("?limit=100");
    const second = page(`?limit=100&older_than=${encodeURIComponent(first.oldest!)}`);
    const times = new Set([...first.data, ...second.data].map((q) => q.time));
    expect(times.size).toBe(first.data.length + second.data.length);
  });

  it("filters by search", () => {
    const filtered = page("?limit=100&search=ads.example-network.com");
    expect(filtered.data.length).toBeGreaterThan(0);
    expect(filtered.data.every((q) => q.question.name.includes("ads.example-network.com"))).toBe(
      true,
    );
  });

  // A typo'd reason would silently render every row as the neutral "other"
  // colour forever, which is exactly the kind of thing nobody notices.
  it("uses only reasons the classifier recognises", () => {
    for (const q of page("?limit=100").data) {
      expect(classifyQueryReason(q.reason)).not.toBe("other");
    }
  });

  it("covers blocked, rewritten and allowed verdicts", () => {
    const verdicts = new Set(page("?limit=100").data.map((q) => classifyQueryReason(q.reason)));
    expect(verdicts).toContain("blocked");
    expect(verdicts).toContain("rewritten");
    expect(verdicts).toContain("allowed");
  });

  it("is ordered newest first", () => {
    const rows = page("?limit=100").data;
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i]!.time).getTime()).toBeLessThanOrEqual(
        new Date(rows[i - 1]!.time).getTime(),
      );
    }
  });
});

describe("filtering", () => {
  it("carries at least one enabled filter list", () => {
    const status = demo("/filtering/status") as AdguardFilterStatus;
    expect(status.filters.some((f) => f.enabled)).toBe(true);
    expect(status.filters.every((f) => typeof f.rules_count === "number")).toBe(true);
  });
});

describe("rewrites", () => {
  it("includes a wildcard record", () => {
    const rewrites = demo("/rewrite/list") as AdguardRewriteEntry[];
    expect(rewrites.length).toBeGreaterThan(0);
    expect(rewrites.some((r) => r.domain.startsWith("*."))).toBe(true);
  });
});
