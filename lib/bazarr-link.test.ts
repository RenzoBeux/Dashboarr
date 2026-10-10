import { ARR_LINK_OFF } from "@/lib/config-types";
import {
  bazarrForArr,
  formatArrAddress,
  matchArrInstance,
  moveLinkPatches,
  resolveLinkState,
  type ArrCandidate,
} from "./bazarr-link";

const cand = (id: string, apiKey: string, localUrl = "", remoteUrl = ""): ArrCandidate => ({
  id,
  apiKey,
  localUrl,
  remoteUrl,
});

describe("matchArrInstance", () => {
  const candidates = [
    cand("r1", "key-a", "http://192.168.1.10:7878"),
    cand("r2", "key-b", "http://192.168.1.11:7878"),
  ];

  it("links the instance whose API key Bazarr uses", () => {
    expect(
      matchArrInstance({ enabled: true, apiKey: "key-b", host: "radarr", port: 7878 }, candidates),
    ).toBe("r2");
  });

  it("ignores surrounding whitespace in keys", () => {
    expect(matchArrInstance({ enabled: true, apiKey: " key-a " }, candidates)).toBe("r1");
  });

  it("finds nothing without a matching key", () => {
    expect(matchArrInstance({ enabled: true, apiKey: "key-z" }, candidates)).toBeNull();
  });

  it("finds nothing when Bazarr has that arr switched off or no key", () => {
    expect(matchArrInstance({ enabled: false, apiKey: "key-a" }, candidates)).toBeNull();
    expect(matchArrInstance({ enabled: true, apiKey: "" }, candidates)).toBeNull();
    expect(matchArrInstance({ enabled: true }, candidates)).toBeNull();
  });

  it("breaks a shared-key tie by port, then by host", () => {
    const shared = [
      cand("lan", "same", "http://10.0.0.5:7878"),
      cand("vpn", "same", "https://radarr.example.com"),
      cand("4k", "same", "http://10.0.0.5:7879"),
    ];
    expect(matchArrInstance({ enabled: true, apiKey: "same", port: 7879 }, shared)).toBe("4k");
    expect(
      matchArrInstance({ enabled: true, apiKey: "same", host: "radarr.example.com" }, shared),
    ).toBe("vpn");
    expect(matchArrInstance({ enabled: true, apiKey: "same" }, shared)).toBe("lan");
  });
});

describe("formatArrAddress", () => {
  it("joins host and port", () => {
    expect(formatArrAddress({ enabled: true, host: "radarr", port: 7878 })).toBe("radarr:7878");
    expect(formatArrAddress({ enabled: true, host: "radarr" })).toBe("radarr");
  });

  it("is null when the arr is off or has no host", () => {
    expect(formatArrAddress({ enabled: false, host: "radarr", port: 7878 })).toBeNull();
    expect(formatArrAddress({ enabled: true })).toBeNull();
  });
});

describe("resolveLinkState", () => {
  const ids = new Set(["r1", "r2"]);

  it("prefers the stored choice over detection", () => {
    expect(resolveLinkState("r1", "r2", ids)).toEqual({ arrId: "r1", how: "manual" });
  });

  it("honours the off switch", () => {
    expect(resolveLinkState(ARR_LINK_OFF, "r2", ids)).toEqual({ arrId: null, how: "off" });
  });

  it("flags a stored id whose instance is gone", () => {
    expect(resolveLinkState("deleted", "r2", ids)).toEqual({ arrId: null, how: "stale" });
  });

  it("uses detection when automatic", () => {
    expect(resolveLinkState(undefined, "r2", ids)).toEqual({ arrId: "r2", how: "detected" });
    expect(resolveLinkState(undefined, null, ids)).toEqual({ arrId: null, how: "none" });
    expect(resolveLinkState(undefined, undefined, ids)).toEqual({ arrId: null, how: "none" });
    expect(resolveLinkState(undefined, "deleted", ids)).toEqual({ arrId: null, how: "none" });
  });
});

describe("bazarrForArr", () => {
  it("picks the manual claim over a detected one", () => {
    expect(
      bazarrForArr("r1", [
        { bazarrId: "b1", state: { arrId: "r1", how: "detected" } },
        { bazarrId: "b2", state: { arrId: "r1", how: "manual" } },
      ]),
    ).toBe("b2");
  });

  it("falls back to instance order between equals", () => {
    expect(
      bazarrForArr("r1", [
        { bazarrId: "b1", state: { arrId: "r1", how: "detected" } },
        { bazarrId: "b2", state: { arrId: "r1", how: "detected" } },
      ]),
    ).toBe("b1");
  });

  it("is null when nothing claims the arr", () => {
    expect(bazarrForArr("r1", [{ bazarrId: "b1", state: { arrId: null, how: "off" } }])).toBeNull();
    expect(bazarrForArr(undefined, [])).toBeNull();
  });
});

describe("moveLinkPatches", () => {
  it("sets the target and returns other manual claims to automatic", () => {
    expect(
      moveLinkPatches(
        "radarr",
        [
          { id: "b1", linkedRadarrInstanceId: "r1" },
          { id: "b2" },
          { id: "b3", linkedRadarrInstanceId: "r2" },
        ],
        "b2",
        "r1",
      ),
    ).toEqual([
      { bazarrId: "b2", patch: { linkedRadarrInstanceId: "r1" } },
      { bazarrId: "b1", patch: { linkedRadarrInstanceId: undefined } },
    ]);
  });

  it("touches only the field of the given kind", () => {
    expect(
      moveLinkPatches("sonarr", [{ id: "b1", linkedRadarrInstanceId: "s1" }], "b2", "s1"),
    ).toEqual([{ bazarrId: "b2", patch: { linkedSonarrInstanceId: "s1" } }]);
  });
});
