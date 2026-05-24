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

  it("picks remoteUrl when auto-switch decides we're away from home", () => {
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
