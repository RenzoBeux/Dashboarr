import {
  addRuleLine,
  allowRuleFor,
  applyDomainRule,
  blockRuleFor,
  domainRuleState,
  normalizeRuleDomain,
  parseAdguardRule,
  removeRuleLine,
  summarizeRules,
} from "@/lib/adguard-rules";

describe("parseAdguardRule", () => {
  it("recognises the two domain-anchor shapes the app writes", () => {
    expect(parseAdguardRule("||ads.example.com^")).toEqual({
      text: "||ads.example.com^",
      kind: "block",
      domain: "ads.example.com",
    });
    expect(parseAdguardRule("@@||cdn.example.com^")).toEqual({
      text: "@@||cdn.example.com^",
      kind: "allow",
      domain: "cdn.example.com",
    });
  });

  it("keeps $modifiers and lower-cases the domain", () => {
    expect(parseAdguardRule("@@||Example.COM^$important")).toEqual({
      text: "@@||Example.COM^$important",
      kind: "allow",
      domain: "example.com",
      modifiers: "$important",
    });
  });

  it("treats hosts-file lines as block rules", () => {
    expect(parseAdguardRule("0.0.0.0 tracker.example.net").domain).toBe("tracker.example.net");
    expect(parseAdguardRule("127.0.0.1 tracker.example.net # legacy").kind).toBe("block");
    expect(parseAdguardRule("::1 tracker.example.net").kind).toBe("block");
  });

  it("classifies comments and leaves everything else untouched as other", () => {
    expect(parseAdguardRule("! my rules").kind).toBe("comment");
    expect(parseAdguardRule("# hosts style comment").kind).toBe("comment");
    expect(parseAdguardRule("").kind).toBe("other");
    // Path, wildcard and regex rules are not domain rules — never rewritten.
    expect(parseAdguardRule("||example.com/ads^").kind).toBe("other");
    expect(parseAdguardRule("||*.example.com^").kind).toBe("other");
    expect(parseAdguardRule("/^ad[0-9]+\\./").kind).toBe("other");
    expect(parseAdguardRule("||example.com").kind).toBe("other");
  });
});

describe("normalizeRuleDomain", () => {
  it("accepts a bare hostname and a trailing-dot FQDN", () => {
    expect(normalizeRuleDomain("Ads.Example.com")).toBe("ads.example.com");
    expect(normalizeRuleDomain("ads.example.com.")).toBe("ads.example.com");
    expect(normalizeRuleDomain("  nas  ")).toBe("nas");
    expect(normalizeRuleDomain("_dmarc.example.com")).toBe("_dmarc.example.com");
  });

  it("strips a pasted URL down to its host", () => {
    expect(normalizeRuleDomain("https://user@ads.example.com:8443/x?y#z")).toBe("ads.example.com");
    expect(normalizeRuleDomain("*.example.com")).toBe("example.com");
  });

  it("rejects things that are not a hostname", () => {
    expect(normalizeRuleDomain("")).toBeNull();
    expect(normalizeRuleDomain("not a host")).toBeNull();
    expect(normalizeRuleDomain("-bad.example.com")).toBeNull();
    expect(normalizeRuleDomain("||example.com^")).toBeNull();
  });
});

describe("domainRuleState", () => {
  const rules = [
    "! comment",
    "||ads.example.com^",
    "@@||ads.example.com^$important",
    "0.0.0.0 ads.example.com",
    "||sub.ads.example.com^",
    "@@||other.example.com^",
  ];

  it("returns only the rules for the exact domain", () => {
    expect(domainRuleState(rules, "ads.example.com")).toEqual({
      allow: ["@@||ads.example.com^$important"],
      block: ["||ads.example.com^", "0.0.0.0 ads.example.com"],
    });
  });

  it("never attributes a parent-domain rule to a subdomain", () => {
    expect(domainRuleState(rules, "deep.ads.example.com")).toEqual({ allow: [], block: [] });
  });

  it("is empty for an invalid domain or missing list", () => {
    expect(domainRuleState(rules, "")).toEqual({ allow: [], block: [] });
    expect(domainRuleState(undefined, "ads.example.com")).toEqual({ allow: [], block: [] });
  });
});

