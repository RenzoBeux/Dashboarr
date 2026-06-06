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
 * True for hosts only reachable on a local network: RFC1918 IPv4 ranges,
 * loopback, IPv4/IPv6 link-local, IPv6 unique-local (fc00::/7), and mDNS
 * `.local` names. These can NEVER be reached off the home LAN, so issuing a
 * fetch to one while on cellular just hangs until it times out.
 *
 * Public domains and Tailscale's CGNAT range (100.64.0.0/10) deliberately
 * return false: Tailscale routes 100.x from anywhere, so those ARE reachable
 * off-LAN and must not be blocked. Keep this conservative — a false positive
 * would wrongly mark a working service offline.
 */
export function isPrivateHost(host: string): boolean {
  // Strip IPv6 brackets (URL.hostname keeps them: "[fd00::1]") and a trailing
  // root dot before matching.
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (h.endsWith(".local")) return true; // mDNS — LAN only
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // IPv4 link-local
  if (h.startsWith("fe80:")) return true; // IPv6 link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // IPv6 ULA
  return false;
}

/** `isPrivateHost` for a full URL string. Normalizes (adds http:// if missing)
 *  then inspects the hostname; returns false for anything unparseable so we
 *  never block on a parse failure. */
export function isPrivateUrl(url: string): boolean {
  try {
    return isPrivateHost(new URL(normalizeServiceUrl(url)).hostname);
  } catch {
    return false;
  }
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
  // True when the active workspace explicitly selected no live home networks
  // (homeNetworkIds: [] or only stale ids) → "always remote", honored even when
  // global auto-switch is off. Mirrors getActiveUrl step 2 (#148). Defaults to
  // false so callers without workspace context keep the legacy behavior.
  workspaceForcesRemote = false,
): "local" | "remote" | null {
  const local = normalizeServiceUrl(inst.localUrl);
  const remote = normalizeServiceUrl(inst.remoteUrl);
  if (!local && !remote) return null;
  if (inst.useRemote) return remote ? "remote" : "local";
  if (workspaceForcesRemote) return "remote";
  if (!autoSwitchNetwork) return local ? "local" : "remote";
  if (networkAwayFromHome) return "remote";
  return local ? "local" : "remote";
}
