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
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
}));
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => {
    const out = new Uint8Array(n);
    require("crypto").randomFillSync(out);
    return out;
  },
}));

import {
  useConfigStore,
  buildExportPayload,
  stripImportedBssids,
  repairOrphanedHomeNetworkSelection,
  withConfigWrite,
} from "./config-store";
import { useBackendStore } from "./backend-store";
import { encryptJsonString } from "@/lib/config-crypto";
import {
  deleteKey,
  getJSON,
  getString,
  setJSON,
  setString,
} from "./storage";
import { SECRET_PREFIX, SERVICE_IDS, STORAGE_KEYS } from "@/lib/constants";
import { queryClient } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Smoke-test that getActiveUrl always returns a fetch-safe URL, even when the
// persisted value lacks a scheme. See #106 — health probes were failing on
// schemeless stored URLs because fetch parses `192.168.x.x:7878` as
// `scheme=192.168.x.x:, path=7878` and throws "Invalid URL". The editor's
// onBlur prepends http://, but historical/migrated values can lack it, so the
// store-level read has to normalize on the way out.

const INSTANCE_ID = "00000000-0000-0000-0000-000000000001";

const initialBackendState = useBackendStore.getState();
const SEEDED_KEYS = [
  STORAGE_KEYS.dashboards,
  STORAGE_KEYS.activeDashboardId,
  STORAGE_KEYS.homeNetworks,
  STORAGE_KEYS.autoSwitchNetwork,
  STORAGE_KEYS.notificationSettings,
  STORAGE_KEYS.wolDevices,
  ...SERVICE_IDS.map((id) => `${STORAGE_KEYS.services}.${id}`),
];

/** Drop what a test wrote to the shared storage cache so later tests don't inherit it. */
function resetStoredConfig() {
  for (const key of SEEDED_KEYS) deleteKey(key);
  useBackendStore.setState(initialBackendState, true);
}

describe("Demo Mode configuration isolation", () => {
  afterEach(resetStoredConfig);

  it("blocks exporting and restoring a backup while demo data is live", async () => {
    const store = useConfigStore.getState();
    const payload = buildExportPayload();
    store.enableDemoMode();
    try {
      const onStage = jest.fn();
      await expect(store.exportConfig("passphrase", onStage)).rejects.toThrow("Turn off Demo Mode");
      expect(onStage).not.toHaveBeenCalled();
      expect(buildExportPayload).toThrow("Turn off Demo Mode");
      await expect(store.importConfigFromPayload(payload)).rejects.toThrow("Turn off Demo Mode");
    } finally {
      await store.disableDemoMode();
    }
  });

  it("keeps the saved workspace layout, attachments, pins and active workspace", async () => {
    const dashboards = [
      { id: "home", name: "Home", widgets: [], attachedInstances: [INSTANCE_ID], activeInstance: { radarr: INSTANCE_ID } },
      { id: "cabin", name: "Cabin", widgets: [], attachedInstances: [] },
    ];
    setJSON(STORAGE_KEYS.dashboards, dashboards);
    setString(STORAGE_KEYS.activeDashboardId, "home");
    setJSON(`${STORAGE_KEYS.services}.radarr`, [
      { id: INSTANCE_ID, name: "Real Radarr", enabled: true, localUrl: "http://radarr.local", remoteUrl: "", useRemote: false },
    ]);
    const store = useConfigStore.getState();
    await store.hydrate();
    const saved = getJSON(STORAGE_KEYS.dashboards);
    store.enableDemoMode();
    try {
      // Also exercise launch with the Demo Mode preference already enabled.
      await store.hydrate();
      const demoRadarr = useConfigStore.getState().serviceInstances.radarr[0];
      store.renameDashboard("cabin", "Demo Cabin");
      store.addWidget("downloads");
      store.setDashboardActiveInstance("home", "radarr", demoRadarr.id);
      store.removeDashboard("home");
      expect(useConfigStore.getState().activeDashboardId).toBe("cabin");
      expect(getJSON(STORAGE_KEYS.dashboards)).toEqual(saved);
      expect(getString(STORAGE_KEYS.activeDashboardId)).toBe("home");
    } finally {
      await store.disableDemoMode();
    }
    const restored = useConfigStore.getState();
    expect(restored.dashboards).toEqual(saved);
    expect(restored.activeDashboardId).toBe("home");
    expect(restored.activeInstance.radarr).toBe(INSTANCE_ID);
  });

  it("keeps the saved service and credentials after editing and removing demo instances", async () => {
    const instances = [
      { id: INSTANCE_ID, name: "Real Radarr", enabled: true, localUrl: "http://radarr.local", remoteUrl: "", useRemote: false },
    ];
    const readSecret = jest.mocked(SecureStore.getItemAsync);
    readSecret.mockImplementation(async (key) =>
      key === `${SECRET_PREFIX}.${INSTANCE_ID}.apiKey` ? "real-key" : null,
    );
    setJSON(`${STORAGE_KEYS.services}.radarr`, instances);
    const store = useConfigStore.getState();
    await store.hydrate();
    store.enableDemoMode();
    try {
      await store.hydrate();
      expect(useConfigStore.getState().instanceSecrets).toEqual({});
      const demoRadarr = useConfigStore.getState().serviceInstances.radarr[0];
      const writeSecret = jest.mocked(SecureStore.setItemAsync).mockClear();
      const deleteSecret = jest.mocked(SecureStore.deleteItemAsync).mockClear();
      store.updateInstance("radarr", demoRadarr.id, { useRemote: true });
      const added = store.addInstance("radarr", { name: "Another demo" });
      store.moveInstance("radarr", added.id, "up");
      await store.updateInstanceSecrets(demoRadarr.id, { apiKey: "demo-key" });
      await store.removeInstance("radarr", demoRadarr.id);
      expect(useConfigStore.getState().serviceInstances.radarr.map(({ id }) => id)).toEqual([added.id]);
      expect(writeSecret).not.toHaveBeenCalled();
      expect(deleteSecret).not.toHaveBeenCalled();
      expect(getJSON(`${STORAGE_KEYS.services}.radarr`)).toEqual(instances);
    } finally {
      await store.disableDemoMode();
      readSecret.mockResolvedValue(null);
    }
    expect(useConfigStore.getState().serviceInstances.radarr).toEqual(instances);
    expect(useConfigStore.getState().instanceSecrets[INSTANCE_ID]).toEqual({ apiKey: "real-key" });
  });
});

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

