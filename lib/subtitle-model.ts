import { baseLanguageCode, normalizeLanguage, parseLanguageList } from "@/lib/language-codes";
import type {
  ArrLanguage,
  BazarrEpisode,
  BazarrLanguage,
  BazarrLanguageProfile,
  BazarrMissingSubtitle,
  BazarrSubtitle,
} from "@/lib/types";

/**
 * View models for subtitle and audio-language UI, shared by the movie card,
 * the episode rows and sheet, the coverage grid and the Bazarr library.
 * Pure: no React, no services.
 */

export type SubtitleState = "present" | "embedded" | "missing";

export interface SubtitleRow {
  // Stable across refetches: language + flags + file.
  key: string;
  code2: string;
  name: string;
  forced: boolean;
  hi: boolean;
  state: SubtitleState;
  // The subtitle Bazarr has (present/embedded rows).
  sub?: BazarrSubtitle;
  // What Bazarr is still looking for (missing rows).
  missing?: BazarrMissingSubtitle;
}

const STATE_ORDER: Record<SubtitleState, number> = { missing: 0, present: 1, embedded: 2 };

/**
 * One row per subtitle Bazarr has and per language it still wants. Missing
 * languages come first (they are what needs attention), then external files,
 * then embedded tracks; each group by language name.
 */
export function buildSubtitleRows(item: {
  subtitles?: BazarrSubtitle[] | null;
  missing_subtitles?: BazarrMissingSubtitle[] | null;
}): SubtitleRow[] {
  const rows: SubtitleRow[] = [];
  const seen = new Map<string, number>();
  for (const sub of item.subtitles ?? []) {
    // Before 1.6 embedded tracks carry no id, so two tracks of one language
    // would share a key; number the repeats.
    const base = `${sub.code2}|${sub.forced ? "f" : ""}${sub.hi ? "h" : ""}|${sub.path ?? `track${sub.embedded_track_id ?? sub.id ?? ""}`}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    rows.push({
      key: n === 0 ? base : `${base}#${n}`,
      code2: sub.code2,
      name: sub.name,
      forced: sub.forced,
      hi: sub.hi,
      state: sub.path ? "present" : "embedded",
      sub,
    });
  }
  for (const miss of item.missing_subtitles ?? []) {
    rows.push({
      key: `${miss.code2}|${miss.forced ? "f" : ""}${miss.hi ? "h" : ""}|missing`,
      code2: miss.code2,
      name: miss.name,
      forced: miss.forced,
      hi: miss.hi,
      state: "missing",
      missing: miss,
    });
  }
  return rows.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name),
  );
}

export interface SubtitleChip {
  key: string;
  code2: string;
  forced: boolean;
  hi: boolean;
  state: SubtitleState;
}

/**
 * Compact chips for overview lines: one per language + flag combination,
 * keeping the best state (a file beats an embedded track beats missing), in
 * a stable order — present, embedded, then missing, by code.
 */
export function buildSubtitleChips(rows: readonly SubtitleRow[]): SubtitleChip[] {
  const rank: Record<SubtitleState, number> = { present: 0, embedded: 1, missing: 2 };
  const best = new Map<string, SubtitleChip>();
  for (const row of rows) {
    const key = `${row.code2}|${row.forced ? "f" : ""}${row.hi ? "h" : ""}`;
    const prev = best.get(key);
    if (!prev || rank[row.state] < rank[prev.state]) {
      best.set(key, { key, code2: row.code2, forced: row.forced, hi: row.hi, state: row.state });
    }
  }
  return Array.from(best.values()).sort(
    (a, b) => rank[a.state] - rank[b.state] || a.code2.localeCompare(b.code2),
  );
}

/** "3/4": languages present (file or embedded) out of all rows' languages. */
export function subtitleCoverage(chips: readonly SubtitleChip[]): {
  have: number;
  total: number;
} {
  return {
    have: chips.filter((c) => c.state !== "missing").length,
    total: chips.length,
  };
}

export interface AudioTag {
  code2: string;
  name: string;
  // The production's own language (Radarr/Sonarr originalLanguage).
  original: boolean;
}

/**
 * Audio-language tags, one per language however many tracks carry it. Takes
 * the arr's slash-joined `mediaInfo.audioLanguages` or Bazarr's
 * `audio_language` list; marks the original language when known.
 */
export function buildAudioTags(
  audio: string | readonly BazarrLanguage[] | null | undefined,
  originalLanguage?: ArrLanguage | string | null,
): AudioTag[] {
  const langs =
    typeof audio === "string" || audio == null
      ? parseLanguageList(audio ?? "")
      : dedupe(
          audio.map(
            (a) =>
              normalizeLanguage(a.code2) ??
              normalizeLanguage(a.name) ??
              // Bazarr already identified it; keep a language our table lacks.
              (a.code2 ? { code2: a.code2, code3: a.code3, name: a.name } : null),
          ),
        );
  const original = normalizeLanguage(
    typeof originalLanguage === "string" ? originalLanguage : originalLanguage?.name,
  );
  // The arr names regional originals ("Portuguese (Brazil)" → pb) that file
  // tracks only tag by base language (por → pt): match the base only when no
  // track matches exactly, so a Spanish film's Latino dub isn't original too.
  const exact = !!original && langs.some((l) => l.code2 === original.code2);
  const isOriginal = (code2: string) =>
    !!original &&
    (exact
      ? code2 === original.code2
      : baseLanguageCode(original.code2) === baseLanguageCode(code2));
  return langs.map((l) => ({
    code2: l.code2,
    name: l.name,
    original: isOriginal(l.code2),
  }));
}

