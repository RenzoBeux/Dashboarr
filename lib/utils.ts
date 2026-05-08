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
 * Format audio channels number to label (e.g. 7.1, 5.1, 2.0)
 */
export function formatAudioChannels(channels: number): string {
  if (channels >= 7) return "7.1";
  if (channels >= 5) return "5.1";
  if (channels >= 2) return "2.0";
  return `${channels}`;
}

/**
 * Format video resolution string from mediaInfo resolution (e.g. "1920x1080" → "1080p", "3840x2160" → "4K")
 */
export function formatResolution(resolution: string): string {
  const height = parseInt(resolution.split("x")[1] || resolution, 10);
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return resolution;
}

/**
 * Compact age label for a release. Prefers ageHours/ageMinutes when fresh so
 * "12m" / "3h" surface instead of "0d" for new uploads.
 */
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
