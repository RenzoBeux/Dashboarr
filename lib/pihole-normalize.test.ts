import {
  PIHOLE_BLOCKED_STATUSES,
  SEATS_EXCEEDED_MESSAGE,
  classifyQueryStatus,
  encodeCnameValue,
  formatCnameRecord,
  isBlockedStatus,
  isSeatsExceededError,
  parseCnameRecord,
  parseGravityOutput,
  piholeErrorMessage,
  queryStatusLabel,
  readCnameRecords,
  readFtlError,
  stripAnsi,
  toHistorySeries,
  validateCnameInput,
} from "@/lib/pihole-normalize";

const ESC = String.fromCharCode(27);

/**
 * Structural stand-in for lib/http-client's HttpError.
 *
 * Importing the real class would pull http-client -> config-store ->
 * AsyncStorage into this suite and require React Native shims, which is exactly
 * what keeping lib/pihole-normalize.ts import-free avoids. The helpers
 * duck-type `{ status, body }`, so this is a faithful stand-in.
 */
class FakeHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

describe("readFtlError / piholeErrorMessage", () => {
  it("reads FTL's nested error envelope", () => {
    expect(
      readFtlError({
        error: { key: "bad_request", message: "Invalid request body", hint: null },
      }),
    ).toEqual({ key: "bad_request", message: "Invalid request body", hint: null });
  });

  it("returns null for a non-envelope body", () => {
    expect(readFtlError(null)).toBeNull();
    expect(readFtlError("nope")).toBeNull();
    expect(readFtlError({ message: "top level" })).toBeNull();
    expect(readFtlError({ error: {} })).toBeNull();
  });

  // This is the whole reason the module exists: getHttpErrorMessage only reads
  // a TOP-LEVEL message, so without this every Pi-hole 4xx renders as
  // "HTTP 401 Unauthorized — http://...".
  it("surfaces the nested message for an HttpError", () => {
    const err = new FakeHttpError(401, {
      error: { key: "unauthorized", message: "Invalid password", hint: null },
    });
    expect(piholeErrorMessage(err)).toBe("Invalid password");
  });

  it("translates api_seats_exceeded instead of reporting a bad password", () => {
    const err = new FakeHttpError(401, {
      error: { key: "api_seats_exceeded", message: "Unauthorized", hint: null },
    });
    expect(piholeErrorMessage(err)).toBe(SEATS_EXCEEDED_MESSAGE);
    expect(isSeatsExceededError(err)).toBe(true);
  });

  it("does not claim seat exhaustion for an ordinary 401", () => {
    const err = new FakeHttpError(401, {
      error: { key: "unauthorized", message: "Unauthorized", hint: null },
    });
    expect(isSeatsExceededError(err)).toBe(false);
  });

  it("returns undefined for a non-HttpError", () => {
    expect(piholeErrorMessage(new Error("boom"))).toBeUndefined();
  });
});

describe("parseCnameRecord", () => {
  it("parses two- and three-field records", () => {
    expect(parseCnameRecord("nas.lan,server.lan")).toEqual({
      raw: "nas.lan,server.lan",
      cname: "nas.lan",
      target: "server.lan",
      ttl: null,
    });
    expect(parseCnameRecord("hourly.example.com,example.com,3600")).toEqual({
      raw: "hourly.example.com,example.com,3600",
      cname: "hourly.example.com",
      target: "example.com",
      ttl: 3600,
    });
  });

  it("keeps `raw` byte-for-byte while trimming the parsed fields", () => {
    const record = parseCnameRecord("a.com , b.com");
    expect(record?.raw).toBe("a.com , b.com");
    expect(record?.cname).toBe("a.com");
    expect(record?.target).toBe("b.com");
  });

  it("rejects malformed records", () => {
    expect(parseCnameRecord("")).toBeNull();
    expect(parseCnameRecord("only-one-field")).toBeNull();
    expect(parseCnameRecord("a,b,c,d")).toBeNull();
    expect(parseCnameRecord("a.com,")).toBeNull();
    expect(parseCnameRecord("a.com,b.com,notanumber")).toBeNull();
    expect(parseCnameRecord("a.com,b.com,-5")).toBeNull();
  });
});

