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
 * last part that names one. "hi" doubles as Hindi's code, so it only counts
 * as the HI flag when another part names the language.
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
  let langIndex = -1;
  for (let i = tags.length - 1; i >= 0; i--) {
    const t = tags[i];
    if (FORCED_TAGS.has(t) || t === "sdh" || t === "cc") continue;
    if (t.length < 2 || t.length > 7) continue;
    const lang = normalizeLanguage(t);
    if (lang && t !== "hi") {
      code2 = lang.code2;
      langIndex = i;
      break;
    }
  }
  const hi = tags.some(
    (t, i) => HI_TAGS.has(t) && (t !== "hi" || (code2 !== undefined && i !== langIndex)),
  );
  if (!code2 && tags.includes("hi") && !tags.some((t) => t === "sdh" || t === "cc")) {
    // A lone "hi" is more likely Hindi than a flag on an unnamed language.
    return { code2: "hi", forced, hi: false };
  }
  return { code2, forced, hi };
}
