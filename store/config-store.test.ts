// Mock the storage layer before importing the store — config-store imports
// storage.ts at module load, which pulls in AsyncStorage/SecureStore. Both are
// native modules that aren't available in the jest-expo node environment, so
// we replace them with no-op shims. Tests below only exercise pure in-memory
// state via the store's getters/setters, so no persistence is needed.
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

import { useConfigStore } from "./config-store";
import { queryClient } from "@/lib/query-client";

// Smoke-test that getActiveUrl always returns a fetch-safe URL, even when the
// persisted value lacks a scheme. See #106 — health probes were failing on
// schemeless stored URLs because fetch parses `192.168.x.x:7878` as
// `scheme=192.168.x.x:, path=7878` and throws "Invalid URL". The editor's
// onBlur prepends http://, but historical/migrated values can lack it, so the
// store-level read has to normalize on the way out.

const INSTANCE_ID = "00000000-0000-0000-0000-000000000001";

function seed(overrides: {
  localUrl?: string;
  remoteUrl?: string;
  useRemote?: boolean;
  autoSwitchNetwork?: boolean;
  networkAwayFromHome?: boolean;
}) {
  useConfigStore.setState({
    serviceInstances: {
      ...useConfigStore.getState().serviceInstances,
      radarr: [
        {
          id: INSTANCE_ID,
          enabled: true,
          name: "Radarr",
          localUrl: overrides.localUrl ?? "",
          remoteUrl: overrides.remoteUrl ?? "",
          useRemote: overrides.useRemote ?? false,
        },
      ],
    },
    activeInstance: {
      ...useConfigStore.getState().activeInstance,
      radarr: INSTANCE_ID,
    },
    autoSwitchNetwork: overrides.autoSwitchNetwork ?? false,
    networkAwayFromHome: overrides.networkAwayFromHome ?? false,
  } as Partial<ReturnType<typeof useConfigStore.getState>>);
}

describe("getActiveUrl — URL normalization on read (#106)", () => {
  it("prepends http:// to a schemeless localUrl", () => {
    seed({ localUrl: "192.168.1.10:7878" });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(
      "http://192.168.1.10:7878",
    );
  });

  it("prepends http:// to a schemeless remoteUrl when useRemote is on", () => {
    seed({ remoteUrl: "radarr.example.com", useRemote: true });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(
      "http://radarr.example.com",
    );
  });

  it("leaves http:// URLs alone", () => {
    seed({ localUrl: "http://192.168.1.10:7878" });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(
      "http://192.168.1.10:7878",
    );
  });

  it("leaves https:// URLs alone", () => {
    seed({ remoteUrl: "https://radarr.example.com", useRemote: true });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(
      "https://radarr.example.com",
    );
  });

  it("returns an empty string for an empty localUrl (still falsy for callers)", () => {
    seed({ localUrl: "" });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe("");
  });

  it("picks remoteUrl when auto-switch is on and away from home", () => {
    seed({
      localUrl: "192.168.1.10:7878",
      remoteUrl: "radarr.example.com",
      useRemote: false,
      autoSwitchNetwork: true,
      networkAwayFromHome: true,
    });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(
      "http://radarr.example.com",
    );
  });

  it("returns an empty string when the instance is missing", () => {
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [],
      },
      activeInstance: {
        ...useConfigStore.getState().activeInstance,
        radarr: null,
      },
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe("");
  });
});

describe("getActiveUrl — secure local/remote selection (#106, #161)", () => {
  const both = {
    localUrl: "192.168.1.10:7878",
    remoteUrl: "radarr.example.com",
    useRemote: false,
    autoSwitchNetwork: true,
  };
  const LOCAL = "http://192.168.1.10:7878";
  const REMOTE = "http://radarr.example.com";

  it("uses local on a confirmed home network", () => {
    seed({ ...both, networkAwayFromHome: false });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(LOCAL);
  });

  it("uses remote when away from home", () => {
    seed({ ...both, networkAwayFromHome: true });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(REMOTE);
  });

  it("honors the useRemote override even on a home network", () => {
    seed({ ...both, useRemote: true, networkAwayFromHome: false });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(REMOTE);
  });

  it("uses local when auto-switch is off, regardless of the away flag", () => {
    seed({ ...both, autoSwitchNetwork: false, networkAwayFromHome: true });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(LOCAL);
  });

  // The core security property: off-home, never fall through to the private
  // local URL even when there's no remote to use — that would leak the API key
  // to whatever device answers that address on an untrusted LAN (airport WiFi).
  it("away with NO remote configured returns '' — never the local URL (credential-leak guard)", () => {
    seed({ ...both, remoteUrl: "", networkAwayFromHome: true });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe("");
  });

  it("uses remote at home when no local URL is configured", () => {
    seed({ ...both, localUrl: "", networkAwayFromHome: false });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(REMOTE);
  });
});