// #148: a workspace that explicitly selected NO live home networks
// (homeNetworkIds: [] or only stale ids) is "always remote" and must be honored
// even when the GLOBAL auto-switch toggle is off — otherwise turning off
// auto-switch silently re-exposes the private local URL for a remote-only
// workspace. undefined (auto-attach all networks) keeps the legacy behavior.
describe("getActiveUrl — workspace 'always remote' honored with auto-switch off (#148)", () => {
  const LOCAL = "http://192.168.1.50:7878";
  const REMOTE = "https://radarr.example.com";

  function seedWorkspace(opts: {
    homeNetworkIds: string[] | undefined;
    homeNetworks: { id: string; ssid: string; bssid: string }[];
    autoSwitchNetwork: boolean;
    networkAwayFromHome: boolean;
  }) {
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [
          {
            id: INSTANCE_ID,
            enabled: true,
            name: "Radarr",
            localUrl: LOCAL,
            remoteUrl: REMOTE,
            useRemote: false,
          },
        ],
      },
      activeInstance: {
        ...useConfigStore.getState().activeInstance,
        radarr: INSTANCE_ID,
      },
      homeNetworks: opts.homeNetworks,
      dashboards: [
        {
          id: "A",
          name: "A",
          widgets: [],
          ...(opts.homeNetworkIds !== undefined
            ? { homeNetworkIds: opts.homeNetworkIds }
            : {}),
        },
      ],
      activeDashboardId: "A",
      autoSwitchNetwork: opts.autoSwitchNetwork,
      networkAwayFromHome: opts.networkAwayFromHome,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("returns remote for homeNetworkIds:[] even when auto-switch is off", () => {
    seedWorkspace({
      homeNetworkIds: [],
      homeNetworks: [{ id: "home", ssid: "home", bssid: "" }],
      autoSwitchNetwork: false,
      networkAwayFromHome: false,
    });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(REMOTE);
  });

  it("returns remote when the selection only references stale (deleted) networks", () => {
    seedWorkspace({
      homeNetworkIds: ["deleted-id"],
      homeNetworks: [{ id: "home", ssid: "home", bssid: "" }],
      autoSwitchNetwork: false,
      networkAwayFromHome: false,
    });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(REMOTE);
  });

  it("keeps legacy local behavior for undefined (auto-attach) with auto-switch off", () => {
    seedWorkspace({
      homeNetworkIds: undefined,
      homeNetworks: [{ id: "home", ssid: "home", bssid: "" }],
      autoSwitchNetwork: false,
      networkAwayFromHome: false,
    });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(LOCAL);
  });

  it("does NOT force remote when the selection has a live match (auto-switch off → local)", () => {
    seedWorkspace({
      homeNetworkIds: ["home"],
      homeNetworks: [{ id: "home", ssid: "home", bssid: "" }],
      autoSwitchNetwork: false,
      networkAwayFromHome: false,
    });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(LOCAL);
  });
});

// #148: editing the ACTIVE workspace's home-network selection can shrink the
// trusted set, so it must reset the away flag the same way a workspace SWITCH
// does — a stale `false` would keep serving the local URL on a network the
// workspace no longer trusts (the in-place-edit analogue of the switch-race).
describe("setDashboardHomeNetworkIds — away-flag reset on active-workspace edit (#148)", () => {
  const net = (id: string) => ({ id, ssid: id, bssid: "" });

  function seedDashboards(opts: {
    homeNetworks: { id: string; ssid: string; bssid: string }[];
    dashboards: { id: string; homeNetworkIds?: string[] }[];
    activeId: string;
    autoSwitchNetwork: boolean;
    networkAwayFromHome: boolean;
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
      demoMode: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("forces away=true when narrowing the active workspace's networks", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [{ id: "A", homeNetworkIds: ["home", "cabin"] }],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    useConfigStore.getState().setDashboardHomeNetworkIds("A", ["home"]);

    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("forces away=true when switching the active workspace to 'always remote' ([])", () => {
    seedDashboards({
      homeNetworks: [net("home")],
      dashboards: [{ id: "A", homeNetworkIds: ["home"] }],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });

    useConfigStore.getState().setDashboardHomeNetworkIds("A", []);

    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
  });

  it("does NOT touch the flag when editing a non-active workspace", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", homeNetworkIds: ["home"] },
        { id: "B", homeNetworkIds: ["home", "cabin"] },
      ],
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });

    useConfigStore.getState().setDashboardHomeNetworkIds("B", ["cabin"]);

    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });

  it("leaves the flag alone when the effective set is unchanged (all → select-all)", () => {
    seedDashboards({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [{ id: "A", homeNetworkIds: undefined }], // all = {home, cabin}
      activeId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });

    useConfigStore
      .getState()
      .setDashboardHomeNetworkIds("A", ["home", "cabin"]);

    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });
});

// #148: the per-dashboard homeNetworkIds is persisted into STORAGE_KEYS.dashboards
// by its setter, so hydrate MUST read it back — dropping it on cold start would
// silently revert a "remote-only"/subset workspace to "all home networks" and
// re-expose the local URL. This test seeds the persisted shape and rehydrates.
describe("hydrate — preserves per-dashboard homeNetworkIds (#148)", () => {
  it("round-trips [] (always remote), a subset, and undefined (all) through hydrate", async () => {
    setJSON(STORAGE_KEYS.homeNetworks, [{ id: "n1", ssid: "Home", bssid: "" }]);
    setJSON(STORAGE_KEYS.dashboards, [
      { id: "A", name: "Remote-only", widgets: [], homeNetworkIds: [] },
      { id: "B", name: "Subset", widgets: [], homeNetworkIds: ["n1"] },
      { id: "C", name: "All", widgets: [] },
    ]);

    await useConfigStore.getState().hydrate();

    const dashboards = useConfigStore.getState().dashboards;
    const a = dashboards.find((d) => d.id === "A");
    const b = dashboards.find((d) => d.id === "B");
    const c = dashboards.find((d) => d.id === "C");
    // Explicit empty selection ("always remote") survives — NOT dropped to undefined.
    expect(a?.homeNetworkIds).toEqual([]);
    // Subset selection survives verbatim.
    expect(b?.homeNetworkIds).toEqual(["n1"]);
    // Absent stays absent (auto-attach all networks).
    expect(c?.homeNetworkIds).toBeUndefined();
  });

  // v30: per-workspace Services-tab order is persisted onto the dashboard, so
  // hydrate must read it back like homeNetworkIds.
  it("round-trips per-dashboard servicesOrder through hydrate (#12)", async () => {
    setJSON(STORAGE_KEYS.dashboards, [
      { id: "A", name: "A", widgets: [], servicesOrder: ["sonarr", "radarr"] },
      { id: "B", name: "B", widgets: [] },
    ]);
    await useConfigStore.getState().hydrate();
    const dashboards = useConfigStore.getState().dashboards;
    expect(dashboards.find((d) => d.id === "A")?.servicesOrder).toEqual([
      "sonarr",
      "radarr",
    ]);
    expect(dashboards.find((d) => d.id === "B")?.servicesOrder).toBeUndefined();
  });
});

