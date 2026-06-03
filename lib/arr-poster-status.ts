import type { RadarrMovie, SonarrSeries, LidarrArtist, LidarrAlbum } from "@/lib/types";

/**
 * Sonarr/Radarr-style poster status indicators (issue #47).
 *
 * The bar-color logic is a faithful port of the *arr frontends so the colors
 * mean exactly what they mean in Sonarr/Radarr:
 *   - Sonarr: frontend/src/Utilities/Series/getProgressBarKind.ts
 *   - Radarr: frontend/src/Utilities/Movie/getProgressBarKind.ts
 * The corner triangle mirrors SeriesIndexPoster/MovieIndexPoster (top-right
 * ribbon): Sonarr shows red for `ended`, both show gray for `deleted`.
 */

export type PosterBarKind =
  | "purple"
  | "success"
  | "primary"
  | "danger"
  | "warning"
  | "default"
  | "inverse";

/** Bar-kind → hex. The 5 semantic kinds reuse the app theme (tailwind.config.ts). */
export const BAR_KIND_COLOR: Record<PosterBarKind, string> = {
  primary: "#3b82f6",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  purple: "#a855f7",
  default: "#71717a",
  inverse: "#52525b",
};

const CORNER_ENDED = "#ef4444"; // danger
const CORNER_DELETED = "#71717a"; // gray

/**
 * Port of Sonarr's getProgressBarKind(status, monitored, progress, isDownloading).
 * progress = episodeFileCount / episodeCount * 100 (no episodes ⇒ treated complete).
 */
export function sonarrBarKind(series: SonarrSeries, isDownloading: boolean): PosterBarKind {
  if (isDownloading) return "purple";

  const episodeCount = series.statistics?.episodeCount ?? series.episodeCount ?? 0;
  const episodeFileCount =
    series.statistics?.episodeFileCount ?? series.episodeFileCount ?? 0;
  const progress = episodeCount ? (episodeFileCount / episodeCount) * 100 : 100;

  if (progress === 100) {
    return series.status === "ended" ? "success" : "primary";
  }
  if (series.monitored) return "danger";
  return "warning";
}

/**
 * Port of Radarr's getProgressBarKind(status, monitored, hasFile, isAvailable,
 * isDownloading). Branches are evaluated in order; first match wins.
 */
export function radarrBarKind(movie: RadarrMovie, isDownloading: boolean): PosterBarKind {
  if (isDownloading) return "purple";
  if (movie.hasFile && movie.monitored) return "success";
  if (movie.hasFile && !movie.monitored) return "default";
  if (movie.status === "deleted") return "inverse";
  if (movie.isAvailable && movie.monitored) return "danger";
  if (!movie.monitored) return "warning";
  return "primary";
}

/**
 * Lidarr artist progress bar — same shape as Sonarr's series logic, but the
 * progress denominator is tracks (trackFileCount / trackCount). An `ended`
 * artist that's fully downloaded reads green; an in-progress monitored artist
 * reads red (missing), unmonitored reads amber.
 */
export function lidarrArtistBarKind(
  artist: LidarrArtist,
  isDownloading: boolean,
): PosterBarKind {
  if (isDownloading) return "purple";
  const trackCount = artist.statistics?.trackCount ?? 0;
  const fileCount = artist.statistics?.trackFileCount ?? 0;
  const progress = trackCount ? (fileCount / trackCount) * 100 : 100;
  if (progress >= 100) {
    return artist.status === "ended" ? "success" : "primary";
  }
  if (artist.monitored) return "danger";
  return "warning";
}

/**
 * Lidarr album progress bar — tracks present vs. expected on the album. A fully
 * downloaded album reads green; a monitored album missing tracks reads red;
 * unmonitored reads amber.
 */
export function lidarrAlbumBarKind(
  album: LidarrAlbum,
  isDownloading: boolean,
): PosterBarKind {
  if (isDownloading) return "purple";
  const trackCount = album.statistics?.trackCount ?? 0;
  const fileCount = album.statistics?.trackFileCount ?? 0;
  const progress = trackCount ? (fileCount / trackCount) * 100 : 100;
  if (progress >= 100) return "success";
  if (album.monitored) return "danger";
  return "warning";
}

/**
 * Top-right corner triangle color, or null for no triangle.
 * Sonarr: `ended` → red, `deleted` → gray. Radarr movie status is never
 * `ended`, so only `deleted` produces a triangle there.
 */
export function cornerColorFor(status: string): string | null {
  if (status === "ended") return CORNER_ENDED;
  if (status === "deleted") return CORNER_DELETED;
  return null;
}
