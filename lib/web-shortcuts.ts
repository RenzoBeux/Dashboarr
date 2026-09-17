/**
 * Pure helpers for the user-defined web shortcuts (#344): validation and
 * normalization of the URL a shortcut opens. Bundled into the backend's web
 * editor through store/config-schema, so no React Native, Expo or store
 * imports here.
 */

export const SHORTCUT_NAME_MAX_LENGTH = 100;
export const SHORTCUT_URL_MAX_LENGTH = 2048;

/**
 * Auto-prefix `https://` when the user typed a bare host such as
 * `portainer.example.com` or `192.168.1.10:9000`. Services default to http://
 * (a LAN box usually has no TLS), but a shortcut opens in the system browser
 * where a wrong scheme just shows an error page the user can fix from the
 * address bar, so the secure default is the better guess.
 */
export function normalizeShortcutUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Only `http:` and `https:` URLs may be stored. Anything else (`javascript:`,
 * `file:`, custom app schemes) is rejected so a shortcut can never hand the
 * in-app browser something other than a web page. Length-capped so a pasted
 * blob can't bloat the config export.
 */
export function isValidShortcutUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  if (url.length === 0 || url.length > SHORTCUT_URL_MAX_LENGTH) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.hostname.length > 0;
}

export type ShortcutUrlValidation =
  | { kind: "ok"; url: string }
  | { kind: "invalid"; message: string };

/** Normalize then validate what the user typed in the URL field. */
export function validateShortcutUrl(raw: string): ShortcutUrlValidation {
  const url = normalizeShortcutUrl(raw);
  if (url === "") return { kind: "invalid", message: "URL is required" };
  if (url.length > SHORTCUT_URL_MAX_LENGTH) {
    return { kind: "invalid", message: "URL is too long" };
  }
  if (!/^https?:\/\//i.test(url)) {
    return {
      kind: "invalid",
      message: "Only http:// and https:// links can be opened",
    };
  }
  if (!isValidShortcutUrl(url)) return { kind: "invalid", message: "Not a valid URL" };
  return { kind: "ok", url };
}

/** Host shown under a shortcut's name in the management list. */
export function shortcutHostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || url;
  } catch {
    return url;
  }
}
