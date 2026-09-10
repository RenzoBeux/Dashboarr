import {
  seerrHostOf,
  seerrSessionHostConflict,
  availableSeerrSignInModes,
  buildSeerrLoginRequest,
  classifySeerrLoginFailure,
  isSeerrAuthMode,
  isSeerrSessionRejection,
  readSeerrErrorMessage,
  readSeerrMe,
  readSeerrPublicSettings,
  seerrAuthMode,
  seerrHasCredential,
  seerrUsesSession,
  SEERR_CSRF_MESSAGE,
  SEERR_LOGIN_DISABLED_MESSAGE,
  SEERR_MEDIA_SERVER_UNREACHABLE_MESSAGE,
  SEERR_MISSING_CREDENTIAL_MESSAGE,
  SEERR_NO_JELLYFIN_ROUTE_MESSAGE,
  SEERR_PLEX_DENIED_MESSAGE,
  SEERR_PLEX_TOKEN_REJECTED_MESSAGE,
} from "./seerr-auth";

describe("mode helpers", () => {
  it("resolves an absent mode to apiKey", () => {
    expect(seerrAuthMode(undefined)).toBe("apiKey");
    expect(seerrAuthMode({})).toBe("apiKey");
    expect(seerrAuthMode({ authMode: "local" })).toBe("local");
  });

  it("treats every non-apiKey mode as a session", () => {
    expect(seerrUsesSession("apiKey")).toBe(false);
    expect(seerrUsesSession("plex")).toBe(true);
    expect(seerrUsesSession("mediaServer")).toBe(true);
    expect(seerrUsesSession("local")).toBe(true);
  });

  it("validates mode strings", () => {
    expect(isSeerrAuthMode("plex")).toBe(true);
    expect(isSeerrAuthMode("emby")).toBe(false);
    expect(isSeerrAuthMode(2)).toBe(false);
  });
});

describe("buildSeerrLoginRequest", () => {
  const secrets = { apiKey: "plex-token", username: "user@example.com", password: "pw" };

  it("is null for the API-key mode", () => {
    expect(buildSeerrLoginRequest("apiKey", secrets)).toBeNull();
  });

  it("posts the plex.tv token as authToken", () => {
    expect(buildSeerrLoginRequest("plex", secrets)).toEqual({
      path: "/auth/plex",
      body: { authToken: "plex-token" },
    });
  });

  it("posts username and password for Jellyfin and Emby alike", () => {
    expect(buildSeerrLoginRequest("mediaServer", secrets)).toEqual({
      path: "/auth/jellyfin",
      body: { username: "user@example.com", password: "pw" },
    });
  });

  it("maps the stored username to email for local sign-in", () => {
    expect(buildSeerrLoginRequest("local", secrets)).toEqual({
      path: "/auth/local",
      body: { email: "user@example.com", password: "pw" },
    });
  });

  // /auth/jellyfin 500s "Jellyfin hostname already configured" when any of
  // these arrive at a configured server, which is every server we talk to.
  it("never sends media-server connection fields", () => {
    for (const mode of ["plex", "mediaServer", "local"] as const) {
      const body = buildSeerrLoginRequest(mode, secrets)!.body;
      for (const key of ["hostname", "port", "urlBase", "useSsl", "serverType"]) {
        expect(body).not.toHaveProperty(key);
      }
    }
  });

  it("reports whether the form holds a usable credential", () => {
    expect(seerrHasCredential("plex", { apiKey: "t" })).toBe(true);
    expect(seerrHasCredential("plex", {})).toBe(false);
    expect(seerrHasCredential("local", { username: "a", password: "b" })).toBe(true);
    expect(seerrHasCredential("local", { username: "a" })).toBe(false);
    expect(seerrHasCredential("mediaServer", { password: "b" })).toBe(false);
    expect(seerrHasCredential("apiKey", { apiKey: "k" })).toBe(true);
  });
});

