import type { RadarrHistoryRecord, SonarrHistoryRecord } from "@/lib/types";

// One imported entry from either Sonarr or Radarr, tagged with its source
// instance so the per-tile router push targets the right id space (movie /
// series ids aren't globally unique across instances of the same kind).
export type RecentItem =
  | {
      kind: "episode";
      record: SonarrHistoryRecord;
      instanceId: string;
      // Pulled out for sorting — `date` is optional on the record type.
      date: string;
    }
  | {
      kind: "movie";
      record: RadarrHistoryRecord;
      instanceId: string;
      date: string;
    };

/**
 * One tile in the Recently Downloaded widget. Usually a single import; with
 * episode grouping on, every import of the same series collapses into one tile
 * (issue #307) so a season batch can't push the rest of the feed off screen.
 */
export interface RecentGroup {
  /** Grouping identity — also the React key. */
  key: string;
  /** Newest import in the group; drives sort order and the tile subtitle. */
  date: string;
  /** Newest first, same order as the flat feed. */
  items: RecentItem[];
}

// Sonarr puts the series id at the top level on modern history records but
// leaves it out on some older ones, where only the embedded series carries it.
function seriesIdOf(record: SonarrHistoryRecord): number | undefined {
  return record.seriesId ?? record.series?.id;
}

/**
 * Merge a flat import feed into the tiles the widget renders, newest first.
 *
 * A series group takes the feed position of its newest episode, so grouping
 * never reorders the feed relative to what an ungrouped view would show — it
 * only collapses the follow-up episodes into the tile that was already there.
 */
export function groupRecentDownloads(
  items: RecentItem[],
  groupEpisodes: boolean,
): RecentGroup[] {
  // Newest first. Array.prototype.sort is stable, so records sharing a
  // timestamp keep the order their service returned them in.
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));

  const groups: RecentGroup[] = [];
  const bySeries = new Map<string, RecentGroup>();

  for (const item of sorted) {
    const seriesId =
      item.kind === "episode" ? seriesIdOf(item.record) : undefined;

    // Movies are one import each, and an episode whose series id is missing
    // has nothing to group on — both get a singleton keyed by record id.
    if (seriesId === undefined || !groupEpisodes) {
      groups.push({
        key: `${item.kind}:${item.instanceId}:${item.record.id}`,
        date: item.date,
        items: [item],
      });
      continue;
    }

    const key = `series:${item.instanceId}:${seriesId}`;
    const existing = bySeries.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const group: RecentGroup = { key, date: item.date, items: [item] };
    bySeries.set(key, group);
    groups.push(group);
  }

  return groups;
}
