import type { RadarrMovie } from "@/lib/types";

/** The three dates Radarr tracks for a movie, as user-selectable options. */
export type RadarrReleaseKind = "cinemas" | "digital" | "physical";

export const RADARR_RELEASE_KINDS: readonly RadarrReleaseKind[] = [
  "cinemas",
  "digital",
  "physical",
];

export function parseReleaseTime(d?: string): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

// Must sort identically to Radarr's own "Release Date" option, which uses the
// server-computed `releaseDate` (Movie.GetReleaseDate(), keyed off
// minimumAvailability). The local computation below replicates it for Radarr
// servers older than 5.10 that don't send `releaseDate`.
export function radarrReleaseTime(m: RadarrMovie): number | null {
  const fromServer = parseReleaseTime(m.releaseDate);
  if (fromServer !== null) return fromServer;

  const cinema = parseReleaseTime(m.inCinemas);
  if (m.minimumAvailability === "tba" || m.minimumAvailability === "announced") {
    const all = [
      cinema,
      parseReleaseTime(m.digitalRelease),
      parseReleaseTime(m.physicalRelease),
    ].filter((t): t is number => t !== null);
    return all.length ? Math.min(...all) : null;
  }
  if (m.minimumAvailability === "inCinemas" && cinema !== null) return cinema;
  const home = [
    parseReleaseTime(m.digitalRelease),
    parseReleaseTime(m.physicalRelease),
  ].filter((t): t is number => t !== null);
  if (home.length) return Math.min(...home);
  return cinema !== null ? cinema + 90 * 24 * 60 * 60 * 1000 : null;
}

/**
 * The first date a movie has among `kinds`, in Radarr's own
 * digital → physical → cinemas preference order. Returns null when the movie
 * carries none of the requested dates — callers drop the movie rather than
 * falling back, so a narrowed selection never silently reintroduces a date the
 * user excluded.
 */
export function pickRadarrReleaseDate(
  m: RadarrMovie,
  kinds: readonly RadarrReleaseKind[],
): string | null {
  const has = (k: RadarrReleaseKind) => kinds.includes(k);
  if (has("digital") && m.digitalRelease) return m.digitalRelease;
  if (has("physical") && m.physicalRelease) return m.physicalRelease;
  if (has("cinemas") && m.inCinemas) return m.inCinemas;
  return null;
}

/** Whether a selection covers every release kind, i.e. the "Any" setting. */
export function isEveryReleaseKind(
  kinds: readonly RadarrReleaseKind[],
): boolean {
  return RADARR_RELEASE_KINDS.every((k) => kinds.includes(k));
}

/**
 * The timestamp the Still Pending widget dates a movie by, honoring the user's
 * "Movie release date" selection (issue #355).
 *
 * Selecting every kind — "Any", the default — defers to `radarrReleaseTime`,
 * which follows the movie's own Minimum Availability. That is the pre-#355
 * behavior, so existing dashboards don't shift under anyone.
 *
 * A narrower selection dates the movie by `pickRadarrReleaseDate` instead, so
 * e.g. picking Digital only stops a movie from reading as overdue from its
 * theatrical date weeks before it's realistically grabbable. A movie with none
 * of the selected dates drops off the widget.
 */
export function radarrPendingTime(
  m: RadarrMovie,
  kinds: readonly RadarrReleaseKind[],
): number | null {
  if (kinds.length === 0 || isEveryReleaseKind(kinds)) return radarrReleaseTime(m);
  return parseReleaseTime(pickRadarrReleaseDate(m, kinds) ?? undefined);
}
