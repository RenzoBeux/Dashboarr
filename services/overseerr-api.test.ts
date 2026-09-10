// Mock the http client entirely, the services/navidrome-api.test.ts idiom: the
// wrapper under test routes every call through serviceRequest, and mocking the
// module also keeps the config-store / AsyncStorage import chain out of the
// test environment. HttpError and AuthProxyResponseError are re-implemented so
// the rejection branches are testable. lib/seerr-session is the REAL module:
// its generation rules are the thing the retry logic is built on.
jest.mock("@/lib/http-client", () => {
  class HttpError extends Error {
    status: number;
    statusText: string;
    url: string;
    body?: unknown;
    constructor(status: number, statusText: string, url: string, body?: unknown) {
      super(`HTTP ${status} ${statusText}`);
      this.name = "HttpError";
      this.status = status;
      this.statusText = statusText;
      this.url = url;
      this.body = body;
    }
  }
  class AuthProxyResponseError extends HttpError {}
  return {
    serviceRequest: jest.fn(),
    ensureSeerrSession: jest.fn(),
    seerrFetchMe: jest.fn(),
    seerrLogout: jest.fn(async () => undefined),
    HttpError,
    AuthProxyResponseError,
    buildUrl: jest.requireActual("@/lib/url-builder").buildUrl,
  };
});

const mockState = {
  demoMode: false,
  instances: {} as Record<string, { authMode?: string }>,
};

jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => ({
      demoMode: mockState.demoMode,
      getActiveInstanceId: () => "inst-active",
      getInstance: (_kind: string, id: string) =>
        mockState.instances[id] ? { id, enabled: true, ...mockState.instances[id] } : undefined,
      getActiveUrl: () => "http://seerr.local:5055",
      getMergedHeaders: () => ({}),
      instanceSecrets: {},
    }),
  },
}));

import {
  AuthProxyResponseError,
  HttpError,
  ensureSeerrSession,
  seerrFetchMe,
  seerrLogout,
  serviceRequest,
} from "@/lib/http-client";
import {
  isSeerrSessionEstablished,
  resetSeerrSessions,
  seerrSessionGeneration,
  setSeerrSession,
} from "@/lib/seerr-session";
import { getRequestCount, getSeerrMe, seerrClearSession } from "./overseerr-api";

const mockedRequest = serviceRequest as jest.MockedFunction<typeof serviceRequest>;
const mockedEnsure = ensureSeerrSession as jest.MockedFunction<typeof ensureSeerrSession>;
const mockedFetchMe = seerrFetchMe as jest.MockedFunction<typeof seerrFetchMe>;
const mockedLogout = seerrLogout as jest.MockedFunction<typeof seerrLogout>;

const ID = "inst-active";
const ME = { id: 7, displayName: "Sarah", permissions: 32 };
const rejection = (status: number) => new HttpError(status, "Forbidden", "http://x", undefined);

beforeEach(() => {
  jest.clearAllMocks();
  resetSeerrSessions();
  mockState.demoMode = false;
  mockState.instances = { [ID]: {} };
  mockedEnsure.mockResolvedValue(ME);
});

describe("seerrRequest — API-key mode", () => {
  it("is a plain serviceRequest with no session handling", async () => {
    mockedRequest.mockResolvedValueOnce({ pending: 1 });
    await expect(getRequestCount()).resolves.toEqual({ pending: 1 });
    expect(mockedRequest).toHaveBeenCalledWith("overseerr", "/request/count", {
      instanceId: undefined,
    });
    expect(mockedEnsure).not.toHaveBeenCalled();
  });

  it("propagates a 403 untouched", async () => {
    mockedRequest.mockRejectedValueOnce(rejection(403));
    await expect(getRequestCount()).rejects.toBeInstanceOf(HttpError);
    expect(mockedEnsure).not.toHaveBeenCalled();
    expect(mockedFetchMe).not.toHaveBeenCalled();
  });
});

