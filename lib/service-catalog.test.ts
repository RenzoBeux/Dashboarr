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

/**
 * Kinds added AFTER the catalog landed, so there is no pre-catalog boolean to
 * be in parity with. Their shape is asserted against upstream instead of
 * against history, and the reason is recorded here:
 *
 *   navidrome - server/subsonic/middlewares.go:validateCredentials accepts only
 *   p / t+s / jwt, and GetOpenSubsonicExtensions does not advertise the
 *   OpenSubsonic apiKey extension. There is no API key to store.
 */
const POST_CATALOG_USER_PASS = new Set<ServiceId>(["navidrome"]);

/**
 * Post-catalog kinds whose credential is a bare password with no username.
 *
 *   pihole - Pi-hole v6's POST /api/auth takes a body of {password} and nothing
 *   else; FTL has no username and implements no API key. An application
 *   password is the same shape. Like Deluge it is passwordOnly but NOT
 *   httpAuth: the password goes to a login endpoint and comes back as an
 *   X-FTL-SID session token, never as HTTP Basic.
 */
const POST_CATALOG_PASSWORD_ONLY = new Set<ServiceId>(["pihole"]);

/** Every id whose credential form is username + password, from all sources. */
const ALL_USER_PASS = new Set<ServiceId>([
  ...LEGACY_USES_BASIC_AUTH,
  ...POST_CATALOG_USER_PASS,
  // passwordOnly collapses to the userPass secrets shape — see secretsShapeFor.
  ...POST_CATALOG_PASSWORD_ONLY,
]);

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
  it("matches the pre-catalog usesBasicAuth boolean for every kind that predates the catalog", () => {
    for (const id of SERVICE_IDS) {
      if (POST_CATALOG_USER_PASS.has(id)) continue;
      if (POST_CATALOG_PASSWORD_ONLY.has(id)) continue;
      const shape = secretsShapeFor(SERVICE_CATALOG[id].authShape);
      expect({ id, shape }).toEqual({
        id,
        shape: LEGACY_USES_BASIC_AUTH.has(id) ? "userPass" : "apiKey",
      });
    }
  });

  it("keeps post-catalog additions on the credential form upstream actually accepts", () => {
    for (const id of [...POST_CATALOG_USER_PASS, ...POST_CATALOG_PASSWORD_ONLY]) {
      expect({ id, shape: secretsShapeFor(SERVICE_CATALOG[id].authShape) }).toEqual({
        id,
        shape: "userPass",
      });
    }
    // ...but a single-password service must not grow a username field.
    for (const id of POST_CATALOG_PASSWORD_ONLY) {
      expect({ id, authShape: SERVICE_CATALOG[id].authShape }).toEqual({
        id,
        authShape: "passwordOnly",
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

  it("marks exactly the single-password services as passwordOnly", () => {
    const passwordOnly = SERVICE_IDS.filter(
      (id) => SERVICE_CATALOG[id].authShape === "passwordOnly",
    );
    expect(new Set(passwordOnly)).toEqual(
      new Set<ServiceId>([
        ...LEGACY_USES_PASSWORD_ONLY,
        ...POST_CATALOG_PASSWORD_ONLY,
      ]),
    );
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

    expect(userPass).toEqual(ALL_USER_PASS);
    expect(httpAuth).toEqual(
      new Set<ServiceId>(["rtorrent", "transmission", "nzbget", "glances"]),
    );
    expect(userPass).not.toEqual(httpAuth);
    // The exact services that make them differ.
    expect(userPass.has("qbittorrent")).toBe(true);
    expect(httpAuth.has("qbittorrent")).toBe(false);
    expect(userPass.has("deluge")).toBe(true);
    expect(httpAuth.has("deluge")).toBe(false);
    // Navidrome joins them: username + password, hashed into the Subsonic `t`
    // param and posted to /auth/login, never sent as HTTP Basic.
    expect(userPass.has("navidrome")).toBe(true);
    expect(httpAuth.has("navidrome")).toBe(false);
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
