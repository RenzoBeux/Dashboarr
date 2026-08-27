import {
  unwrapBinderyList,
  fetchAllBinderyPages,
  binderyImageSource,
  binderyQueueProgress,
  binderyQueueSeverity,
  binderyQueueStatusLabel,
  binderyCanRetryImport,
  BINDERY_PAGE_LIMIT,
} from "@/lib/bindery-normalize";

describe("unwrapBinderyList", () => {
  it("unwraps the offset envelope used by /author, /book and /history", () => {
    const data = { items: [{ id: 1 }, { id: 2 }], total: 57, limit: 100, offset: 0 };
    expect(unwrapBinderyList<{ id: number }>(data)).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      total: 57,
    });
  });

  it("unwraps the /queue envelope, ignoring partial and staleClients", () => {
    const data = {
      items: [{ id: 9 }],
      partial: true,
      staleClients: [{ clientId: 3, name: "sab" }],
    };
    expect(unwrapBinderyList<{ id: number }>(data)).toEqual({
      items: [{ id: 9 }],
      total: 1,
    });
  });

  it("unwraps a bare array and synthesizes a total", () => {
    expect(unwrapBinderyList<number>([1, 2, 3])).toEqual({
      items: [1, 2, 3],
      total: 3,
    });
  });

  it("unwraps the *arr-style records envelope it might drift toward", () => {
    const data = { records: [{ id: 1 }], totalRecords: 12 };
    expect(unwrapBinderyList<{ id: number }>(data)).toEqual({
      items: [{ id: 1 }],
      total: 12,
    });
  });

  it("falls back to the item count when total is missing or not a number", () => {
    expect(unwrapBinderyList({ items: [1, 2] }).total).toBe(2);
    expect(unwrapBinderyList({ items: [1, 2], total: "many" }).total).toBe(2);
  });

  it("returns an empty result for null, undefined and a stray HTML page", () => {
    expect(unwrapBinderyList(null)).toEqual({ items: [], total: 0 });
    expect(unwrapBinderyList(undefined)).toEqual({ items: [], total: 0 });
    expect(unwrapBinderyList("<html>login</html>")).toEqual({ items: [], total: 0 });
    expect(unwrapBinderyList({ error: "nope" })).toEqual({ items: [], total: 0 });
  });
});

describe("fetchAllBinderyPages", () => {
  // Serves `rows` in slices, recording the offsets it was asked for.
  function server(rows: number[], pageSize: number, offsets: number[]) {
    return (limit: number, offset: number) => {
      offsets.push(offset);
      const size = Math.min(limit, pageSize);
      return Promise.resolve({
        items: rows.slice(offset, offset + size),
        total: rows.length,
        limit: size,
        offset,
      });
    };
  }

  it("returns everything in one call when the set fits on a page", async () => {
    const offsets: number[] = [];
    const rows = [1, 2, 3];
    expect(await fetchAllBinderyPages<number>(server(rows, 500, offsets), 500)).toEqual(rows);
    expect(offsets).toEqual([0]);
  });

  it("walks by offset when the total is an exact multiple of the page size", async () => {
    const offsets: number[] = [];
    const rows = [1, 2, 3, 4];
    expect(await fetchAllBinderyPages<number>(server(rows, 2, offsets), 2)).toEqual(rows);
    expect(offsets).toEqual([0, 2]);
  });

  it("walks by offset when the last page is a remainder", async () => {
    const offsets: number[] = [];
    const rows = [1, 2, 3, 4, 5];
    expect(await fetchAllBinderyPages<number>(server(rows, 2, offsets), 2)).toEqual(rows);
    expect(offsets).toEqual([0, 2, 4]);
  });

  it("advances by the items actually returned, not the limit requested", async () => {
    // The server clamps to 500 no matter what we ask for. Advancing by the
    // requested limit would skip rows 500..999 on the second page.
    const offsets: number[] = [];
    const rows = Array.from({ length: 900 }, (_, i) => i);
    const all = await fetchAllBinderyPages<number>(server(rows, 500, offsets), 5000);
    expect(all).toHaveLength(900);
    expect(offsets).toEqual([0, 500]);
  });

  it("stops on a short page even when total overstates the row count", async () => {
    let calls = 0;
    const all = await fetchAllBinderyPages<number>(() => {
      calls++;
      return Promise.resolve({ items: calls === 1 ? [1, 2] : [], total: 999 });
    }, 2);
    expect(all).toEqual([1, 2]);
    expect(calls).toBe(2);
  });

  it("stops immediately on an empty first page", async () => {
    let calls = 0;
    const all = await fetchAllBinderyPages<number>(() => {
      calls++;
      return Promise.resolve({ items: [], total: 0 });
    });
    expect(all).toEqual([]);
    expect(calls).toBe(1);
  });

  it("defaults to Bindery's maximum page size", async () => {
    let seen = 0;
    await fetchAllBinderyPages<number>((limit) => {
      seen = limit;
      return Promise.resolve({ items: [], total: 0 });
    });
    expect(seen).toBe(BINDERY_PAGE_LIMIT);
  });
});