// #6: duplicateDashboard clones a workspace with a fresh id + fresh slot ids and
// deep-copied fields, so the two dashboards never share mutable references and
// the global slot-id uniqueness invariant holds.
describe("duplicateDashboard (#6)", () => {
  const src = {
    id: "src",
    name: "Home",
    widgets: [
      { id: "slot-1", widgetId: "service-health" },
      { id: "slot-2", widgetId: "speed-stats", settings: { foo: 1 } },
    ],
    attachedInstances: ["a", "b"],
    pinnedTabs: ["services"],
    activeInstance: { radarr: "a" },
    homeNetworkIds: [] as string[],
    servicesOrder: ["radarr", "sonarr"],
    icon: "Film",
    color: "#3b82f6",
  };

  it("clones with fresh ids, a ' copy' name, and deep-copied fields", () => {
    useConfigStore.setState({
      dashboards: [src],
      activeDashboardId: "src",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);

    const clone = useConfigStore.getState().duplicateDashboard("src")!;
    expect(clone).not.toBeNull();
    expect(clone.id).not.toBe("src");
    expect(clone.name).toBe("Home copy");
    // Fresh slot ids (uniqueness invariant), settings deep-copied.
    expect(clone.widgets.map((w) => w.id)).not.toContain("slot-1");
    expect(clone.widgets.map((w) => w.id)).not.toContain("slot-2");
    expect(clone.widgets[1].settings).toEqual({ foo: 1 });
    expect(clone.widgets[1].settings).not.toBe(src.widgets[1].settings);
    // Explicit empty homeNetworkIds ("always remote") preserved, by value.
    expect(clone.homeNetworkIds).toEqual([]);
    expect(clone.servicesOrder).toEqual(["radarr", "sonarr"]);
    expect(clone.attachedInstances).toEqual(["a", "b"]);
    expect(clone.attachedInstances).not.toBe(src.attachedInstances);
    expect(useConfigStore.getState().dashboards).toHaveLength(2);
  });

  it("dedupes the copy name", () => {
    useConfigStore.setState({
      dashboards: [
        { id: "x", name: "Home", widgets: [] },
        { id: "y", name: "Home copy", widgets: [] },
      ],
      activeDashboardId: "x",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    const clone = useConfigStore.getState().duplicateDashboard("x")!;
    expect(clone.name).toBe("Home copy 2");
  });

  it("returns null for an unknown id", () => {
    useConfigStore.setState({
      dashboards: [{ id: "only", name: "Only", widgets: [] }],
      activeDashboardId: "only",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    expect(useConfigStore.getState().duplicateDashboard("nope")).toBeNull();
  });
});

// #6: copySlotToDashboard places a copy of a widget (with its settings) on
// another dashboard, with a fresh slot id.
describe("copySlotToDashboard (#6)", () => {
  it("copies a slot with its settings onto the target, with a new id", () => {
    useConfigStore.setState({
      dashboards: [
        {
          id: "A",
          name: "A",
          widgets: [{ id: "s1", widgetId: "speed-stats", settings: { n: 5 } }],
        },
        { id: "B", name: "B", widgets: [] },
      ],
      activeDashboardId: "A",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);

    useConfigStore.getState().copySlotToDashboard("s1", "B");
    const b = useConfigStore.getState().dashboards.find((d) => d.id === "B")!;
    expect(b.widgets).toHaveLength(1);
    expect(b.widgets[0].id).not.toBe("s1");
    expect(b.widgets[0].widgetId).toBe("speed-stats");
    expect(b.widgets[0].settings).toEqual({ n: 5 });
    // Source untouched.
    const a = useConfigStore.getState().dashboards.find((d) => d.id === "A")!;
    expect(a.widgets).toHaveLength(1);
  });
});

// #7: notifications are global; tapping one switches to the first workspace that
// has the instance attached so the destination screen is populated.
describe("activateDashboardForInstance (#7)", () => {
  function seed(active: string) {
    useConfigStore.setState({
      dashboards: [
        { id: "A", name: "A", widgets: [], attachedInstances: ["x"] },
        { id: "B", name: "B", widgets: [], attachedInstances: ["y"] },
        { id: "C", name: "C", widgets: [] }, // auto-attach (undefined)
      ],
      activeDashboardId: active,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  it("switches to the first dashboard attaching the instance", () => {
    seed("B");
    useConfigStore.getState().activateDashboardForInstance("x");
    expect(useConfigStore.getState().activeDashboardId).toBe("A");
  });

  it("is a no-op when the active dashboard already attaches it", () => {
    seed("A");
    useConfigStore.getState().activateDashboardForInstance("x");
    expect(useConfigStore.getState().activeDashboardId).toBe("A");
  });

  it("treats an auto-attach dashboard as attaching every instance", () => {
    useConfigStore.setState({
      dashboards: [{ id: "C", name: "C", widgets: [] }],
      activeDashboardId: "C",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    useConfigStore.getState().activateDashboardForInstance("anything");
    expect(useConfigStore.getState().activeDashboardId).toBe("C"); // no-op
  });
});

// #10: setDashboardActiveInstance must reject a pin the resolver would ignore
// (disabled or not attached), so the persisted pin always matches resolution.
describe("setDashboardActiveInstance — rejects un-resolvable pins (#10)", () => {
  const inst = (id: string, enabled: boolean) => ({
    id,
    enabled,
    name: id,
    localUrl: "",
    remoteUrl: "",
    useRemote: false,
  });

  beforeEach(() => {
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [inst("A", true), inst("B", true), inst("D", false)],
      },
      dashboards: [
        { id: "dash", name: "dash", widgets: [], attachedInstances: ["A", "D"] },
      ],
      activeDashboardId: "dash",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  });

  const pinOf = () =>
    useConfigStore.getState().dashboards.find((d) => d.id === "dash")
      ?.activeInstance?.radarr;

  it("accepts an enabled + attached instance", () => {
    useConfigStore.getState().setDashboardActiveInstance("dash", "radarr", "A");
    expect(pinOf()).toBe("A");
  });

  it("rejects an enabled but NOT attached instance", () => {
    useConfigStore.getState().setDashboardActiveInstance("dash", "radarr", "B");
    expect(pinOf()).toBeUndefined();
  });

  it("rejects an attached but DISABLED instance", () => {
    useConfigStore.getState().setDashboardActiveInstance("dash", "radarr", "D");
    expect(pinOf()).toBeUndefined();
  });
});

// #14: broadening the active workspace's home-network set (a superset) must NOT
// flash remote — the network we're home on is still trusted.
describe("setActiveDashboard — superset switch stays home (#14)", () => {
  const net = (id: string) => ({ id, ssid: id, bssid: "" });
  it("does not force away when the new set is a superset of the old", () => {
    useConfigStore.setState({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", name: "A", widgets: [], homeNetworkIds: ["home"] },
        { id: "B", name: "B", widgets: [], homeNetworkIds: ["home", "cabin"] },
      ],
      activeDashboardId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false, // home on "home"
      demoMode: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    useConfigStore.getState().setActiveDashboard("B");
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });
});

// #168: a BSSID pinned on the source device won't match on the importing
// device (different AP/band, or iOS hides it) → isHomeNetwork fails closed →
// stuck "away" → remote-only on the real home WiFi. Strip pins on import so
// matching is SSID-only; the SSID still has to match, so the invariant holds.
describe("stripImportedBssids (#168)", () => {
  it("clears pinned BSSIDs so imported networks match by SSID on a new device", () => {
    expect(
      stripImportedBssids([
        { id: "1", ssid: "Home", bssid: "aa:bb:cc:dd:ee:ff" },
        { id: "2", ssid: "Cabin", bssid: "" },
      ]),
    ).toEqual([
      { id: "1", ssid: "Home", bssid: "" },
      { id: "2", ssid: "Cabin", bssid: "" },
    ]);
  });

  it("returns the same object reference for an unpinned entry (no needless copy)", () => {
    const net = { id: "2", ssid: "Cabin", bssid: "" };
    expect(stripImportedBssids([net])[0]).toBe(net);
  });

  it("handles an empty list", () => {
    expect(stripImportedBssids([])).toEqual([]);
  });
});

// #168: a non-empty home-network selection whose ids are ALL stale resolves to
// an empty effective set, which getActiveUrl treats as "always remote" — local
// URLs silently break with no recovery. Revert that to "use all networks".
describe("repairOrphanedHomeNetworkSelection (#168)", () => {
  const nets = [{ id: "home", ssid: "Home", bssid: "" }];
  const dash = (homeNetworkIds?: any) =>
    ({
      id: "d1",
      name: "D",
      widgets: [],
      ...(homeNetworkIds !== undefined ? { homeNetworkIds } : {}),
    }) as any;

  it("reverts a fully-orphaned selection to 'use all networks' (undefined)", () => {
    const [d] = repairOrphanedHomeNetworkSelection([dash(["gone1", "gone2"])], nets);
    expect("homeNetworkIds" in d).toBe(false);
  });

  it("keeps an explicit empty selection ([] = deliberate always-remote)", () => {
    const [d] = repairOrphanedHomeNetworkSelection([dash([])], nets);
    expect(d.homeNetworkIds).toEqual([]);
  });

  it("prunes stale IDs without clearing the remaining selection", () => {
    const [d] = repairOrphanedHomeNetworkSelection([dash(["home", "gone"])], nets);
    expect(d.homeNetworkIds).toEqual(["home"]);
  });

  it("leaves 'use all' (undefined) untouched", () => {
    const [d] = repairOrphanedHomeNetworkSelection([dash(undefined)], nets);
    expect("homeNetworkIds" in d).toBe(false);
  });
});

describe("home network deletion", () => {
  afterEach(resetStoredConfig);

  const casa = { id: "casa", ssid: "Casa", bssid: "" };
  const cabin = { id: "cabin", ssid: "Cabin", bssid: "" };
  const workspaces = [
    { id: "A", name: "Home", widgets: [], homeNetworkIds: [casa.id] },
    { id: "B", name: "Shared", widgets: [], homeNetworkIds: [casa.id, cabin.id] },
    { id: "C", name: "Remote", widgets: [], homeNetworkIds: [] },
  ];

  it("repairs workspace selections when deleting and re-adding the same WiFi", async () => {
    setJSON(STORAGE_KEYS.homeNetworks, [casa, cabin]);
    setJSON(STORAGE_KEYS.dashboards, workspaces);
    setString(STORAGE_KEYS.activeDashboardId, "A");
    const store = useConfigStore.getState();
    await store.hydrate();
    store.setAutoSwitch(false);
    const radarr = store.addInstance("radarr", {
      enabled: true,
      localUrl: "http://radarr.local",
      remoteUrl: "",
    });

    store.removeHomeNetwork(casa.id);
    const restoredCasa = store.addHomeNetwork({ ssid: casa.ssid, bssid: "" });
    expect(restoredCasa.id).not.toBe(casa.id);
    for (const state of [useConfigStore.getState().dashboards, getJSON<typeof workspaces>(STORAGE_KEYS.dashboards)!]) {
      expect(state.find((dashboard) => dashboard.id === "A")?.homeNetworkIds).toBeUndefined();
      expect(state.find((dashboard) => dashboard.id === "B")?.homeNetworkIds).toEqual([cabin.id]);
      expect(state.find((dashboard) => dashboard.id === "C")?.homeNetworkIds).toEqual([]);
    }
    expect(store.getActiveUrl("radarr", radarr.id)).toBe("http://radarr.local");
  });

  it("repairs stale selections left on disk by an older app", async () => {
    setJSON(STORAGE_KEYS.homeNetworks, [cabin]);
    setJSON(STORAGE_KEYS.dashboards, workspaces);
    await useConfigStore.getState().hydrate();
    const saved = getJSON<typeof workspaces>(STORAGE_KEYS.dashboards)!;
    expect(saved.map((dashboard) => dashboard.homeNetworkIds)).toEqual([undefined, [cabin.id], []]);
    expect(useConfigStore.getState().dashboards).toEqual(saved);
  });
});

// Seerr sign-in (#332): hosts whose next login must post credentials. Per host
// and persisted, because the platform cookie jar keeps cookies across launches
// while the in-memory session cache (lib/seerr-session.ts) does not.
describe("seerrStaleHosts", () => {
  beforeEach(() => {
    useConfigStore.setState({ seerrStaleHosts: {} });
  });

  it("marks hosts per instance, cumulatively and without duplicates", () => {
    useConfigStore.getState().markSeerrHostsStale("i1", ["seerr.local", "seerr.example.com"]);
    useConfigStore.getState().markSeerrHostsStale("i1", ["seerr.example.com", "other.host", ""]);
    expect([...useConfigStore.getState().seerrStaleHosts.i1].sort()).toEqual([
      "other.host",
      "seerr.example.com",
      "seerr.local",
    ]);
    expect(useConfigStore.getState().isSeerrHostStale("i1", "seerr.local")).toBe(true);
    expect(useConfigStore.getState().isSeerrHostStale("i1", "nope")).toBe(false);
    expect(useConfigStore.getState().isSeerrHostStale("i2", "seerr.local")).toBe(false);
  });

  // Lifting is per host: a credential login on the LAN host says nothing
  // about the remote host's cookie.
  it("clears one host at a time and drops the entry when empty", () => {
    useConfigStore.getState().markSeerrHostsStale("i1", ["seerr.local", "seerr.example.com"]);
    useConfigStore.getState().clearSeerrStaleHost("i1", "seerr.local");
    expect(useConfigStore.getState().isSeerrHostStale("i1", "seerr.local")).toBe(false);
    expect(useConfigStore.getState().isSeerrHostStale("i1", "seerr.example.com")).toBe(true);
    useConfigStore.getState().clearSeerrStaleHost("i1", "seerr.example.com");
    expect(useConfigStore.getState().seerrStaleHosts.i1).toBeUndefined();
    expect(() => useConfigStore.getState().clearSeerrStaleHost("i1", "gone")).not.toThrow();
  });

  it("forgets an instance on removal", () => {
    useConfigStore.getState().markSeerrHostsStale("i1", ["seerr.local"]);
    useConfigStore.getState().markSeerrHostsStale("i2", ["seerr.local"]);
    useConfigStore.getState().forgetSeerrStaleHosts("i1");
    expect(useConfigStore.getState().seerrStaleHosts).toEqual({ i2: ["seerr.local"] });
    expect(() => useConfigStore.getState().forgetSeerrStaleHosts("i1")).not.toThrow();
  });
});

describe("importConfigFromEnvelope (backend backup restore, Refs #385)", () => {
  const PASSPHRASE = "correct-horse-battery-staple";
  const pairing = { url: "http://backend.local:4000", sharedSecret: "s".repeat(64), deviceId: "dev-1" };

  beforeEach(() => {
    useConfigStore.setState({
      hydrated: true,
      dashboards: [{ id: "dash-1", name: "Default", widgets: [] }] as never,
      activeDashboardId: "dash-1",
    });
    useBackendStore.setState({ hydrated: true, ...pairing, backupEnabled: true });
  });

  it("a payload without a backend block leaves the current pairing untouched", async () => {
    const payload = buildExportPayload();
    delete payload.backend;
    const envelope = await encryptJsonString(JSON.stringify(payload), PASSPHRASE);
    await useConfigStore.getState().importConfigFromEnvelope(envelope, PASSPHRASE);
    const b = useBackendStore.getState();
    expect([b.url, b.sharedSecret, b.deviceId, b.backupEnabled]).toEqual([
      pairing.url,
      pairing.sharedSecret,
      pairing.deviceId,
      true,
    ]);
  });

  it("a payload with a backend block still pairs (file import regression)", async () => {
    const payload = buildExportPayload();
    payload.backend = { url: "http://other:4000", sharedSecret: "o".repeat(64), deviceId: "dev-9" };
    const envelope = await encryptJsonString(JSON.stringify(payload), PASSPHRASE);
    await useConfigStore.getState().importConfigFromEnvelope(envelope, PASSPHRASE);
    expect(useBackendStore.getState().url).toBe("http://other:4000");
    expect(useBackendStore.getState().deviceId).toBe("dev-9");
  });

  it("a wrong passphrase fails before anything is replaced", async () => {
    const payload = buildExportPayload();
    const envelope = await encryptJsonString(JSON.stringify(payload), PASSPHRASE);
    const before = useConfigStore.getState().dashboards;
    await expect(
      useConfigStore.getState().importConfigFromEnvelope(envelope, "not-the-passphrase"),
    ).rejects.toThrow(/Incorrect passphrase/);
    expect(useConfigStore.getState().dashboards).toBe(before);
  });
});

describe("configuration restore persistence", () => {
  const serviceKey = `${STORAGE_KEYS.services}.radarr`;
  const apiKey = `${SECRET_PREFIX}.${INSTANCE_ID}.apiKey`;
  const passwordKey = `${SECRET_PREFIX}.${INSTANCE_ID}.password`;
  const original = {
    id: INSTANCE_ID,
    name: "Original Radarr",
    enabled: true,
    localUrl: "http://original.local",
    remoteUrl: "",
    useRemote: false,
  };
  const disk = new Map<string, string>();
  const keychain = new Map<string, string>();

  beforeEach(async () => {
    disk.clear();
    keychain.clear();
    keychain.set(apiKey, "original-key");
    keychain.set(passwordKey, "original-password");
    keychain.set("backend.url", "http://original-backend.local");
    keychain.set("backend.sharedSecret", "a".repeat(64));
    keychain.set("backend.deviceId", "original-device");
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => keychain.get(key) ?? null);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      keychain.set(key, value);
    });
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
      keychain.delete(key);
    });
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      disk.set(key, value);
    });
    jest.mocked(AsyncStorage.multiSet).mockImplementation(async (entries) => {
      for (const [key, value] of entries) disk.set(key, value);
    });
    jest.mocked(AsyncStorage.multiRemove).mockImplementation(async (keys) => {
      for (const key of keys) disk.delete(key);
    });
    setJSON(serviceKey, [original]);
    setJSON(STORAGE_KEYS.notificationSettings, { enabled: false });
    await useConfigStore.getState().hydrate();
    await useBackendStore.getState().hydrate();
  });

  afterEach(() => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue();
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
    jest.mocked(AsyncStorage.setItem).mockResolvedValue();
    jest.mocked(AsyncStorage.multiSet).mockResolvedValue();
    jest.mocked(AsyncStorage.multiRemove).mockResolvedValue();
    resetStoredConfig();
  });

  function backup() {
    const payload = buildExportPayload();
    payload.services = { ...payload.services, radarr: [{ ...original, name: "Imported Radarr" }] };
    payload.secrets = { [INSTANCE_ID]: { apiKey: "imported-key" } };
    payload.backend = {
      url: "http://imported-backend.local",
      sharedSecret: "b".repeat(64),
      deviceId: "imported-device",
    };
    return payload;
  }

  it("leaves the old service and credentials intact if the first secret write fails", async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(useConfigStore.getState().importConfigFromPayload(backup())).rejects.toThrow("Keychain unavailable");
    expect(keychain.get(apiKey)).toBe("original-key");
    expect(keychain.get(passwordKey)).toBe("original-password");
    expect(disk.get(serviceKey)).toBe(JSON.stringify([original]));
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().serviceInstances.radarr).toEqual([original]);
    expect(useConfigStore.getState().instanceSecrets[INSTANCE_ID]?.apiKey).toBe("original-key");
  });

  it("rolls back changes to reused service IDs and backend pairing after a later failure", async () => {
    const before = new Map(keychain);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      if (key === "backend.sharedSecret") throw new Error("Backend keychain write failed");
      keychain.set(key, value);
    });
    await expect(useConfigStore.getState().importConfigFromPayload(backup())).rejects.toThrow("Backend keychain write failed");
    expect(keychain).toEqual(before);
    expect(disk.get(serviceKey)).toBe(JSON.stringify([original]));
    expect(useBackendStore.getState().url).toBe("http://original-backend.local");
  });

  it("rolls back keychain and settings when native storage rejects a partial batch", async () => {
    const before = new Map(keychain);
    jest.mocked(AsyncStorage.multiSet).mockImplementationOnce(async (entries) => {
      const serviceEntry = entries.find(([key]) => key === serviceKey)!;
      disk.set(...serviceEntry);
      throw new Error("Settings storage unavailable");
    });
    await expect(useConfigStore.getState().importConfigFromPayload(backup())).rejects.toThrow("Settings storage unavailable");
    expect(keychain).toEqual(before);
    expect(disk.get(serviceKey)).toBe(JSON.stringify([original]));
    expect(useConfigStore.getState().serviceInstances.radarr).toEqual([original]);
  });

  it("commits default notification settings when a legacy backup omits them", async () => {
    const payload = backup();
    delete payload.notificationSettings;
    expect(useConfigStore.getState().notificationSettings.enabled).toBe(false);
    await useConfigStore.getState().importConfigFromPayload(payload);
    const restored = useConfigStore.getState().notificationSettings;
    expect(restored.enabled).toBe(true);
    expect(JSON.parse(disk.get(STORAGE_KEYS.notificationSettings)!)).toEqual(restored);
    expect(keychain.get(apiKey)).toBe("imported-key");
    expect(keychain.has(passwordKey)).toBe(false);
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().notificationSettings).toEqual(restored);
  });

  it("switches to the restored settings and clears cached queries before deleting replaced credentials", async () => {
    const replacement = "00000000-0000-0000-0000-000000000099";
    const payload = backup();
    payload.services = { ...payload.services, radarr: [{ ...original, id: replacement, name: "Imported Radarr" }] };
    payload.secrets = { [replacement]: { apiKey: "imported-key" } };
    const clear = jest.spyOn(queryClient, "clear");
    let atCleanup: { names: string[]; cleared: boolean } | undefined;
    jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
      if (key === apiKey && !atCleanup) {
        atCleanup = {
          names: useConfigStore.getState().serviceInstances.radarr.map(({ name }) => name),
          cleared: clear.mock.calls.length > 0,
        };
      }
      keychain.delete(key);
    });
    await useConfigStore.getState().importConfigFromPayload(payload);
    clear.mockRestore();
    expect(atCleanup).toEqual({ names: ["Imported Radarr"], cleared: true });
    expect(keychain.has(apiKey)).toBe(false);
    expect(keychain.has("restore.journal")).toBe(false);
  });

  it("clears a reused instance's stored session cookie", async () => {
    const cookieKey = `${SECRET_PREFIX}.${INSTANCE_ID}.sessionCookie`;
    keychain.set(cookieKey, "SID=old");
    await useConfigStore.getState().importConfigFromPayload(backup());
    expect(keychain.has(cookieKey)).toBe(false);
  });

  it("removes legacy keys and the replaced backend's backup time instead of storing null", async () => {
    setString(STORAGE_KEYS.backendBackupLastAt, "123");
    setJSON(STORAGE_KEYS.widgetSettingsLegacy, {});
    await useConfigStore.getState().importConfigFromPayload(backup());
    expect(getString(STORAGE_KEYS.backendBackupLastAt)).toBeUndefined();
    expect(getString(STORAGE_KEYS.widgetSettingsLegacy)).toBeUndefined();
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(
      expect.arrayContaining([STORAGE_KEYS.backendBackupLastAt, STORAGE_KEYS.widgetSettingsLegacy]),
    );
  });
});

