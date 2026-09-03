import type { SonarrCalendarEntry } from "@/lib/types";

// Sonarr marks finales (`finaleType`: "season" | "series" | null) but ships no
// premiere equivalent, so the calendar surfaces derive it from the episode
// numbering the response already carries (issue #354).

/** The minimum shape the check needs, so `SonarrEpisode` works here too. */
type NumberedEpisode = Pick<
  SonarrCalendarEntry,
  "seasonNumber" | "episodeNumber"
>;

/** The pill every calendar surface shows for a premiere. */
export const PREMIERE_BADGE = { label: "New Season", variant: "info" } as const;

/**
 * Whether an episode opens a season.
 *
 * Season 0 has to be excluded: it is Sonarr's specials bucket, numbered as one
 * running list across the whole series, so an S00E01 is an extra rather than
 * the start of anything.
 */
export function isSeasonPremiere(ep: NumberedEpisode): boolean {
  return ep.episodeNumber === 1 && ep.seasonNumber >= 1;
}
