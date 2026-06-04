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

/**
 * Auto-prefix `http://` if no protocol is present. This helps users who type
 * just `192.168.1.10:8080` or `localhost:8989`.
 */
export function normalizeServiceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/**
 * Which URL bucket a service instance is actively using right now: "local",
 * "remote", or null when neither URL is configured. This MIRRORS the decision
 * tree in `getActiveUrl` (store/config-store.ts) — keep the two in sync — but
 * reports the chosen bucket instead of the URL string, so UI can surface an
 * L/R indicator. The away branch is "remote" with no local fallback (the
 * security invariant: never the private local URL off a confirmed home WiFi).
 */
export function resolveActiveUrlKind(
  inst: { localUrl: string; remoteUrl: string; useRemote: boolean },
  autoSwitchNetwork: boolean,
  networkAwayFromHome: boolean,
): "local" | "remote" | null {
  const local = normalizeServiceUrl(inst.localUrl);
  const remote = normalizeServiceUrl(inst.remoteUrl);
  if (!local && !remote) return null;
  if (inst.useRemote) return remote ? "remote" : "local";
  if (!autoSwitchNetwork) return local ? "local" : "remote";
  if (networkAwayFromHome) return "remote";
  return local ? "local" : "remote";
}
