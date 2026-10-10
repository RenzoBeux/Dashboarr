import { groupBy } from "@/lib/group-by";
import { localDateKey, relativeDate } from "@/lib/utils";
import type { BazarrHistoryItem } from "@/lib/types";

/**
 * Bazarr history view logic: what each action means, when it happened, and
 * how movie and episode history merge into one day-grouped list. Pure.
 */

export type HistoryActionKind =
  | "deleted"
  | "downloaded"
  | "manual"
  | "upgraded"
  | "uploaded"
  | "synced"
  | "translated"
  | "extracted"
  | "unknown";

// Bazarr's HistoryAction enum (frontend/src/components/bazarr/HistoryIcon.tsx).
const ACTIONS: Record<number, { kind: HistoryActionKind; label: string }> = {
  0: { kind: "deleted", label: "Deleted" },
  1: { kind: "downloaded", label: "Downloaded" },
  2: { kind: "manual", label: "Downloaded manually" },
  3: { kind: "upgraded", label: "Upgraded" },
  4: { kind: "uploaded", label: "Uploaded" },
  5: { kind: "synced", label: "Synced" },
  6: { kind: "translated", label: "Translated" },
  7: { kind: "extracted", label: "Extracted" },
};

export function historyActionMeta(action: number): { kind: HistoryActionKind; label: string } {
  return ACTIONS[action] ?? { kind: "unknown", label: "Changed" };
}

/**
 * When the entry happened. Bazarr only sends `parsed_timestamp`, formatted
 * with Python's locale-dependent "%x %X": "10/09/26 14:22:05" in the C locale
 * Docker images run, "10/09/2026 02:22:05 PM" in en_US, "09.10.2026 14:22:05"
 * in de_DE. ISO strings are accepted too. Anything else is null and lands in
 * an "Earlier" group rather than being guessed at.
 */
export function parseBazarrTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const iso = new Date(value);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }
  const m =
    /^(\d{1,2})([/.])(\d{1,2})\2(\d{2}|\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(value);
  if (!m) return null;
  const [, a, sep, b, y, hh, mm, ss, ampm] = m;
  // Slashes are month-first (US / C locale); dots are day-first (European).
  const month = Number(sep === "/" ? a : b);
  const day = Number(sep === "/" ? b : a);
  let year = Number(y);
  if (y.length === 2) year += 2000;
  let hour = Number(hh);
  if (ampm) {
    const pm = ampm.toLowerCase() === "pm";
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const date = new Date(year, month - 1, day, hour, Number(mm), Number(ss ?? 0));
  return Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 ? null : date;
}

export type HistoryKind = "movie" | "episode";

export interface HistoryEntry {
  key: string;
  kind: HistoryKind;
  item: BazarrHistoryItem;
  at: Date | null;
}

/**
 * Merge movie and episode history (each newest first, possibly paged) into
 * one newest-first list. When a stream still has more pages, entries older
 * than its last loaded one are held back — they might sort below entries of
 * that stream not yet loaded — so "All" never shows an out-of-order gap.
 */
export function mergeHistoryStreams(
  movies: readonly BazarrHistoryItem[],
  episodes: readonly BazarrHistoryItem[],
  more: { movies: boolean; episodes: boolean },
): HistoryEntry[] {
  const tag = (kind: HistoryKind) => (item: BazarrHistoryItem, i: number): HistoryEntry => ({
    key: `${kind}-${i}-${item.parsed_timestamp ?? item.timestamp}-${item.radarrId ?? item.sonarrEpisodeId ?? ""}`,
    kind,
    item,
    at: parseBazarrTimestamp(item.parsed_timestamp),
  });
  const m = movies.map(tag("movie"));
  const e = episodes.map(tag("episode"));

  const lastAt = (list: HistoryEntry[]) => list[list.length - 1]?.at?.getTime();
  let cutoff = -Infinity;
  if (more.movies && m.length > 0) cutoff = Math.max(cutoff, lastAt(m) ?? -Infinity);
  if (more.episodes && e.length > 0) cutoff = Math.max(cutoff, lastAt(e) ?? -Infinity);

  return [...m, ...e]
    .filter((entry) => !entry.at || entry.at.getTime() >= cutoff)
    .sort((x, y) => (y.at?.getTime() ?? -Infinity) - (x.at?.getTime() ?? -Infinity));
}

export const EARLIER_GROUP = "earlier";

/** Day sections ("Today", "Yesterday", "Mon Oct 6", "Earlier"), newest first. */
export function groupHistoryByDay(
  entries: readonly HistoryEntry[],
): { key: string; label: string; entries: HistoryEntry[] }[] {
  return groupBy(entries, (e) => (e.at ? localDateKey(e.at) : EARLIER_GROUP)).map((g) => ({
    key: g.key,
    label: g.key === EARLIER_GROUP ? "Earlier" : relativeDate(g.key),
    entries: g.items,
  }));
}