describe("readSeerrMe", () => {
  it("keeps only the fields the app needs", () => {
    expect(
      readSeerrMe({
        id: 7,
        displayName: "Sarah",
        permissions: 32,
        avatar: "/avatarproxy/x",
        email: "s@example.com",
        userType: 2,
        plexToken: "should-not-be-here",
        settings: { locale: "en" },
      }),
    ).toEqual({
      id: 7,
      displayName: "Sarah",
      permissions: 32,
      avatar: "/avatarproxy/x",
      email: "s@example.com",
      userType: 2,
    });
  });

  it("defaults permissions to 0", () => {
    expect(readSeerrMe({ id: 1, displayName: "x" })?.permissions).toBe(0);
  });

  it("falls back through the upstream displayName chain", () => {
    expect(readSeerrMe({ id: 1, username: "u" })?.displayName).toBe("u");
    expect(readSeerrMe({ id: 1, plexUsername: "p" })?.displayName).toBe("p");
    expect(readSeerrMe({ id: 1, jellyfinUsername: "j" })?.displayName).toBe("j");
    expect(readSeerrMe({ id: 1, email: "e@x" })?.displayName).toBe("e@x");
    expect(readSeerrMe({ id: 9 })?.displayName).toBe("User #9");
  });

  it("rejects anything that is not a user", () => {
    expect(readSeerrMe(null)).toBeNull();
    expect(readSeerrMe("nope")).toBeNull();
    expect(readSeerrMe([])).toBeNull();
    expect(readSeerrMe({ displayName: "no id" })).toBeNull();
    expect(readSeerrMe({ id: "1" })).toBeNull();
  });
});

describe("readSeerrErrorMessage", () => {
  it("reads every envelope Seerr uses", () => {
    expect(readSeerrErrorMessage({ error: "Plex login is disabled" })).toBe(
      "Plex login is disabled",
    );
    expect(readSeerrErrorMessage({ status: 403, message: "Access denied." })).toBe(
      "Access denied.",
    );
    expect(readSeerrErrorMessage("<html>invalid csrf token</html>")).toContain("csrf");
    expect(readSeerrErrorMessage(undefined)).toBe("");
    expect(readSeerrErrorMessage({})).toBe("");
  });
});