describe("hydrate — repairs values older builds saved", () => {
  afterEach(resetStoredConfig);

  it("adds the scheme to bare URLs, shortens long names, and saves the result (#526, #529)", async () => {
    setJSON(`${STORAGE_KEYS.services}.radarr`, [
      { id: INSTANCE_ID, name: "x".repeat(250), enabled: true, localUrl: "192.168.1.10:7878", remoteUrl: "", useRemote: false },
    ]);
    await useConfigStore.getState().hydrate();
    const expected = { name: "x".repeat(200), localUrl: "http://192.168.1.10:7878", remoteUrl: "" };
    expect(useConfigStore.getState().serviceInstances.radarr[0]).toMatchObject(expected);
    expect(getJSON<Record<string, unknown>[]>(`${STORAGE_KEYS.services}.radarr`)![0]).toMatchObject(expected);
  });

  it("gives Wake-on-LAN devices that share an id their own", async () => {
    const device = { id: "migrated-1", name: "NAS", mac: "aa:bb:cc:dd:ee:ff" };
    setJSON(STORAGE_KEYS.wolDevices, [device, { ...device, name: "Desktop" }]);
    await useConfigStore.getState().hydrate();
    const devices = useConfigStore.getState().wolDevices;
    expect(devices.map(({ name }) => name)).toEqual(["NAS", "Desktop"]);
    expect(new Set(devices.map(({ id }) => id)).size).toBe(2);
    expect(getJSON(STORAGE_KEYS.wolDevices)).toEqual(devices);
  });
});

