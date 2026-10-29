// pushConfigSnapshot against a mocked fetch: the legacy-backend retry for
// per-instance categories a backend <= v1.9.0 predates (#464). Both stores are
// stubbed to break the AsyncStorage import chain.
const mockConfigRef: { current: any } = { current: null };
jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: () => mockConfigRef.current },
}));
jest.mock("@/store/backend-store", () => ({
  useBackendStore: {
    getState: () => ({ url: "http://backend.local:4000", sharedSecret: "s".repeat(64) }),
  },
}));

import { pushConfigSnapshot } from "@/services/backend-api";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/config-defaults";
import type { NotificationSettings } from "@/lib/config-types";

function setNotifications(over: Partial<NotificationSettings>) {
  mockConfigRef.current = {
    serviceInstances: {
      radarr: [
        { id: "r1", enabled: true, name: "Radarr", localUrl: "http://radarr:7878", remoteUrl: "", useRemote: false },
      ],
    },
    instanceSecrets: { r1: { apiKey: "key", username: "", password: "" } },
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...over },
  };
}

function respond(status: number) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers() };
}

let originalFetch: typeof global.fetch;
let fetchSpy: jest.Mock;

beforeEach(() => {
  originalFetch = global.fetch;
  fetchSpy = jest.fn();
  global.fetch = fetchSpy as unknown as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function sentNotifications(call: number): Record<string, unknown> {
  const init = fetchSpy.mock.calls[call]![1] as RequestInit;
  return JSON.parse(init.body as string).notifications;
}

describe("pushConfigSnapshot", () => {
  it("sends the grab toggles alongside the other globals", async () => {
    setNotifications({ radarrGrabbed: true });
    fetchSpy.mockResolvedValueOnce(respond(200));
    await pushConfigSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe("http://backend.local:4000/config");
    expect(sentNotifications(0)).toMatchObject({ radarrGrabbed: true, sonarrGrabbed: false, radarrDownloaded: true });
  });

  it("retries a 400 once without the overrides an old backend can't parse", async () => {
    setNotifications({
      perInstance: { r1: { radarrGrabbed: true, radarrDownloaded: false }, s1: { sonarrGrabbed: false } },
    });
    fetchSpy.mockResolvedValueOnce(respond(400)).mockResolvedValueOnce(respond(200));
    await expect(pushConfigSnapshot()).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentNotifications(0).perInstance).toEqual({
      r1: { radarrGrabbed: true, radarrDownloaded: false },
      s1: { sonarrGrabbed: false },
    });
    const retried = sentNotifications(1);
    expect(retried.perInstance).toEqual({ r1: { radarrDownloaded: false } });
    // Everything else still lands.
    expect(retried).toMatchObject({ enabled: true, radarrDownloaded: true, serviceOffline: true });
  });

  it("drops perInstance entirely on the retry when only new categories were set", async () => {
    setNotifications({ perInstance: { r1: { radarrGrabbed: true } } });
    fetchSpy.mockResolvedValueOnce(respond(400)).mockResolvedValueOnce(respond(200));
    await pushConfigSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentNotifications(1)).not.toHaveProperty("perInstance");
  });

  it("does not retry a 400 when nothing would change", async () => {
    setNotifications({ perInstance: { r1: { radarrDownloaded: false } } });
    fetchSpy.mockResolvedValueOnce(respond(400));
    await expect(pushConfigSnapshot()).rejects.toMatchObject({ status: 400 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry other failures", async () => {
    setNotifications({ perInstance: { r1: { radarrGrabbed: true } } });
    fetchSpy.mockResolvedValueOnce(respond(401));
    await expect(pushConfigSnapshot()).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends the Cleanuparr toggles (#486), the defaults its per-instance overrides inherit", async () => {
    setNotifications({ cleanuparrCleaned: true });
    fetchSpy.mockResolvedValueOnce(respond(200));
    await pushConfigSnapshot();
    expect(sentNotifications(0)).toMatchObject({ cleanuparrRemoved: true, cleanuparrCleaned: true });
  });

  it("retries without Cleanuparr overrides on a backend that predates them", async () => {
    setNotifications({
      perInstance: { c1: { cleanuparrRemoved: false, serviceOffline: false }, c2: { cleanuparrCleaned: true } },
    });
    fetchSpy.mockResolvedValueOnce(respond(400)).mockResolvedValueOnce(respond(200));
    await pushConfigSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentNotifications(1).perInstance).toEqual({ c1: { serviceOffline: false } });
  });

  it("surfaces the retry's own failure", async () => {
    setNotifications({ perInstance: { r1: { radarrGrabbed: true } } });
    fetchSpy.mockResolvedValueOnce(respond(400)).mockResolvedValueOnce(respond(500));
    await expect(pushConfigSnapshot()).rejects.toMatchObject({ status: 500 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
