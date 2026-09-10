/**
 * Pure helpers for Seerr's sign-in modes (#332).
 *
 * No imports from the store or http-client, on purpose: store/config-store.ts
 * imports `SeerrAuthMode` from here for its `ServiceConfig` type, and
 * lib/http-client.ts's connection probe calls the classifier below. A value
 * import in either direction would be a cycle, and http-client drags React
 * Native shims into what should be a plain unit test (the lib/pihole-normalize
 * precedent). Verdicts are therefore a local structural type rather than
 * http-client's `ConnectionTestResult`, which they satisfy by shape.
 *
 * Everything here is verified against seerr-team/seerr@develop
 * (server/routes/auth.ts, server/middleware/auth.ts, server/lib/settings) and
 * cross-checked with sct/overseerr@develop, which shares the same auth routes
 * minus /auth/jellyfin.
 */

/**
 * How one Seerr instance authenticates.
 *
 * - `apiKey`: the admin API key in `X-Api-Key` (pre-#332 behavior, and the
 *   value an absent field resolves to).
 * - `plex`: `POST /auth/plex {authToken}` with a plex.tv account token
 *   obtained through the app's PIN flow. The token lives in `secrets.apiKey`,
 *   the same slot the Plex service uses for its own PIN-flow token.
 * - `mediaServer`: `POST /auth/jellyfin {username, password}`. One endpoint
 *   serves BOTH Jellyfin and Emby upstream; there is no /auth/emby.
 * - `local`: `POST /auth/local {email, password}`. The email is stored in
 *   `secrets.username`.
 *
 * The three session modes ride Seerr's express-session cookie, which the
 * platform cookie jar holds and JS can never read (services/qbittorrent-api.ts
 * explains why). In those modes `X-Api-Key` must never be sent: Seerr's
 * checkUser middleware gives the header precedence over the session.
 */
export type SeerrAuthMode = "apiKey" | "plex" | "mediaServer" | "local";

export const SEERR_AUTH_MODES: readonly SeerrAuthMode[] = [
  "apiKey",
  "plex",
  "mediaServer",
  "local",
];

export function isSeerrAuthMode(value: unknown): value is SeerrAuthMode {
  return typeof value === "string" && (SEERR_AUTH_MODES as readonly string[]).includes(value);
}

/** The instance's mode, with absence meaning the pre-#332 API-key behavior. */
export function seerrAuthMode(inst?: { authMode?: SeerrAuthMode } | null): SeerrAuthMode {
  return inst?.authMode ?? "apiKey";
}

/** True for the modes that hold a session cookie instead of sending a key. */
export function seerrUsesSession(mode: SeerrAuthMode): boolean {
  return mode !== "apiKey";
}

// ---------------------------------------------------------------------------
// /auth/me and login responses
// ---------------------------------------------------------------------------

/**
 * The slice of Seerr's User entity the app keeps.
 *
 * `GET /auth/me` returns the raw entity and every login route returns
 * `user.filter()`; both carry `permissions` (an integer bitfield, default 0)
 * and `displayName`, which the entity sets in an @AfterLoad hook. The token
 * and password columns are `select: false` upstream so they are never on the
 * wire, but this parser still copies only what it needs.
 */
export interface SeerrMe {
  id: number;
  displayName: string;
  /** Bitfield; see lib/seerr-permissions.ts for the bits. */
  permissions: number;
  avatar?: string;
  email?: string;
  userType?: number;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Parse a User payload, or null when it is not one. */
export function readSeerrMe(body: unknown): SeerrMe | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const v = body as Record<string, unknown>;
  if (typeof v.id !== "number" || !Number.isFinite(v.id)) return null;
  // Mirrors User.setDisplayName(): username || plexUsername || jellyfinUsername
  // || email. Present on every real response, but a hand-rolled proxy that
  // strips unknown fields would otherwise leave the account nameless.
  const displayName =
    readString(v.displayName) ??
    readString(v.username) ??
    readString(v.plexUsername) ??
    readString(v.jellyfinUsername) ??
    readString(v.email) ??
    `User #${v.id}`;
  const permissions =
    typeof v.permissions === "number" && Number.isFinite(v.permissions)
      ? v.permissions
      : 0;
  const me: SeerrMe = { id: v.id, displayName, permissions };
  const avatar = readString(v.avatar);
  if (avatar) me.avatar = avatar;
  const email = readString(v.email);
  if (email) me.email = email;
  if (typeof v.userType === "number") me.userType = v.userType;
  return me;
}

// ---------------------------------------------------------------------------
// Login requests
// ---------------------------------------------------------------------------

export type SeerrLoginPath = "/auth/plex" | "/auth/jellyfin" | "/auth/local";

export interface SeerrLoginRequest {
  path: SeerrLoginPath;
  body: Record<string, string>;
}

