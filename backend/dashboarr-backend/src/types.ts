import { z } from "zod";

// Keep this list in sync with the app's SERVICE_IDS (lib/constants.ts). The app
// pushes a config entry for every kind it knows about, so any kind missing here
// is rejected by `kind`'s enum below — and because one bad entry fails the whole
// `PUT /config`, that silently disables ALL push notifications, not just the
// unknown service. `configPayloadSchema` now drops unknown kinds defensively
// (see dropUnknownKinds), but this list should still mirror the app.
export const SERVICE_IDS = [
  "qbittorrent",
  "rtorrent",
  "transmission",
  "sabnzbd",
  "nzbget",
  "radarr",
  "sonarr",
  "lidarr",
  "overseerr",
  "tautulli",
  "tracearr",
  "jellystat",
  "prowlarr",
  "plex",
  "jellyfin",
  "emby",
  "glances",
  "bazarr",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export const serviceIdSchema = z.enum(SERVICE_IDS);

/**
 * Empty string or a real http(s) URL. Reject other schemes (file://, gopher://,
 * javascript:) so a compromised / misconfigured paired device can't turn the
 * backend's pollers into an SSRF primitive against internal network resources.
 */
const httpUrlOrEmpty = z.string().refine(
  (v) => {
    if (v === "") return true;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "must be empty or an http(s) URL" },
);

// Length caps are belt-and-suspenders against a misbehaving or malicious
// paired device writing multi-MB blobs into SQLite. Real API keys / creds
// are orders of magnitude smaller than these limits.
const sharedServiceFields = {
  enabled: z.boolean(),
  name: z.string().max(200),
  localUrl: httpUrlOrEmpty.default(""),
  remoteUrl: httpUrlOrEmpty.default(""),
  useRemote: z.boolean().default(false),
  apiKey: z.string().max(4096).optional(),
  username: z.string().max(256).optional(),
  password: z.string().max(256).optional(),
  wolMac: z.string().max(32).optional(),
  pollMs: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(),
};

/**
 * Legacy single-instance shape (pre-multi-instance app). One entry per
 * service kind; `id` is the ServiceId. Still accepted by PUT /config so a
 * backend upgrade doesn't strand users running an older app build.
 */
export const serviceConfigSchema = z.object({
  id: serviceIdSchema,
  ...sharedServiceFields,
});

export type ServiceConfigPayload = z.infer<typeof serviceConfigSchema>;

/**
 * Multi-instance shape. `id` is the app-side instance UUID (stable across
 * config pushes); `kind` is the service kind. Two Radarrs from one app would
 * arrive as two entries with kind="radarr" and different `id`s.
 */
export const serviceInstanceSchema = z.object({
  id: z.string().min(1).max(128),
  kind: serviceIdSchema,
  ...sharedServiceFields,
});

export type ServiceInstancePayload = z.infer<typeof serviceInstanceSchema>;

// v21: per-instance overrides keyed by instance UUID. A category absent from
// an instance's record falls through to the global category toggle above.
// Sent as `undefined` by older clients; defaulted to an empty record so the
// dispatcher can always read `settings.perInstance?.[id]` safely.
export const notifCategoryEnum = z.enum([
  "torrentCompleted",
  "sabnzbdCompleted",
  "nzbgetCompleted",
  "radarrDownloaded",
  "sonarrDownloaded",
  "serviceOffline",
  "overseerrNewRequest",
  // Tracearr webhook events. Surfaced per-instance only (no global toggle),
  // so a Tracearr push only respects these when the webhook URL carries
  // ?instance=<uuid>; otherwise the global defaults below apply.
  "tracearrViolation",
  "tracearrNewDevice",
  "tracearrTrustScore",
  "tracearrServerDown",
  "tracearrServerUp",
  "tracearrStreamStarted",
  "tracearrStreamStopped",
]);

export type NotifCategory = z.infer<typeof notifCategoryEnum>;

// Each instance maps to a subset of category booleans (records in Zod are
// inherently partial — omitted keys mean "no override for that category").
export const perInstanceOverridesSchema = z
  .record(z.string().min(1), z.record(notifCategoryEnum, z.boolean()))
  .optional();

export const notificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  torrentCompleted: z.boolean().default(true),
  sabnzbdCompleted: z.boolean().default(true),
  nzbgetCompleted: z.boolean().default(true),
  radarrDownloaded: z.boolean().default(true),
  sonarrDownloaded: z.boolean().default(true),
  serviceOffline: z.boolean().default(true),
  overseerrNewRequest: z.boolean().default(true),
  // Tracearr — defaults mirror Tracearr's own webhook-channel routing.
  tracearrViolation: z.boolean().default(true),
  tracearrNewDevice: z.boolean().default(true),
  tracearrTrustScore: z.boolean().default(false),
  tracearrServerDown: z.boolean().default(true),
  tracearrServerUp: z.boolean().default(true),
  tracearrStreamStarted: z.boolean().default(false),
  tracearrStreamStopped: z.boolean().default(false),
  perInstance: perInstanceOverridesSchema,
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  torrentCompleted: true,
  sabnzbdCompleted: true,
  nzbgetCompleted: true,
  radarrDownloaded: true,
  sonarrDownloaded: true,
  serviceOffline: true,
  overseerrNewRequest: true,
  tracearrViolation: true,
  tracearrNewDevice: true,
  tracearrTrustScore: false,
  tracearrServerDown: true,
  tracearrServerUp: true,
  tracearrStreamStarted: false,
  tracearrStreamStopped: false,
};

