import type { RadarrMovie } from "@/lib/types";

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
