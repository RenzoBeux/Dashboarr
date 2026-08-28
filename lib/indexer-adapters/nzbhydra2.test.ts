// The adapter object pulls in the grab flow (and with it the whole RN
// component chain) purely to satisfy the IndexerSearchAdapter shape, and the
// api module pulls in http-client -> config-store -> AsyncStorage. The mapper
// under test needs none of it.
jest.mock("@/components/indexers/nzbhydra2-grab-flow", () => ({
  Nzbhydra2GrabFlow: () => null,
}));
jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));
jest.mock("@/store/config-store", () => ({
  useConfigStore: Object.assign(() => undefined, {
    getState: () => ({ getActiveInstanceId: () => null, instanceSecrets: {} }),
  }),
}));

import { nzbhydra2ToUnified } from "@/lib/indexer-adapters/nzbhydra2";
import type { Nzbhydra2SearchItem } from "@/lib/types";

// Shaped like a real NewznabJsonTransformer item: the attribute holders are
// keyed "@attributes", which is the trap this whole mapper exists around.
const ITEM: Nzbhydra2SearchItem = {
  title: "Some.Show.S01E01.1080p.WEB-DL-GRP",
  guid: "5032704754818772909",
  link: "http://hydra:5076/getnzb/api/1234?apikey=abc",
  comments: "https://nzbgeek.info/geekseek.php?guid=xyz",
  category: "TV > HD",
  enclosure: {
    "@attributes": {
      url: "http://hydra:5076/getnzb/api/1234?apikey=abc",
      length: "1610612736",
      type: "application/x-nzb",
    },
  },
  attr: [
    { "@attributes": { name: "size", value: "1610612736" } },
    { "@attributes": { name: "hydraIndexerName", value: "NZBGeek" } },
  ],
};

describe("nzbhydra2ToUnified", () => {
  it("labels the row with the originating indexer, not NZBHydra2", () => {
    // The whole point of a meta-search: the user needs to know which indexer
    // actually produced the result.
    expect(nzbhydra2ToUnified(ITEM).indexer).toBe("NZBGeek");
  });

  it("falls back to NZBHydra2 when hydraIndexerName is absent", () => {
    expect(nzbhydra2ToUnified({ title: "x" }).indexer).toBe("NZBHydra2");
  });

  it("reads the size out of the enclosure's @attributes holder", () => {
    expect(nzbhydra2ToUnified(ITEM).sizeBytes).toBe(1610612736);
  });

  it("falls back to the size attr when the enclosure has no length", () => {
    const noEnclosure: Nzbhydra2SearchItem = { ...ITEM, enclosure: undefined };
    expect(nzbhydra2ToUnified(noEnclosure).sizeBytes).toBe(1610612736);
  });

  it("composes a key from indexer + guid, since Hydra merges across indexers", () => {
    expect(nzbhydra2ToUnified(ITEM).id).toBe("NZBGeek:5032704754818772909");
  });

  it("leaves seeders and leechers undefined rather than 0", () => {
    // ReleaseCard renders the S:/L: columns whenever they are DEFINED, so a 0
    // would print "S:0 L:0" on every usenet row.
    const release = nzbhydra2ToUnified(ITEM);
    expect(release.seeders).toBeUndefined();
    expect(release.leechers).toBeUndefined();
  });

  it("is always usenet and never carries a server-side grab payload", () => {
    const release = nzbhydra2ToUnified(ITEM);
    expect(release.protocol).toBe("usenet");
    // NZBHydra2's send-to-downloader is /internalapi-only, so the grab is
    // client-side (the Jackett shape), not Prowlarr's {guid, indexerId} POST.
    expect(release.grab).toBeUndefined();
  });

  it("uses the self-authenticating NZB link as the download URL", () => {
    expect(nzbhydra2ToUnified(ITEM).downloadUrl).toBe(
      "http://hydra:5076/getnzb/api/1234?apikey=abc",
    );
  });

  it("takes infoUrl from comments", () => {
    expect(nzbhydra2ToUnified(ITEM).infoUrl).toBe(
      "https://nzbgeek.info/geekseek.php?guid=xyz",
    );
  });

  it("ignores a guid that is a bare id rather than a URL", () => {
    const noComments: Nzbhydra2SearchItem = { ...ITEM, comments: undefined };
    expect(nzbhydra2ToUnified(noComments).infoUrl).toBeUndefined();
  });

  it("accepts a guid that IS a URL as the details link", () => {
    const urlGuid: Nzbhydra2SearchItem = {
      ...ITEM,
      comments: undefined,
      guid: "https://indexer.example/details/9",
    };
    expect(nzbhydra2ToUnified(urlGuid).infoUrl).toBe(
      "https://indexer.example/details/9",
    );
  });

  it("degrades a bare item to a renderable row instead of throwing", () => {
    expect(nzbhydra2ToUnified({})).toMatchObject({
      title: "Unknown release",
      indexer: "NZBHydra2",
      sizeBytes: 0,
      protocol: "usenet",
    });
  });
});
