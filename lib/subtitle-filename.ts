import { normalizeLanguage } from "@/lib/language-codes";

/**
 * Subtitle file name handling for uploads: which extensions Bazarr accepts,
 * and what a conventional name ("Film.de.forced.srt", "Show.S01E02.en.sdh.srt")
 * says about language and flags, to prefill the upload form.
 */

// Bazarr accepts what subliminal's SUBTITLE_EXTENSIONS lists.
export const SUBTITLE_EXTENSIONS: readonly string[] = [
  ".srt",
  ".sub",
  ".smi",
  ".txt",
  ".ssa",
  ".ass",
  ".mpl",
  ".vtt",
];

export function hasSubtitleExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return SUBTITLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const FORCED_TAGS = new Set(["forced", "foreign"]);
const HI_TAGS = new Set(["hi", "sdh", "cc"]);

/**
 * Read language, forced and HI tags from the dot-separated parts before the
 * extension. Tags may come in any order after the title; the language is the
 * last part that names one, searched only through the trailing run of tags
 * (so a title word such as "No" or "It" isn't read as a language). "hi"
 * doubles as Hindi's code, so it only counts as the HI flag when another part
 * names the language.
 */
export function parseSubtitleFilename(name: string): {
  code2?: string;
  forced: boolean;
  hi: boolean;
} {
  const parts = name.split(".").slice(0, -1).map((p) => p.toLowerCase());
  // The title itself is never a tag.
  const tags = parts.slice(1);
  const forced = tags.some((t) => FORCED_TAGS.has(t));

  let code2: string | undefined;
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    if (FORCED_TAGS.has(t) || HI_TAGS.has(t)) continue;
    // The first part that isn't a flag is the language, or ends the tags.
    const lang = t.length >= 2 ? normalizeLanguage(t) : null;
    if (lang) code2 = lang.code2;
    break;
  }
  const hi = tags.some((t) => HI_TAGS.has(t) && (t !== "hi" || code2 !== undefined));
  if (!code2 && tags.includes("hi")) {
    // A lone "hi" is more likely Hindi than a flag on an unnamed language;
    // "sdh"/"cc" next to it still flag Hindi HI.
    return { code2: "hi", forced, hi: tags.some((t) => t === "sdh" || t === "cc") };
  }
  return { code2, forced, hi };
}
