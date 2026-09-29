import { Linking } from "react-native";

// Public pages for a title on the metadata sites Radarr/Sonarr key on. An id
// the server didn't send (or sent empty) yields no URL, so callers can hide
// the link instead of opening a dead page.
export function imdbTitleUrl(imdbId?: string | null): string | undefined {
  return imdbId ? `https://www.imdb.com/title/${imdbId}` : undefined;
}

export function tmdbMovieUrl(tmdbId?: number | null): string | undefined {
  return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined;
}

// Hands the URL to the OS rather than the in-app browser (lib/open-in-browser),
// so an installed app that claims the link can open it instead.
export function openExternalUrl(url: string): void {
  Linking.openURL(url).catch(() => {});
}