describe("applyDomainRule", () => {
  it("appends an allow rule and leaves unrelated lines in order", () => {
    const edit = applyDomainRule(["! c", "||x.com^"], "ads.example.com", "allow");
    expect(edit).toEqual({
      rules: ["! c", "||x.com^", "@@||ads.example.com^"],
      changed: true,
      added: "@@||ads.example.com^",
      removed: [],
    });
  });

  it("replaces an existing block with an allow instead of adding a conflicting pair", () => {
    const edit = applyDomainRule(
      ["||ads.example.com^", "0.0.0.0 ads.example.com", "||x.com^"],
      "ads.example.com",
      "allow",
    );
    expect(edit.rules).toEqual(["||x.com^", "@@||ads.example.com^"]);
    expect(edit.removed).toEqual(["||ads.example.com^", "0.0.0.0 ads.example.com"]);
    expect(edit.changed).toBe(true);
  });

  it("is a no-op when the list already says exactly this", () => {
    const edit = applyDomainRule(["@@||ads.example.com^"], "ads.example.com", "allow");
    expect(edit.changed).toBe(false);
    expect(edit.rules).toEqual(["@@||ads.example.com^"]);
  });

  it("still rewrites when the only existing rule carries a modifier", () => {
    const edit = applyDomainRule(["@@||ads.example.com^$important"], "ads.example.com", "allow");
    expect(edit.changed).toBe(true);
    expect(edit.rules).toEqual(["@@||ads.example.com^"]);
  });

  it("clear removes every rule for the domain and reports when there was none", () => {
    expect(applyDomainRule(["||a.com^", "@@||a.com^"], "a.com", "clear")).toEqual({
      rules: [],
      changed: true,
      removed: ["||a.com^", "@@||a.com^"],
    });
    expect(applyDomainRule(["||b.com^"], "a.com", "clear").changed).toBe(false);
  });

  it("normalises the domain it is given", () => {
    expect(applyDomainRule([], "https://Ads.Example.com/path", "block").added).toBe(
      blockRuleFor("ads.example.com"),
    );
    expect(allowRuleFor("a.com")).toBe("@@||a.com^");
  });

  it("throws on an invalid domain rather than writing garbage", () => {
    expect(() => applyDomainRule([], "not a host", "block")).toThrow("valid domain");
  });

  it("tolerates a missing list", () => {
    expect(applyDomainRule(undefined, "a.com", "block").rules).toEqual(["||a.com^"]);
  });
});

describe("removeRuleLine / addRuleLine", () => {
  it("removes exactly the given line", () => {
    expect(removeRuleLine(["a", "b", "a"], "a")).toEqual({ rules: ["b"], changed: true });
    expect(removeRuleLine(["a"], "z")).toEqual({ rules: ["a"], changed: false });
  });

  it("appends a trimmed raw line once", () => {
    expect(addRuleLine(["a"], "  b  ")).toEqual({ rules: ["a", "b"], changed: true });
    expect(addRuleLine(["a"], "a")).toEqual({ rules: ["a"], changed: false });
    expect(() => addRuleLine([], "   ")).toThrow("Enter a rule");
  });
});

describe("summarizeRules", () => {
  it("counts allow/block/other and ignores comments and blanks", () => {
    expect(
      summarizeRules(["! c", "", "@@||a.com^", "||b.com^", "0.0.0.0 c.com", "/regex/"]),
    ).toEqual({ allow: 1, block: 2, other: 1, total: 4 });
    expect(summarizeRules(undefined)).toEqual({ allow: 0, block: 0, other: 0, total: 0 });
  });
});
