import type { SeerrMe } from "@/lib/seerr-auth";
import {
  canDeleteSeerrRequest,
  canRequest4kMedia,
  canRequestMedia,
  deriveSeerrCapabilities,
  hasSeerrPermission,
  SeerrPermission as P,
  UNLOADED_SEERR_CAPABILITIES,
} from "./seerr-permissions";

const me = (permissions: number, id = 7): SeerrMe => ({
  id,
  displayName: `user-${id}`,
  permissions,
});

describe("hasSeerrPermission", () => {
  it("grants nothing to a zero bitfield", () => {
    expect(hasSeerrPermission(0, P.REQUEST)).toBe(false);
    expect(hasSeerrPermission(0, [P.REQUEST, P.REQUEST_MOVIE], { type: "or" })).toBe(false);
  });

  // Upstream returns true before looking at the requested bits at all.
  it("short-circuits on the ADMIN bit", () => {
    expect(hasSeerrPermission(P.ADMIN, P.MANAGE_REQUESTS)).toBe(true);
    expect(hasSeerrPermission(P.ADMIN, [P.REQUEST_4K, P.MANAGE_USERS])).toBe(true);
    expect(hasSeerrPermission(P.ADMIN | P.REQUEST, P.VIEW_BLOCKLIST)).toBe(true);
  });

  it("matches a single bit exactly", () => {
    expect(hasSeerrPermission(P.REQUEST, P.REQUEST)).toBe(true);
    expect(hasSeerrPermission(P.REQUEST | P.VOTE, P.VOTE)).toBe(true);
    expect(hasSeerrPermission(P.REQUEST_4K, P.REQUEST)).toBe(false);
  });

  it("requires every bit for an AND array and any bit for an OR array", () => {
    const both = P.REQUEST | P.REQUEST_4K;
    expect(hasSeerrPermission(both, [P.REQUEST, P.REQUEST_4K])).toBe(true);
    expect(hasSeerrPermission(P.REQUEST, [P.REQUEST, P.REQUEST_4K])).toBe(false);
    expect(hasSeerrPermission(P.REQUEST, [P.REQUEST, P.REQUEST_4K], { type: "or" })).toBe(true);
    expect(hasSeerrPermission(P.VOTE, [P.REQUEST, P.REQUEST_4K], { type: "or" })).toBe(false);
  });

  it("handles the highest bit without sign trouble", () => {
    expect(hasSeerrPermission(P.VIEW_BLOCKLIST, P.VIEW_BLOCKLIST)).toBe(true);
    expect(hasSeerrPermission(P.VIEW_BLOCKLIST, P.MANAGE_BLOCKLIST)).toBe(false);
  });
});