describe("classifySeerrLoginFailure", () => {
  it("keeps the API-key verdicts", () => {
    expect(classifySeerrLoginFailure(403, undefined, "apiKey", true)).toEqual({
      kind: "auth_failed",
      message: "Invalid API key",
    });
    expect(classifySeerrLoginFailure(502, undefined, "apiKey", true).kind).toBe(
      "unreachable",
    );
  });

  // csurf sits in front of the session, so nothing typed into the form can
  // get past it. That is a server setting, not a credential problem.
  it("classifies a CSRF rejection as unreachable with the fix", () => {
    for (const body of [
      "ForbiddenError: invalid csrf token",
      { message: "invalid csrf token" },
      { error: "Invalid CSRF token" },
    ]) {
      expect(classifySeerrLoginFailure(403, body, "local", true)).toEqual({
        kind: "unreachable",
        message: SEERR_CSRF_MESSAGE,
      });
    }
  });

  it("maps 403 to wrong credentials per mode", () => {
    const denied = { status: 403, message: "Access denied." };
    expect(classifySeerrLoginFailure(403, denied, "local", true)).toEqual({
      kind: "auth_failed",
      message: "Wrong email or password",
    });
    expect(classifySeerrLoginFailure(403, denied, "mediaServer", true)).toEqual({
      kind: "auth_failed",
      message: "Wrong username or password",
    });
    expect(classifySeerrLoginFailure(403, denied, "plex", true)).toEqual({
      kind: "auth_failed",
      message: SEERR_PLEX_DENIED_MESSAGE,
    });
  });

  it("asks for the credential when the form was empty", () => {
    expect(classifySeerrLoginFailure(403, undefined, "local", false).message).toBe(
      SEERR_MISSING_CREDENTIAL_MESSAGE.local,
    );
    expect(classifySeerrLoginFailure(403, undefined, "plex", false).message).toBe(
      SEERR_MISSING_CREDENTIAL_MESSAGE.plex,
    );
  });

  // Overseerr never registered /auth/jellyfin.
  it("explains a 404 on the Jellyfin route as an Overseerr server", () => {
    expect(classifySeerrLoginFailure(404, "Cannot POST", "mediaServer", true)).toEqual({
      kind: "auth_failed",
      message: SEERR_NO_JELLYFIN_ROUTE_MESSAGE,
    });
    expect(classifySeerrLoginFailure(404, "Cannot POST", "local", true).kind).toBe(
      "unreachable",
    );
  });

  it("maps the sign-in-disabled 500s to an actionable auth failure", () => {
    expect(
      classifySeerrLoginFailure(500, { error: "Jellyfin login is disabled" }, "mediaServer", true),
    ).toEqual({ kind: "auth_failed", message: SEERR_LOGIN_DISABLED_MESSAGE.mediaServer });
    expect(
      classifySeerrLoginFailure(500, { error: "Password sign-in is disabled." }, "local", true),
    ).toEqual({ kind: "auth_failed", message: SEERR_LOGIN_DISABLED_MESSAGE.local });
    expect(
      classifySeerrLoginFailure(500, { error: "Plex login is disabled" }, "plex", true),
    ).toEqual({ kind: "auth_failed", message: SEERR_LOGIN_DISABLED_MESSAGE.plex });
  });

  it("maps the ApiErrorCode strings from /auth/jellyfin", () => {
    const at = (code: string) =>
      classifySeerrLoginFailure(500, { status: 500, message: code }, "mediaServer", true);
    expect(at("INVALID_CREDENTIALS")).toEqual({
      kind: "auth_failed",
      message: "Wrong username or password",
    });
    expect(at("NOT_ADMIN").kind).toBe("auth_failed");
    expect(at("NO_ADMIN_USER").kind).toBe("auth_failed");
    expect(at("INVALID_URL")).toEqual({
      kind: "unreachable",
      message: SEERR_MEDIA_SERVER_UNREACHABLE_MESSAGE,
    });
    expect(at("CONNECTION_ERROR")).toEqual({
      kind: "unreachable",
      message: SEERR_MEDIA_SERVER_UNREACHABLE_MESSAGE,
    });
  });

  it("treats a rejected Plex token as something to re-mint", () => {
    expect(
      classifySeerrLoginFailure(500, { status: 500, message: "Unable to authenticate." }, "plex", true),
    ).toEqual({ kind: "auth_failed", message: SEERR_PLEX_TOKEN_REJECTED_MESSAGE });
    // The same text from /auth/local is its catch-all DB error.
    expect(
      classifySeerrLoginFailure(500, { status: 500, message: "Unable to authenticate." }, "local", true).kind,
    ).toBe("unreachable");
  });

  it("falls back to generic server verdicts", () => {
    expect(classifySeerrLoginFailure(503, undefined, "local", true)).toEqual({
      kind: "unreachable",
      message: "Server error 503",
    });
    expect(classifySeerrLoginFailure(418, undefined, "local", true)).toEqual({
      kind: "unreachable",
      message: "Unexpected status 418",
    });
  });

  it("knows which statuses mean no session", () => {
    expect(isSeerrSessionRejection(401)).toBe(true);
    expect(isSeerrSessionRejection(403)).toBe(true);
    expect(isSeerrSessionRejection(404)).toBe(false);
    expect(isSeerrSessionRejection(500)).toBe(false);
  });
});

