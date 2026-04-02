export const SERVICE_IDS = [
  "qbittorrent",
  "radarr",
  "sonarr",
  "overseerr",
  "tautulli",
  "prowlarr",
  "plex",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export const SERVICE_DEFAULTS: Record<
  ServiceId,
  { name: string; defaultPort: number; apiBasePath: string }
> = {
  qbittorrent: {
    name: "qBittorrent",
    defaultPort: 8080,
    apiBasePath: "/api/v2",
  },
  radarr: { name: "Radarr", defaultPort: 7878, apiBasePath: "/api/v3" },
  sonarr: { name: "Sonarr", defaultPort: 8989, apiBasePath: "/api/v3" },
  overseerr: { name: "Overseerr", defaultPort: 5055, apiBasePath: "/api/v1" },
  tautulli: { name: "Tautulli", defaultPort: 8181, apiBasePath: "/api/v2" },
  prowlarr: { name: "Prowlarr", defaultPort: 9696, apiBasePath: "/api/v1" },
  plex: { name: "Plex", defaultPort: 32400, apiBasePath: "" },
};

export const POLLING_INTERVALS = {
  transferSpeed: 2000,
  activeTorrents: 5000,
  serviceHealth: 30000,
  queue: 30000,
  calendar: 60000,
} as const;

// MMKV key prefixes
export const STORAGE_KEYS = {
  services: "services",
  autoSwitchNetwork: "app.autoSwitchNetwork",
  homeSSID: "app.homeSSID",
} as const;

// SecureStore key prefix
export const SECRET_PREFIX = "secrets";
