import { formatEpisodeCode, formatRuntime } from "@/lib/utils";
import type { PlexMediaItem } from "@/lib/types";

// Pure display and link helpers for Plex library items, shared by the Plex
// tab, its library browser and the item detail screen. RN-free so it stays
// unit-testable.

const CONTAINER_TYPES = new Set<PlexMediaItem["type"]>(["show", "season", "artist", "album"]);

/** Whether the item has a children listing (seasons, episodes, albums, tracks). */
export function plexHasChildren(item: Pick<PlexMediaItem, "type" | "key">): boolean {
  return CONTAINER_TYPES.has(item.type) || item.key.endsWith("/children");
}

/**
 * Portrait artwork for an item. Episodes and tracks have no poster of their
 * own (an episode's thumb is a 16:9 still), so they borrow the season/show or
 * album art.
 */
export function plexPosterPath(item: PlexMediaItem): string | undefined {
  if (item.type === "episode" || item.type === "track") {
    return item.parentThumb || item.grandparentThumb || item.thumb || undefined;
  }
  return item.thumb || item.parentThumb || item.grandparentThumb || undefined;
}

/** Wide artwork for the detail hero. An episode's own still beats the show art. */
export function plexBackdropPath(item: PlexMediaItem): string | undefined {
  if (item.type === "episode") return item.thumb || item.art || undefined;
  return item.art || undefined;
}

/** Plex reports videoResolution as "4k", "1080", "720", "sd" and so on. */
export function plexResolutionLabel(resolution?: string | null): string | undefined {
  if (!resolution) return undefined;
  const value = resolution.toLowerCase();
  if (value === "4k") return "4K";
  if (value === "sd") return "SD";
  if (/^\d+$/.test(value)) return `${value}p`;
  return resolution.toUpperCase();
}

/** Plex durations are milliseconds. */
export function plexRuntimeLabel(durationMs?: number | null): string | undefined {
  if (!durationMs || durationMs <= 0) return undefined;
  return formatRuntime(Math.max(1, Math.round(durationMs / 60000)));
}

function countLabel(count: number | undefined, singular: string, plural: string) {
  if (count === undefined || count === null) return undefined;
  return `${count} ${count === 1 ? singular : plural}`;
}

function episodeCode(item: PlexMediaItem): string | undefined {
  if (item.parentIndex === undefined || item.index === undefined) return undefined;
  return formatEpisodeCode(item.parentIndex, item.index);
}

function join(parts: (string | number | undefined | null | false)[]): string {
  return parts.filter((p) => p !== undefined && p !== null && p !== false && p !== "").join(" · ");
}

/** The line under the title on the detail hero. */
export function plexMetaLine(item: PlexMediaItem): string {
  switch (item.type) {
    case "movie":
      return join([item.year, plexRuntimeLabel(item.duration)]);
    case "show":
      return join([item.year, countLabel(item.childCount, "season", "seasons")]);
    case "season":
      return join([item.parentTitle, countLabel(item.leafCount, "episode", "episodes")]);
    case "episode":
      return join([item.grandparentTitle, episodeCode(item), plexRuntimeLabel(item.duration)]);
    case "album":
      return join([item.parentTitle, item.year]);
    case "track":
      return join([item.grandparentTitle, item.parentTitle]);
    default:
      return join([item.year]);
  }
}

/** Secondary line for a row in a children list. */
export function plexChildSubtitle(item: PlexMediaItem): string {
  switch (item.type) {
    case "season": {
      const watched =
        item.viewedLeafCount && item.leafCount && item.viewedLeafCount < item.leafCount
          ? `${item.viewedLeafCount} watched`
          : undefined;
      return join([countLabel(item.leafCount, "episode", "episodes"), watched]);
    }
    case "episode":
      return join([plexRuntimeLabel(item.duration), item.originallyAvailableAt]);
    case "album":
      return join([item.year, countLabel(item.leafCount, "track", "tracks")]);
    case "track":
      return join([plexRuntimeLabel(item.duration)]);
    default:
      return join([item.year]);
  }
}

/**
 * Fully watched: a played leaf, or a container whose every episode was played.
 */
export function plexIsWatched(item: PlexMediaItem): boolean {
  if (item.leafCount !== undefined) {
    return item.leafCount > 0 && (item.viewedLeafCount ?? 0) >= item.leafCount;
  }
  return (item.viewCount ?? 0) > 0;
}

/**
 * Offset of the next library page, or undefined when done. Stops once the
 * loaded count reaches the server's total, and on an empty page so a server
 * that ignores the offset can't page forever.
 */
export function plexLibraryNextOffset(
  lastPage: { items: unknown[]; totalSize: number },
  allPages: { items: unknown[] }[],
): number | undefined {
  if (lastPage.items.length === 0) return undefined;
  const loaded = allPages.reduce((n, page) => n + page.items.length, 0);
  return loaded < lastPage.totalSize ? loaded : undefined;
}

// Deep links into Plex's own apps, in the format Overseerr uses
// (server/entity/Media.ts, setPlexUrls). Both key the server by its machine
// identifier from GET /identity.

function metadataKey(ratingKey: string): string {
  return encodeURIComponent(`/library/metadata/${ratingKey}`);
}

/** Opens the item's page in the Plex iOS app. */
export function plexAppUrl(machineIdentifier: string, ratingKey: string): string {
  return `plex://preplay/?metadataKey=${metadataKey(ratingKey)}&server=${machineIdentifier}`;
}

/** Opens the item's page in Plex Web. */
export function plexWebUrl(machineIdentifier: string, ratingKey: string): string {
  return `https://app.plex.tv/desktop#!/server/${machineIdentifier}/details?key=${metadataKey(ratingKey)}`;
}
