// Mock the storage layer before importing anything that pulls in the config
// store (http-client → config-store → storage.ts → AsyncStorage/SecureStore),
// which aren't available in the jest-expo node environment.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { useConfigStore } from "@/store/config-store";
import {
  addDelugeTorrent,
  delugeClearSession,
  getDelugeTorrents,
  pauseDelugeTorrents,
  removeDelugeTorrents,
} from "@/services/deluge-api";

// Everything demo mode structurally cannot cover: what we actually put on the
// wire, and the two recovery paths Deluge forces on every client — the session
// cookie (HTTP 200 + error code 1) and the daemon handshake (HTTP 200 + error
// code 2, which reads as "Unknown method" rather than any kind of
// connection error).
const ID = "deluge-actions-uuid";
const URL = "http://deluge.local:8112";

type Call = [string, { method: string; headers: Headers; body: string }];

function ok(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({
      "content-type": "application/json",
      "set-cookie": "_session_id=sess-1; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT",
    }),
    json: async () => ({ result, error: null, id: 1 }),
    text: async () => "",
    clone() {
      return this;
    },
  };
}

// Deluge reports EVERY failure as HTTP 200 with an error object.
function rpcError(code: number, message: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ result: null, error: { message, code }, id: 1 }),
    text: async () => "",
    clone() {
      return this;
    },
  };
}

const bodyOf = (call: Call) => JSON.parse(call[1].body) as { method: string; params: unknown[] };
const methodsOf = (calls: Call[]) => calls.map((c) => bodyOf(c).method);

