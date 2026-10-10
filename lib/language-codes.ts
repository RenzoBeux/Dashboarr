/**
 * Language identification across services that each spell languages their own
 * way, so audio and subtitle tags can be compared and shown uniformly:
 *
 *   - Radarr/Sonarr `mediaInfo.audioLanguages` / `subtitles`: slash-joined
 *     ffprobe stream tags, usually ISO 639-2 ("eng/ger"), sometimes /T ("deu")
 *     or a name ("English").
 *   - Radarr/Sonarr `originalLanguage.name`: an English name, with a few *arr
 *     specifics ("Portuguese (Brazil)", "Flemish").
 *   - Bazarr: ISO 639-1 `code2` plus its own pseudo-codes for regional
 *     variants (`pb` Brazilian Portuguese, `zt` Traditional Chinese, `ea`
 *     Latin American Spanish).
 *
 * Pure and dependency-free, so any module (Plex/Jellyfin stream languages,
 * Seerr) can reuse it.
 */

export interface Language {
  // ISO 639-1, or Bazarr's pseudo-code for a regional variant.
  code2: string;
  // ISO 639-2/B ("ger", "fre"), the form ffprobe and Bazarr's code3 use.
  code3: string;
  name: string;
}

// [code2, code3 (639-2/B), 639-2/T if different, English name, ...aliases]
type Row = [string, string, string | null, string, ...string[]];

const ROWS: Row[] = [
  ["af", "afr", null, "Afrikaans"],
  ["sq", "alb", "sqi", "Albanian"],
  ["am", "amh", null, "Amharic"],
  ["ar", "ara", null, "Arabic"],
  ["hy", "arm", "hye", "Armenian"],
  ["az", "aze", null, "Azerbaijani"],
  ["eu", "baq", "eus", "Basque"],
  ["be", "bel", null, "Belarusian"],
  ["bn", "ben", null, "Bengali", "Bangla"],
  ["bs", "bos", null, "Bosnian"],
  ["bg", "bul", null, "Bulgarian"],
  ["my", "bur", "mya", "Burmese"],
  ["ca", "cat", null, "Catalan"],
  ["zh", "chi", "zho", "Chinese", "Chinese (Simplified)", "Mandarin", "Cantonese"],
  ["zt", "zht", null, "Chinese (Traditional)", "Chinese Traditional"],
  ["hr", "hrv", null, "Croatian"],
  ["cs", "cze", "ces", "Czech"],
  ["da", "dan", null, "Danish"],
  ["nl", "dut", "nld", "Dutch", "Flemish"],
  ["en", "eng", null, "English"],
  ["eo", "epo", null, "Esperanto"],
  ["et", "est", null, "Estonian"],
  ["fa", "per", "fas", "Persian", "Farsi"],
  ["fi", "fin", null, "Finnish"],
  ["fr", "fre", "fra", "French", "French (Canada)"],
  ["gl", "glg", null, "Galician"],
  ["ka", "geo", "kat", "Georgian"],
  ["de", "ger", "deu", "German"],
  ["el", "gre", "ell", "Greek", "Greek, Modern"],
  ["gu", "guj", null, "Gujarati"],
  ["he", "heb", null, "Hebrew"],
  ["hi", "hin", null, "Hindi"],
  ["hu", "hun", null, "Hungarian"],
  ["is", "ice", "isl", "Icelandic"],
  ["id", "ind", null, "Indonesian"],
  ["ga", "gle", null, "Irish"],
  ["it", "ita", null, "Italian"],
  ["ja", "jpn", null, "Japanese"],
  ["kn", "kan", null, "Kannada"],
  ["kk", "kaz", null, "Kazakh"],
  ["km", "khm", null, "Khmer"],
  ["ko", "kor", null, "Korean"],
  ["ku", "kur", null, "Kurdish"],
  ["lo", "lao", null, "Lao"],
  ["la", "lat", null, "Latin"],
  ["lv", "lav", null, "Latvian"],
  ["lt", "lit", null, "Lithuanian"],
  ["lb", "ltz", null, "Luxembourgish"],
  ["mk", "mac", "mkd", "Macedonian"],
  ["ms", "may", "msa", "Malay"],
  ["ml", "mal", null, "Malayalam"],
  ["mt", "mlt", null, "Maltese"],
  ["mr", "mar", null, "Marathi"],
  ["mn", "mon", null, "Mongolian"],
  ["ne", "nep", null, "Nepali"],
  ["no", "nor", null, "Norwegian", "Norwegian Bokmal", "Norwegian Bokmål"],
  ["nb", "nob", null, "Norwegian Bokmål (nb)"],
  ["nn", "nno", null, "Norwegian Nynorsk"],
  ["pl", "pol", null, "Polish"],
  ["pt", "por", null, "Portuguese", "Portuguese (Portugal)"],
  ["pb", "pob", null, "Portuguese (Brazil)", "Brazilian Portuguese", "Portuguese (Brazilian)"],
  ["pa", "pan", null, "Punjabi", "Panjabi"],
  ["ro", "rum", "ron", "Romanian", "Moldavian"],
  ["ru", "rus", null, "Russian"],
  ["sr", "srp", null, "Serbian"],
  ["si", "sin", null, "Sinhala", "Sinhalese"],
  ["sk", "slo", "slk", "Slovak"],
  ["sl", "slv", null, "Slovenian", "Slovene"],
  ["so", "som", null, "Somali"],
  ["es", "spa", null, "Spanish", "Castilian", "Spanish (Spain)"],
  ["ea", "spl", null, "Spanish (Latino)", "Latin American Spanish", "Spanish (Latin America)"],
  ["sw", "swa", null, "Swahili"],
  ["sv", "swe", null, "Swedish"],
  ["tl", "tgl", null, "Tagalog", "Filipino"],
  ["ta", "tam", null, "Tamil"],
  ["te", "tel", null, "Telugu"],
  ["th", "tha", null, "Thai"],
  ["tr", "tur", null, "Turkish"],
  ["uk", "ukr", null, "Ukrainian"],
  ["ur", "urd", null, "Urdu"],
  ["uz", "uzb", null, "Uzbek"],
  ["vi", "vie", null, "Vietnamese"],
  ["cy", "wel", "cym", "Welsh"],
  ["yi", "yid", null, "Yiddish"],
  ["zu", "zul", null, "Zulu"],
];