const KNOWN_SERVICE_IDS = new Set<string>(SERVICE_IDS);

/**
 * Drop array entries whose service kind this backend doesn't recognize instead
 * of rejecting the whole config payload. The app sends a default entry for EVERY
 * kind it knows about (enabled or not), so when a newer app adds a service this
 * backend version predates, a strict `kind` enum would fail the entire
 * `PUT /config` and silently disable ALL push notifications — not just the
 * unknown service. (That is exactly how rtorrent/lidarr/jellystat bricked
 * notifications before they were added to SERVICE_IDS.) Unknown kinds are
 * harmless to drop: the scheduler has no poller for them anyway. The kind lives
 * in `id` for the legacy `services` shape and in `kind` for `instances`.
 */
function dropUnknownKinds(keyField: "id" | "kind") {
  return (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    return value.filter((entry) => {
      if (entry === null || typeof entry !== "object") return false;
      const kind = (entry as Record<string, unknown>)[keyField];
      return typeof kind === "string" && KNOWN_SERVICE_IDS.has(kind);
    });
  };
}

/**
 * Either shape is accepted: the new app sends `instances`, older builds send
 * `services`. The route handler normalizes both to ServiceInstancePayload[]
 * before persisting (see routes/config.ts). Unknown service kinds are filtered
 * out first (see dropUnknownKinds) so a newer app never 400s the whole config.
 */
export const configPayloadSchema = z
  .object({
    services: z.preprocess(dropUnknownKinds("id"), z.array(serviceConfigSchema).optional()),
    instances: z.preprocess(dropUnknownKinds("kind"), z.array(serviceInstanceSchema).optional()),
    notifications: notificationSettingsSchema,
  })
  .refine((p) => p.services !== undefined || p.instances !== undefined, {
    message: "must include either `services` or `instances`",
  });

export type ConfigPayload = z.infer<typeof configPayloadSchema>;

export const pairClaimSchema = z.object({
  token: z.string().min(1),
  expoPushToken: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().optional(),
});

export type PairClaimRequest = z.infer<typeof pairClaimSchema>;

export const deviceRegisterSchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().optional(),
});

export const SERVICE_API_BASE: Record<ServiceId, string> = {
  qbittorrent: "/api/v2",
  rtorrent: "/RPC2",
  transmission: "/transmission/rpc",
  sabnzbd: "/api",
  nzbget: "/jsonrpc",
  radarr: "/api/v3",
  sonarr: "/api/v3",
  lidarr: "/api/v1",
  overseerr: "/api/v1",
  tautulli: "/api/v2",
  tracearr: "/api/v1/public",
  jellystat: "",
  prowlarr: "/api/v1",
  plex: "",
  jellyfin: "",
  emby: "",
  glances: "/api/4",
  bazarr: "/api",
};

export const SERVICE_PING_PATH: Record<ServiceId, string> = {
  qbittorrent: "/app/version",
  // rTorrent is XML-RPC over the /RPC2 mount; there is no GET ping path (the
  // app pings it with an XML-RPC POST). No backend poller uses this today.
  rtorrent: "",
  // Transmission is JSON-RPC over /transmission/rpc; the ping POSTs session-get
  // (see pingService), so there is no GET ping path.
  transmission: "",
  // SAB has no path-based ping endpoint — pingService synthesises ?mode=version.
  sabnzbd: "",
  // NZBGet uses JSON-RPC POST to /jsonrpc; ping logic POSTs the version method.
  nzbget: "",
  radarr: "/system/status",
  sonarr: "/system/status",
  // Lidarr is an *arr sibling on the v1 API; same status ping as Radarr/Sonarr.
  lidarr: "/system/status",
  overseerr: "/status",
  tautulli: "/home",
  // Tracearr's /health is Bearer-authed, so it doubles as a reachability +
  // auth probe (mirrors the app's runConnectionProbe).
  tracearr: "/health",
  // JellyStat's REST API is root-mounted; a cheap authenticated GET doubles as
  // the reachability probe (mirrors the app). No backend poller uses this today.
  jellystat: "/stats/getLibraryOverview",
  prowlarr: "/system/status",
  plex: "/identity",
  jellyfin: "/System/Info/Public",
  emby: "/System/Info/Public",
  glances: "/cpu",
  bazarr: "/system/status",
};

// Notification category labels sent to the device as `data.type`
export type NotificationCategory =
  | "torrentCompleted"
  | "sabnzbdCompleted"
  | "nzbgetCompleted"
  | "radarrDownloaded"
  | "sonarrDownloaded"
  | "serviceOffline"
  | "overseerrNewRequest"
  | "tracearrViolation"
  | "tracearrNewDevice"
  | "tracearrTrustScore"
  | "tracearrServerDown"
  | "tracearrServerUp"
  | "tracearrStreamStarted"
  | "tracearrStreamStopped";

export interface PushEvent {
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Used for dedupe — if set, backend won't send duplicate pushes for the same key. */
  dedupeKey?: string;
  /**
   * Ignore the per-category notification toggle. Used by the "send test push"
   * button so the test works even when the chosen category is disabled.
   * The global `notifications.enabled` master flag is still respected.
   */
  bypassCategory?: boolean;
}