/**
 * The POST a mode needs, or null for the API-key mode.
 *
 * Deliberately never includes `hostname`, `port`, `urlBase` or `useSsl`:
 * /auth/jellyfin answers 500 "Jellyfin hostname already configured" when any
 * of them arrives at a server that already has a media server set up, which
 * is every server this app will ever talk to.
 */
export function buildSeerrLoginRequest(
  mode: SeerrAuthMode,
  secrets: { apiKey?: string; username?: string; password?: string },
): SeerrLoginRequest | null {
  switch (mode) {
    case "apiKey":
      return null;
    case "plex":
      return { path: "/auth/plex", body: { authToken: secrets.apiKey ?? "" } };
    case "mediaServer":
      return {
        path: "/auth/jellyfin",
        body: { username: secrets.username ?? "", password: secrets.password ?? "" },
      };
    case "local":
      return {
        path: "/auth/local",
        body: { email: secrets.username ?? "", password: secrets.password ?? "" },
      };
  }
}

/** True when the form holds enough to attempt a login in this mode. */
export function seerrHasCredential(
  mode: SeerrAuthMode,
  secrets: { apiKey?: string; username?: string; password?: string },
): boolean {
  switch (mode) {
    case "apiKey":
    case "plex":
      return Boolean(secrets.apiKey);
    case "mediaServer":
    case "local":
      return Boolean(secrets.username) && Boolean(secrets.password);
  }
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/** Structurally a `ConnectionTestResult` failure arm (lib/http-client.ts). */
export interface SeerrLoginVerdict {
  kind: "auth_failed" | "unreachable";
  message: string;
}

export const SEERR_CSRF_MESSAGE =
  "Seerr has CSRF protection on, which blocks sign-in from apps. Turn it off in Seerr > Settings > General.";

export const SEERR_LOGIN_DISABLED_MESSAGE: Record<
  Exclude<SeerrAuthMode, "apiKey">,
  string
> = {
  plex: "Plex sign-in is disabled in Seerr",
  mediaServer: "Jellyfin/Emby sign-in is disabled in Seerr",
  local: "Password sign-in is disabled in Seerr",
};

export const SEERR_NO_JELLYFIN_ROUTE_MESSAGE =
  "This server has no Jellyfin/Emby sign-in (Overseerr). Use Plex or email sign-in.";

export const SEERR_PLEX_DENIED_MESSAGE =
  "This Plex account is not allowed on this Seerr (not shared the server, or new Plex sign-ins are off)";

export const SEERR_PLEX_TOKEN_REJECTED_MESSAGE =
  "Plex token was rejected. Sign in with Plex again.";

export const SEERR_MEDIA_SERVER_UNREACHABLE_MESSAGE =
  "Seerr could not reach its Jellyfin/Emby server";

export const SEERR_MISSING_CREDENTIAL_MESSAGE: Record<
  Exclude<SeerrAuthMode, "apiKey">,
  string
> = {
  plex: "Sign in with Plex first",
  mediaServer: "Enter your Jellyfin/Emby username and password",
  local: "Enter your Seerr email and password",
};

/**
 * The human text out of whichever envelope Seerr used. Its routes answer with
 * `{error}` (inline `res.status(500).json({error})`), `{status, message}`
 * (the `next({status, message})` handler) or, for csurf, a text/html body.
 */
export function readSeerrErrorMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const v = body as Record<string, unknown>;
  if (typeof v.error === "string") return v.error;
  if (typeof v.message === "string") return v.message;
  return "";
}

const WRONG_CREDENTIALS: Record<Exclude<SeerrAuthMode, "apiKey">, string> = {
  plex: SEERR_PLEX_DENIED_MESSAGE,
  mediaServer: "Wrong username or password",
  local: "Wrong email or password",
};

/**
 * Map a failed login response to a probe verdict.
 *
 * `auth_failed` means "change something in the form"; `unreachable` means the
 * server, its configuration or the path in front of it is the problem. A CSRF
 * rejection is the latter even though it is a 403: nothing the user types will
 * get past it, and the fix is a Seerr setting.
 */