describe("setNetworkAwayFromHome", () => {
  it("updates the flag and is a no-op when unchanged", () => {
    useConfigStore.setState({
      networkAwayFromHome: true,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);

    useConfigStore.getState().setNetworkAwayFromHome(false);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);

    useConfigStore.getState().setNetworkAwayFromHome(false); // no-op
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);

    useConfigStore.getState().setNetworkAwayFromHome(true);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
  });
});

// #3: the read helpers must trust only the workspace-resolved active instance
// (attachment + enabled aware). They must NOT fall back to
// serviceInstances[kind][0] — activeInstance[kind] is null exactly when nothing
// is enabled+attached, so a first-instance fallback can only resolve a disabled
// or other-workspace instance, leaking its URL + API key on the next request.
describe("instance resolution — no raw first-instance fallback (#3)", () => {
  const OTHER_ID = "00000000-0000-0000-0000-0000000000ff";

  // An enabled instance exists, but the active workspace resolved nothing for
  // the kind (deriveActiveInstance → null because it isn't attached here).
  function seedUnattached() {
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [
          {
            id: OTHER_ID,
            enabled: true,
            name: "Other-workspace Radarr",
            localUrl: "http://192.168.1.50:7878",
            remoteUrl: "",
            useRemote: false,
          },
        ],
      },
      instanceSecrets: {
        ...useConfigStore.getState().instanceSecrets,
        [OTHER_ID]: { apiKey: "leak-key", customHeaders: { "X-Leak": "secret" } },
      },
      globalCustomHeaders: { "X-Global": "ok" },
      activeInstance: {
        ...useConfigStore.getState().activeInstance,
        radarr: null,
      },
      autoSwitchNetwork: false,
      networkAwayFromHome: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("getActiveInstanceId returns null instead of the first instance", () => {
    seedUnattached();
    expect(useConfigStore.getState().getActiveInstanceId("radarr")).toBeNull();
  });

  it("getActiveUrl returns '' instead of the unattached instance's URL", () => {
    seedUnattached();
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe("");
  });

  it("getMergedHeaders omits the unattached instance's custom headers", () => {
    seedUnattached();
    const headers = useConfigStore.getState().getMergedHeaders("radarr");
    expect(headers).toEqual({ "X-Global": "ok" });
  });

  it("still resolves an explicit instanceId (explicit binding wins)", () => {
    seedUnattached();
    expect(useConfigStore.getState().getActiveUrl("radarr", OTHER_ID)).toBe(
      "http://192.168.1.50:7878",
    );
  });
});

