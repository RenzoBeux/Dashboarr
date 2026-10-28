import type { BazarrSubtitle } from "@/lib/types";

/**
 * The single place Bazarr subtitle request parameters are encoded.
 *
 * Bazarr's routes disagree on how booleans are spelled (verified against
 * bazarr/api/ at v1.6.2), so each request type gets its own builder here and
 * nothing else formats them:
 *
 *   - PATCH /subtitles (sync, translate, extract, mods) compares `forced`,
 *     `hi` and `original_format` to the exact string "True".
 *   - POST /movies|episodes/subtitles (upload) compares to lowercase "true".
 *   - PATCH /movies|episodes/subtitles (search one language) capitalizes, so
 *     either works; it gets "True"/"False" like Bazarr's own UI sends.
 *   - POST /providers/* (download a manual-search result) gets back exactly
 *     the strings the search returned.
 */

/** A movie or an episode, as Bazarr addresses them (by Radarr/Sonarr ids). */
export type SubtitleTarget =
  | { type: "movie"; radarrId: number }
  | { type: "episode"; seriesId: number; episodeId: number };

type Params = Record<string, string | number>;

export const boolCap = (b: boolean): "True" | "False" => (b ? "True" : "False");
export const boolLower = (b: boolean): "true" | "false" => (b ? "true" : "false");

/** The id params of the /movies|episodes/subtitles and /providers routes. */
export function targetParams(target: SubtitleTarget): Params {
  return target.type === "movie"
    ? { radarrid: target.radarrId }
    : { seriesid: target.seriesId, episodeid: target.episodeId };
}

/** /movies/subtitles or /episodes/subtitles. */
export function subtitlesRoute(target: SubtitleTarget): string {
  return target.type === "movie" ? "/movies/subtitles" : "/episodes/subtitles";
}

/** /providers/movies or /providers/episodes. */
export function providersRoute(target: SubtitleTarget): string {
  return target.type === "movie" ? "/providers/movies" : "/providers/episodes";
}

/** /movies/blacklist or /episodes/blacklist. */
export function blacklistRoute(target: SubtitleTarget): string {
  return target.type === "movie" ? "/movies/blacklist" : "/episodes/blacklist";
}

export interface LanguageChoice {
  code2: string;
  forced: boolean;
  hi: boolean;
}

/** PATCH /movies|episodes/subtitles: search one language. */
export function searchParams(target: SubtitleTarget, lang: LanguageChoice): Params {
  return {
    ...targetParams(target),
    language: lang.code2,
    forced: boolCap(lang.forced),
    hi: boolCap(lang.hi),
  };
}

/** POST /movies|episodes/subtitles (multipart): upload a file. */
export function uploadFields(target: SubtitleTarget, lang: LanguageChoice): Params {
  return {
    ...targetParams(target),
    language: lang.code2,
    forced: boolLower(lang.forced),
    hi: boolLower(lang.hi),
  };
}

/** DELETE /movies|episodes/subtitles: remove an external file. */
export function deleteParams(target: SubtitleTarget, sub: BazarrSubtitle): Params {
  return {
    ...targetParams(target),
    language: sub.code2,
    forced: boolCap(sub.forced),
    hi: boolCap(sub.hi),
    path: sub.path ?? "",
  };
}

/** One manual-search candidate, as far as downloading it is concerned. */
export interface ProviderResultRef {
  provider: string;
  subtitle: string;
  forced: string;
  hearing_impaired: string;
  original_format?: string;
}

/** POST /providers/movies|episodes: download a manual-search result. */
export function downloadResultParams(
  target: SubtitleTarget,
  result: ProviderResultRef,
): Params {
  return {
    ...targetParams(target),
    provider: result.provider,
    subtitle: result.subtitle,
    hi: result.hearing_impaired,
    forced: result.forced,
    original_format: result.original_format ?? "False",
  };
}

// --- PATCH /subtitles tools ---

export type SubtitleToolAction =
  | { kind: "sync" }
  | { kind: "translate"; to: string }
  | { kind: "extract" }
  | { kind: "mod"; mod: string };

/**
 * Query params for PATCH /subtitles.
 *
 * An external file is addressed by its path, sent exactly as Bazarr reported
 * it (already path-mapped; Bazarr checks it with os.path.exists). An embedded
 * track has no path and is addressed by its subtitle row id, which `extract`
 * and translating an embedded track require.
 */
export function toolParams(
  target: SubtitleTarget,
  sub: BazarrSubtitle,
  action: SubtitleToolAction,
): Params {
  const params: Params = {
    action:
      action.kind === "mod" ? action.mod : action.kind,
    // translate targets a language; everything else names the file's own.
    language: action.kind === "translate" ? action.to : sub.code2,
    type: target.type,
    id: target.type === "movie" ? target.radarrId : target.episodeId,
    forced: boolCap(sub.forced),
    hi: boolCap(sub.hi),
  };
  if (sub.path) params.path = sub.path;
  else if (sub.id != null) params.subtitles_id = sub.id;
  return params;
}

/**
 * Bazarr's text clean-up mods, in the order its own Tools menu lists them.
 * They only work on .srt files.
 */
export const CLEANUP_MODS: readonly { mod: string; label: string; description: string }[] = [
  { mod: "remove_HI", label: "Remove hearing-impaired tags", description: "[MUSIC], (laughs), speaker names" },
  { mod: "remove_tags", label: "Remove style tags", description: "Italics, bold, colors and positioning" },
  { mod: "emoji", label: "Remove emoji", description: "Strips emoji characters" },
  { mod: "OCR_fixes", label: "Fix OCR errors", description: "Common misreads from image-based subtitles" },
  { mod: "common", label: "Common fixes", description: "Spacing, punctuation and line breaks" },
  { mod: "fix_uppercase", label: "Fix all-caps text", description: "Converts shouted lines to sentence case" },
  { mod: "reverse_rtl", label: "Reverse right-to-left", description: "For Hebrew or Arabic shown backwards" },
];

/**
 * The shift_offset mod for a signed offset in milliseconds. Bazarr's own UI
 * negates every component for a negative shift, so this does too.
 */
export function buildShiftAction(totalMs: number): string {
  const sign = totalMs < 0 ? -1 : 1;
  let rest = Math.round(Math.abs(totalMs));
  const h = Math.floor(rest / 3_600_000);
  rest -= h * 3_600_000;
  const m = Math.floor(rest / 60_000);
  rest -= m * 60_000;
  const s = Math.floor(rest / 1000);
  const ms = rest - s * 1000;
  const v = (n: number) => (n === 0 ? 0 : sign * n);
  return `shift_offset(h=${v(h)},m=${v(m)},s=${v(s)},ms=${v(ms)})`;
}

/** The change_FPS mod: retime a subtitle made for one frame rate to another. */
export function buildFpsAction(from: number, to: number): string {
  return `change_FPS(from=${from},to=${to})`;
}

/** Common video frame rates, for the frame-rate picker. */
export const FRAME_RATES: readonly number[] = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

/** Is this an external file Bazarr's text tools can edit? (.srt only.) */
export function isModifiable(sub: BazarrSubtitle): boolean {
  return !!sub.path && /\.srt$/i.test(sub.path);
}

/** A track inside the video file rather than a file next to it. */
export function isEmbedded(sub: BazarrSubtitle): boolean {
  return !sub.path;
}
