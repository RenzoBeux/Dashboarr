import { SERVICE_IDS, SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";
import {
  SERVICE_CATALOG,
  CATEGORY_ORDER,
  SERVICE_CATEGORY_LABELS,
  servicesInCategory,
  secretsShapeFor,
  filterCatalog,
} from "@/lib/service-catalog";

/**
 * A literal copy of the booleans that lived in service-editor.tsx before the
 * catalog replaced them:
 *
 *   const usesPasswordOnly = serviceId === "deluge";
 *   const usesBasicAuth =
 *     usesPasswordOnly || serviceId === "qbittorrent" || "rtorrent" ||
 *     "transmission" || "glances" || "nzbget";
 *
 * Kept as data, not re-derived from the catalog, so the parity test below is a
 * real check against the shipped behaviour rather than a tautology.
 */
const LEGACY_USES_BASIC_AUTH = new Set<ServiceId>([
  "deluge",
  "qbittorrent",
  "rtorrent",
  "transmission",
  "glances",
  "nzbget",
]);
const LEGACY_USES_PASSWORD_ONLY = new Set<ServiceId>(["deluge"]);

describe("SERVICE_CATALOG", () => {
  it("has exactly one entry per service id", () => {
    expect(Object.keys(SERVICE_CATALOG).sort()).toEqual([...SERVICE_IDS].sort());
  });

  it("gives every service a non-empty tagline and a known category", () => {
    for (const id of SERVICE_IDS) {
      const entry = SERVICE_CATALOG[id];
      expect(entry.tagline.length).toBeGreaterThan(0);
      expect(CATEGORY_ORDER).toContain(entry.category);
    }
  });

  it("labels every category in CATEGORY_ORDER", () => {
    for (const category of CATEGORY_ORDER) {
      expect(SERVICE_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });

  it("partitions every service into exactly one category", () => {
    const seen = CATEGORY_ORDER.flatMap((c) => servicesInCategory(c));
    expect(seen.sort()).toEqual([...SERVICE_IDS].sort());
    expect(new Set(seen).size).toBe(SERVICE_IDS.length);
  });
});

describe("auth shapes", () => {
  // The load-bearing test. Every id must resolve to the same credential form
  // it had before the catalog existed; a mismatch means that service silently
  // stops reading or writing its saved credential.
  it("matches the pre-catalog usesBasicAuth boolean for all 25 kinds", () => {
    for (const id of SERVICE_IDS) {
      const shape = secretsShapeFor(SERVICE_CATALOG[id].authShape);
      expect({ id, shape }).toEqual({
        id,
        shape: LEGACY_USES_BASIC_AUTH.has(id) ? "userPass" : "apiKey",
      });
    }
  });

  it("keeps Plex on apiKey so the manual token field survives", () => {
    // The Connect-with-Plex PIN flow writes into the SAME apiKey secret the
    // manual field edits, and isDirty/wasInitiallyUnconfigured both read it.
    // Modelling Plex as its own exclusive shape would drop the manual path.
    expect(SERVICE_CATALOG.plex.authShape).toBe("apiKey");
    expect(SERVICE_CATALOG.plex.oauth).toBe("plex");
    expect(secretsShapeFor(SERVICE_CATALOG.plex.authShape)).toBe("apiKey");
  });

  it("marks Deluge, and only Deluge, as passwordOnly", () => {
    const passwordOnly = SERVICE_IDS.filter(
      (id) => SERVICE_CATALOG[id].authShape === "passwordOnly",
    );
    expect(new Set(passwordOnly)).toEqual(LEGACY_USES_PASSWORD_ONLY);
  });

  it("only offers OAuth alongside a credential shape, never instead of one", () => {
    for (const id of SERVICE_IDS) {
      const entry = SERVICE_CATALOG[id];
      if (entry.oauth) expect(entry.authShape).toBe("apiKey");
    }
  });

  // Guard rail: authShape and SERVICE_DEFAULTS.httpAuth look interchangeable
  // and are not. httpAuth is a transport flag (send HTTP Basic/Digest per
  // request); authShape is the credential form. They diverge on qBittorrent
  // and Deluge, which post to a login endpoint and carry a session cookie.
  it("does not track SERVICE_DEFAULTS.httpAuth", () => {
    const userPass = new Set(
      SERVICE_IDS.filter(
        (id) => secretsShapeFor(SERVICE_CATALOG[id].authShape) === "userPass",
      ),
    );
    const httpAuth = new Set(
      SERVICE_IDS.filter((id) => SERVICE_DEFAULTS[id].httpAuth === true),
    );

    expect(userPass).toEqual(LEGACY_USES_BASIC_AUTH);
    expect(httpAuth).toEqual(
      new Set<ServiceId>(["rtorrent", "transmission", "nzbget", "glances"]),
    );
    expect(userPass).not.toEqual(httpAuth);
    // The exact services that make them differ.
    expect(userPass.has("qbittorrent")).toBe(true);
    expect(httpAuth.has("qbittorrent")).toBe(false);
    expect(userPass.has("deluge")).toBe(true);
    expect(httpAuth.has("deluge")).toBe(false);
  });
});

describe("filterCatalog", () => {
  it("returns every service for an empty or whitespace query", () => {
    expect(filterCatalog("")).toEqual([...SERVICE_IDS]);
    expect(filterCatalog("   ")).toEqual([...SERVICE_IDS]);
  });

  it("finds Seerr by its old and forked names", () => {
    expect(filterCatalog("seerr")).toContain("overseerr");
    expect(filterCatalog("overseerr")).toContain("overseerr");
    expect(filterCatalog("jellyseerr")).toContain("overseerr");
  });

  it("finds Bindery by the archived Readarr name", () => {
    expect(filterCatalog("readarr")).toContain("bindery");
  });

  it("finds every usenet client by protocol", () => {
    const hits = filterCatalog("usenet");
    expect(hits).toEqual(
      expect.arrayContaining(["sabnzbd", "nzbget", "nzbhydra2"]),
    );
  });

  it("matches common abbreviations", () => {
    expect(filterCatalog("qbit")).toContain("qbittorrent");
    expect(filterCatalog("hydra")).toContain("nzbhydra2");
    expect(filterCatalog("sab")).toContain("sabnzbd");
  });

  it("is case insensitive and matches on display name", () => {
    expect(filterCatalog("RaDaRr")).toEqual(["radarr"]);
  });

  it("returns nothing for a query that matches no service", () => {
    expect(filterCatalog("zzzznope")).toEqual([]);
  });

  it("preserves canonical SERVICE_IDS order", () => {
    const hits = filterCatalog("torrent client");
    const canonical = SERVICE_IDS.filter((id) => hits.includes(id));
    expect(hits).toEqual(canonical);
  });
});