function dedupe<T extends { code2: string }>(list: (T | null)[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of list) {
    if (l && !seen.has(l.code2)) {
      seen.add(l.code2);
      out.push(l);
    }
  }
  return out;
}

/**
 * How many equal-width chips fit in `available` px before a "+N" chip is
 * needed. Uses the whole width first: all chips show if they fit, otherwise
 * as many as fit next to the "+N" chip.
 */
export function fitChips(
  count: number,
  available: number,
  chipWidth: number,
  gap: number,
  plusWidth: number,
): number {
  if (count <= 0 || available <= 0) return 0;
  const all = count * chipWidth + (count - 1) * gap;
  if (all <= available) return count;
  // n chips, each followed by a gap, then the "+N" chip.
  const n = Math.floor((available - plusWidth) / (chipWidth + gap));
  return Math.max(0, Math.min(count - 1, n));
}

// --- Series coverage ---

export type CoverageCell = SubtitleState | "unwanted";

export interface CoverageLanguage {
  key: string;
  code2: string;
  forced: boolean;
  hi: boolean;
}

export interface CoverageSeason {
  season: number;
  episodes: { episodeId: number; episode: number; cells: CoverageCell[] }[];
  // Episodes with at least one missing language.
  gaps: number;
}

/**
 * The language × episode grid for a series. Columns are the series profile's
 * languages (or, without a profile, every language any episode has); each
 * cell says whether that episode has it as a file, embedded, is missing it,
 * or doesn't want it.
 */
export function buildCoverageGrid(
  episodes: readonly BazarrEpisode[],
  profile?: BazarrLanguageProfile | null,
): { languages: CoverageLanguage[]; seasons: CoverageSeason[] } {
  const languages: CoverageLanguage[] = profile
    ? profile.items.map((i) => ({
        key: langKey(i.language, i.forced === "True", i.hi === "True"),
        code2: i.language,
        forced: i.forced === "True",
        hi: i.hi === "True",
      }))
    : collectLanguages(episodes);

  const bySeason = new Map<number, CoverageSeason>();
  for (const ep of episodes) {
    const cells = languages.map((lang) => cellFor(ep, lang));
    const season =
      bySeason.get(ep.season) ?? { season: ep.season, episodes: [], gaps: 0 };
    season.episodes.push({ episodeId: ep.sonarrEpisodeId, episode: ep.episode, cells });
    if (cells.includes("missing")) season.gaps += 1;
    bySeason.set(ep.season, season);
  }

  const seasons = Array.from(bySeason.values()).sort((a, b) => b.season - a.season);
  for (const s of seasons) s.episodes.sort((a, b) => a.episode - b.episode);
  return { languages, seasons };
}

function langKey(code2: string, forced: boolean, hi: boolean) {
  return `${code2}|${forced ? "f" : ""}${hi ? "h" : ""}`;
}

function collectLanguages(episodes: readonly BazarrEpisode[]): CoverageLanguage[] {
  const map = new Map<string, CoverageLanguage>();
  for (const ep of episodes) {
    for (const s of [...ep.subtitles, ...ep.missing_subtitles]) {
      const key = langKey(s.code2, s.forced, s.hi);
      if (!map.has(key)) map.set(key, { key, code2: s.code2, forced: s.forced, hi: s.hi });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code2.localeCompare(b.code2));
}

function cellFor(ep: BazarrEpisode, lang: CoverageLanguage): CoverageCell {
  const same = (s: { code2: string; forced: boolean }) =>
    s.code2 === lang.code2 && s.forced === lang.forced;
  // Bazarr lists exactly what it still wants, flags included. A plain column
  // is satisfied by an HI subtitle too (as in Bazarr), an HI column only by HI.
  if (ep.missing_subtitles.some((s) => same(s) && s.hi === lang.hi)) return "missing";
  const subs = ep.subtitles.filter((s) => same(s) && (s.hi || !lang.hi));
  if (subs.some((s) => s.path)) return "present";
  if (subs.length > 0) return "embedded";
  return "unwanted";
}

/** Episodes of one season that still miss languages, for "Search missing". */
export function seasonMissingTargets(
  episodes: readonly BazarrEpisode[],
  season: number,
): { episode: BazarrEpisode; languages: BazarrMissingSubtitle[] }[] {
  return episodes
    .filter((ep) => ep.season === season && ep.missing_subtitles.length > 0)
    .map((ep) => ({ episode: ep, languages: ep.missing_subtitles }));
}
