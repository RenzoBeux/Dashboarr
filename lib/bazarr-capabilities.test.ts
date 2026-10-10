import { deriveBazarrCapabilities } from "./bazarr-capabilities";

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
