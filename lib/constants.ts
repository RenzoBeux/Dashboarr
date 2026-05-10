export const SERVICE_IDS = [
  "qbittorrent",
  "sabnzbd",
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
  // SAB has no REST routes — every call is /api?mode=<command>. The empty
  // pingPath combined with mode=version (injected as a param in pingService)
  // gives /api?mode=version&apikey=... at request time.
  sabnzbd: { name: "SABnzbd", defaultPort: 8080, apiBasePath: "/api", pingPath: "" },
  radarr: { name: "Radarr", defaultPort: 7878, apiBasePath: "/api/v3", pingPath: "/system/status" },
  sonarr: { name: "Sonarr", defaultPort: 8989, apiBasePath: "/api/v3", pingPath: "/system/status" },
  overseerr: { name: "Seerr", defaultPort: 5055, apiBasePath: "/api/v1", pingPath: "/status" },
  tautulli: { name: "Tautulli", defaultPort: 8181, apiBasePath: "/api/v2", pingPath: "/home" },
  prowlarr: { name: "Prowlarr", defaultPort: 9696, apiBasePath: "/api/v1", pingPath: "/system/status" },
  plex: { name: "Plex", defaultPort: 32400, apiBasePath: "", pingPath: "/identity" },
  jellyfin: { name: "Jellyfin", defaultPort: 8096, apiBasePath: "", pingPath: "/System/Info/Public" },
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
  "radarr-queue",
  "calendar",
  "tautulli-activity",
  "overseerr-requests",
  "plex-now-playing",
  "jellyfin-now-playing",
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
