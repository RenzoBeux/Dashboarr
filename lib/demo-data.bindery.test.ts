import { getDemoResponse } from "@/lib/demo-data";
import { unwrapBinderyList } from "@/lib/bindery-normalize";
import type { BinderyAuthor, BinderyBook, BinderyQueueResponse } from "@/lib/types";

// Demo mode is the only place outside these unit tests where a Bindery payload
// is produced end to end, so the fixtures are asserted against the real
// unwrapper rather than eyeballed. A fixture that drifts from the envelope
// shape the live API uses would otherwise make demo mode look correct while
// the real integration breaks (or vice versa).

describe("bindery demo fixtures", () => {
  it("serves /author in the offset envelope, not a bare array", () => {
    const raw = getDemoResponse("bindery", "/author");
    expect(Array.isArray(raw)).toBe(false);
    expect(raw).toMatchObject({ limit: expect.any(Number), offset: 0 });

    const { items, total } = unwrapBinderyList<BinderyAuthor>(raw);
    expect(items.length).toBeGreaterThan(0);
    expect(total).toBe(items.length);
  });

  it("gives list authors a bookCount and leaves the two dead stat fields at 0", () => {
    const { items } = unwrapBinderyList<BinderyAuthor>(
      getDemoResponse("bindery", "/author"),
    );
    for (const author of items) {
      expect(author.statistics?.bookCount).toBeGreaterThanOrEqual(0);
      // Upstream never populates these. The fixture mirrors that so demo mode
      // exercises the same "no per-author progress" path as a real server.
      expect(author.statistics?.availableBookCount).toBe(0);
      expect(author.statistics?.wantedBookCount).toBe(0);
    }
  });

  it("omits statistics on author detail and embeds books instead", () => {
    const author = getDemoResponse("bindery", "/author/1") as BinderyAuthor;
    expect(author.statistics).toBeUndefined();
    expect(Array.isArray(author.books)).toBe(true);
    expect(author.books!.every((b) => b.authorId === author.id)).toBe(true);
  });

  it("serves /book in the offset envelope and honours the status filter", () => {
    const all = unwrapBinderyList<BinderyBook>(getDemoResponse("bindery", "/book"));
    expect(all.items.length).toBeGreaterThan(0);

    const wanted = unwrapBinderyList<BinderyBook>(
      getDemoResponse("bindery", "/book", { status: "wanted" }),
    );
    expect(wanted.items.length).toBeGreaterThan(0);
    expect(wanted.items.every((b) => b.status === "wanted")).toBe(true);
    expect(wanted.items.length).toBeLessThan(all.items.length);
  });

  it("reports a real total for the wanted badge's limit=1 request", () => {
    // The dashboard badge reads the envelope total, not the item count, so a
    // fixture that echoed items.length would hide a real-world bug.
    const full = unwrapBinderyList<BinderyBook>(
      getDemoResponse("bindery", "/book", { status: "wanted" }),
    );
    expect(full.total).toBe(full.items.length);
    expect(full.total).toBeGreaterThan(0);
  });

  it("attaches bookFiles and identifiers to a single-book read only", () => {
    const detail = getDemoResponse("bindery", "/book/101") as BinderyBook;
    expect(detail.identifiers?.length).toBeGreaterThan(0);
    expect(detail.bookFiles?.length).toBeGreaterThan(0);
    expect(detail.author?.authorName).toBeTruthy();

    const listed = unwrapBinderyList<BinderyBook>(getDemoResponse("bindery", "/book"))
      .items.find((b) => b.id === 101);
    expect(listed?.bookFiles).toBeUndefined();
    expect(listed?.identifiers).toBeUndefined();
  });

  it("serves /queue in its own envelope, which the unwrapper also handles", () => {
    const raw = getDemoResponse("bindery", "/queue") as BinderyQueueResponse;
    expect(Array.isArray(raw.items)).toBe(true);
    expect(unwrapBinderyList(raw).items.length).toBe(raw.items.length);
  });

  it("covers both a live-progress row and a stuck one", () => {
    const { items } = getDemoResponse("bindery", "/queue") as BinderyQueueResponse;
    expect(items.some((i) => i.percentage)).toBe(true);
    // The queue-issues banner needs something to find, and retry-import is
    // only offered on importFailed.
    expect(items.some((i) => i.status === "importFailed" && i.errorMessage)).toBe(true);
  });

  it("serves the bare-array routes as bare arrays", () => {
    for (const path of ["/rootfolder", "/metadataprofile", "/wanted/missing"]) {
      const raw = getDemoResponse("bindery", path);
      expect(Array.isArray(raw)).toBe(true);
    }
  });

  it("probes /system/status with a version, the field the probe path returns", () => {
    expect(getDemoResponse("bindery", "/system/status")).toMatchObject({
      version: expect.any(String),
    });
  });

  it("proxies every cover through the relative image path, like a real server", () => {
    const { items } = unwrapBinderyList<BinderyAuthor>(
      getDemoResponse("bindery", "/author"),
    );
    for (const author of items) {
      expect(author.imageUrl).toMatch(/^\/api\/v1\/images\?url=/);
    }
  });
});
