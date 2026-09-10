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
// importConfig (exercised below for the v52 round-2 custom-secrets fix) reads
// the picked file via expo-document-picker + expo-file-system's `File`. Both
// are otherwise-unused native modules in this test file, so stub just the
// surface importConfig touches.
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { cache: "file:///cache" },
}));

import {
  useConfigStore,
  stripImportedBssids,
  repairOrphanedHomeNetworkSelection,
  buildExportServicesAndSecrets,
} from "./config-store";
import { setJSON } from "./storage";
import { STORAGE_KEYS, SECRET_PREFIX, SERVICE_IDS } from "@/lib/constants";
import { queryClient } from "@/lib/query-client";
import { CURRENT_CONFIG_VERSION } from "@/store/config-migrations";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import type { CustomServiceDefinition } from "@/lib/custom-service";

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

// v52 round-2 fix: a `custom` instance's auth.password/auth.token/
// login.body are credential-shaped exactly like apiKey/username/password,
// which never land in AsyncStorage — only SecureStore. `custom` itself is a
// field on the ServiceInstance record though, so persisting it verbatim
// would have written those secrets straight into plain AsyncStorage. These
// tests pin the fix at every layer: the AsyncStorage record is redacted, the
// values move to SecureStore, hydrate restores them, and importConfig
// round-trips the whole definition.
describe("custom service secrets — split between AsyncStorage and SecureStore (v52 round-2 fix)", () => {
  const fullCustom: CustomServiceDefinition = {
    auth: { mode: "basic", username: "u", password: "secret-pw" },
    login: {
      method: "POST",
      path: "/login",
      injectAs: "cookie",
      body: "pw=secret-pw",
    },
  };

  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function lastAsyncStorageWrite(key: string): Array<{ id: string; custom?: CustomServiceDefinition }> {
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls as [string, string][];
    const matching = calls.filter(([k]) => k === key);
    const last = matching[matching.length - 1];
    return last ? JSON.parse(last[1]) : [];
  }

  beforeEach(() => {
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("addInstance persists a redacted custom block to AsyncStorage", async () => {
    const inst = useConfigStore
      .getState()
      .addInstance("custom", { name: "My API", custom: fullCustom });
    await flush();

    const persisted = lastAsyncStorageWrite(`${STORAGE_KEYS.services}.custom`);
    const persistedInst = persisted.find((i) => i.id === inst.id);
    expect(persistedInst?.custom?.auth?.password).toBe("");
    expect(persistedInst?.custom?.login?.body).toBe("");

    // The in-memory record stays fully populated — a sibling feature reads
    // instance.custom with secrets present to make the actual request.
    const live = useConfigStore
      .getState()
      .serviceInstances.custom.find((i) => i.id === inst.id);
    expect(live?.custom?.auth?.password).toBe("secret-pw");
    expect(live?.custom?.login?.body).toBe("pw=secret-pw");
  });

  it("addInstance writes the extracted secrets to SecureStore", async () => {
    const inst = useConfigStore
      .getState()
      .addInstance("custom", { name: "My API", custom: fullCustom });
    await flush();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      `${SECRET_PREFIX}.${inst.id}.customPassword`,
      "secret-pw",
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      `${SECRET_PREFIX}.${inst.id}.customLoginBody`,
      "pw=secret-pw",
    );
  });

  it("updateInstance also redacts the persisted record and syncs SecureStore", async () => {
    const inst = useConfigStore.getState().addInstance("custom", { name: "My API" });
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();

    useConfigStore.getState().updateInstance("custom", inst.id, { custom: fullCustom });
    await flush();

    const persisted = lastAsyncStorageWrite(`${STORAGE_KEYS.services}.custom`);
    const persistedInst = persisted.find((i) => i.id === inst.id);
    expect(persistedInst?.custom?.auth?.password).toBe("");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      `${SECRET_PREFIX}.${inst.id}.customPassword`,
      "secret-pw",
    );
  });

  it("hydrate restores customPassword/customLoginBody onto instance.custom", async () => {
    const INST_ID = "00000000-0000-0000-0000-00000000cccc";
    setJSON(`${STORAGE_KEYS.services}.custom`, [
      {
        id: INST_ID,
        enabled: true,
        name: "My API",
        localUrl: "",
        remoteUrl: "",
        useRemote: false,
        custom: {
          auth: { mode: "basic", username: "u", password: "" },
          login: { method: "POST", path: "/login", injectAs: "cookie", body: "" },
        },
      },
    ]);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      if (key === `${SECRET_PREFIX}.${INST_ID}.customPassword`) return "secret-pw";
      if (key === `${SECRET_PREFIX}.${INST_ID}.customLoginBody`) return "pw=secret-pw";
      return null;
    });

    await useConfigStore.getState().hydrate();

    const restored = useConfigStore
      .getState()
      .serviceInstances.custom.find((i) => i.id === INST_ID);
    expect(restored?.custom?.auth?.password).toBe("secret-pw");
    expect(restored?.custom?.login?.body).toBe("pw=secret-pw");
    expect(useConfigStore.getState().instanceSecrets[INST_ID]?.customPassword).toBe(
      "secret-pw",
    );
  });

  it("importConfig round-trips the full custom definition (redacted at rest, restored in memory)", async () => {
    const INST_ID = "00000000-0000-0000-0000-00000000dddd";
    const DASH_ID = "00000000-0000-0000-0000-00000000dash";
    const exportPayload = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: "2026-09-08T00:00:00.000Z",
      services: {
        custom: [
          {
            id: INST_ID,
            enabled: true,
            name: "My API",
            localUrl: "",
            remoteUrl: "",
            useRemote: false,
            // A well-formed export already redacts these — matching what
            // exportConfig now produces.
            custom: {
              auth: { mode: "basic", username: "u", password: "" },
              login: { method: "POST", path: "/login", injectAs: "cookie", body: "" },
            },
          },
        ],
      },
      secrets: {
        [INST_ID]: {
          customPassword: "secret-pw",
          customLoginBody: "pw=secret-pw",
        },
      },
      autoSwitchNetwork: false,
      homeNetworks: [],
      dashboards: [{ id: DASH_ID, name: "Default", widgets: [] }],
      activeDashboardId: DASH_ID,
    };

    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///fake-config.json" }],
    });
    (File as unknown as jest.Mock).mockImplementation(() => ({
      text: async () => JSON.stringify(exportPayload),
    }));

    const ok = await useConfigStore
      .getState()
      .importConfig(async () => null, () => {});
    expect(ok).toBe(true);
    await flush();

    // In-memory: instance.custom is fully populated again.
    const restored = useConfigStore
      .getState()
      .serviceInstances.custom.find((i) => i.id === INST_ID);
    expect(restored?.custom?.auth?.password).toBe("secret-pw");
    expect(restored?.custom?.login?.body).toBe("pw=secret-pw");

    // On disk: still redacted.
    const persisted = lastAsyncStorageWrite(`${STORAGE_KEYS.services}.custom`);
    const persistedInst = persisted.find((i) => i.id === INST_ID);
    expect(persistedInst?.custom?.auth?.password).toBe("");
    expect(persistedInst?.custom?.login?.body).toBe("");

    // SecureStore got the real values.
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      `${SECRET_PREFIX}.${INST_ID}.customPassword`,
      "secret-pw",
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      `${SECRET_PREFIX}.${INST_ID}.customLoginBody`,
      "pw=secret-pw",
    );
  });
});