describe("Demo Mode — global settings and guards", () => {
  afterEach(async () => {
    if (useConfigStore.getState().demoMode) await useConfigStore.getState().disableDemoMode();
    for (const key of [STORAGE_KEYS.treatVpnAsHome, STORAGE_KEYS.servicesOrder, STORAGE_KEYS.globalCustomHeaders]) {
      deleteKey(key);
    }
    resetStoredConfig();
  });

  it("keeps network and service settings in memory", async () => {
    const store = useConfigStore.getState();
    await store.hydrate();
    store.setAutoSwitch(false);
    const saved = [STORAGE_KEYS.treatVpnAsHome, STORAGE_KEYS.servicesOrder, STORAGE_KEYS.wolDevices, STORAGE_KEYS.globalCustomHeaders]
      .map((key) => getString(key));
    expect(store.enableDemoMode()).toBe(true);
    store.setAutoSwitch(true);
    store.setTreatVpnAsHome(true);
    store.setServicesOrder(["sonarr"]);
    store.setWolDevices([{ id: "w1", name: "NAS", mac: "aa:bb:cc:dd:ee:ff" }]);
    store.setGlobalCustomHeaders({ "X-Demo": "1" });
    expect(useConfigStore.getState()).toMatchObject({ autoSwitchNetwork: true, treatVpnAsHome: true });
    expect(getString(STORAGE_KEYS.autoSwitchNetwork)).toBe("false");
    expect(
      [STORAGE_KEYS.treatVpnAsHome, STORAGE_KEYS.servicesOrder, STORAGE_KEYS.wolDevices, STORAGE_KEYS.globalCustomHeaders]
        .map((key) => getString(key)),
    ).toEqual(saved);
    await store.disableDemoMode();
    expect(useConfigStore.getState().autoSwitchNetwork).toBe(false);
    expect(useConfigStore.getState().wolDevices).not.toContainEqual(expect.objectContaining({ id: "w1" }));
    expect(useConfigStore.getState().globalCustomHeaders).not.toHaveProperty("X-Demo");
  });

  it("applies notification overrides for demo instances in memory", async () => {
    const store = useConfigStore.getState();
    const saved = getString(STORAGE_KEYS.notificationSettings);
    expect(store.enableDemoMode()).toBe(true);
    const qbit = useConfigStore.getState().serviceInstances.qbittorrent[0].id;
    store.setInstanceNotificationOverride(qbit, "torrentCompleted", false);
    store.setQbtMutedCategories(qbit, ["tv"]);
    // A global setting changed afterwards must not save the demo overrides.
    store.setNotificationSetting("radarrGrabbed", true);
    const settings = useConfigStore.getState().notificationSettings;
    expect(settings.perInstance?.[qbit]).toEqual({ torrentCompleted: false });
    expect(settings.qbtMutedCategories?.[qbit]).toEqual(["tv"]);
    expect(settings.radarrGrabbed).toBe(true);
    expect(getString(STORAGE_KEYS.notificationSettings)).toBe(saved);
    await store.disableDemoMode();
    expect(useConfigStore.getState().notificationSettings.perInstance?.[qbit]).toBeUndefined();
  });

  it("refuses to start, and a restore refuses too, while a settings change is still being written", async () => {
    const store = useConfigStore.getState();
    let finish!: () => void;
    const write = withConfigWrite(() => new Promise<void>((resolve) => { finish = resolve; }));
    expect(store.enableDemoMode()).toBe(false);
    expect(useConfigStore.getState().demoMode).toBe(false);
    await expect(store.importConfigFromPayload(buildExportPayload())).rejects.toThrow(/in progress/);
    finish();
    await write;
    expect(store.enableDemoMode()).toBe(true);
  });

  it("refuses a backend restore before decrypting it", async () => {
    const store = useConfigStore.getState();
    store.enableDemoMode();
    const onStage = jest.fn();
    await expect(store.importConfigFromEnvelope({} as never, "passphrase", onStage)).rejects.toThrow(
      "Turn off Demo Mode",
    );
    expect(onStage).not.toHaveBeenCalled();
  });
});

