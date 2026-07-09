/**
 * Combine 32-bit Hi/Lo halves of a 64-bit integer field. NZBGet's JSON-RPC
 * splits sizes this way to stay within JSON's safe-integer range (e.g.
 * `FileSizeLo` + `FileSizeHi`). Reassembled values above 2^53 lose precision —
 * acceptable for byte counts up to ~9 PB which is well beyond Usenet usage.
 */
export function combineHiLo(hi: number, lo: number): number {
  return hi * 0x100000000 + lo;
}

/**
 * Format bytes to human-readable string (e.g., 1.5 GB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Format bytes/second to speed string (e.g., 12.5 MB/s)
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format a kilobit/second value as a streaming bitrate (e.g., 18.4 Mbps,
 * 1.20 Gbps). Streaming bandwidth is conventionally read in bits, not bytes —
 * use this (not formatSpeed) for Plex/Tautulli/Jellyfin/Emby throughput.
 */
export function formatBitrate(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps <= 0) return "0 Mbps";
  const mbps = kbps / 1000;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps >= 100) return `${Math.round(mbps)} Mbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

/**
 * Format seconds to ETA string (e.g., 2h 15m, 45m, 30s)
 */
export function formatEta(seconds: number): string {
  if (seconds <= 0 || seconds === 8640000) return "\u221E"; // infinity for unknown
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Format a runtime in minutes (e.g., 138 → "2h 18m", 45 → "45m")
 */
export function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Format a percentage (0-1 float to "45.2%")
 */
export function formatProgress(progress: number): string {
  return `${(progress * 100).toFixed(1)}%`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}

/**
 * Display name (`dn` param) from a magnet URI, or null when absent/malformed.
 */
export function magnetDisplayName(uri: string): string | null {
  const match = uri.match(/[?&]dn=([^&]+)/);
  if (!match) return null;
  try {
    const name = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Format season/episode as S01E05
 */
export function formatEpisodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

/**
 * Relative date string (Today, Tomorrow, Mon Apr 7, etc.)
 */
export function relativeDate(dateString: string): string {
  // Date-only strings (YYYY-MM-DD, e.g. Sonarr's airDate) get parsed as UTC
  // midnight by `new Date(...)`, which lands on the previous local day for any
  // timezone west of UTC. Anchor those at local midnight instead so today's
  // airdate doesn't show as "Yesterday".
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? new Date(`${dateString}T00:00:00`)
    : new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Local YYYY-MM-DD key for a Date (defaults to now). Use this instead of
 * `toISOString().split("T")[0]` whenever the key represents the user's
 * calendar day — `toISOString` is UTC and disagrees with local day at TZ
 * boundaries (always for east-of-UTC users; late evening for west-of-UTC).
 */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get local YYYY-MM-DD for today + offset days.
 */
export function getDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/**
 * Calendar-day key for a Sonarr episode, matching Sonarr's web UI: the
 * device-local day of the UTC airing instant (airDateUtc), NOT the network's
 * airDate. A Tuesday-evening US airing is Wednesday for viewers east of the
 * US; Sonarr web shows Wednesday, so we must too (issue #86). Falls back to
 * airDate when airDateUtc is missing/unparsable (TBA entries); null if neither.
 */
export function airDateKey(ep: {
  airDate?: string;
  airDateUtc?: string;
}): string | null {
  if (ep.airDateUtc) {
    const d = new Date(ep.airDateUtc);
    if (!Number.isNaN(d.getTime())) return localDateKey(d);
  }
  return ep.airDate ?? null;
}

/**
 * Calendar-day key for a Radarr release datetime (inCinemas/digitalRelease/
 * physicalRelease), matching Radarr's web UI: the device-local day of the UTC
 * instant — never `.split("T")[0]` (the UTC day). Date-only strings are
 * returned verbatim (new Date("YYYY-MM-DD") parses as UTC midnight and would
 * shift the day west of UTC). Null for missing/unparsable input.
 */
export function releaseDateKey(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : localDateKey(d);
}

/**
 * Format audio channels number to label (e.g. 7.1, 5.1, 2.0)
 */
export function formatAudioChannels(channels: number): string {
  if (channels >= 7) return "7.1";
  if (channels >= 5) return "5.1";
  if (channels >= 2) return "2.0";
  return `${channels}`;
}

/**
 * Format video resolution string from mediaInfo resolution (e.g. "1920x1080" → "1080p", "3840x2160" → "4K").
 *
 * Bucket by the longest dimension, not the height. Cinemascope 4K rips are
 * commonly cropped to remove black bars, leaving sizes like 3840x2080 or
 * 3840x1600 — height alone would mis-bucket those as 1080p. The longest side
 * stays anchored to the standard width (3840 / 1920 / 1280 / 720) regardless
 * of crop, so it's the reliable axis to classify on.
 */
export function formatResolution(resolution: string): string {
  const [a, b] = resolution.split("x").map((n) => parseInt(n, 10));
  const longest = Math.max(
    Number.isFinite(a) ? a : 0,
    Number.isFinite(b) ? b : 0,
  );
  if (longest >= 3000) return "4K";
  if (longest >= 1800) return "1080p";
  if (longest >= 1200) return "720p";
  if (longest >= 700) return "480p";
  return resolution;
}

/**
 * Compact age label for a release. Prefers ageHours/ageMinutes when fresh so
 * "12m" / "3h" surface instead of "0d" for new uploads.
 */
/**
 * Compact "time ago" label for an absolute timestamp, with finer granularity
 * than relativeDate (which is day-only). Used for history entries ("grabbed 3h
 * ago"). Falls back to an absolute short date once past a week.
 */
export function formatTimeAgo(dateString?: string): string {
  if (!dateString) return "";
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(seconds / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatReleaseAge(
  ageDays: number,
  ageHours?: number,
  ageMinutes?: number,
): string {
  if (ageMinutes !== undefined && ageMinutes < 60) return `${Math.max(0, Math.round(ageMinutes))}m`;
  if (ageHours !== undefined && ageHours < 24) return `${Math.max(0, Math.round(ageHours))}h`;
  if (ageDays < 1) {
    if (ageHours !== undefined) return `${Math.max(0, Math.round(ageHours))}h`;
    return "<1d";
  }
  if (ageDays < 30) return `${Math.round(ageDays)}d`;
  if (ageDays < 365) return `${Math.round(ageDays / 30)}mo`;
  return `${(ageDays / 365).toFixed(1)}y`;
}