describe("availableSeerrSignInModes", () => {
  it("offers everything when the settings could not be read", () => {
    expect(availableSeerrSignInModes(null)).toEqual(["apiKey", "plex", "mediaServer", "local"]);
  });

  it("offers Jellyfin/Emby sign-in only for those media servers with login on", () => {
    expect(
      availableSeerrSignInModes({ localLogin: true, mediaServerLogin: true, mediaServerType: 2 }),
    ).toEqual(["apiKey", "plex", "mediaServer", "local"]);
    expect(
      availableSeerrSignInModes({ localLogin: true, mediaServerLogin: true, mediaServerType: 3 }),
    ).toEqual(["apiKey", "plex", "mediaServer", "local"]);
    // A Plex-backed Seerr: the media-server login flag is about Plex there.
    expect(
      availableSeerrSignInModes({ localLogin: true, mediaServerLogin: true, mediaServerType: 1 }),
    ).toEqual(["apiKey", "plex", "local"]);
    expect(
      availableSeerrSignInModes({ localLogin: true, mediaServerLogin: false, mediaServerType: 2 }),
    ).toEqual(["apiKey", "plex", "local"]);
    expect(
      availableSeerrSignInModes({ localLogin: true, mediaServerLogin: true, mediaServerType: 4 }),
    ).toEqual(["apiKey", "plex", "local"]);
  });

  it("drops local sign-in only when it is explicitly off", () => {
    expect(availableSeerrSignInModes({ localLogin: false })).toEqual(["apiKey", "plex"]);
    // Overseerr's payload has no media-server fields at all.
    expect(availableSeerrSignInModes({ localLogin: true, newPlexLogin: true })).toEqual([
      "apiKey",
      "plex",
      "local",
    ]);
    expect(availableSeerrSignInModes({})).toEqual(["apiKey", "plex", "local"]);
  });

  it("parses the public settings payload leniently", () => {
    expect(
      readSeerrPublicSettings({
        localLogin: true,
        mediaServerLogin: "yes",
        mediaServerType: 2,
        applicationTitle: "Seerr",
        vapidPublic: "ignored",
      }),
    ).toEqual({ localLogin: true, mediaServerType: 2, applicationTitle: "Seerr" });
    expect(readSeerrPublicSettings("<html>")).toBeNull();
    expect(readSeerrPublicSettings(null)).toBeNull();
  });
});

describe("seerrHostOf", () => {
  it("reduces a URL to its cookie-scoping host", () => {
    expect(seerrHostOf("http://Seerr.local:5055/api")).toBe("seerr.local");
    expect(seerrHostOf("https://user:pw@seerr.example.com/")).toBe("seerr.example.com");
    expect(seerrHostOf("seerr.local")).toBe("seerr.local");
    expect(seerrHostOf("")).toBe("");
  });
});

describe("seerrSessionHostConflict", () => {
  const me = { id: "a", authMode: "local" as const, localUrl: "http://seerr.local:5055", remoteUrl: "https://seerr.example.com" };

  // The platform jar scopes connect.sid by host, so two signed-in instances
  // on one host would share one real session and act as each other.
  it("flags another signed-in instance on the same host, on either URL slot", () => {
    const other = { id: "b", name: "Cabin", authMode: "plex" as const, localUrl: "", remoteUrl: "http://SEERR.LOCAL:5055/" };
    expect(seerrSessionHostConflict(me, [me, other])).toBe(other);
    const viaRemote = { ...other, remoteUrl: "https://seerr.example.com:443" };
    expect(seerrSessionHostConflict(me, [viaRemote])).toBe(viaRemote);
  });

  it("ignores API-key instances, other hosts, and itself", () => {
    expect(seerrSessionHostConflict(me, [{ id: "b", localUrl: "http://seerr.local:5055", remoteUrl: "" }])).toBeNull();
    expect(seerrSessionHostConflict(me, [{ id: "b", authMode: "local", localUrl: "http://other.local:5055", remoteUrl: "" }])).toBeNull();
    expect(seerrSessionHostConflict(me, [me])).toBeNull();
  });

  it("never flags an API-key instance", () => {
    const keyed = { ...me, authMode: undefined };
    expect(seerrSessionHostConflict(keyed, [{ id: "b", authMode: "local", localUrl: "http://seerr.local", remoteUrl: "" }])).toBeNull();
  });
});