// #4: getActiveUrl flips local↔remote with the away flag, but query keys don't
// encode the URL, so staleTime:Infinity reads must be invalidated when the
// resolved URL can change — on a home/away flip and on a settings URL edit.
describe("setNetworkAwayFromHome — query invalidation on flip (#4)", () => {
  it("invalidates all queries on an actual change, but not on a no-op", () => {
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    useConfigStore.setState({
      networkAwayFromHome: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    spy.mockClear();

    useConfigStore.getState().setNetworkAwayFromHome(false); // unchanged → no-op
    expect(spy).not.toHaveBeenCalled();

    useConfigStore.getState().setNetworkAwayFromHome(true); // flip → invalidate
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(); // unfiltered (every kind's URL may flip)

    spy.mockRestore();
  });
});

describe("updateInstance — invalidates cached queries on URL change (#4)", () => {
  const ID = "00000000-0000-0000-0000-00000000aaaa";

  function seedOne() {
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [
          {
            id: ID,
            enabled: true,
            name: "Radarr",
            localUrl: "http://192.168.1.10:7878",
            remoteUrl: "",
            useRemote: false,
          },
        ],
      },
      activeInstance: {
        ...useConfigStore.getState().activeInstance,
        radarr: ID,
      },
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("invalidates [serviceId, instanceId] when a URL field changes", () => {
    seedOne();
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    useConfigStore
      .getState()
      .updateInstance("radarr", ID, { localUrl: "http://10.0.0.5:7878" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["radarr", ID] });
    spy.mockRestore();
  });

  it("does NOT invalidate on an unrelated edit (e.g. rename)", () => {
    seedOne();
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    useConfigStore.getState().updateInstance("radarr", ID, { name: "Renamed" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does NOT invalidate when the URL value is unchanged", () => {
    seedOne();
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    useConfigStore
      .getState()
      .updateInstance("radarr", ID, { localUrl: "http://192.168.1.10:7878" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("updateInstanceSecrets — invalidates on credential change (#4)", () => {
  it("invalidates this instance's queries on a secrets save", async () => {
    const SECRET_ID = "00000000-0000-0000-0000-00000000bbbb";
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    await useConfigStore
      .getState()
      .updateInstanceSecrets(SECRET_ID, { apiKey: "new-key" });
    expect(spy).toHaveBeenCalledTimes(1);
    const filters = spy.mock.calls[0]?.[0] as
      | { predicate?: (q: never) => boolean }
      | undefined;
    expect(filters?.predicate).toBeDefined();
    // Matches [serviceId, instanceId, …] for this instance, nothing else.
    expect(
      filters?.predicate?.({ queryKey: ["radarr", SECRET_ID, "tags"] } as never),
    ).toBe(true);
    expect(
      filters?.predicate?.({ queryKey: ["radarr", "other", "tags"] } as never),
    ).toBe(false);
    spy.mockRestore();
  });
});

// #148 Rec #8: switching workspaces must not leave the new dashboard running
// against the old dashboard's home/away verdict. When the incoming workspace
// governs a different home-network set, the flag resets to the safe away
// default (the async re-eval in useNetworkAutoSwitch then clears it if we're
// actually home). Same-network switches leave the flag alone.
describe("setActiveDashboard — away-flag safe reset on workspace switch (#148)", () => {
  const net = (id: string) => ({ id, ssid: id, bssid: "" });

  function seedDashboards(opts: {
    homeNetworks: { id: string; ssid: string; bssid: string }[];
    dashboards: { id: string; homeNetworkIds?: string[] }[];
    activeId: string;
    autoSwitchNetwork: boolean;
    networkAwayFromHome: boolean;
    demoMode?: boolean;
  }) {
    useConfigStore.setState({
      homeNetworks: opts.homeNetworks,
      dashboards: opts.dashboards.map((d) => ({
        id: d.id,
        name: d.id,
        widgets: [],
        ...(d.homeNetworkIds !== undefined
          ? { homeNetworkIds: d.homeNetworkIds }
          : {}),
      })),
      activeDashboardId: opts.activeId,
      autoSwitchNetwork: opts.autoSwitchNetwork,
      networkAwayFromHome: opts.networkAwayFromHome,
      demoMode: opts.demoMode ?? false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("forces away=true when the new workspace governs a different network set", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", homeNetworkIds: ["home"] },
        { id: "B", homeNetworkIds: ["cabin"] },
      ],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false, // currently "home" on dashboard A
    });

    useConfigStore.getState().setActiveDashboard("B");

    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
  });

  it("leaves the flag alone when both workspaces govern the same network set", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", homeNetworkIds: ["home"] },
        { id: "B", homeNetworkIds: ["home"] },
      ],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });

    useConfigStore.getState().setActiveDashboard("B");

    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });

  it("treats 'use all' (undefined) and 'select every network' as the same set", () => {
    seedDashboards({
      homeNetworks: [net("home")],
      dashboards: [
        { id: "A", homeNetworkIds: undefined }, // all = {home}
        { id: "B", homeNetworkIds: ["home"] }, // {home}
      ],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });

    useConfigStore.getState().setActiveDashboard("B");

    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });

  it("does not touch the flag when auto-switch is off (flag is ignored anyway)", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", homeNetworkIds: ["home"] },
        { id: "B", homeNetworkIds: ["cabin"] },
      ],
      activeId: "A",
      autoSwitchNetwork: false,
      networkAwayFromHome: false,
    });

    useConfigStore.getState().setActiveDashboard("B");

    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });

  it("is a no-op when already away (already at the safe default)", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", homeNetworkIds: ["home"] },
        { id: "B", homeNetworkIds: ["cabin"] },
      ],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: true,
    });

    useConfigStore.getState().setActiveDashboard("B");

    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
  });
});

// #4: the forced away reset on a workspace switch is set inline (not via
// setNetworkAwayFromHome), so it must invalidate queries itself — otherwise an
// instance shared with the previous workspace keeps its Infinity-cached data
// from the old (local) URL after switching to an away workspace.
describe("setActiveDashboard — query invalidation on forced away (#4)", () => {
  const net = (id: string) => ({ id, ssid: id, bssid: "" });

  function seedTwo(aIds: string[] | undefined, bIds: string[] | undefined) {
    useConfigStore.setState({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        {
          id: "A",
          name: "A",
          widgets: [],
          ...(aIds !== undefined ? { homeNetworkIds: aIds } : {}),
        },
        {
          id: "B",
          name: "B",
          widgets: [],
          ...(bIds !== undefined ? { homeNetworkIds: bIds } : {}),
        },
      ],
      activeDashboardId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
      demoMode: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("invalidates when the switch forces away (different home-network set)", () => {
    seedTwo(["home"], ["cabin"]);
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    useConfigStore.getState().setActiveDashboard("B");
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
    spy.mockRestore();
  });

  it("does NOT invalidate when both workspaces share the home-network set", () => {
    seedTwo(["home"], ["home"]);
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    useConfigStore.getState().setActiveDashboard("B");
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