// v52 round-3 fix (review finding): state.instanceSecrets diverged from
// SecureStore for custom secrets. Hydrate populated
// instanceSecrets[id].customPassword/customToken/customLoginBody, but
// addInstance/updateInstance never kept it in sync afterward — so clearing a
// custom password via updateInstance deleted it from SecureStore but left
// the stale value sitting in instanceSecrets, and buildExportServicesAndSecrets
// (which only overrides truthy freshly-extracted values) let that stale value
// leak straight into an export. Fixed by making the live instance.custom
// authoritative: addInstance/updateInstance now resync instanceSecrets via
// withCustomSecretsSynced, and buildExportServicesAndSecrets rebuilds the
// three fields from scratch (belt-and-braces) instead of merging over
// whatever instanceSecrets already had.
describe("custom service secrets — instanceSecrets stays in sync with instance.custom (v52 round-3 fix)", () => {
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("a cleared custom password is absent from instanceSecrets after updateInstance", async () => {
    const INST_ID = "00000000-0000-0000-0000-00000000eeee";
    // Seed via hydrate, exactly as the review finding describes: hydrate
    // with customPassword "old" restores it onto instance.custom AND
    // populates instanceSecrets[INST_ID].customPassword.
    setJSON(`${STORAGE_KEYS.services}.custom`, [
      {
        id: INST_ID,
        enabled: true,
        name: "My API",
        localUrl: "",
        remoteUrl: "",
        useRemote: false,
        custom: {
          auth: { mode: "basic", username: "u", password: "" },
        },
      },
    ]);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      if (key === `${SECRET_PREFIX}.${INST_ID}.customPassword`) return "old";
      return null;
    });
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().instanceSecrets[INST_ID]?.customPassword).toBe(
      "old",
    );

    // User clears the password via updateInstance.
    useConfigStore.getState().updateInstance("custom", INST_ID, {
      custom: { auth: { mode: "basic", username: "u", password: "" } },
    });
    await flush();

    expect(
      useConfigStore.getState().instanceSecrets[INST_ID]?.customPassword,
    ).toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      `${SECRET_PREFIX}.${INST_ID}.customPassword`,
    );
  });

  it("buildExportServicesAndSecrets emits no customPassword for a since-cleared secret", async () => {
    const INST_ID = "00000000-0000-0000-0000-00000000ffff";
    setJSON(`${STORAGE_KEYS.services}.custom`, [
      {
        id: INST_ID,
        enabled: true,
        name: "My API",
        localUrl: "",
        remoteUrl: "",
        useRemote: false,
        custom: {
          auth: { mode: "basic", username: "u", password: "" },
        },
      },
    ]);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      if (key === `${SECRET_PREFIX}.${INST_ID}.customPassword`) return "old";
      return null;
    });
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().instanceSecrets[INST_ID]?.customPassword).toBe(
      "old",
    );

    useConfigStore.getState().updateInstance("custom", INST_ID, {
      custom: { auth: { mode: "basic", username: "u", password: "" } },
    });
    await flush();

    const { secrets } = buildExportServicesAndSecrets(
      useConfigStore.getState().serviceInstances,
      useConfigStore.getState().instanceSecrets,
    );
    expect(secrets[INST_ID]?.customPassword).toBeUndefined();
  });

  it("buildExportServicesAndSecrets ignores a stale customPassword left over in instanceSecrets (belt-and-braces)", () => {
    const INST_ID = "00000000-0000-0000-0000-00000000ab12";
    const serviceInstances = {
      ...useConfigStore.getState().serviceInstances,
      custom: [
        {
          id: INST_ID,
          enabled: true,
          name: "My API",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
          custom: { auth: { mode: "basic" as const, username: "u", password: "" } },
        },
      ],
    };
    // Simulate a stale instanceSecrets entry that was never resynced —
    // buildExportServicesAndSecrets must not trust it once instance.custom
    // no longer carries a password.
    const staleInstanceSecrets = { [INST_ID]: { customPassword: "old" } };

    const { secrets } = buildExportServicesAndSecrets(
      serviceInstances,
      staleInstanceSecrets,
    );
    expect(secrets[INST_ID]?.customPassword).toBeUndefined();
  });
});

