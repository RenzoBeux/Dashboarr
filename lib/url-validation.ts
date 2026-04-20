export type UrlValidation =
  | { kind: "ok" }
  | { kind: "invalid"; message: string }
  | { kind: "warn"; message: string };

/**
 * Validate a service URL before saving.
 *
 * - Empty string is allowed (user hasn't configured that URL yet).
 * - Only `http:` and `https:` schemes are accepted; anything else is rejected
 *   outright (blocks `javascript:`, `file:`, `gopher:` etc. from ever reaching
 *   the fetch layer).
 * - For `remote` URLs, `http://` produces a `warn` — the caller should
 *   confirm with the user before saving, since API keys will be sent in the
 *   clear over the public internet.
 * - For `local` URLs, `http://` is fine (typical LAN setups don't have TLS).
 */
export function validateServiceUrl(
  raw: string,
  kind: "local" | "remote",
): UrlValidation {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "ok" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { kind: "invalid", message: "Not a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      kind: "invalid",
      message: `URL scheme ${parsed.protocol} is not allowed. Use http:// or https://.`,
    };
  }

  if (kind === "remote" && parsed.protocol === "http:") {
    return {
      kind: "warn",
      message:
        "This remote URL uses http:// — API keys and credentials will be sent in cleartext over the internet. Use https:// for remote endpoints whenever possible.",
    };
  }

  return { kind: "ok" };
}