describe("deluge-api (transport)", () => {
  let originalFetch: typeof global.fetch;
  let fetchSpy: jest.Mock;
  let restore: Record<string, unknown>;

  beforeAll(() => {
    const state = useConfigStore.getState();
    // Capture what we are about to overwrite: this installs a real (non-demo)
    // instance into the shared, process-wide Zustand store, and without the
    // matching afterAll any suite appended after this one would inherit it.
    restore = {
      demoMode: state.demoMode,
      serviceInstances: state.serviceInstances,
      instanceSecrets: state.instanceSecrets,
      activeInstance: state.activeInstance,
    };
    useConfigStore.setState({
      demoMode: false,
      serviceInstances: {
        ...state.serviceInstances,
        deluge: [
          {
            id: ID,
            enabled: true,
            name: "Deluge",
            localUrl: URL,
            remoteUrl: "",
            useRemote: false,
          },
        ],
      },
      instanceSecrets: { ...state.instanceSecrets, [ID]: { password: "hunter2" } },
      activeInstance: { ...state.activeInstance, deluge: ID },
    } as any);
  });

  afterAll(() => {
    useConfigStore.setState(restore as any);
  });

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    // Module-level session cache shared with every other test in this file.
    delugeClearSession();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const calls = () => fetchSpy.mock.calls as Call[];

  it("logs in, attaches the daemon, then lists — in that order", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true)) // auth.login
      .mockResolvedValueOnce(ok(false)) // web.connected → not attached
      .mockResolvedValueOnce(ok([["host-1", "127.0.0.1", 58846, "localclient"]])) // web.get_hosts
      .mockResolvedValueOnce(ok(["core.get_torrents_status"])) // web.connect
      .mockResolvedValueOnce(ok({}));

    await getDelugeTorrents();

    expect(methodsOf(calls())).toEqual([
      "auth.login",
      "web.connected",
      "web.get_hosts",
      "web.connect",
      "core.get_torrents_status",
    ]);
    // web.connect takes the host id from the first element of the tuple.
    expect(bodyOf(calls()[3]).params).toEqual(["host-1"]);
  });

  it("skips the host lookup when the daemon is already attached", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true)) // web.connected → already attached
      .mockResolvedValueOnce(ok({}));

    await getDelugeTorrents();

    expect(methodsOf(calls())).toEqual([
      "auth.login",
      "web.connected",
      "core.get_torrents_status",
    ]);
  });

  it("sends a bare application/json content type and the mandatory id", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok({}));

    await getDelugeTorrents();

    for (const call of calls()) {
      // Deluge <= 2.0.5 string-compares this header, so a "; charset=utf-8"
      // suffix — which most HTTP stacks append by default — is rejected
      // outright with error code 5.
      expect(call[1].headers.get("content-type")).toBe("application/json");
      // method/params/id are all read with plain indexing; a missing id fails
      // the whole request.
      const parsed = JSON.parse(call[1].body);
      expect(typeof parsed.id).toBe("number");
      expect(Array.isArray(parsed.params)).toBe(true);
    }
    expect(calls()[0][1].method).toBe("POST");
    expect(calls()[0][0]).toBe(`${URL}/json`);
  });

  it("never sends an empty key list — that would return every field per torrent", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok({}));

    await getDelugeTorrents();

    const [filter, keys] = bodyOf(calls()[2]).params as [unknown, string[]];
    expect(filter).toEqual({});
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain("name");
    expect(keys).toContain("state");
    // save_path, not download_location — the deprecated alias is the portable
    // one and is what exists as a status key on every version.
    expect(keys).toContain("save_path");
  });

  it("re-runs the daemon handshake when a core call answers 'Unknown method'", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true)) // auth.login
      .mockResolvedValueOnce(ok(true)) // web.connected
      .mockResolvedValueOnce(rpcError(2, "Unknown method")) // daemon detached
      .mockResolvedValueOnce(ok(false)) // web.connected → false
      .mockResolvedValueOnce(ok([["host-1", "127.0.0.1", 58846, "u"]]))
      .mockResolvedValueOnce(ok(["core.get_torrents_status"]))
      .mockResolvedValueOnce(ok({}));

    await expect(getDelugeTorrents()).resolves.toEqual([]);

    expect(methodsOf(calls())).toEqual([
      "auth.login",
      "web.connected",
      "core.get_torrents_status",
      "web.connected",
      "web.get_hosts",
      "web.connect",
      "core.get_torrents_status",
    ]);
  });

  it("re-logs in when the session has expired (error code 1, HTTP 200)", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(rpcError(1, "Not authenticated"))
      .mockResolvedValueOnce(ok(true)) // fresh auth.login
      .mockResolvedValueOnce(ok(true)) // web.connected
      .mockResolvedValueOnce(ok({}));

    await expect(getDelugeTorrents()).resolves.toEqual([]);

    expect(methodsOf(calls())).toEqual([
      "auth.login",
      "web.connected",
      "core.get_torrents_status",
      "auth.login",
      "web.connected",
      "core.get_torrents_status",
    ]);
  });

  it("recovers when the session expires DURING the daemon handshake", async () => {
    // The handshake issues real authenticated RPCs, so an expired session can
    // surface from web.connected rather than from the payload call. With the
    // session setup hoisted outside the retry that code 1 escaped recovery and
    // — since nothing cleared the stale cookie — every later call repeated it,
    // wedging the instance until the app restarted.
    fetchSpy
      .mockResolvedValueOnce(ok(true)) // auth.login
      .mockResolvedValueOnce(ok(true)) // web.connected
      .mockResolvedValueOnce(rpcError(2, "Unknown method")) // daemon detached
      .mockResolvedValueOnce(rpcError(1, "Not authenticated")) // web.connected, expired
      .mockResolvedValueOnce(ok(true)) // fresh auth.login
      .mockResolvedValueOnce(ok(true)) // web.connected
      .mockResolvedValueOnce(ok({}));

    await expect(getDelugeTorrents()).resolves.toEqual([]);

    expect(methodsOf(calls())).toEqual([
      "auth.login",
      "web.connected",
      "core.get_torrents_status",
      "web.connected",
      "auth.login",
      "web.connected",
      "core.get_torrents_status",
    ]);
  });

  it("treats a false auth.login result as an auth failure, not a transport error", async () => {
    // A wrong password is HTTP 200 with `result: false` and `error: null`.
    fetchSpy.mockResolvedValue(ok(false));
    await expect(getDelugeTorrents()).rejects.toThrow(/authentication failed/i);
  });

  it("rejects when the Web UI cannot attach to any daemon", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(false)) // web.connected
      .mockResolvedValueOnce(ok([])); // no hosts configured

    await expect(getDelugeTorrents()).rejects.toThrow(/not connected to the deluged daemon/i);
  });

  it("rejects a silently-failed web.connect instead of trusting it", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(false))
      .mockResolvedValueOnce(ok([["host-1", "10.0.0.9", 58846, "u"]]))
      // web.connect's failure path only logs and returns null, so this is a
      // success-shaped response for a connection that did not happen.
      .mockResolvedValueOnce(ok(null));

    await expect(getDelugeTorrents()).rejects.toThrow(/not connected to the deluged daemon/i);
  });

  it("pauses through the plural form with the ids always passed explicitly", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(null));

    await pauseDelugeTorrents(["ABC123", "def456"]);

    const call = bodyOf(calls()[2]);
    expect(call.method).toBe("core.pause_torrents");
    // Lowercased: Deluge normalizes every info hash to lowercase hex and its
    // methods match on that exact casing.
    expect(call.params).toEqual([["abc123", "def456"]]);
  });

  it("does not call out at all for an empty selection", async () => {
    await pauseDelugeTorrents([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a non-empty remove_torrents result as a partial failure", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      // An EMPTY list means success here; a populated one is [id, error] pairs.
      .mockResolvedValueOnce(ok([["abc123", "InvalidTorrentError"]]));

    await expect(removeDelugeTorrents(["abc123"], true)).rejects.toThrow(
      /InvalidTorrentError/,
    );
  });

  it("accepts an empty remove_torrents result as success", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok([]));

    await expect(removeDelugeTorrents(["abc123"], false)).resolves.toBeUndefined();
    expect(bodyOf(calls()[2]).params).toEqual([["abc123"], false]);
  });

  it("routes a magnet and an http .torrent link to different add methods", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok("abc123"));
    await addDelugeTorrent("magnet:?xt=urn:btih:abc123", { savePath: "/data" });
    expect(bodyOf(calls()[2]).method).toBe("core.add_torrent_magnet");
    // The options key is download_location; save_path is a read-only status
    // alias and would be silently ignored.
    expect(bodyOf(calls()[2]).params[1]).toEqual({
      add_paused: false,
      download_location: "/data",
    });

    fetchSpy.mockClear();
    delugeClearSession();
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok("def456"));
    await addDelugeTorrent("https://tracker.example/file.torrent");
    expect(bodyOf(calls()[2]).method).toBe("core.add_torrent_url");
  });

  it("fails the add when Deluge answers with a null torrent id", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(null));

    await expect(addDelugeTorrent("magnet:?xt=urn:btih:abc")).rejects.toThrow(
      /already be in the session/i,
    );
  });

  it("unwraps the Twisted Failure blob a daemon error arrives wrapped in", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(
        rpcError(
          4,
          "Failure: [Failure instance: Traceback: <class 'deluge.error.AddTorrentError'>: Torrent already in session (abc123).\n<string>:6:<module>\n]",
        ),
      );

    // Every failing core.* call takes this path, so the raw blob would
    // otherwise be the normal thing users see.
    await expect(getDelugeTorrents()).rejects.toThrow(
      "Deluge: AddTorrentError: Torrent already in session (abc123).",
    );
  });

  it("skips desynced entries that come back without a name", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(
        ok({
          // A deluge-web whose cache has desynced from the daemon returns
          // entries with a null hash AND name.
          abc123: { name: null, state: "Downloading", progress: 10 },
          def456: { name: "Real torrent", state: "Seeding", progress: 100 },
        }),
      );

    const torrents = await getDelugeTorrents();
    expect(torrents).toHaveLength(1);
    expect(torrents[0].name).toBe("Real torrent");
  });

  it("recomputes progress for an errored torrent, which Deluge pins at 100", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(
        ok({
          abc123: {
            name: "Broken",
            state: "Error",
            progress: 100,
            total_size: 1000,
            total_wanted: 1000,
            total_done: 400,
            message: "No space left on device",
          },
        }),
      );

    const [t] = await getDelugeTorrents();
    expect(t.status).toBe("errored");
    // Trusting Deluge's 100 here would put a failed download in the "Done"
    // filter at a full progress bar.
    expect(t.progress).toBeCloseTo(0.4, 5);
    expect(t.errorMessage).toBe("No space left on device");
  });

  it("splits Downloading into downloading vs stalled on the payload rate", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(
        ok({
          aaa: {
            name: "Moving along",
            state: "Downloading",
            progress: 10,
            download_payload_rate: 5000,
          },
          // Deluge has no Stalled state — a started torrent with no peers is
          // just Downloading at zero bytes/s.
          bbb: { name: "No peers", state: "Downloading", progress: 10, download_payload_rate: 0 },
          ccc: { name: "Relocating", state: "Moving", progress: 50 },
        }),
      );

    const byName = new Map((await getDelugeTorrents()).map((t) => [t.name, t]));
    expect(byName.get("Moving along")?.status).toBe("downloading");
    expect(byName.get("No peers")?.status).toBe("stalled");
    expect(byName.get("Relocating")?.status).toBe("other");
    // The badge label keeps Deluge's own wording even where the normalized
    // status collapses states together.
    expect(byName.get("Relocating")?.statusLabel).toBe("Moving");
  });

  it("clamps the -1 'infinite' ratio a never-downloaded torrent reports", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(ok(true))
      .mockResolvedValueOnce(
        ok({ aaa: { name: "Fresh", state: "Seeding", progress: 100, ratio: -1 } }),
      );

    const [t] = await getDelugeTorrents();
    expect(t.ratio).toBe(0);
  });
});