describe("deriveSeerrCapabilities", () => {
  it("is the unloaded set until /auth/me answers", () => {
    expect(deriveSeerrCapabilities(undefined)).toBe(UNLOADED_SEERR_CAPABILITIES);
    expect(deriveSeerrCapabilities(null)).toBe(UNLOADED_SEERR_CAPABILITIES);
    expect(UNLOADED_SEERR_CAPABILITIES.loaded).toBe(false);
    expect(UNLOADED_SEERR_CAPABILITIES.canManageRequests).toBe(false);
  });

  // The API-key path: /auth/me returns the admin, so nothing changes from the
  // pre-#332 UI.
  it("grants everything to an admin", () => {
    const caps = deriveSeerrCapabilities(me(P.ADMIN, 1));
    expect(caps.loaded).toBe(true);
    expect(caps.userId).toBe(1);
    expect(caps.displayName).toBe("user-1");
    for (const [key, value] of Object.entries(caps)) {
      if (typeof value === "boolean") expect({ key, value }).toEqual({ key, value: true });
    }
  });

  it("gives a REQUEST-only account only the request bits", () => {
    const caps = deriveSeerrCapabilities(me(P.REQUEST));
    expect(caps.canRequestMovie).toBe(true);
    expect(caps.canRequestTv).toBe(true);
    expect(caps.canRequest4kMovie).toBe(false);
    expect(caps.canRequest4kTv).toBe(false);
    expect(caps.canManageRequests).toBe(false);
    expect(caps.canViewAllRequests).toBe(false);
    expect(caps.canRequestAs).toBe(false);
    expect(caps.canManageDiscover).toBe(false);
    expect(caps.isAdmin).toBe(false);
  });

  it("splits the per-type request bits", () => {
    const tvOnly = deriveSeerrCapabilities(me(P.REQUEST_TV));
    expect(tvOnly.canRequestTv).toBe(true);
    expect(tvOnly.canRequestMovie).toBe(false);

    const movie4k = deriveSeerrCapabilities(me(P.REQUEST_4K_MOVIE));
    expect(movie4k.canRequest4kMovie).toBe(true);
    expect(movie4k.canRequest4kTv).toBe(false);

    const all4k = deriveSeerrCapabilities(me(P.REQUEST_4K));
    expect(all4k.canRequest4kMovie).toBe(true);
    expect(all4k.canRequest4kTv).toBe(true);
  });

  it("maps the viewing and on-behalf bits", () => {
    const viewer = deriveSeerrCapabilities(me(P.REQUEST_VIEW));
    expect(viewer.canViewAllRequests).toBe(true);
    expect(viewer.canManageRequests).toBe(false);
    expect(viewer.canRequestAs).toBe(false);

    const userManager = deriveSeerrCapabilities(me(P.MANAGE_USERS));
    expect(userManager.canRequestAs).toBe(true);
    expect(userManager.canManageUsers).toBe(true);
    expect(userManager.canManageRequests).toBe(false);

    const manager = deriveSeerrCapabilities(me(P.MANAGE_REQUESTS));
    expect(manager.canManageRequests).toBe(true);
    expect(manager.canViewAllRequests).toBe(true);
    expect(manager.canRequestAs).toBe(true);
    expect(manager.canManageDiscover).toBe(false);
    expect(manager.isAdmin).toBe(false);
  });

  it("selects by media type", () => {
    const caps = deriveSeerrCapabilities(me(P.REQUEST_TV | P.REQUEST_4K_MOVIE));
    expect(canRequestMedia(caps, "tv")).toBe(true);
    expect(canRequestMedia(caps, "movie")).toBe(false);
    expect(canRequest4kMedia(caps, "movie")).toBe(true);
    expect(canRequest4kMedia(caps, "tv")).toBe(false);
  });
});

describe("canDeleteSeerrRequest", () => {
  const own = (status: number) => ({ status, requestedBy: { id: 7 } });
  const other = (status: number) => ({ status, requestedBy: { id: 8 } });

  it("lets a manager delete anything", () => {
    const caps = deriveSeerrCapabilities(me(P.MANAGE_REQUESTS));
    expect(canDeleteSeerrRequest(caps, own(2))).toBe(true);
    expect(canDeleteSeerrRequest(caps, other(1))).toBe(true);
    expect(canDeleteSeerrRequest(caps, other(3))).toBe(true);
  });

  // Upstream: without MANAGE_REQUESTS, only the caller's own request and only
  // while it is still pending, else 401.
  it("limits everyone else to their own pending requests", () => {
    const caps = deriveSeerrCapabilities(me(P.REQUEST));
    expect(canDeleteSeerrRequest(caps, own(1))).toBe(true);
    expect(canDeleteSeerrRequest(caps, own(2))).toBe(false);
    expect(canDeleteSeerrRequest(caps, own(3))).toBe(false);
    expect(canDeleteSeerrRequest(caps, other(1))).toBe(false);
  });

  it("denies everything before /auth/me has answered", () => {
    expect(canDeleteSeerrRequest(UNLOADED_SEERR_CAPABILITIES, own(1))).toBe(false);
  });
});
