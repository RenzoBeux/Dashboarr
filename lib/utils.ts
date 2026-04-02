/**
 * Format bytes to human-readable string (e.g., 1.5 GB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
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
  const date = new Date(dateString);
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
 * Get ISO date string for today + offset days
 */
export function getDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}
