import {
  airDateKey,
  formatEpisodeCode,
  getDateOffset,
  localDateKey,
  relativeDate,
  releaseDateKey,
} from "@/lib/utils";
import {
  BAR_KIND_COLOR,
  radarrBarKind,
  sonarrEpisodeBarKind,
} from "@/lib/arr-poster-status";
import type {
  RadarrImage,
  RadarrMovie,
  SonarrCalendarEntry,
  SonarrImage,
} from "@/lib/types";

// Shared "Releasing Soon" calendar logic used by the dashboard card
// (components/dashboard/calendar-card.tsx), the Calendar tab, AND the Android
// home-screen widget (widgets/*). Keeping the fragile bits — the Radarr
// release-date waterfall and the day-window filter — in one pure module is what
// keeps a movie landing on the SAME day across all three surfaces (past
// divergence: a movie showing under different dates in the card vs the tab).
//
// This module must stay pure (no React, no react-query, no native imports) so
// the widget's headless task can import it cheaply.

export type RadarrReleaseType = "cinemas" | "digital" | "physical" | "any";

/**
 * Which Radarr release date a movie lands on, honoring the user's preference.
 * "any" mirrors the Calendar tab's waterfall (digital → physical → cinemas) so
 * the same movie buckets onto the same day in every surface.
 */
export function pickRadarrDate(
  movie: RadarrMovie,
  type: RadarrReleaseType,
): string | null {
  const cinemas = movie.inCinemas;
  const digital = movie.digitalRelease;
  const physical = movie.physicalRelease;
  switch (type) {
    case "cinemas":
      return cinemas ?? null;
    case "digital":
      return digital ?? null;
    case "physical":
      return physical ?? null;
    case "any":
    default:
      return digital ?? physical ?? cinemas ?? null;
  }
}

/**
 * Poster URL for the widget: the PUBLIC TMDB `remoteUrl` only (never the local
 * `/MediaCover` proxy `url`). The widget's native ImageWidget fetches with no
 * API key and no LAN reachability, so a proxy URL would both fail off-Wi-Fi and
 * risk leaking the host/key — return null (widget shows a placeholder) instead.
 * TMDB originals are ~6MB; downscale to w500 like hooks/use-service-image.ts.
 */
function widgetPosterUrl(
  images: (SonarrImage | RadarrImage)[] | undefined | null,
): string | null {
  const remote = images?.find((i) => i.coverType === "poster")?.remoteUrl;
  if (!remote) return null;
  return remote.replace("/t/p/original/", "/t/p/w500/");
}

// One calendar source: the entries returned for a single Sonarr/Radarr instance.
export interface InstanceCalendar<T> {
  instanceId: string;
  entries: T[];
}

export interface BuildAgendaOptions {
  sonarr: InstanceCalendar<SonarrCalendarEntry>[];
  radarr: InstanceCalendar<RadarrMovie>[];
  daysAhead: number;
  radarrReleaseType: RadarrReleaseType;
  maxItems: number;
}

// A single serializable widget row. Plain JSON only — this crosses into the
// RemoteViews render and (optionally) a persisted last-known cache.
export interface AgendaItem {
  id: string;
  kind: "episode" | "movie";
  title: string;
  subtitle: string;
  dateKey: string; // local YYYY-MM-DD, for grouping/day-headers
  dateLabel: string; // relativeDate(dateKey): "Today" / "Tomorrow" / "Mon Jul 7"
  posterUrl: string | null; // public TMDB w500, or null
  barColor: string; // hex status spine color (BAR_KIND_COLOR)
  hasFile: boolean;
  route: string; // in-app route for the deep link, e.g. "/movie/45?instanceId=abc"
}

/**
 * Merge Sonarr episodes + Radarr movies into a flat, day-sorted, capped agenda
 * for the widget. Mirrors calendar-card.tsx's window filter (today → today +
 * daysAhead, inclusive) and title sort; the "downloading" purple state is
 * intentionally omitted here (the widget skips the queue fetch), so bar colors
 * are computed with isDownloading=false — hasFile still distinguishes
 * downloaded (green) from pending.
 */
export function buildAgenda(opts: BuildAgendaOptions): AgendaItem[] {
  const { sonarr, radarr, daysAhead, radarrReleaseType, maxItems } = opts;
  const todayIso = localDateKey();
  const horizonIso = getDateOffset(daysAhead);

  const items: AgendaItem[] = [];

  for (const { instanceId, entries } of sonarr) {
    for (const ep of entries) {
      const date = airDateKey(ep);
      if (!date || date < todayIso || date > horizonIso) continue;
      items.push({
        id: `ep-${instanceId}-${ep.id}`,
        kind: "episode",
        title: ep.series.title,
        subtitle: `${formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)} — ${ep.title}`,
        dateKey: date,
        dateLabel: relativeDate(date),
        posterUrl: widgetPosterUrl(ep.series.images),
        barColor: BAR_KIND_COLOR[sonarrEpisodeBarKind(ep, false)],
        hasFile: ep.hasFile,
        route: `/series/${ep.seriesId}?instanceId=${instanceId}`,
      });
    }
  }

  for (const { instanceId, entries } of radarr) {
    for (const movie of entries) {
      const date = releaseDateKey(pickRadarrDate(movie, radarrReleaseType));
      if (!date || date < todayIso || date > horizonIso) continue;
      items.push({
        id: `mv-${instanceId}-${movie.id}`,
        kind: "movie",
        title: movie.title,
        subtitle: movie.year ? `${movie.year} • Movie` : "Movie",
        dateKey: date,
        dateLabel: relativeDate(date),
        posterUrl: widgetPosterUrl(movie.images),
        barColor: BAR_KIND_COLOR[radarrBarKind(movie, false)],
        hasFile: movie.hasFile,
        route: `/movie/${movie.id}?instanceId=${instanceId}`,
      });
    }
  }

  items.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) || a.title.localeCompare(b.title),
  );
  return items.slice(0, maxItems);
}