export function classifySeerrLoginFailure(
  status: number,
  body: unknown,
  mode: SeerrAuthMode,
  hasCredential: boolean,
): SeerrLoginVerdict {
  if (mode === "apiKey") {
    return status === 401 || status === 403
      ? { kind: "auth_failed", message: "Invalid API key" }
      : status >= 500
        ? { kind: "unreachable", message: `Server error ${status}` }
        : { kind: "unreachable", message: `Unexpected status ${status}` };
  }

  const message = readSeerrErrorMessage(body);

  if (status === 403) {
    if (/invalid csrf token/i.test(message)) {
      return { kind: "unreachable", message: SEERR_CSRF_MESSAGE };
    }
    return {
      kind: "auth_failed",
      message: hasCredential
        ? WRONG_CREDENTIALS[mode]
        : SEERR_MISSING_CREDENTIAL_MESSAGE[mode],
    };
  }

  // Overseerr never registered /auth/jellyfin, so the express 404 handler
  // answers. The user picked a mode this server does not have.
  if (status === 404 && mode === "mediaServer") {
    return { kind: "auth_failed", message: SEERR_NO_JELLYFIN_ROUTE_MESSAGE };
  }

  if (status === 500) {
    if (/login is disabled|sign-in is disabled/i.test(message)) {
      return { kind: "auth_failed", message: SEERR_LOGIN_DISABLED_MESSAGE[mode] };
    }
    // ApiErrorCode strings from server/constants/error.ts, surfaced verbatim
    // as `message` by the /auth/jellyfin catch block.
    switch (message) {
      case "INVALID_CREDENTIALS":
        return { kind: "auth_failed", message: WRONG_CREDENTIALS[mode] };
      case "NOT_ADMIN":
      case "NO_ADMIN_USER":
        return {
          kind: "auth_failed",
          message:
            "This Seerr has no admin user yet. Finish its setup in a browser first.",
        };
      case "INVALID_URL":
      case "CONNECTION_ERROR":
        return { kind: "unreachable", message: SEERR_MEDIA_SERVER_UNREACHABLE_MESSAGE };
      default:
        break;
    }
    if (mode === "plex" && /unable to authenticate/i.test(message)) {
      return { kind: "auth_failed", message: SEERR_PLEX_TOKEN_REJECTED_MESSAGE };
    }
    return { kind: "unreachable", message: message || `Server error ${status}` };
  }

  if (status >= 500) return { kind: "unreachable", message: `Server error ${status}` };
  return { kind: "unreachable", message: `Unexpected status ${status}` };
}

/** 401 and 403 are the two ways Seerr says "no session". */
export function isSeerrSessionRejection(status: number): boolean {
  return status === 401 || status === 403;
}

// ---------------------------------------------------------------------------
// Which sign-in methods a server offers
// ---------------------------------------------------------------------------

/**
 * The anonymous `GET /settings/public` payload, narrowed to the login flags.
 * Overseerr sends only `localLogin` and `newPlexLogin`; Seerr adds the media
 * server pair. Every field is optional so either fork parses.
 */
export interface SeerrPublicSettings {
  localLogin?: boolean;
  mediaServerLogin?: boolean;
  /** MediaServerType upstream: PLEX = 1, JELLYFIN = 2, EMBY = 3, NOT_CONFIGURED = 4. */
  mediaServerType?: number;
  newPlexLogin?: boolean;
  applicationTitle?: string;
}

export const SEERR_MEDIA_SERVER_JELLYFIN = 2;
export const SEERR_MEDIA_SERVER_EMBY = 3;

export function readSeerrPublicSettings(body: unknown): SeerrPublicSettings | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const v = body as Record<string, unknown>;
  const out: SeerrPublicSettings = {};
  if (typeof v.localLogin === "boolean") out.localLogin = v.localLogin;
  if (typeof v.mediaServerLogin === "boolean") out.mediaServerLogin = v.mediaServerLogin;
  if (typeof v.mediaServerType === "number") out.mediaServerType = v.mediaServerType;
  if (typeof v.newPlexLogin === "boolean") out.newPlexLogin = v.newPlexLogin;
  if (typeof v.applicationTitle === "string") out.applicationTitle = v.applicationTitle;
  return out;
}

/**
 * The modes the editor should offer for a server.
 *
 * `null` (the settings fetch failed) offers everything: a reverse-proxy hiccup
 * must never hide the mode the user is about to configure. `apiKey` and
 * `plex` are always offered because both forks have those routes; whether
 * Plex sign-in is *enabled* is only learnable by trying (the route checks it
 * server-side and answers "Plex login is disabled", which the classifier
 * turns into an actionable message).
 */
export function availableSeerrSignInModes(
  settings: SeerrPublicSettings | null,
): SeerrAuthMode[] {
  if (!settings) return [...SEERR_AUTH_MODES];
  const modes: SeerrAuthMode[] = ["apiKey", "plex"];
  if (
    settings.mediaServerLogin === true &&
    (settings.mediaServerType === SEERR_MEDIA_SERVER_JELLYFIN ||
      settings.mediaServerType === SEERR_MEDIA_SERVER_EMBY)
  ) {
    modes.push("mediaServer");
  }
  if (settings.localLogin !== false) modes.push("local");
  return modes;
}

export const SEERR_AUTH_MODE_LABELS: Record<SeerrAuthMode, string> = {
  apiKey: "API key (admin)",
  plex: "Plex account",
  mediaServer: "Jellyfin / Emby account",
  local: "Seerr email and password",
};