describe("formatCnameRecord", () => {
  it("omits the TTL segment when there is none, and lowercases", () => {
    expect(formatCnameRecord({ cname: "NAS.lan", target: "Server.lan" })).toBe(
      "nas.lan,server.lan",
    );
    expect(
      formatCnameRecord({ cname: "a.com", target: "b.com", ttl: 300 }),
    ).toBe("a.com,b.com,300");
  });
});

describe("encodeCnameValue", () => {
  it("encodes the comma and leaves a wildcard readable", () => {
    expect(encodeCnameValue("*.example.com,default.example.com")).toBe(
      "*.example.com%2Cdefault.example.com",
    );
  });

  it("encodes each field separator in a three-part record", () => {
    expect(encodeCnameValue("a.com,b.com,3600")).toBe("a.com%2Cb.com%2C3600");
  });

  it("preserves the spacing of a raw record so DELETE still matches", () => {
    expect(encodeCnameValue("a.com , b.com")).toBe("a.com%20%2C%20b.com");
  });
});

describe("readCnameRecords", () => {
  it("digs the list out of FTL's nested config subtree", () => {
    expect(
      readCnameRecords({
        config: { dns: { cnameRecords: ["a.com,b.com", "c.com,d.com,60"] } },
        took: 0.001,
      }),
    ).toHaveLength(2);
  });

  it("falls back to a bare array", () => {
    expect(readCnameRecords(["a.com,b.com"])).toHaveLength(1);
  });

  it("drops unparseable entries rather than throwing", () => {
    expect(
      readCnameRecords({ config: { dns: { cnameRecords: ["a.com,b.com", "junk"] } } }),
    ).toHaveLength(1);
  });

  it("returns an empty array for junk", () => {
    expect(readCnameRecords(undefined)).toEqual([]);
    expect(readCnameRecords({})).toEqual([]);
    expect(readCnameRecords({ config: { dns: {} } })).toEqual([]);
  });
});

describe("validateCnameInput", () => {
  it("accepts a valid record", () => {
    expect(validateCnameInput("nas.lan", "server.lan", "")).toEqual({});
    expect(validateCnameInput("*.example.com", "example.com", "3600")).toEqual({});
  });

  // A comma would corrupt the record's own encoding: FTL splits on commas.
  it("rejects commas and whitespace in either field", () => {
    expect(validateCnameInput("a,b.com", "c.com", "").cname).toBeDefined();
    expect(validateCnameInput("a.com", "c d.com", "").target).toBeDefined();
  });

  it("rejects a record pointing at itself", () => {
    expect(validateCnameInput("a.com", "A.com", "").target).toBe(
      "A record can't point at itself",
    );
  });

  it("bounds the TTL", () => {
    expect(validateCnameInput("a.com", "b.com", "0")).toEqual({});
    expect(validateCnameInput("a.com", "b.com", "604800")).toEqual({});
    expect(validateCnameInput("a.com", "b.com", "604801").ttl).toBeDefined();
    expect(validateCnameInput("a.com", "b.com", "1.5").ttl).toBeDefined();
    expect(validateCnameInput("a.com", "b.com", "-1").ttl).toBeDefined();
  });

  it("rejects a duplicate name", () => {
    expect(
      validateCnameInput("a.com", "c.com", "", ["a.com,b.com"]).cname,
    ).toBe("A record for this name already exists");
  });

  it("rejects malformed hostnames", () => {
    expect(validateCnameInput("-bad.com", "b.com", "").cname).toBeDefined();
    expect(validateCnameInput("a.com", "b.com.", "").target).toBeDefined();
    expect(validateCnameInput("", "b.com", "").cname).toBeDefined();
  });

  // Wildcards are a first-class Pi-hole feature and appear in FTL's own API
  // spec example, but only on the left-hand side.
  it("allows a wildcard cname but not a wildcard target", () => {
    expect(validateCnameInput("*.example.com", "example.com", "")).toEqual({});
    expect(validateCnameInput("a.com", "*.example.com", "").target).toBeDefined();
    expect(validateCnameInput("*", "example.com", "").cname).toBeDefined();
    expect(validateCnameInput("*.-bad.com", "example.com", "").cname).toBeDefined();
  });
});