describe("binderyImageSource", () => {
  const remote = "https://covers.openlibrary.org/b/id/123-L.jpg";

  it("rebuilds the proxy path and exposes the remote as a fallback", () => {
    const proxied = `/api/v1/images?url=${encodeURIComponent(remote)}`;
    expect(binderyImageSource(proxied)).toEqual({
      url: `/api/v1/images?url=${encodeURIComponent(remote)}`,
      remoteUrl: remote,
    });
  });

  it("strips a BINDERY_URL_BASE prefix so a subpath deploy is not double-prefixed", () => {
    // The server returns its own urlBase on the path. The user's configured
    // base URL already ends in /bindery, so passing this through verbatim
    // would resolve to /bindery/bindery/api/v1/images.
    const proxied = `/bindery/api/v1/images?url=${encodeURIComponent(remote)}`;
    const source = binderyImageSource(proxied);
    expect(source?.url).toBe(`/api/v1/images?url=${encodeURIComponent(remote)}`);
    expect(source?.url).not.toContain("/bindery/");
    expect(source?.remoteUrl).toBe(remote);
  });

  it("finds url= regardless of parameter order", () => {
    const proxied = `/api/v1/images?w=500&url=${encodeURIComponent(remote)}`;
    expect(binderyImageSource(proxied)?.remoteUrl).toBe(remote);
  });

  it("decodes a plus-encoded space in the remote URL", () => {
    const spaced = "https://example.com/a+b.jpg";
    expect(binderyImageSource(`/api/v1/images?url=${spaced}`)?.remoteUrl).toBe(
      "https://example.com/a b.jpg",
    );
  });

  it("treats a raw remote URL as a fallback-only source", () => {
    // Search stubs and /wanted/missing are never image-proxied upstream.
    expect(binderyImageSource(remote)).toEqual({ url: "", remoteUrl: remote });
  });

  it("passes through an unrelated relative path for the hook to join", () => {
    expect(binderyImageSource("/static/cover.jpg")).toEqual({
      url: "/static/cover.jpg",
      remoteUrl: "",
    });
  });

  it("degrades to the raw path when the percent-encoding is malformed", () => {
    const source = binderyImageSource("/api/v1/images?url=%E0%A4%A");
    expect(source).toEqual({ url: "/api/v1/images?url=%E0%A4%A", remoteUrl: "" });
  });

  it("returns undefined for an absent or blank imageUrl", () => {
    expect(binderyImageSource(undefined)).toBeUndefined();
    expect(binderyImageSource(null)).toBeUndefined();
    expect(binderyImageSource("")).toBeUndefined();
    expect(binderyImageSource("   ")).toBeUndefined();
  });

  it("returns undefined when url= is present but empty", () => {
    expect(binderyImageSource("/api/v1/images?url=")).toEqual({
      url: "/api/v1/images?url=",
      remoteUrl: "",
    });
  });
});

