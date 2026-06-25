import { Platform } from "react-native";
import { NATIVE_VERSION } from "@/lib/app-version";

// Client-side Plex PIN OAuth + server discovery. No backend, no app
// registration with Plex — this is the public flow documented at
// https://forums.plex.tv/t/authenticating-with-plex/609370. The X-Plex-Product
// here is just the label shown on the approval screen and in
// plex.tv → Authorized Devices.
//
// Flow: requestPin() → open buildAuthUrl() in a browser → pollPinForToken()
// until the user approves → discoverServers() to auto-fill the URLs. All calls
// reuse one stable X-Plex-Client-Identifier (see lib/plex-client-id.ts).

const PLEX_TV = "https://plex.tv/api/v2";
const PLEX_AUTH_APP = "https://app.plex.tv/auth";
const PLEX_PRODUCT = "Dashboarr";
const PLEX_PLATFORM = Platform.OS === "ios" ? "iOS" : "Android";

const REQUEST_TIMEOUT_MS = 15000;

export interface PlexPin {
  id: number;
  code: string;
  /** Seconds until the PIN expires (Plex default ~1800). */
  expiresIn?: number;
}

export interface PlexServer {
  name: string;
  clientIdentifier: string;
  owned: boolean;
  /** Per-server token — the one the PMS accepts, distinct from the account
   * token for shared/non-owned servers. Stored as the instance's apiKey. */
  accessToken: string;
  localUrl: string;
  remoteUrl: string;
}

interface PlexPinResponse {
  id: number;
  code: string;
  authToken: string | null;
  expiresIn?: number;
}

interface PlexConnection {
  protocol: string; // "http" | "https"
  address: string;
  port: number;
  uri: string;
  local: boolean;
  relay: boolean;
  IPv6: boolean;
}

interface PlexResource {
  name: string;
  clientIdentifier: string;
  provides: string; // CSV, e.g. "server" or "server,player"
  owned: boolean;
  accessToken?: string;
  connections?: PlexConnection[];
}

// The X-Plex-* identity headers Plex reads to attribute the device. Sent as
// headers (not query) so the product/version never lands in a logged URL.
function plexHeaders(clientId: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": PLEX_PRODUCT,
    "X-Plex-Version": NATIVE_VERSION,
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Platform": PLEX_PLATFORM,
    "X-Plex-Device": PLEX_PLATFORM,
    "X-Plex-Device-Name": PLEX_PRODUCT,
    ...extra,
  };
}

async function plexFetch(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Forward an external cancel (browser dismissed) onto our timeout-bound signal.
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort);
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** Create a PIN. strong=true returns a long opaque code suited to app flows. */
export async function requestPin(clientId: string): Promise<PlexPin> {
  const res = await plexFetch(`${PLEX_TV}/pins?strong=true`, {
    method: "POST",
    headers: plexHeaders(clientId),
  });
  if (!res.ok) throw new Error(`Plex PIN request failed (HTTP ${res.status})`);
  const data = (await res.json()) as PlexPinResponse;
  return { id: data.id, code: data.code, expiresIn: data.expiresIn };
}

/**
 * The user-facing approval URL. Params live in the URL fragment and
 * context[device][product] must be percent-encoded. We render this inside an
 * in-app WebView (not a redirect-based browser flow), and the token always
 * comes from polling — so forwardUrl is optional and omitted by default to
 * avoid the page trying to redirect away once the user approves.
 */
export function buildAuthUrl(
  code: string,
  clientId: string,
  redirectUrl?: string,
): string {
  const params = [
    `clientID=${encodeURIComponent(clientId)}`,
    `code=${encodeURIComponent(code)}`,
    `context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PLEX_PRODUCT)}`,
  ];
  if (redirectUrl) params.push(`forwardUrl=${encodeURIComponent(redirectUrl)}`);
  return `${PLEX_AUTH_APP}#?${params.join("&")}`;
}