describe("query status classification", () => {
  // Every status string FTL emits (src/datastructure.c get_query_status_str).
  const ALL_STATUSES = [
    "UNKNOWN",
    "GRAVITY",
    "FORWARDED",
    "CACHE",
    "REGEX",
    "DENYLIST",
    "EXTERNAL_BLOCKED_IP",
    "EXTERNAL_BLOCKED_NULL",
    "EXTERNAL_BLOCKED_NXRA",
    "GRAVITY_CNAME",
    "REGEX_CNAME",
    "DENYLIST_CNAME",
    "RETRIED",
    "RETRIED_DNSSEC",
    "IN_PROGRESS",
    "DBBUSY",
    "SPECIAL_DOMAIN",
    "CACHE_STALE",
    "EXTERNAL_BLOCKED_EDE15",
  ];

  it("covers all 19 FTL statuses", () => {
    expect(ALL_STATUSES).toHaveLength(19);
    for (const s of ALL_STATUSES) {
      expect(["blocked", "cached", "forwarded", "other"]).toContain(
        classifyQueryStatus(s),
      );
    }
  });

  it("classifies every blocked status as blocked", () => {
    for (const s of PIHOLE_BLOCKED_STATUSES) {
      expect(isBlockedStatus(s)).toBe(true);
      expect(classifyQueryStatus(s)).toBe("blocked");
    }
    expect(PIHOLE_BLOCKED_STATUSES.size).toBe(11);
  });

  // CACHE_STALE is a cache hit, not a block. Getting this wrong inflates the
  // blocked count on every screen that recomputes it client-side.
  it("does not treat CACHE_STALE as blocked", () => {
    expect(isBlockedStatus("CACHE_STALE")).toBe(false);
    expect(classifyQueryStatus("CACHE_STALE")).toBe("cached");
  });

  it("treats all three CNAME variants as blocked", () => {
    for (const s of ["GRAVITY_CNAME", "REGEX_CNAME", "DENYLIST_CNAME"]) {
      expect(isBlockedStatus(s)).toBe(true);
    }
  });

  // Pi-hole adds status codes across point releases. A future block reason must
  // never render as if the query sailed through.
  it("falls through to 'other', never to an allowed verdict", () => {
    expect(classifyQueryStatus("SOME_FUTURE_BLOCK_REASON")).toBe("other");
    expect(classifyQueryStatus(null)).toBe("other");
    expect(classifyQueryStatus(undefined)).toBe("other");
    expect(isBlockedStatus("SOME_FUTURE_BLOCK_REASON")).toBe(false);
  });

  it("humanizes known labels and passes unknown ones through", () => {
    expect(queryStatusLabel("GRAVITY")).toBe("Blocklist");
    expect(queryStatusLabel("CACHE_STALE")).toBe("Cached (stale)");
    expect(queryStatusLabel("WEIRD_NEW_ONE")).toBe("WEIRD_NEW_ONE");
    expect(queryStatusLabel(null)).toBe("Unknown");
  });
});

