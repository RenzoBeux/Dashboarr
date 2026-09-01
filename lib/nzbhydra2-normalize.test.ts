import {
  formatHydraCountdown,
  hydraAttr,
  hydraCapsVersion,
  hydraBytes,
  hydraDownloadStatusMeta,
  hydraStateMeta,
  hydraVipInfo,
  isStatsApiGated,
  parseHydraTimestamp,
  readHydraJsonError,
  readHydraXmlError,
  statsWindow,
} from "@/lib/nzbhydra2-normalize";
import type { Nzbhydra2SearchItem } from "@/lib/types";

// 2018-12-11T18:11:57.589Z — the timestamp from NZBHydra2's own wiki example,
// so the seconds-vs-milliseconds assertion is anchored to a real payload.
const EPOCH_SECONDS = 1544551917.589;
const EPOCH_MS = 1544551917589;

describe("parseHydraTimestamp", () => {
  // The same field comes back in all three shapes depending on version and
  // endpoint — upstream's own UI parses all three, so we must too.
  it.each([
    ["a raw number in epoch seconds", EPOCH_SECONDS, EPOCH_MS],
    ["a numeric string", "1544551917.589", EPOCH_MS],
    ["an integer-seconds string", "1544551917", 1544551917000],
    ["an ISO-8601 string", "2018-12-11T18:11:57.589Z", EPOCH_MS],
  ])("parses %s", (_label, input, expected) => {
    expect(parseHydraTimestamp(input)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["unparseable text", "not a date"],
    ["a non-scalar", { time: 1 }],
  ])("returns null for %s", (_label, input) => {
    expect(parseHydraTimestamp(input)).toBeNull();
  });

  it("passes a value that is already milliseconds through unscaled", () => {
    // 1e12 seconds is the year 33658, so anything at or above it is already ms.
    // Guards against a future upstream switch shifting every date by 1000x.
    expect(parseHydraTimestamp(EPOCH_MS)).toBe(EPOCH_MS);
  });
});

describe("formatHydraCountdown", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("counts forward for a future reset time", () => {
    // disabledUntil / apiResetTime / downloadResetTime are always future-dated,
    // and formatTimeAgo clamps those to 'just now'.
    expect(formatHydraCountdown((now + 900_000) / 1000, now)).toBe("in 15m");
  });

  it("counts backward for a past timestamp", () => {
    // Anchored to the real clock, not `now`: the past branch delegates to
    // formatTimeAgo, which reads Date.now() itself.
    const realNow = Date.now();
    expect(formatHydraCountdown((realNow - 7_200_000) / 1000, realNow)).toBe("2h ago");
  });

  it("returns null when the field is absent", () => {
    expect(formatHydraCountdown(null, now)).toBeNull();
  });
});

describe("statsWindow", () => {
  it("sends ISO-8601, not epoch — StatsRequest binds Instants", () => {
    const now = Date.UTC(2026, 0, 31, 0, 0, 0);
    expect(statsWindow(30, now)).toEqual({
      after: "2026-01-01T00:00:00.000Z",
      before: "2026-01-31T00:00:00.000Z",
    });
  });
});

describe("hydraStateMeta", () => {
  it.each([
    ["ENABLED", "Enabled", "success"],
    ["DISABLED_SYSTEM_TEMPORARY", "Temporarily disabled", "warning"],
    ["DISABLED_SYSTEM", "Disabled by system", "error"],
    ["DISABLED_USER", "Disabled by user", "default"],
  ])("maps %s", (state, label, variant) => {
    const meta = hydraStateMeta(state);
    expect(meta.label).toBe(label);
    expect(meta.badgeVariant).toBe(variant);
  });

  it("falls back to the raw value for an unknown state", () => {
    expect(hydraStateMeta("SOMETHING_NEW").label).toBe("SOMETHING_NEW");
  });
});

describe("hydraVipInfo", () => {
  const now = Date.UTC(2026, 5, 1);

  it("returns null when the indexer has no VIP", () => {
    expect(hydraVipInfo(null, now)).toBeNull();
  });

  it("handles the literal 'Lifetime'", () => {
    expect(hydraVipInfo("Lifetime", now)).toEqual({
      label: "VIP · lifetime",
      expiring: false,
    });
  });

  it("flags an expiry inside the 7-day warning window", () => {
    expect(hydraVipInfo("2026-06-05", now)?.expiring).toBe(true);
  });

  it("does not flag an expiry beyond the window", () => {
    expect(hydraVipInfo("2026-09-01", now)?.expiring).toBe(false);
  });

  it("flags an already-expired date", () => {
    const info = hydraVipInfo("2026-05-01", now);
    expect(info).toEqual({ label: "VIP expired 2026-05-01", expiring: true });
  });
});

describe("hydraDownloadStatusMeta", () => {
  it("maps a terminal success", () => {
    expect(hydraDownloadStatusMeta("CONTENT_DOWNLOAD_SUCCESSFUL")).toMatchObject({
      label: "Download successful",
      tone: "success",
    });
  });

  it("maps a client rejection to the danger tone", () => {
    expect(hydraDownloadStatusMeta("NZB_ADD_REJECTED").tone).toBe("danger");
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(hydraDownloadStatusMeta("BRAND_NEW")).toMatchObject({
      label: "BRAND_NEW",
      tone: "muted",
    });
  });
});