interface PollOptions {
  signal: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Poll the PIN until the user approves it. Returns the account authToken, or
 * null if the caller aborts (browser dismissed) or the foreground timeout
 * elapses. Throws if the PIN expired/was consumed server-side (404).
 */
export async function pollPinForToken(
  pinId: number,
  clientId: string,
  { signal, intervalMs = 2000, timeoutMs = 120000 }: PollOptions,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    let res: Response;
    try {
      res = await plexFetch(
        `${PLEX_TV}/pins/${pinId}`,
        { method: "GET", headers: plexHeaders(clientId) },
        signal,
      );
    } catch {
      // External cancel (browser dismissed) → clean stop. A per-request
      // timeout / network blip → wait and retry until the deadline.
      if (signal.aborted) return null;
      if (await sleepOrAbort(intervalMs, signal)) return null;
      continue;
    }
    if (res.status === 404) throw new Error("Plex PIN expired — please try again");
    if (res.ok) {
      const data = (await res.json()) as PlexPinResponse;
      if (data.authToken) return data.authToken;
    }
    // Wait before the next poll, but wake immediately on cancel.
    if (await sleepOrAbort(intervalMs, signal)) return null;
  }
  return null;
}

/** Discover the account's Plex Media Servers and map each to local/remote URLs. */
export async function discoverServers(
  authToken: string,
  clientId: string,
): Promise<PlexServer[]> {
  const res = await plexFetch(`${PLEX_TV}/resources?includeHttps=1&includeRelay=1`, {
    method: "GET",
    headers: plexHeaders(clientId, { "X-Plex-Token": authToken }),
  });
  if (!res.ok) throw new Error(`Plex server discovery failed (HTTP ${res.status})`);
  const resources = (await res.json()) as PlexResource[];
  return resources
    .filter((r) => providesServer(r.provides))
    .map((r) => {
      const { localUrl, remoteUrl } = deriveUrls(r.connections ?? []);
      return {
        name: r.name,
        clientIdentifier: r.clientIdentifier,
        owned: r.owned,
        // Per-server accessToken is correct for shared servers; fall back to
        // the account token for owned servers that omit it.
        accessToken: r.accessToken ?? authToken,
        localUrl,
        remoteUrl,
      };
    });
}

function providesServer(provides: string | undefined): boolean {
  return (provides ?? "")
    .split(",")
    .map((p) => p.trim())
    .includes("server");
}

// One localUrl + one remoteUrl per instance (the model holds a single pair, and
// getActiveUrl switches between them by home/away network state). Prefer https
// over http and IPv4 over IPv6; use Plex's provided `uri` verbatim so the
// *.plex.direct wildcard TLS cert stays valid.
function deriveUrls(connections: PlexConnection[]): {
  localUrl: string;
  remoteUrl: string;
} {
  const local = connections.filter((c) => c.local && !c.relay);
  const remote = connections.filter((c) => !c.local && !c.relay);
  const relay = connections.filter((c) => c.relay);

  // For local, also weigh which address a phone on home Wi-Fi can actually
  // reach — Plex-in-Docker frequently advertises a 172.16–31.x bridge address.
  const localPick = pickConnection(local, true);
  const remotePick = pickConnection(remote) ?? pickConnection(relay);
  return {
    localUrl: localPick?.uri ?? "",
    remoteUrl: remotePick?.uri ?? "",
  };
}

// Lower is better. Plex-in-Docker commonly advertises a 172.16–31.x bridge
// address that's only reachable inside the container host; rank real home-LAN
// ranges (192.168.x / 10.x) ahead of it so auto-fill prefers a reachable URL
// when Plex offers more than one local connection.
function lanReachRank(address: string): number {
  if (/^(192\.168\.|10\.)/.test(address)) return 0;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2; // Docker-likely
  return 1;
}

function connScore(c: PlexConnection, preferLan: boolean): number {
  return (
    (preferLan ? lanReachRank(c.address) * 100 : 0) +
    (c.protocol === "https" ? 0 : 10) + // https (valid plex.direct cert)
    (c.IPv6 ? 1 : 0) // IPv4 preferred
  );
}

function pickConnection(
  conns: PlexConnection[],
  preferLan = false,
): PlexConnection | undefined {
  if (conns.length === 0) return undefined;
  return [...conns].sort(
    (a, b) => connScore(a, preferLan) - connScore(b, preferLan),
  )[0];
}

// Resolves true if the wait was cut short by an abort, false if it elapsed.
function sleepOrAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    signal.addEventListener("abort", onAbort);
  });
}