describe("seerrRequest — session modes (#332)", () => {
  beforeEach(() => {
    mockState.instances = { [ID]: { authMode: "local" } };
  });

  it("establishes the session before the request", async () => {
    mockedRequest.mockResolvedValueOnce({ pending: 2 });
    await expect(getRequestCount()).resolves.toEqual({ pending: 2 });
    expect(mockedEnsure).toHaveBeenCalledWith(ID);
    expect(mockedEnsure.mock.invocationCallOrder[0]).toBeLessThan(
      mockedRequest.mock.invocationCallOrder[0],
    );
    expect(mockedRequest).toHaveBeenCalledWith("overseerr", "/request/count", {
      instanceId: ID,
    });
  });

  it("re-logs in exactly once when the session is dead", async () => {
    setSeerrSession(ID, ME);
    const gen = seerrSessionGeneration(ID);
    mockedRequest.mockRejectedValueOnce(rejection(401)).mockResolvedValueOnce({ pending: 3 });
    mockedFetchMe.mockResolvedValueOnce(null);

    await expect(getRequestCount()).resolves.toEqual({ pending: 3 });
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(mockedEnsure).toHaveBeenCalledTimes(2);
    // The dead session was invalidated so ensureSeerrSession logged in again.
    expect(seerrSessionGeneration(ID)).toBe(gen + 1);
  });

  // Seerr says 403 for "no permission" too. A live session means that is
  // what happened; re-logging in would only churn server-side sessions.
  it("rethrows a permission 403 when the session is still live, without re-login", async () => {
    setSeerrSession(ID, ME);
    const gen = seerrSessionGeneration(ID);
    mockedRequest.mockRejectedValueOnce(rejection(403));
    mockedFetchMe.mockResolvedValueOnce(ME);

    await expect(getRequestCount()).rejects.toBeInstanceOf(HttpError);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(seerrSessionGeneration(ID)).toBe(gen);
    expect(isSeerrSessionEstablished(ID)).toBe(true);
  });

  it("gives up after a second rejection", async () => {
    mockedRequest.mockRejectedValueOnce(rejection(401)).mockRejectedValueOnce(rejection(401));
    mockedFetchMe.mockResolvedValue(null);
    await expect(getRequestCount()).rejects.toBeInstanceOf(HttpError);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("does not retry an auth-proxy page, even on a 403", async () => {
    mockedRequest.mockRejectedValueOnce(
      new AuthProxyResponseError(403, "Forbidden", "http://x", "<html>login</html>"),
    );
    await expect(getRequestCount()).rejects.toBeInstanceOf(AuthProxyResponseError);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(mockedFetchMe).not.toHaveBeenCalled();
  });

  it("does not retry non-auth failures", async () => {
    mockedRequest.mockRejectedValueOnce(rejection(500));
    await expect(getRequestCount()).rejects.toBeInstanceOf(HttpError);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  // Several queries share one session and get rejected together. The first
  // caller's generation matches and invalidates; the rest are stale no-ops,
  // so the shared cache is invalidated exactly once.
  it("invalidates once for concurrent rejections", async () => {
    setSeerrSession(ID, ME);
    const gen = seerrSessionGeneration(ID);
    mockedRequest
      .mockRejectedValueOnce(rejection(401))
      .mockRejectedValueOnce(rejection(401))
      .mockResolvedValue({ pending: 4 });
    mockedFetchMe.mockResolvedValue(null);

    await expect(Promise.all([getRequestCount(), getRequestCount()])).resolves.toEqual([
      { pending: 4 },
      { pending: 4 },
    ]);
    expect(seerrSessionGeneration(ID)).toBe(gen + 1);
  });

  it("falls back to plain serviceRequest in demo mode", async () => {
    mockState.demoMode = true;
    mockedRequest.mockResolvedValueOnce({ pending: 0 });
    await getRequestCount();
    expect(mockedEnsure).not.toHaveBeenCalled();
  });
});

describe("getSeerrMe", () => {
  it("uses the session in a sign-in mode", async () => {
    mockState.instances = { [ID]: { authMode: "plex" } };
    await expect(getSeerrMe()).resolves.toEqual(ME);
    expect(mockedEnsure).toHaveBeenCalledWith(ID);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("reads /auth/me with the key in API-key mode and caches the account", async () => {
    mockedRequest.mockResolvedValueOnce({ ...ME, id: 1, permissions: 2 });
    await expect(getSeerrMe()).resolves.toEqual({ id: 1, displayName: "Sarah", permissions: 2 });
    expect(mockedRequest).toHaveBeenCalledWith("overseerr", "/auth/me", { instanceId: ID });
    expect(isSeerrSessionEstablished(ID)).toBe(true);
  });

  it("rejects an unrecognised payload", async () => {
    mockedRequest.mockResolvedValueOnce("<html>");
    await expect(getSeerrMe()).rejects.toThrow(/unrecognized/i);
  });
});

describe("seerrClearSession", () => {
  it("logs an established sign-in session out and forgets it", async () => {
    mockState.instances = { [ID]: { authMode: "local" } };
    setSeerrSession(ID, ME);
    await seerrClearSession(ID);
    expect(mockedLogout).toHaveBeenCalledWith("http://seerr.local:5055", {});
    expect(isSeerrSessionEstablished(ID)).toBe(false);
  });

  it("does not log out in API-key mode, but still drops the cached account", async () => {
    setSeerrSession(ID, ME);
    await seerrClearSession(ID);
    expect(mockedLogout).not.toHaveBeenCalled();
    expect(isSeerrSessionEstablished(ID)).toBe(false);
  });

  it("is a no-op for an instance with no session", async () => {
    mockState.instances = { [ID]: { authMode: "local" } };
    await seerrClearSession(ID);
    expect(mockedLogout).not.toHaveBeenCalled();
  });
});
