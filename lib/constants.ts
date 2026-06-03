export const SERVICE_IDS = [
  "qbittorrent",
  "rtorrent",
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

export const SERVICE_DEFAULTS: Record<
  ServiceId,
  { name: string; defaultPort: number; apiBasePath: string; pingPath: string }
> = {
  qbittorrent: {
    name: "qBittorrent",
    defaultPort: 8080,
    apiBasePath: "/api/v2",
    pingPath: "/app/version",
  },
  // rtorrent/ruTorrent speak XML-RPC over the SCGI HTTP mount, conventionally
  // /RPC2 (the mount ships in the standard ruTorrent web-server config and also
  // covers bare rtorrent). apiBasePath is that mount; users with a nested mount
  // include the prefix in their base URL. defaultPort is the web-server port in
  // front of rtorrent (not rtorrent's internal SCGI port). HTTP Basic auth.
  // The api module (services/rtorrent-api.ts) POSTs XML-RPC; there is no GET
  // ping endpoint, so pingPath is empty (the connection probe POSTs instead).
  rtorrent: {
    name: "rTorrent",
    defaultPort: 8080,
    apiBasePath: "/RPC2",
    pingPath: "",
  },
  // SAB has no REST routes — every call is /api?mode=<command>. The empty
  // pingPath combined with mode=version (injected as a param in pingService)
  // gives /api?mode=version&apikey=... at request time.
  sabnzbd: { name: "SABnzbd", defaultPort: 8080, apiBasePath: "/api", pingPath: "" },
  // NZBGet is JSON-RPC: every method is POST /jsonrpc with a JSON body. The
  // empty pingPath combined with the version method (issued as a POST in
  // pingService) gives /jsonrpc at request time.
  nzbget: { name: "NZBGet", defaultPort: 6789, apiBasePath: "/jsonrpc", pingPath: "" },
  radarr: { name: "Radarr", defaultPort: 7878, apiBasePath: "/api/v3", pingPath: "/system/status" },
  sonarr: { name: "Sonarr", defaultPort: 8989, apiBasePath: "/api/v3", pingPath: "/system/status" },
  // Lidarr is an *arr sibling but on the v1 API (not v3 like Radarr/Sonarr).
  lidarr: { name: "Lidarr", defaultPort: 8686, apiBasePath: "/api/v1", pingPath: "/system/status" },
  overseerr: { name: "Seerr", defaultPort: 5055, apiBasePath: "/api/v1", pingPath: "/status" },
  tautulli: { name: "Tautulli", defaultPort: 8181, apiBasePath: "/api/v2", pingPath: "/home" },
  // Tracearr's read-only public API lives under /api/v1/public with Bearer-token
  // auth (Authorization: Bearer trr_pub_<token>). /health is the authenticated
  // ping/probe endpoint. Default Docker port is 3000.
  tracearr: {
    name: "Tracearr",
    defaultPort: 3000,
    apiBasePath: "/api/v1/public",
    pingPath: "/health",
  },
  // JellyStat is a Jellyfin statistics server (analogous to Tautulli for Plex).
  // Its REST API lives at the server root (/stats, /api, /proxy) — no version
  // prefix — and authenticates with an `x-api-token` header (see
  // services/jellystat-api.ts). Default Docker port is 3000. getLibraryOverview
  // is a cheap authenticated GET used as the ping/probe endpoint.
  jellystat: {
    name: "Jellystat",
    defaultPort: 3000,
    apiBasePath: "",
    pingPath: "/stats/getLibraryOverview",
  },
  prowlarr: { name: "Prowlarr", defaultPort: 9696, apiBasePath: "/api/v1", pingPath: "/system/status" },
  plex: { name: "Plex", defaultPort: 32400, apiBasePath: "", pingPath: "/identity" },
  jellyfin: { name: "Jellyfin", defaultPort: 8096, apiBasePath: "", pingPath: "/System/Info/Public" },
  // Emby shares Jellyfin's API surface (same default port, root API path, and
  // public System/Info endpoint). See lib/media-server-config.ts.
  emby: { name: "Emby", defaultPort: 8096, apiBasePath: "", pingPath: "/System/Info/Public" },
  glances: { name: "Glances", defaultPort: 61208, apiBasePath: "/api/4", pingPath: "/cpu" },
  bazarr: { name: "Bazarr", defaultPort: 6767, apiBasePath: "/api", pingPath: "/system/status" },
};

export const POLLING_INTERVALS = {
  transferSpeed: 2000,
  activeTorrents: 5000,
  serviceHealth: 30000,
  queue: 30000,
  calendar: 60000,
} as const;

export const DASHBOARD_WIDGET_IDS = [
  "server-stats",
  "speed-stats",
  "service-health",
  "downloads",
  "sabnzbd-queue",
  "nzbget-queue",
  "radarr-queue",
  "lidarr-queue",
  "recently-downloaded",
  "calendar",
  "stream-monitor",
  "streaming-bandwidth",
  "overseerr-requests",
  "combined-now-playing",
  "plex-now-playing",
  "jellyfin-now-playing",
  "emby-now-playing",
  "prowlarr-stats",
  "bazarr-wanted",
  "wol-devices",
] as const;

export type WidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

// Curated initial set of widgets for the Default dashboard on fresh installs.
// Users add more via the picker, or create extra dashboards.
export const DEFAULT_DASHBOARD_WIDGETS: WidgetId[] = [
  "service-health",
  "radarr-queue",
  "calendar",
];

// Display name for the auto-created first dashboard. Surfaced verbatim in the
// dashboard picker on fresh installs and after legacy migration.
export const DEFAULT_DASHBOARD_NAME = "Default";

// Old widget ids that have been renamed. Hydrate + import use this to remap
// stored values so users keep their dashboard layout across upgrades.
export const WIDGET_ID_RENAMES: Record<string, WidgetId> = {
  "sonarr-calendar": "calendar",
  // The Tautulli-only "Now Playing" widget was generalized into a unified
  // Tautulli + Tracearr stream monitor. Existing dashboards keep their slot.
  "tautulli-activity": "stream-monitor",
};

// MMKV key prefixes
export const STORAGE_KEYS = {
  services: "services",
  autoSwitchNetwork: "app.autoSwitchNetwork",
  homeNetworks: "app.homeNetworks",
  // v14: per-user named dashboards, each with their own widget slots and
  // per-slot settings (so the same widget can appear with different instance
  // bindings on different dashboards).
  dashboards: "app.dashboards",
  activeDashboardId: "app.activeDashboardId",
  // Legacy keys — read-only fallback during one-time hydrate migration into
  // `dashboards`. Cleared after the migration runs.
  dashboardWidgetsLegacy: "app.dashboardWidgets",
  widgetSettingsLegacy: "app.widgetSettings",
  // Legacy key — read-only fallback for pre-widget-id dashboards.
  dashboardOrderLegacy: "app.dashboardOrder",
  notificationSettings: "app.notificationSettings",
  wolDevices: "app.wolDevices",
  demoMode: "app.demoMode",
  hapticsEnabled: "app.hapticsEnabled",
  globalCustomHeaders: "app.globalCustomHeaders",
  uiScale: "app.uiScale",
  // v17: user-defined display order for the Services tab tiles. Stored as a
  // ServiceId[]; unknown ids in this list are ignored at render time, and
  // any SERVICE_IDS missing from the list are appended in their canonical
  // order — so adding a new service kind ships with a sensible default.
  servicesOrder: "app.servicesOrder",
  // v18: cached network-state ("am I off my home network right now?"). The
  // auto-switch hook updates this on every home↔away transition. Persisted
  // so cold launches use last-known state for the brief moment before
  // NetInfo fires; NetInfo overwrites it on first event.
  networkAwayFromHome: "app.networkAwayFromHome",
  // v18 one-shot marker: pre-v18 builds clobbered useRemote with derived
  // network state. On first v18 launch the hydrate path resets useRemote
  // (only for installs that had auto-switch on) so the user starts from a
  // clean override; this flag prevents the reset from running twice.
  v18UseRemoteReset: "app.v18.useRemoteReset",
  // v22: one-shot flag for the multi-dashboard intro carousel. Set true on
  // first dismissal; the Settings → About → "Show workspace tour" row
  // resets it to false so users can replay.
  workspaceIntroSeen: "app.onboarding.workspaceIntroSeen",
  // One-shot flag for the Library tab's "swipe between Movies/TV" coachmark.
  // Set true once the hint has been dismissed (swipe, tap, or timeout) so it
  // never nags again.
  librarySwipeHintSeen: "app.onboarding.librarySwipeHintSeen",
  // Sticky hash→poster mapping for the Downloads widget. The *arr queue only
  // lists in-flight downloads, so without persistence the cover would vanish
  // the instant Radarr/Sonarr imports the file (#88). Populated additively
  // from queue + history; survives cold starts so seeding torrents still
  // render their posters on app open.
  torrentPosterCache: "app.torrentPosterCache",
} as const;

// Whitelisted UI scale multipliers. Kept as a const so the schema and the
// settings UI agree on the allowed set.
export const UI_SCALES = [1, 1.15, 1.3] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const DEFAULT_UI_SCALE: UiScale = 1;

// SecureStore key prefix
export const SECRET_PREFIX = "secrets";

// Standardized icon sizes
export const ICON = {
  XS: 12,
  SM: 16,
  MD: 20,
  LG: 24,
  XL: 32,
} as const;
