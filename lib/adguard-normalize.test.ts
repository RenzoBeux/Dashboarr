import {
  classifyQueryReason,
  isBlockedReason,
  queryReasonLabel,
  toTopListRows,
  validateRewriteInput,
} from "@/lib/adguard-normalize";

describe("toTopListRows", () => {
  it("flattens single-key entries into title/count rows", () => {
    expect(toTopListRows([{ "example.com": 42 }, { "ads.example.net": 7 }])).toEqual([
      { title: "example.com", count: 42 },
      { title: "ads.example.net", count: 7 },
    ]);
  });

  it("skips malformed entries instead of guessing", () => {
    expect(
      toTopListRows([
        {},
        { a: 1, b: 2 },
        { "good.com": 3 },
        null as unknown as Record<string, number>,
      ]),
    ).toEqual([{ title: "good.com", count: 3 }]);
  });

  it("returns an empty array for non-array input", () => {
    expect(toTopListRows(undefined)).toEqual([]);
  });
});

describe("classifyQueryReason / isBlockedReason", () => {
  it("buckets every documented reason correctly", () => {
    expect(classifyQueryReason("FilteredBlackList")).toBe("blocked");
    expect(classifyQueryReason("FilteredSafeBrowsing")).toBe("blocked");
    expect(classifyQueryReason("FilteredParental")).toBe("blocked");
    expect(classifyQueryReason("FilteredInvalid")).toBe("blocked");
    expect(classifyQueryReason("FilteredSafeSearch")).toBe("blocked");
    expect(classifyQueryReason("FilteredBlockedService")).toBe("blocked");
    expect(classifyQueryReason("Rewrite")).toBe("rewritten");
    expect(classifyQueryReason("RewriteEtcHosts")).toBe("rewritten");
    expect(classifyQueryReason("RewriteRule")).toBe("rewritten");
    expect(classifyQueryReason("NotFilteredNotFound")).toBe("allowed");
    expect(classifyQueryReason("NotFilteredWhiteList")).toBe("allowed");
    expect(classifyQueryReason("NotFilteredError")).toBe("allowed");
  });

  it("never buckets an unrecognized reason as allowed", () => {
    expect(classifyQueryReason("SomeFutureReason")).toBe("other");
    expect(classifyQueryReason(null)).toBe("other");
    expect(classifyQueryReason(undefined)).toBe("other");
  });

  it("agrees with classifyQueryReason on which reasons are blocked", () => {
    expect(isBlockedReason("FilteredBlackList")).toBe(true);
    expect(isBlockedReason("NotFilteredWhiteList")).toBe(false);
    expect(isBlockedReason(null)).toBe(false);
  });
});

describe("queryReasonLabel", () => {
  it("has a friendly label for every documented reason", () => {
    expect(queryReasonLabel("FilteredBlackList")).toBe("Blocklist");
    expect(queryReasonLabel("Rewrite")).toBe("Rewritten");
  });

  it("falls back to the raw string for an unrecognized reason", () => {
    expect(queryReasonLabel("SomeFutureReason")).toBe("SomeFutureReason");
  });

  it("falls back to 'Unknown' for a missing reason", () => {
    expect(queryReasonLabel(null)).toBe("Unknown");
  });
});

describe("validateRewriteInput", () => {
  it("accepts a hostname domain with an IPv4 answer", () => {
    expect(validateRewriteInput("example.com", "192.168.1.1")).toEqual({});
  });

  it("accepts a wildcard domain with a hostname (CNAME-style) answer", () => {
    expect(validateRewriteInput("*.example.com", "target.example.com")).toEqual({});
  });

  it("accepts an IPv6 answer", () => {
    expect(validateRewriteInput("example.com", "::1")).toEqual({});
  });

  it("rejects empty fields", () => {
    expect(validateRewriteInput("", "")).toEqual({
      domain: "Enter a hostname",
      answer: "Enter an IP address or hostname",
    });
  });

  it("rejects a malformed answer", () => {
    expect(validateRewriteInput("example.com", "not_a_valid_answer!")).toEqual({
      answer: "Enter a valid IP address or hostname",
    });
  });

  it("rejects spaces in either field", () => {
    expect(validateRewriteInput("exa mple.com", "1.2.3.4").domain).toBeDefined();
    expect(validateRewriteInput("example.com", "1.2.3 .4").answer).toBeDefined();
  });

  it("flags an exact duplicate of an existing record", () => {
    const existing = [{ domain: "example.com", answer: "1.2.3.4" }];
    expect(validateRewriteInput("example.com", "1.2.3.4", existing).domain).toBe(
      "This exact record already exists",
    );
  });

  it("allows a second answer for the same domain (round-robin)", () => {
    const existing = [{ domain: "example.com", answer: "1.2.3.4" }];
    expect(validateRewriteInput("example.com", "5.6.7.8", existing)).toEqual({});
  });
});
