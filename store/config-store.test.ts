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
