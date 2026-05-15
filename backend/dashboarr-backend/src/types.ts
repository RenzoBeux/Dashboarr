import { z } from "zod";

export const SERVICE_IDS = [
  "qbittorrent",
  "sabnzbd",
  "nzbget",
  "radarr",
  "sonarr",
  "overseerr",
  "tautulli",
  "prowlarr",
  "plex",
  "jellyfin",
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

export const notificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  torrentCompleted: z.boolean().default(true),
  sabnzbdCompleted: z.boolean().default(true),
  nzbgetCompleted: z.boolean().default(true),
  radarrDownloaded: z.boolean().default(true),
  sonarrDownloaded: z.boolean().default(true),
  serviceOffline: z.boolean().default(true),
  overseerrNewRequest: z.boolean().default(true),
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
};

/**
 * Either shape is accepted: the new app sends `instances`, older builds send
 * `services`. The route handler normalizes both to ServiceInstancePayload[]
 * before persisting (see routes/config.ts).
 */
export const configPayloadSchema = z
  .object({
    services: z.array(serviceConfigSchema).optional(),
    instances: z.array(serviceInstanceSchema).optional(),
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
  sabnzbd: "/api",
  nzbget: "/jsonrpc",
  radarr: "/api/v3",
  sonarr: "/api/v3",
  overseerr: "/api/v1",
  tautulli: "/api/v2",
  prowlarr: "/api/v1",
  plex: "",
  jellyfin: "",
  glances: "/api/4",
  bazarr: "/api",
};

export const SERVICE_PING_PATH: Record<ServiceId, string> = {
  qbittorrent: "/app/version",
  // SAB has no path-based ping endpoint — pingService synthesises ?mode=version.
  sabnzbd: "",
  // NZBGet uses JSON-RPC POST to /jsonrpc; ping logic POSTs the version method.
  nzbget: "",
  radarr: "/system/status",
  sonarr: "/system/status",
  overseerr: "/status",
  tautulli: "/home",
  prowlarr: "/system/status",
  plex: "/identity",
  jellyfin: "/System/Info/Public",
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
  | "overseerrNewRequest";

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
