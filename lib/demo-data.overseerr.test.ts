import { getDemoResponse } from "@/lib/demo-data";
import {
  availableSeerrSignInModes,
  readSeerrMe,
  readSeerrPublicSettings,
} from "@/lib/seerr-auth";
import { deriveSeerrCapabilities } from "@/lib/seerr-permissions";

/**
 * Demo mode is a first-class path. These push the Seerr auth fixtures through
 * the REAL parsers, so a drifted fixture cannot make demo mode look right while
 * the live sign-in breaks (#332).
 */

const demo = (path: string, method?: string) =>
  getDemoResponse("overseerr", path, undefined, undefined, method);

describe("Seerr auth fixtures", () => {
  it("answers every auth path the session layer calls", () => {
    for (const path of ["/auth/me", "/auth/plex", "/auth/jellyfin", "/auth/local", "/auth/logout", "/settings/public"]) {
      expect({ path, answered: demo(path, "POST") !== undefined }).toEqual({ path, answered: true });
    }
  });

  it("acts as an admin so every control stays visible", () => {
    const me = readSeerrMe(demo("/auth/me"));
    expect(me).not.toBeNull();
    const caps = deriveSeerrCapabilities(me);
    expect(caps.loaded).toBe(true);
    expect(caps.isAdmin).toBe(true);
    expect(caps.canManageDiscover).toBe(true);
    expect(caps.canRequestAs).toBe(true);
  });

  it("returns the same account from every login route", () => {
    const me = readSeerrMe(demo("/auth/me"));
    for (const path of ["/auth/plex", "/auth/jellyfin", "/auth/local"]) {
      expect(readSeerrMe(demo(path, "POST"))).toEqual(me);
    }
  });

  it("offers every sign-in method in the editor", () => {
    const settings = readSeerrPublicSettings(demo("/settings/public"));
    expect(settings).not.toBeNull();
    expect(availableSeerrSignInModes(settings)).toEqual(["apiKey", "plex", "mediaServer", "local"]);
  });

  it("still routes the request fixtures after the auth handlers", () => {
    expect(demo("/request/count")).toBeDefined();
    expect(demo("/request")).toBeDefined();
    expect(demo("/user")).toBeDefined();
  });
});