describe("setDashboardHomeNetworkIds — unknown networks", () => {
  afterEach(resetStoredConfig);

  it("keeps only saved networks, and reads a selection of unknown ones as all networks", () => {
    useConfigStore.setState({
      homeNetworks: [{ id: "n1", ssid: "Home", bssid: "" }],
      dashboards: [{ id: "A", name: "A", widgets: [] }],
      activeDashboardId: "A",
    });
    const homeNetworkIds = () => useConfigStore.getState().dashboards[0].homeNetworkIds;
    useConfigStore.getState().setDashboardHomeNetworkIds("A", ["n1", "gone", "n1"]);
    expect(homeNetworkIds()).toEqual(["n1"]);
    useConfigStore.getState().setDashboardHomeNetworkIds("A", ["gone"]);
    expect(homeNetworkIds()).toBeUndefined();
    useConfigStore.getState().setDashboardHomeNetworkIds("A", []);
    expect(homeNetworkIds()).toEqual([]);
  });
});

// #418: two houses, each with its own dashboard, home SSID and instances, and
// identical LAN addressing. The health poll and the Integrations hub probe
// EVERY instance, so the other house's instance must be judged against ITS
// dashboard's home networks — not the active dashboard's — or its local URL
// reaches the wrong box at this house (which answers "authentication failed").
describe("getActiveUrl — instance attached to another workspace (#418)", () => {
  const HOME_ID = "00000000-0000-0000-0000-0000000000aa";
  const SEDONA_ID = "00000000-0000-0000-0000-0000000000bb";
  const ORPHAN_ID = "00000000-0000-0000-0000-0000000000cc";
  const LOCAL = "http://homeserver.local:7878"; // same name on both LANs
  const HOME_REMOTE = "http://100.64.0.1:7878";
  const SEDONA_REMOTE = "http://100.64.0.2:7878";
  const HOME_WIFI = { ssid: "HomeWifi", bssid: "" };
  const SEDONA_WIFI = { ssid: "SedonaWifi", bssid: "" };

  const inst = (id: string, remoteUrl: string) => ({
    id,
    enabled: true,
    name: id,
    localUrl: LOCAL,
    remoteUrl,
    useRemote: false,
  });

  function seedHouses(opts: {
    activeDashboardId: "home" | "sedona";
    networkAwayFromHome: boolean;
    currentWifi: { ssid: string; bssid: string } | null;
    autoSwitchNetwork?: boolean;
    treatVpnAsHome?: boolean;
    isVpnActive?: boolean;
    sedonaHomeNetworkIds?: string[];
  }) {
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [
          inst(HOME_ID, HOME_REMOTE),
          inst(SEDONA_ID, SEDONA_REMOTE),
          inst(ORPHAN_ID, HOME_REMOTE),
        ],
      },
      activeInstance: {
        ...useConfigStore.getState().activeInstance,
        radarr: opts.activeDashboardId === "home" ? HOME_ID : SEDONA_ID,
      },
      homeNetworks: [
        { id: "home-net", ssid: HOME_WIFI.ssid, bssid: "" },
        { id: "sedona-net", ssid: SEDONA_WIFI.ssid, bssid: "" },
      ],
      dashboards: [
        {
          id: "home",
          name: "Home",
          widgets: [],
          attachedInstances: [HOME_ID],
          homeNetworkIds: ["home-net"],
        },
        {
          id: "sedona",
          name: "Sedona",
          widgets: [],
          attachedInstances: [SEDONA_ID],
          homeNetworkIds: opts.sedonaHomeNetworkIds ?? ["sedona-net"],
        },
      ],
      activeDashboardId: opts.activeDashboardId,
      autoSwitchNetwork: opts.autoSwitchNetwork ?? true,
      networkAwayFromHome: opts.networkAwayFromHome,
      currentWifi: opts.currentWifi,
      treatVpnAsHome: opts.treatVpnAsHome ?? false,
      isVpnActive: opts.isVpnActive ?? false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  const url = (id: string) => useConfigStore.getState().getActiveUrl("radarr", id);

  it("at home on the Home dashboard: Home is local, Sedona is REMOTE (the #418 bug)", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: false, currentWifi: HOME_WIFI });
    expect(url(HOME_ID)).toBe(LOCAL);
    expect(url(SEDONA_ID)).toBe(SEDONA_REMOTE);
  });

  it("at Sedona on the Home dashboard: Home is remote, Sedona is LOCAL", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: true, currentWifi: SEDONA_WIFI });
    expect(url(HOME_ID)).toBe(HOME_REMOTE);
    expect(url(SEDONA_ID)).toBe(LOCAL);
  });

  it("at Sedona on the Sedona dashboard: Sedona is local, Home is remote", () => {
    seedHouses({ activeDashboardId: "sedona", networkAwayFromHome: false, currentWifi: SEDONA_WIFI });
    expect(url(SEDONA_ID)).toBe(LOCAL);
    expect(url(HOME_ID)).toBe(HOME_REMOTE);
  });

  it("off WiFi (or before the first evaluation) the other workspace's instance is remote-only", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: true, currentWifi: null });
    expect(url(SEDONA_ID)).toBe(SEDONA_REMOTE);
    // Even with a stale confirmed-home active flag, a null identity never
    // matches → never the private local URL for the other house's instance.
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: false, currentWifi: null });
    expect(url(SEDONA_ID)).toBe(SEDONA_REMOTE);
  });

  it("honors the other workspace's 'always remote' pin even with auto-switch off", () => {
    seedHouses({
      activeDashboardId: "home",
      networkAwayFromHome: true,
      currentWifi: SEDONA_WIFI,
      sedonaHomeNetworkIds: [],
      autoSwitchNetwork: false,
    });
    expect(url(SEDONA_ID)).toBe(SEDONA_REMOTE);
    expect(useConfigStore.getState().resolveInstanceNetwork(SEDONA_ID)).toEqual({
      away: true,
      forcesRemote: true,
    });
  });

  it("uses local for the other workspace's instance when auto-switch is off (user opted out)", () => {
    seedHouses({
      activeDashboardId: "home",
      networkAwayFromHome: true,
      currentWifi: null,
      autoSwitchNetwork: false,
    });
    expect(url(SEDONA_ID)).toBe(LOCAL);
  });

  it("counts an active VPN as home for the other workspace's instance with the opt-in (#185)", () => {
    seedHouses({
      activeDashboardId: "home",
      networkAwayFromHome: false,
      currentWifi: null,
      treatVpnAsHome: true,
      isVpnActive: true,
    });
    expect(url(SEDONA_ID)).toBe(LOCAL);
  });

  it("an instance no workspace claims keeps the active workspace's verdict", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: false, currentWifi: HOME_WIFI });
    expect(url(ORPHAN_ID)).toBe(LOCAL);
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: true, currentWifi: null });
    expect(url(ORPHAN_ID)).toBe(HOME_REMOTE);
  });

  // Review finding on #418: a migrated / pre-v20 dashboard auto-attaches
  // (attachedInstances undefined). That is a display default, not a claim on
  // which house an instance lives in, so an explicit owner elsewhere wins.
  it("an explicit owner beats an auto-attach ACTIVE workspace (migrated dashboards)", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: false, currentWifi: HOME_WIFI });
    useConfigStore.setState({
      dashboards: useConfigStore
        .getState()
        .dashboards.map((d) =>
          d.id === "home" ? { ...d, attachedInstances: undefined } : d,
        ),
    });
    expect(url(HOME_ID)).toBe(LOCAL); // no explicit owner → active verdict
    expect(url(SEDONA_ID)).toBe(SEDONA_REMOTE); // Sedona owns it explicitly
  });

  it("with no explicit owner anywhere, the active verdict governs (unchanged behavior)", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: false, currentWifi: HOME_WIFI });
    useConfigStore.setState({
      dashboards: useConfigStore
        .getState()
        .dashboards.map((d) => ({ ...d, attachedInstances: undefined })),
    });
    expect(url(SEDONA_ID)).toBe(LOCAL);
  });

  it("the per-instance verdict mirrors the active flag for attached instances", () => {
    seedHouses({ activeDashboardId: "home", networkAwayFromHome: false, currentWifi: HOME_WIFI });
    expect(useConfigStore.getState().resolveInstanceNetwork(HOME_ID)).toEqual({
      away: false,
      forcesRemote: false,
    });
    expect(useConfigStore.getState().resolveInstanceNetwork(SEDONA_ID)).toEqual({
      away: true,
      forcesRemote: false,
    });
  });
});

