import {
  bazarrVersionState,
  deriveBazarrCapabilities,
  versionGateNote,
} from "./bazarr-capabilities";

describe("deriveBazarrCapabilities", () => {
  it("gates each feature on the version that introduced it", () => {
    expect(deriveBazarrCapabilities("1.5.5")).toEqual({
      extract: false,
      translateEmbedded: false,
      jobs: false,
    });
    expect(deriveBazarrCapabilities("1.5.6")).toMatchObject({ jobs: true, extract: false });
    expect(deriveBazarrCapabilities("v1.6.1")).toEqual({
      extract: true,
      translateEmbedded: false,
      jobs: true,
    });
    expect(deriveBazarrCapabilities("1.6.3-beta.8")).toEqual({
      extract: true,
      translateEmbedded: true,
      jobs: true,
    });
  });

  it("offers nothing optional for an unknown version", () => {
    expect(deriveBazarrCapabilities(null)).toEqual({
      extract: false,
      translateEmbedded: false,
      jobs: false,
    });
  });
});

describe("bazarrVersionState", () => {
  it("is checking until the status call answers", () => {
    expect(bazarrVersionState(undefined, false)).toBe("checking");
  });

  it("is unreadable when the call failed or carried no usable version", () => {
    expect(bazarrVersionState(undefined, true)).toBe("unreadable");
    expect(bazarrVersionState({}, false)).toBe("unreadable");
    expect(bazarrVersionState({ bazarr_version: "unknown" }, false)).toBe("unreadable");
  });

  it("is known for a real version, even after a failed refetch", () => {
    expect(bazarrVersionState({ bazarr_version: "v1.6.2" }, true)).toBe("known");
  });
});

describe("versionGateNote", () => {
  it("names the minimum version only once the version is known", () => {
    expect(versionGateNote("known", "extract")).toBe("Needs Bazarr 1.6.1 or later");
    expect(versionGateNote("known", "translateEmbedded")).toBe("Needs Bazarr 1.6.2 or later");
    expect(versionGateNote("checking", "extract")).toBe("Checking Bazarr version…");
    expect(versionGateNote("unreadable", "extract")).toBe("Couldn't read Bazarr's version");
  });
});
