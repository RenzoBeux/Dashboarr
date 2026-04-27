export const SERVICE_IDS = [
  "qbittorrent",
  "radarr",
  "sonarr",
  "overseerr",
  "tautulli",
  "prowlarr",
  "plex",
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
  radarr: { name: "Radarr", defaultPort: 7878, apiBasePath: "/api/v3", pingPath: "/system/status" },
  sonarr: { name: "Sonarr", defaultPort: 8989, apiBasePath: "/api/v3", pingPath: "/system/status" },
  overseerr: { name: "Overseerr", defaultPort: 5055, apiBasePath: "/api/v1", pingPath: "/status" },
  tautulli: { name: "Tautulli", defaultPort: 8181, apiBasePath: "/api/v2", pingPath: "/home" },
  prowlarr: { name: "Prowlarr", defaultPort: 9696, apiBasePath: "/api/v1", pingPath: "/system/status" },
  plex: { name: "Plex", defaultPort: 32400, apiBasePath: "", pingPath: "/identity" },
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
  "radarr-queue",
  "calendar",
  "tautulli-activity",
  "overseerr-requests",
  "plex-now-playing",
  "prowlarr-stats",
  "bazarr-wanted",
  "wol-devices",
] as const;

export type WidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

// Curated initial set for fresh installs. Users add more via the picker.
export const DEFAULT_DASHBOARD_WIDGETS: WidgetId[] = [
  "service-health",
  "radarr-queue",
  "calendar",
];

// Old widget ids that have been renamed. Hydrate + import use this to remap
// stored values so users keep their dashboard layout across upgrades.
export const WIDGET_ID_RENAMES: Record<string, WidgetId> = {
  "sonarr-calendar": "calendar",
};

// MMKV key prefixes
export const STORAGE_KEYS = {
  services: "services",
  autoSwitchNetwork: "app.autoSwitchNetwork",
  homeSSID: "app.homeSSID",
  homeBSSID: "app.homeBSSID",
  dashboardWidgets: "app.dashboardWidgets",
  widgetSettings: "app.widgetSettings",
  // Legacy key — read-only fallback during one-time hydrate migration.
  dashboardOrderLegacy: "app.dashboardOrder",
  notificationSettings: "app.notificationSettings",
  wolDevices: "app.wolDevices",
  demoMode: "app.demoMode",
} as const;

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