const BY_KEY = new Map<string, Language>();
for (const [code2, code3, code3t, name, ...aliases] of ROWS) {
  const lang: Language = { code2, code3, name };
  for (const key of [code2, code3, code3t, name, ...aliases]) {
    if (key && !BY_KEY.has(key.toLowerCase())) BY_KEY.set(key.toLowerCase(), lang);
  }
}

// Region-tagged forms ("pt-BR", "zh_TW", "es-419") that map to a variant.
const REGION_VARIANTS: Record<string, string> = {
  "pt-br": "pb",
  "zh-tw": "zt",
  "zh-hant": "zt",
  "zh-hk": "zt",
  "es-419": "ea",
  "es-mx": "ea",
};

const VARIANT_BASE: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_VARIANTS).map(([tag, code2]) => [code2, tag.split("-")[0]]),
);

/** The language a regional variant belongs to: "pb" → "pt", "ea" → "es". */
export function baseLanguageCode(code2: string): string {
  return VARIANT_BASE[code2] ?? code2;
}

/**
 * Identify a language from any of the spellings above. Null for an empty,
 * unknown or "undetermined" (`und`) tag, so callers can drop it.
 */
export function normalizeLanguage(input: string | null | undefined): Language | null {
  const raw = input?.trim().toLowerCase();
  if (!raw || raw === "und" || raw === "unknown" || raw === "zxx") return null;

  const direct = BY_KEY.get(raw);
  if (direct) return direct;

  const region = raw.replace("_", "-");
  const variant = REGION_VARIANTS[region];
  if (variant) return BY_KEY.get(variant) ?? null;
  // "en-US", "de-CH": fall back to the base language.
  const base = region.split("-")[0];
  return base !== raw ? (BY_KEY.get(base) ?? null) : null;
}

/**
 * Parse a slash- or comma-joined language list ("English/English/German"),
 * dropping unknowns and duplicates while keeping first-seen order — one entry
 * per language, however many tracks carry it.
 */
export function parseLanguageList(list: string | null | undefined): Language[] {
  if (!list) return [];
  const seen = new Set<string>();
  const out: Language[] = [];
  for (const part of list.split(/[/,]/)) {
    const lang = normalizeLanguage(part);
    if (lang && !seen.has(lang.code2)) {
      seen.add(lang.code2);
      out.push(lang);
    }
  }
  return out;
}