// v52 round-4 fix (review finding): redactInstanceForStorage's round-3 fix
// made it ALWAYS call syncCustomSecrets (delete-if-empty). That's correct
// when `inst.custom` is live in-memory state, but hydrate's migration
// re-persist and importConfig's initial persist both call
// persistServiceInstanceList on an instance whose `custom` was just loaded
// from disk / an import payload — already redacted, so extractCustomSecrets
// sees {} and the "delete cleared keys" behavior wiped a REAL secret out of
// SecureStore before the secrets-load/merge-back step (which runs later)
// ever got to read it back. This only shows up with a STATEFUL SecureStore
// mock: the file's default mock at the top of this file is stateless
// (getItemAsync always resolves null, setItemAsync/deleteItemAsync are
// no-ops), so it can't distinguish "value present" from "value deleted".
describe("custom service secrets — survive a needsServicesPersist rewrite (v52 round-4 fix)", () => {
  let secureStoreMap: Map<string, string>;

  beforeEach(() => {
    secureStoreMap = new Map();
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      secureStoreMap.has(key) ? (secureStoreMap.get(key) as string) : null,
    );
    (SecureStore.setItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        secureStoreMap.set(key, value);
      },
    );
    (SecureStore.deleteItemAsync as jest.Mock).mockReset();
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
      secureStoreMap.delete(key);
    });
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  afterEach(() => {
    // Restore the file's default stateless mocks so later describe blocks
    // aren't affected by this one's map-backed behavior.
    (SecureStore.getItemAsync as jest.Mock).mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockReset();
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockReset();
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it("hydrate's needsServicesPersist rewrite does not delete a custom instance's secrets", async () => {
    const INST_ID = "00000000-0000-0000-0000-00000000ba11";
    // Pre-seed SecureStore with a real, already-saved password for this
    // instance — this is what a genuine prior session would have left there.
    secureStoreMap.set(`${SECRET_PREFIX}.${INST_ID}.customPassword`, "keep-me");

    // Seed ONLY services.custom (redacted, as it would be on disk) and force
    // every OTHER kind's stored list to empty so hydrate's normal
    // fresh-install/backfill path (makeInstance per kind) sets
    // needsServicesPersist = true — which rewrites EVERY kind's list,
    // `custom` included, via persistServiceInstanceList BEFORE the
    // secrets-load/merge-back loop runs.
    for (const id of SERVICE_IDS) {
      if (id !== "custom") setJSON(`${STORAGE_KEYS.services}.${id}`, []);
    }
    setJSON(`${STORAGE_KEYS.services}.custom`, [
      {
        id: INST_ID,
        enabled: true,
        name: "My API",
        localUrl: "",
        remoteUrl: "",
        useRemote: false,
        custom: { auth: { mode: "basic", username: "u", password: "" } },
      },
    ]);

    await useConfigStore.getState().hydrate();

    // The secret must still be in SecureStore — not deleted by the
    // migration re-persist that ran before the secrets read.
    expect(secureStoreMap.get(`${SECRET_PREFIX}.${INST_ID}.customPassword`)).toBe(
      "keep-me",
    );
    // ...and merged back onto the in-memory instance, same as any normal
    // hydrate.
    const restored = useConfigStore
      .getState()
      .serviceInstances.custom.find((i) => i.id === INST_ID);
    expect(restored?.custom?.auth?.password).toBe("keep-me");
  });

  it("importConfig does not delete a custom instance's secrets it just restored", async () => {
    const INST_ID = "00000000-0000-0000-0000-00000000ba22";
    const DASH_ID = "00000000-0000-0000-0000-00000000da22";
    const exportPayload = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: "2026-09-08T00:00:00.000Z",
      services: {
        custom: [
          {
            id: INST_ID,
            enabled: true,
            name: "My API",
            localUrl: "",
            remoteUrl: "",
            useRemote: false,
            // A well-formed export already redacts these.
            custom: { auth: { mode: "basic", username: "u", password: "" } },
          },
        ],
      },
      secrets: {
        [INST_ID]: { customPassword: "keep-me" },
      },
      autoSwitchNetwork: false,
      homeNetworks: [],
      dashboards: [{ id: DASH_ID, name: "Default", widgets: [] }],
      activeDashboardId: DASH_ID,
    };

    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///fake-config.json" }],
    });
    (File as unknown as jest.Mock).mockImplementation(() => ({
      text: async () => JSON.stringify(exportPayload),
    }));

    const ok = await useConfigStore
      .getState()
      .importConfig(async () => null, () => {});
    expect(ok).toBe(true);

    // The value the "Restore secrets" loop just wrote must still be there —
    // not deleted by the initial (syncSecrets:false) persist that runs
    // before it.
    expect(secureStoreMap.get(`${SECRET_PREFIX}.${INST_ID}.customPassword`)).toBe(
      "keep-me",
    );
    const restored = useConfigStore
      .getState()
      .serviceInstances.custom.find((i) => i.id === INST_ID);
    expect(restored?.custom?.auth?.password).toBe("keep-me");
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

  it("keeps a selection that still has at least one live id", () => {
    const [d] = repairOrphanedHomeNetworkSelection([dash(["home", "gone"])], nets);
    expect(d.homeNetworkIds).toEqual(["home", "gone"]);
  });

  it("leaves 'use all' (undefined) untouched", () => {
    const [d] = repairOrphanedHomeNetworkSelection([dash(undefined)], nets);
    expect("homeNetworkIds" in d).toBe(false);
  });
});
