export const SERVICE_IDS = [
  "qbittorrent",
  "radarr",
  "sonarr",
  "overseerr",
  "tautulli",
  "prowlarr",
  "plex",
  "glances",
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
};

export const POLLING_INTERVALS = {
  transferSpeed: 2000,
  activeTorrents: 5000,
  serviceHealth: 30000,
  queue: 30000,
  calendar: 60000,
} as const;

export const DASHBOARD_CARD_IDS = [
  "server-stats",
  "speed-stats",
  "service-health",
  "downloads",
  "radarr-queue",
  "sonarr-calendar",
  "tautulli-activity",
  "overseerr-requests",
  "plex-now-playing",
  "prowlarr-stats",
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];
export const DEFAULT_DASHBOARD_ORDER: DashboardCardId[] = [...DASHBOARD_CARD_IDS];

// MMKV key prefixes
export const STORAGE_KEYS = {
  services: "services",
  autoSwitchNetwork: "app.autoSwitchNetwork",
  homeSSID: "app.homeSSID",
  dashboardOrder: "app.dashboardOrder",
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