describe("hydraAttr", () => {
  // Upstream declares @JsonProperty("@attributes"), but the GraalVM native
  // build that both mainstream Docker images ship loses the rename and emits
  // the bare `attributes` (measured against 8.9.0). Reading only one spelling
  // fails SILENTLY: every row falls back to "NZBHydra2" with a zero size.
  const item: Nzbhydra2SearchItem = {
    title: "Some.Release-GRP",
    attr: [
      { "@attributes": { name: "size", value: "1610612736" } },
      { "@attributes": { name: "hydraIndexerName", value: "NZBGeek" } },
      { "@attributes": { name: "hydraIndexerScore", value: 25 } },
    ],
  };

  // The exact shape a containerised NZBHydra2 answers with.
  const nativeBuildItem: Nzbhydra2SearchItem = {
    title: "Some.Release-GRP",
    attr: [
      { attributes: { name: "size", value: "1610612736" } },
      { attributes: { name: "hydraIndexerName", value: "NZBGeek" } },
    ],
  };

  it("reads the bare `attributes` spelling a native build emits", () => {
    expect(hydraAttr(nativeBuildItem, "hydraIndexerName")).toBe("NZBGeek");
    expect(hydraAttr(nativeBuildItem, "size")).toBe("1610612736");
  });

  it("reads a string attribute out of the @attributes holder", () => {
    expect(hydraAttr(item, "hydraIndexerName")).toBe("NZBGeek");
  });

  it("stringifies a numeric attribute value", () => {
    expect(hydraAttr(item, "hydraIndexerScore")).toBe("25");
  });

  it("returns undefined for a missing attribute", () => {
    expect(hydraAttr(item, "seeders")).toBeUndefined();
  });

  it("returns undefined when the item carries no attr array at all", () => {
    expect(hydraAttr({ title: "x" }, "hydraIndexerName")).toBeUndefined();
  });

  it("ignores a holder that is neither spelling", () => {
    const wrong = {
      attr: [{ attrs: { name: "hydraIndexerName", value: "NZBGeek" } }],
    } as unknown as Nzbhydra2SearchItem;
    expect(hydraAttr(wrong, "hydraIndexerName")).toBeUndefined();
  });
});

describe("hydraCapsVersion", () => {
  it.each([
    ["the JVM build's @attributes", { server: { "@attributes": { appversion: "8.9.0" } } }],
    ["the native build's attributes", { server: { attributes: { appversion: "8.9.0" } } }],
  ])("reads the version from %s", (_label, caps) => {
    expect(hydraCapsVersion(caps)).toBe("8.9.0");
  });

  it("returns undefined when caps has not loaded", () => {
    expect(hydraCapsVersion(undefined)).toBeUndefined();
  });
});

describe("hydraBytes", () => {
  it.each([
    ["a numeric string", "1610612736", 1610612736],
    ["a number", 512, 512],
    ["undefined", undefined, 0],
    ["an empty string", "", 0],
    ["a non-numeric string", "big", 0],
    ["zero", 0, 0],
    ["a negative value", -5, 0],
  ])("coerces %s", (_label, input, expected) => {
    expect(hydraBytes(input)).toBe(expected);
  });
});

describe("readHydraJsonError", () => {
  it("reads the flat newznab error envelope", () => {
    expect(readHydraJsonError({ code: "100", description: "Wrong api key" })).toBe(
      "Wrong api key (code 100)",
    );
  });

  it("reads a nested { error } wrapper", () => {
    expect(
      readHydraJsonError({ error: { code: "200", description: "Unknown parameter" } }),
    ).toBe("Unknown parameter (code 200)");
  });

  it("returns undefined for a successful caps payload", () => {
    expect(
      readHydraJsonError({ server: { "@attributes": { appversion: "8.9.0" } } }),
    ).toBeUndefined();
  });

  it("returns undefined for a non-object body", () => {
    expect(readHydraJsonError("nope")).toBeUndefined();
  });
});

describe("readHydraXmlError", () => {
  it("reads the XML error the newznab mount can answer with even when o=json", () => {
    expect(
      readHydraXmlError('<?xml version="1.0"?><error code="100" description="Wrong api key"/>'),
    ).toBe("Wrong api key (code 100)");
  });

  it("returns undefined for a successful caps document", () => {
    expect(readHydraXmlError("<caps><server title=\"NZBHydra 2\"/></caps>")).toBeUndefined();
  });
});

describe("isStatsApiGated", () => {
  // Measured against 8.9.0: with allowApiStats off (and with a wrong key),
  // /api/stats/indexers answers 500 text/html, because ExternalApiStats is a
  // separate controller that inherits no @ExceptionHandler. A 4xx would only
  // come from a reverse proxy answering ahead of NZBHydra2.
  it.each([500, 401, 403])("treats HTTP %s as the allowApiStats gate", (status) => {
    expect(isStatsApiGated({ status })).toBe(true);
  });

  it.each([502, 404, undefined])("does not claim the gate for %s", (status) => {
    expect(isStatsApiGated({ status })).toBe(false);
  });

  it("classifies the AuthProxyResponseError the HTML 500 actually produces", () => {
    // The gate answers 500 text/html, so serviceRequest sniffs the HTML body
    // and throws AuthProxyResponseError rather than a plain HttpError. It
    // extends HttpError, so `.status` still reads 500 and this must catch it —
    // otherwise the user sees "behind an authentication proxy" for a setting
    // they turned off themselves.
    expect(isStatsApiGated({ name: "AuthProxyResponseError", status: 500 })).toBe(true);
  });

  it("tolerates a non-HttpError throwable", () => {
    expect(isStatsApiGated(new Error("boom"))).toBe(false);
  });
});
