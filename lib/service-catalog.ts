import { SERVICE_IDS, SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";

/**
 * Presentation and capability metadata for every service kind.
 *
 * This is the single place the Integrations UI reads to answer "what is this
 * service, where does it belong, and what does its credential form look like".
 * It mirrors the shape of components/dashboard/widget-registry.tsx: one flat
 * Record keyed by id, plain object literals, plus a few pure selectors.
 *
 * Deliberately pure data — it imports only lib/constants, so its test needs no
 * React renderer and no AsyncStorage/SecureStore shims.
 */

export type ServiceCategory =
  | "downloads"
  | "automation"
  | "indexers"
  | "media-servers"
  | "requests"
  | "monitoring";

/**
 * The shape of the credential FORM and of the stored ServiceSecrets.
 *
 * WARNING: this is NOT the same thing as `SERVICE_DEFAULTS[id].httpAuth`, and
 * the two must never be merged. `httpAuth` is a wire-level transport flag
 * (send HTTP Basic/Digest on every request) covering only
 *   { rtorrent, transmission, nzbget, glances }
 * whereas the userPass side of `authShape` also covers qBittorrent and Deluge,
 * which post their credentials to a login endpoint and carry a session cookie
 * instead. Collapsing the two sets breaks auth for both of those clients.
 * lib/service-catalog.test.ts locks the inequality.
 */
export type ServiceAuthShape = "apiKey" | "userPass" | "passwordOnly";

export interface ServiceCatalogEntry {
  category: ServiceCategory;
  /** One short noun phrase shown under the name in the browse list. */
  tagline: string;
  /** Extra search terms: former names, forks, protocol words, abbreviations. */
  keywords: string[];
  authShape: ServiceAuthShape;
  /**
   * An OAuth-style sign-in offered IN ADDITION TO `authShape`, never instead
   * of it. Plex is `apiKey` + `oauth: "plex"`: the PIN flow writes the token
   * into the same apiKey secret the manual field edits, and dropping the
   * manual field would strand anyone who cannot complete the browser flow.
   */
  oauth?: "plex";
  /** Where to find the key in the service's own UI. Omitted when unverified. */
  apiKeyHint?: string;
  docsUrl?: string;
}

export const SERVICE_CATALOG: Record<ServiceId, ServiceCatalogEntry> = {
  // --- Download clients ---
  qbittorrent: {
    category: "downloads",
    tagline: "Torrent client",
    keywords: ["qbit", "qb", "torrent"],
    authShape: "userPass",
  },
  rtorrent: {
    category: "downloads",
    tagline: "Torrent client",
    keywords: ["rutorrent", "torrent", "xmlrpc"],
    authShape: "userPass",
  },
  transmission: {
    category: "downloads",
    tagline: "Torrent client",
    keywords: ["torrent"],
    authShape: "userPass",
  },
  deluge: {
    category: "downloads",
    tagline: "Torrent client",
    keywords: ["torrent"],
    // Deluge's Web UI has a single password and no username at all.
    authShape: "passwordOnly",
  },
  sabnzbd: {
    category: "downloads",
    tagline: "Usenet downloader",
    keywords: ["sab", "usenet", "nzb"],
    authShape: "apiKey",
    apiKeyHint: "Config > General > API Key",
  },
  nzbget: {
    category: "downloads",
    tagline: "Usenet downloader",
    keywords: ["usenet", "nzb"],
    authShape: "userPass",
  },

  // --- Media automation ---
  radarr: {
    category: "automation",
    tagline: "Movie automation",
    keywords: ["movies", "arr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > Security > API Key",
  },
  sonarr: {
    category: "automation",
    tagline: "TV automation",
    keywords: ["tv", "series", "shows", "arr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > Security > API Key",
  },
  lidarr: {
    category: "automation",
    tagline: "Music automation",
    keywords: ["music", "albums", "arr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > Security > API Key",
  },
  bindery: {
    category: "automation",
    tagline: "Book and audiobook automation",
    // Bindery is the successor to the archived Readarr, so people search for
    // the old name long after the migration.
    keywords: ["books", "audiobooks", "readarr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > Security",
  },
  bazarr: {
    category: "automation",
    tagline: "Subtitle automation",
    keywords: ["subtitles", "subs", "arr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > Security > API Key",
  },

  // --- Indexers ---
  prowlarr: {
    category: "indexers",
    tagline: "Indexer manager",
    keywords: ["indexer", "trackers", "arr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > Security > API Key",
  },
  jackett: {
    category: "indexers",
    tagline: "Torrent indexer proxy",
    keywords: ["indexer", "trackers", "torznab"],
    authShape: "apiKey",
    apiKeyHint: "Shown at the top of the Jackett dashboard",
  },
  nzbhydra2: {
    category: "indexers",
    tagline: "Usenet meta-search",
    keywords: ["hydra", "usenet", "nzb", "indexer", "newznab"],
    authShape: "apiKey",
    apiKeyHint: "Config > Main > Security > API key",
  },

  // --- Media servers ---
  plex: {
    category: "media-servers",
    tagline: "Media server",
    keywords: ["pms"],
    // See ServiceCatalogEntry.oauth: additive, not a replacement.
    authShape: "apiKey",
    oauth: "plex",
    apiKeyHint: "Filled in by Connect with Plex, or paste an X-Plex-Token",
  },
  jellyfin: {
    category: "media-servers",
    tagline: "Media server",
    keywords: ["jelly"],
    authShape: "apiKey",
    apiKeyHint: "Dashboard > Advanced > API Keys",
  },
  emby: {
    category: "media-servers",
    tagline: "Media server",
    keywords: [],
    authShape: "apiKey",
  },

  // --- Requests and automation ---
  overseerr: {
    category: "requests",
    tagline: "Media requests",
    // The id stays `overseerr` for back-compat while the product is "Seerr";
    // both spellings plus the Jellyfin fork have to match.
    keywords: ["seerr", "overseerr", "jellyseerr", "requests"],
    authShape: "apiKey",
    apiKeyHint: "Settings > General > API Key",
  },
  autobrr: {
    category: "requests",
    tagline: "Release filtering",
    keywords: ["irc", "announce", "filters", "brr"],
    authShape: "apiKey",
    apiKeyHint: "Settings > API keys",
  },
  cleanuparr: {
    category: "requests",
    tagline: "Queue cleanup",
    keywords: ["cleanup", "strike", "arr"],
    authShape: "apiKey",
    apiKeyHint: "Account Settings",
  },

  // --- Monitoring ---
  tautulli: {
    category: "monitoring",
    tagline: "Plex activity and stats",
    keywords: ["plexpy", "stats", "history"],
    authShape: "apiKey",
    apiKeyHint: "Settings > Web Interface > API > API Key",
  },
  tracearr: {
    category: "monitoring",
    tagline: "Streaming activity and history",
    keywords: ["stats", "history", "streams"],
    authShape: "apiKey",
    apiKeyHint: "Tracearr, as a trr_pub_ token",
  },
  jellystat: {
    category: "monitoring",
    tagline: "Jellyfin activity and stats",
    keywords: ["jellyfin", "stats", "history"],
    authShape: "apiKey",
  },
  glances: {
    category: "monitoring",
    tagline: "System monitoring",
    keywords: ["cpu", "ram", "system", "server"],
    authShape: "userPass",
  },
  unraid: {
    category: "monitoring",
    tagline: "Server and array monitoring",
    keywords: ["nas", "array", "docker", "server"],
    // The GraphQL API has to be switched on there first, and the key needs
    // array-read permission.
    apiKeyHint: "Settings > Management Access",
    authShape: "apiKey",
  },
};

/** Display order of the category sections on the browse screen. */
export const CATEGORY_ORDER: ServiceCategory[] = [
  "downloads",
  "automation",
  "indexers",
  "media-servers",
  "requests",
  "monitoring",
];

/**
 * Named SERVICE_CATEGORY_LABELS, not CATEGORY_LABELS: lib/notification-categories.ts
 * already exports a CATEGORY_LABELS keyed by NotifCategory, and two same-named
 * exports of different key types in neighbouring files is a guaranteed wrong
 * autoimport.
 */
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  downloads: "Download clients",
  automation: "Media automation",
  indexers: "Indexers",
  "media-servers": "Media servers",
  requests: "Requests and automation",
  monitoring: "Monitoring",
};

/** Service kinds in a category, in canonical SERVICE_IDS order. */
export function servicesInCategory(category: ServiceCategory): ServiceId[] {
  return SERVICE_IDS.filter((id) => SERVICE_CATALOG[id].category === category);
}

/**
 * Which ServiceSecrets fields the editor reads and writes for an auth shape.
 * `passwordOnly` still stores the username/password pair (with the username
 * field hidden), so it collapses to "userPass" here.
 *
 * This is the ONLY place that mapping lives. The editor uses it for the form
 * branch, the initial-configured snapshot, the dirty check and the secrets
 * write — a second inline copy is how a credential silently stops saving.
 */
export function secretsShapeFor(
  shape: ServiceAuthShape,
): "userPass" | "apiKey" {
  return shape === "apiKey" ? "apiKey" : "userPass";
}

/**
 * Substring match over the display name, the id, the tagline and the keywords.
 * Returns canonical order; an empty query returns every kind.
 *
 * Not debounced at the call site on purpose: this filters 25 in-memory strings
 * and never touches the network, unlike app/search.tsx (300ms) which fires a
 * request per keystroke.
 */
export function filterCatalog(query: string): ServiceId[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...SERVICE_IDS];
  return SERVICE_IDS.filter((id) => {
    const entry = SERVICE_CATALOG[id];
    return (
      SERVICE_DEFAULTS[id].name.toLowerCase().includes(q) ||
      id.includes(q) ||
      entry.tagline.toLowerCase().includes(q) ||
      entry.keywords.some((k) => k.includes(q))
    );
  });
}
