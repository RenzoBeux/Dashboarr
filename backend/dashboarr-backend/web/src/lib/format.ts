export function relativeTime(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return "never";
  const diff = Math.max(0, now - ts);
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  return `${h}h ${m % 60}m`;
}

export function formatInterval(ms: number): string {
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.round(ms / 1000)}s`;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

const LABELS: Record<string, string> = {
  qbittorrent: "qBittorrent",
  rtorrent: "rTorrent",
  transmission: "Transmission",
  deluge: "Deluge",
  sabnzbd: "SABnzbd",
  nzbget: "NZBGet",
  radarr: "Radarr",
  sonarr: "Sonarr",
  lidarr: "Lidarr",
  bindery: "Bindery",
  overseerr: "Seerr",
  tautulli: "Tautulli",
  tracearr: "Tracearr",
  jellystat: "JellyStat",
  prowlarr: "Prowlarr",
  jackett: "Jackett",
  nzbhydra2: "NZBHydra2",
  plex: "Plex",
  jellyfin: "Jellyfin",
  emby: "Emby",
  navidrome: "Navidrome",
  glances: "Glances",
  bazarr: "Bazarr",
  unraid: "Unraid",
  tdarr: "Tdarr",
  autobrr: "Autobrr",
  cleanuparr: "Cleanuparr",
  pihole: "Pi-hole",
};

export function serviceLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

export function platformLabel(platform: string): string {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  return platform;
}