describe("toHistorySeries", () => {
  it("converts unix seconds to milliseconds and preserves order", () => {
    const series = toHistorySeries({
      history: [
        { timestamp: 1511819900.539157, total: 2134, cached: 525, blocked: 413, forwarded: 1196 },
        { timestamp: 1511820500.583821, total: 2014, cached: 52, blocked: 43, forwarded: 1910 },
      ],
    });
    expect(series).toHaveLength(2);
    expect(series[0]!.timestampMs).toBe(1511819900539);
    expect(series[1]!.timestampMs).toBeGreaterThan(series[0]!.timestampMs);
  });

  // `total` is the SUM of the other three (plus uncategorized), NOT a fourth
  // independent series. Stacking all four double-counts every bucket, so chart
  // code must stack blocked against (total - blocked).
  it("keeps `total` as the sum, not a fourth series", () => {
    const [point] = toHistorySeries({
      history: [{ timestamp: 1, total: 100, cached: 20, blocked: 30, forwarded: 50 }],
    });
    expect(point!.cached + point!.blocked + point!.forwarded).toBe(point!.total);
    expect(point!.total - point!.blocked).toBe(70);
  });

  it("drops non-finite rows and defaults missing counters", () => {
    const series = toHistorySeries({
      history: [
        { timestamp: "nope", total: 1, cached: 1, blocked: 0, forwarded: 0 },
        { timestamp: 5 },
      ],
    });
    expect(series).toHaveLength(1);
    expect(series[0]).toEqual({
      timestampMs: 5000,
      total: 0,
      cached: 0,
      blocked: 0,
      forwarded: 0,
    });
  });

  it("returns an empty array for junk", () => {
    expect(toHistorySeries(undefined)).toEqual([]);
    expect(toHistorySeries({ history: "nope" })).toEqual([]);
  });
});

describe("stripAnsi / parseGravityOutput", () => {
  const SUCCESS = [
    "  [i] Neutrino emissions detected...",
    "  [✓] Pulling blocklist source list into range",
    "  [i] Target: https://example.com/hosts",
    "  [✓] Status: Retrieval successful",
    "  [✓] Swapping databases",
    "  [i] Number of gravity domains: 219,727 (215,440 unique domains)",
    "  [✓] Cleaning up stray matter",
  ].join("\n");

  it("strips ANSI without eating gravity's own [i] / [✓] markers", () => {
    const colored = `${ESC}[0;32m[✓]${ESC}[0m Pulling blocklist\n  [i] Neutrino emissions detected...`;
    const stripped = stripAnsi(colored);
    expect(stripped).toContain("[✓] Pulling blocklist");
    expect(stripped).toContain("[i] Neutrino emissions detected...");
    expect(stripped).not.toContain(ESC);
  });

  it("reports success and parses the thousands-separated domain count", () => {
    const result = parseGravityOutput(SUCCESS);
    expect(result.status).toBe("success");
    expect(result.domainCount).toBe(219727);
    expect(result.failures).toEqual([]);
  });

  // A [✗] almost always means one blocklist was unreachable. Gravity still
  // swapped the database, so calling that a failure trains people to ignore
  // a real one.
  it("reports a failed blocklist as partial, not failed", () => {
    const result = parseGravityOutput(
      SUCCESS.replace(
        "  [✓] Status: Retrieval successful",
        "  [✗] Status: Connection Refused",
      ),
    );
    expect(result.status).toBe("partial");
    expect(result.failures).toEqual(["Status: Connection Refused"]);
    expect(result.domainCount).toBe(219727);
  });

  it("reports failure only when nothing completed", () => {
    expect(parseGravityOutput("").status).toBe("failed");
    expect(parseGravityOutput("<html><body>nope</body></html>").status).toBe("failed");
    expect(parseGravityOutput("  [✗] Unable to update gravity").status).toBe("failed");
  });

  it("parses a colored response the same as a plain one", () => {
    const colored = SUCCESS.split("\n")
      .map((l) => `${ESC}[0;32m${l}${ESC}[0m`)
      .join("\n");
    expect(parseGravityOutput(colored).status).toBe("success");
    expect(parseGravityOutput(colored).domainCount).toBe(219727);
  });

  it("accepts a non-string body without throwing", () => {
    expect(parseGravityOutput(undefined as unknown as string).status).toBe("failed");
  });
});