describe("setCurrentWifi — invalidation only on a real change (#418)", () => {
  it("no-ops on an identical identity and invalidates on a change", () => {
    useConfigStore.setState({ currentWifi: { ssid: "Home", bssid: "" } });
    const spy = jest.spyOn(queryClient, "invalidateQueries");
    spy.mockClear();

    useConfigStore.getState().setCurrentWifi({ ssid: "Home", bssid: "" });
    expect(spy).not.toHaveBeenCalled();

    useConfigStore.getState().setCurrentWifi({ ssid: "Cabin", bssid: "" });
    expect(useConfigStore.getState().currentWifi).toEqual({ ssid: "Cabin", bssid: "" });
    expect(spy).toHaveBeenCalledTimes(1);

    useConfigStore.getState().setCurrentWifi(null);
    expect(useConfigStore.getState().currentWifi).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("setNetworkObservation — one atomic write, one invalidation (#418)", () => {
  it("writes both fields in one update and invalidates once", () => {
    useConfigStore.setState({
      currentWifi: { ssid: "Home", bssid: "" },
      networkAwayFromHome: false,
    });
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const seen: Array<[unknown, boolean]> = [];
    const unsub = useConfigStore.subscribe((s) =>
      seen.push([s.currentWifi, s.networkAwayFromHome]),
    );
    spy.mockClear();

    useConfigStore.getState().setNetworkObservation({ ssid: "Cabin", bssid: "" }, true);

    // A single subscriber notification carrying BOTH new values: no
    // intermediate state where the identity is new but the verdict is stale.
    expect(seen).toEqual([[{ ssid: "Cabin", bssid: "" }, true]]);
    expect(spy).toHaveBeenCalledTimes(1);

    useConfigStore.getState().setNetworkObservation({ ssid: "Cabin", bssid: "" }, true);
    expect(spy).toHaveBeenCalledTimes(1); // unchanged → no-op

    useConfigStore.getState().setNetworkObservation({ ssid: "Cabin", bssid: "" }, false);
    expect(spy).toHaveBeenCalledTimes(2); // one field changed → still one invalidate
    unsub();
    spy.mockRestore();
  });
});

// #418 review: ownership and home-network edits re-route instances with no
// network flag moving, so the setters must refetch what was cached against the
// old URLs.
describe("ownership / home-network edits invalidate queries (#418)", () => {
  const net = (id: string) => ({ id, ssid: id, bssid: "" });
  function seedTwo() {
    useConfigStore.setState({
      homeNetworks: [net("home"), net("cabin")],
      dashboards: [
        { id: "A", name: "A", widgets: [], attachedInstances: ["x"], homeNetworkIds: ["home"] },
        { id: "B", name: "B", widgets: [], attachedInstances: ["y"], homeNetworkIds: ["cabin"] },
      ],
      activeDashboardId: "A",
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    spy.mockClear();
    return spy;
  }

  it("setDashboardAttachedInstances on a NON-active workspace invalidates", () => {
    const spy = seedTwo();
    useConfigStore.getState().setDashboardAttachedInstances("B", ["y", "z"]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("setDashboardHomeNetworkIds on a NON-active workspace invalidates without touching the flag", () => {
    const spy = seedTwo();
    useConfigStore.getState().setDashboardHomeNetworkIds("B", ["home"]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
    spy.mockRestore();
  });

  it("updateHomeNetwork / removeHomeNetwork / addHomeNetwork invalidate", () => {
    const spy = seedTwo();
    useConfigStore.getState().updateHomeNetwork("cabin", { ssid: "cabin-5g" });
    expect(spy).toHaveBeenCalledTimes(1);
    useConfigStore.getState().removeHomeNetwork("cabin");
    expect(spy).toHaveBeenCalledTimes(2);
    useConfigStore.getState().addHomeNetwork({ ssid: "lake", bssid: "" });
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});

// #418 review (blocking): a home-network edit must land together with the
// active dashboard's recomputed away verdict. If the list were committed alone,
// the invalidation that follows would refetch while the flag still said "home"
// for a network that is no longer in the list — local URL, wrong LAN, real
// credentials. These assert the URL AT INVALIDATION TIME.
describe("home-network edits recompute the active away verdict atomically (#418)", () => {
  const LOCAL = "http://homeserver.local:7878";
  const REMOTE = "http://100.64.0.1:7878";
  const HOME_WIFI = { ssid: "HomeWifi", bssid: "" };

  function seedHome(opts: { networks: { id: string; ssid: string; bssid: string }[]; away: boolean }) {
    seed({ localUrl: LOCAL, remoteUrl: REMOTE, autoSwitchNetwork: true, networkAwayFromHome: opts.away });
    useConfigStore.setState({
      homeNetworks: opts.networks,
      // One plain dashboard: auto-attach, all home networks (no leaked
      // selection from earlier describes).
      dashboards: [{ id: "A", name: "A", widgets: [] }],
      activeDashboardId: "A",
      currentWifi: HOME_WIFI,
      treatVpnAsHome: false,
      isVpnActive: false,
      demoMode: false,
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }
  // Capture what getActiveUrl resolves to at the moment the refetch starts.
  function captureAtInvalidation(): { spy: jest.SpyInstance; urls: string[] } {
    const urls: string[] = [];
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => {
        urls.push(useConfigStore.getState().getActiveUrl("radarr"));
      });
    return { spy, urls };
  }

  it("renaming the currently matched network is remote by the time invalidation runs", () => {
    seedHome({ networks: [{ id: "home", ssid: "HomeWifi", bssid: "" }], away: false });
    expect(useConfigStore.getState().getActiveUrl("radarr")).toBe(LOCAL);
    const { spy, urls } = captureAtInvalidation();

    useConfigStore.getState().updateHomeNetwork("home", { ssid: "Renamed" });

    expect(urls).toEqual([REMOTE]);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    spy.mockRestore();
  });

  it("removing the currently matched network is remote by the time invalidation runs", () => {
    seedHome({ networks: [{ id: "home", ssid: "HomeWifi", bssid: "" }], away: false });
    const { spy, urls } = captureAtInvalidation();

    useConfigStore.getState().removeHomeNetwork("home");

    expect(urls).toEqual([REMOTE]);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    spy.mockRestore();
  });

  it("pinning a BSSID the OS does not surface fails closed to remote at invalidation time", () => {
    seedHome({ networks: [{ id: "home", ssid: "HomeWifi", bssid: "" }], away: false });
    const { spy, urls } = captureAtInvalidation();

    useConfigStore.getState().updateHomeNetwork("home", { bssid: "aa:bb:cc:dd:ee:ff" });

    expect(urls).toEqual([REMOTE]);
    spy.mockRestore();
  });

  // An edit never LOOSENS the verdict from the cached identity: the evaluator
  // stops refreshing `currentWifi` while no network is configured, so it can
  // be stale by the time one is added again. Home is confirmed only by the
  // evaluator's fresh NetInfo read that the edit triggers.
  it("adding the network we are on stays remote until the evaluator confirms it", () => {
    seedHome({ networks: [], away: true });
    const { spy, urls } = captureAtInvalidation();

    useConfigStore.getState().addHomeNetwork({ ssid: "HomeWifi", bssid: "" });

    expect(urls).toEqual([REMOTE]);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    spy.mockRestore();
  });

  it("removing the last network drops the cached identity, so a later re-add cannot match it", () => {
    seedHome({ networks: [{ id: "home", ssid: "HomeWifi", bssid: "" }], away: false });

    // 1. At home, the user removes the last network → away, identity dropped.
    useConfigStore.getState().removeHomeNetwork("home");
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    expect(useConfigStore.getState().currentWifi).toBeNull();

    // 2. Evaluation has stopped (no networks). The device travels. 3. The user
    //    adds HomeWifi again while away: must NOT resolve local from a cache.
    const { spy, urls } = captureAtInvalidation();
    useConfigStore.getState().addHomeNetwork({ ssid: "HomeWifi", bssid: "" });
    expect(urls).toEqual([REMOTE]);
    expect(useConfigStore.getState().networkAwayFromHome).toBe(true);
    spy.mockRestore();
  });

  it("leaves the flag alone when auto-switch is off (the evaluator would too)", () => {
    seedHome({ networks: [{ id: "home", ssid: "HomeWifi", bssid: "" }], away: false });
    useConfigStore.setState({ autoSwitchNetwork: false });
    useConfigStore.getState().removeHomeNetwork("home");
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });

  it("stays home under VPN-as-home regardless of the edit (#185 precedence)", () => {
    seedHome({ networks: [{ id: "home", ssid: "HomeWifi", bssid: "" }], away: false });
    useConfigStore.setState({ treatVpnAsHome: true, isVpnActive: true });
    useConfigStore.getState().removeHomeNetwork("home");
    expect(useConfigStore.getState().networkAwayFromHome).toBe(false);
  });
});

describe("removeDashboard — invalidates on a NON-active deletion too (#418)", () => {
  it("refetches when the deleted dashboard was an instance's only explicit owner", () => {
    useConfigStore.setState({
      dashboards: [
        { id: "A", name: "A", widgets: [], attachedInstances: ["x"] },
        { id: "B", name: "B", widgets: [], attachedInstances: ["y"] },
      ],
      activeDashboardId: "A",
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    spy.mockClear();

    useConfigStore.getState().removeDashboard("B");
    expect(spy).toHaveBeenCalledTimes(1);

    useConfigStore.getState().removeDashboard("nope"); // no-op → no refetch
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("updateInstanceSecrets — Bazarr link detection", () => {
  const RADARR_ID = "00000000-0000-0000-0000-00000000bbbb";
  const QBIT_ID = "00000000-0000-0000-0000-00000000cccc";
  const detectionKey = ["bazarr", "bazarr-1", "arr-link-detection", "fp"];

  function seedArrAndClient() {
    const base = {
      enabled: true,
      localUrl: "http://192.168.1.10:7878",
      remoteUrl: "",
      useRemote: false,
    };
    useConfigStore.setState({
      serviceInstances: {
        ...useConfigStore.getState().serviceInstances,
        radarr: [{ ...base, id: RADARR_ID, name: "Radarr" }],
        qbittorrent: [{ ...base, id: QBIT_ID, name: "qBittorrent" }],
      },
    } as Partial<ReturnType<typeof useConfigStore.getState>>);
  }

  function detectionInvalidated(spy: jest.SpyInstance): boolean {
    return spy.mock.calls.some(([filters]) =>
      filters?.predicate?.({ queryKey: detectionKey }),
    );
  }

  it("re-runs detection when a Radarr/Sonarr key is saved", async () => {
    seedArrAndClient();
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    await useConfigStore.getState().updateInstanceSecrets(RADARR_ID, { apiKey: "fixed" });
    expect(detectionInvalidated(spy)).toBe(true);
    spy.mockRestore();
  });

  it("leaves detection alone for other services", async () => {
    seedArrAndClient();
    const spy = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    await useConfigStore.getState().updateInstanceSecrets(QBIT_ID, { password: "x" });
    expect(detectionInvalidated(spy)).toBe(false);
    spy.mockRestore();
  });
});
