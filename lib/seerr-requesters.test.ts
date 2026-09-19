import type { OverseerrMediaInfoRequest } from "@/lib/types";
import {
  collectSeerrRequesters,
  seerrAvatarUrl,
  seerrInitials,
} from "./seerr-requesters";

const request = (
  over: Partial<OverseerrMediaInfoRequest> & {
    requestedBy?: OverseerrMediaInfoRequest["requestedBy"];
  } = {},
): OverseerrMediaInfoRequest => ({
  id: 1,
  status: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  requestedBy: { id: 7, displayName: "Sarah Connor" },
  ...over,
});

describe("collectSeerrRequesters", () => {
  it("returns nothing for an absent or empty request list", () => {
    expect(collectSeerrRequesters(undefined)).toEqual([]);
    expect(collectSeerrRequesters(null)).toEqual([]);
    expect(collectSeerrRequesters([])).toEqual([]);
  });

  it("names the requester of a single request", () => {
    expect(collectSeerrRequesters([request()])).toEqual([
      {
        userId: 7,
        displayName: "Sarah Connor",
        requestedAt: "2026-01-01T00:00:00.000Z",
        only4k: false,
      },
    ]);
  });

  it("collapses a user's regular + 4K requests into one row", () => {
    const rows = collectSeerrRequesters([
      request({ id: 1, is4k: false, createdAt: "2026-01-02T00:00:00.000Z" }),
      request({ id: 2, is4k: true, createdAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(rows).toHaveLength(1);
    // The earliest of the two is what "requested" means for that account.
    expect(rows[0]).toMatchObject({
      userId: 7,
      requestedAt: "2026-01-01T00:00:00.000Z",
      only4k: false,
    });
  });

  it("marks a user whose only request is the 4K one", () => {
    const rows = collectSeerrRequesters([request({ is4k: true })]);
    expect(rows[0]!.only4k).toBe(true);
  });

  it("lists distinct requesters oldest first", () => {
    const rows = collectSeerrRequesters([
      request({
        id: 2,
        createdAt: "2026-03-01T00:00:00.000Z",
        requestedBy: { id: 9, displayName: "John Smith" },
      }),
      request({ id: 1, createdAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.displayName)).toEqual([
      "Sarah Connor",
      "John Smith",
    ]);
  });

  it("puts rows with no usable timestamp last", () => {
    const rows = collectSeerrRequesters([
      request({
        id: 2,
        createdAt: undefined,
        requestedBy: { id: 9, displayName: "Undated" },
      }),
      request({
        id: 3,
        createdAt: "not a date",
        requestedBy: { id: 11, displayName: "Garbled" },
      }),
      request({ id: 1, createdAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(rows[0]!.displayName).toBe("Sarah Connor");
    expect(rows.slice(1).map((r) => r.displayName).sort()).toEqual([
      "Garbled",
      "Undated",
    ]);
  });

  it("picks up an avatar that only a later row carried", () => {
    const rows = collectSeerrRequesters([
      request({ id: 1 }),
      request({
        id: 2,
        requestedBy: { id: 7, displayName: "Sarah Connor", avatar: "/a.png" },
      }),
    ]);
    expect(rows[0]!.avatar).toBe("/a.png");
  });

  it("drops rows a proxy stripped requestedBy from", () => {
    expect(
      collectSeerrRequesters([
        { id: 1, status: 2 },
        request({ id: 2 }),
      ]),
    ).toHaveLength(1);
  });

  it("falls back to the account id when displayName is empty", () => {
    const rows = collectSeerrRequesters([
      request({ requestedBy: { id: 7, displayName: "" } }),
    ]);
    expect(rows[0]!.displayName).toBe("User #7");
  });
});

describe("seerrAvatarUrl", () => {
  const base = "https://seerr.example.com";

  it("passes an absolute avatar through untouched", () => {
    expect(seerrAvatarUrl("https://plex.tv/users/abc/avatar", base)).toBe(
      "https://plex.tv/users/abc/avatar",
    );
  });

  it("resolves the avatarproxy path against the server ROOT, not /api/v1", () => {
    expect(seerrAvatarUrl("/avatarproxy/jf-user?v=3", base)).toBe(
      "https://seerr.example.com/avatarproxy/jf-user?v=3",
    );
  });

  it("does not double the slash on a base URL with a trailing one", () => {
    expect(seerrAvatarUrl("/os_logo_square.png", "https://seerr.example.com/")).toBe(
      "https://seerr.example.com/os_logo_square.png",
    );
  });

  it("returns undefined when there is nothing to load", () => {
    expect(seerrAvatarUrl(undefined, base)).toBeUndefined();
    expect(seerrAvatarUrl("", base)).toBeUndefined();
    expect(seerrAvatarUrl("   ", base)).toBeUndefined();
  });

  it("returns undefined for a relative avatar with no reachable base URL", () => {
    // getActiveUrl answers "" while away from home with no remote configured.
    expect(seerrAvatarUrl("/avatarproxy/x", "")).toBeUndefined();
    expect(seerrAvatarUrl("/avatarproxy/x", undefined)).toBeUndefined();
  });
});

describe("seerrInitials", () => {
  it("takes the first and last word's initials", () => {
    expect(seerrInitials("Sarah Connor")).toBe("SC");
    expect(seerrInitials("john ronald reuel tolkien")).toBe("JT");
  });

  it("takes two letters from a single word", () => {
    expect(seerrInitials("admin")).toBe("AD");
    expect(seerrInitials("x")).toBe("X");
  });

  it("falls back to a question mark for a blank name", () => {
    expect(seerrInitials("   ")).toBe("?");
  });
});
