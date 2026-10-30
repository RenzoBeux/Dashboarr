import { getDemoResponse } from "@/lib/demo-data";
import type { MaintainerrBulkMediaResponse, MaintainerrCollectionMediaPage } from "@/lib/types";

/**
 * Demo mode is what store screenshots use, so the collection page and its
 * Exclude button must work there too: a missing route would show an empty
 * collection, and a missing exclusion answer would toast a failure.
 */

describe("maintainerr demo collection media", () => {
  it("answers the paged content route with titled members on page 1", () => {
    const page = getDemoResponse(
      "maintainerr",
      "/api/collections/media/2/content/1",
    ) as MaintainerrCollectionMediaPage;
    expect(page.totalSize).toBe(page.items.length);
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.collectionId).toBe(2);
      expect(item.mediaData?.title).toBeTruthy();
    }
  });

  it("has no members past page 1", () => {
    const page = getDemoResponse(
      "maintainerr",
      "/api/collections/media/1/content/2",
    ) as MaintainerrCollectionMediaPage;
    expect(page.items).toEqual([]);
  });

  it("confirms a bulk exclusion for every requested id", () => {
    const response = getDemoResponse(
      "maintainerr",
      "/api/rules/exclusions/bulk",
      undefined,
      JSON.stringify({ mediaIds: ["5000"], collectionId: 1, action: 0 }),
      "POST",
    ) as MaintainerrBulkMediaResponse;
    expect(response.results).toEqual([{ mediaId: "5000", code: 1 }]);
  });
});