describe("binderyQueueProgress", () => {
  it("converts a 0-100 string to a 0..1 fraction", () => {
    expect(binderyQueueProgress("42.5")).toBeCloseTo(0.425);
    expect(binderyQueueProgress("0")).toBe(0);
    expect(binderyQueueProgress("100")).toBe(1);
  });

  it("tolerates the trailing percent sign upstream sometimes sends", () => {
    expect(binderyQueueProgress("42.5%")).toBeCloseTo(0.425);
    expect(binderyQueueProgress(" 7 ")).toBeCloseTo(0.07);
  });

  it("clamps out-of-range values instead of overflowing the bar", () => {
    expect(binderyQueueProgress("140")).toBe(1);
    expect(binderyQueueProgress("-5")).toBe(0);
  });

  it("reads as zero rather than NaN for missing or unparseable input", () => {
    expect(binderyQueueProgress(undefined)).toBe(0);
    expect(binderyQueueProgress("")).toBe(0);
    expect(binderyQueueProgress("unknown")).toBe(0);
    expect(binderyQueueProgress("%")).toBe(0);
  });

  it("reads a fully-downloaded row as complete when the client reports nothing", () => {
    // The percentage field only exists while a download client is actively
    // reporting. Once the bytes are down and the row is waiting on (or stuck
    // in) import there is no percentage, and 0 would draw an empty bar under a
    // release that is already on disk. These are the nine states upstream's
    // own queueItemSizeLeft treats as zero bytes remaining.
    for (const status of [
      "completed",
      "importPending",
      "importing",
      "imported",
      "failed",
      "importFailed",
      "importBlocked",
      "importExternal",
      "importHeld",
    ]) {
      expect(binderyQueueProgress(undefined, status)).toBe(1);
      expect(binderyQueueProgress("", status)).toBe(1);
    }
  });

  it("still reads as zero for states that have genuinely not downloaded", () => {
    expect(binderyQueueProgress(undefined, "grabbed")).toBe(0);
    expect(binderyQueueProgress(undefined, "downloading")).toBe(0);
    expect(binderyQueueProgress(undefined, "someFutureState")).toBe(0);
  });

  it("prefers a live percentage over the status fallback", () => {
    // A stuck import that the client is still reporting on should show what
    // the client says, not a blanket 100%.
    expect(binderyQueueProgress("40", "importFailed")).toBeCloseTo(0.4);
  });
});

describe("binderyQueueSeverity", () => {
  it("flags the three states that need a human", () => {
    expect(binderyQueueSeverity("failed")).toBe("error");
    expect(binderyQueueSeverity("importFailed")).toBe("error");
    expect(binderyQueueSeverity("importBlocked")).toBe("error");
  });

  it("warns on the two held states", () => {
    expect(binderyQueueSeverity("importHeld")).toBe("warning");
    expect(binderyQueueSeverity("importExternal")).toBe("warning");
  });

  it("stays quiet for healthy and transient states", () => {
    for (const state of [
      "grabbed",
      "downloading",
      "completed",
      "importPending",
      "importing",
      "imported",
    ]) {
      expect(binderyQueueSeverity(state)).toBeNull();
    }
  });

  it("stays quiet for an unknown state so a new upstream status cannot cry wolf", () => {
    expect(binderyQueueSeverity("someFutureState")).toBeNull();
    expect(binderyQueueSeverity(undefined)).toBeNull();
  });
});

describe("binderyQueueStatusLabel", () => {
  it("labels every known state", () => {
    expect(binderyQueueStatusLabel("importBlocked")).toBe("Import blocked");
    expect(binderyQueueStatusLabel("completed")).toBe("Downloaded");
    expect(binderyQueueStatusLabel("importExternal")).toBe("Imported elsewhere");
  });

  it("falls back to Downloading for unknown or missing states", () => {
    expect(binderyQueueStatusLabel("someFutureState")).toBe("Downloading");
    expect(binderyQueueStatusLabel(undefined)).toBe("Downloading");
  });
});

describe("binderyCanRetryImport", () => {
  it("allows retry only in importFailed, the one state the server accepts", () => {
    expect(binderyCanRetryImport("importFailed")).toBe(true);
    for (const state of ["failed", "importBlocked", "importHeld", "downloading", undefined]) {
      expect(binderyCanRetryImport(state)).toBe(false);
    }
  });
});
