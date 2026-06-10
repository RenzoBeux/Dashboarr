// Mock native storage before importing — disk-space-settings pulls in
// use-widget-settings → config-store → AsyncStorage/SecureStore at module
// load. The functions under test are pure. Same shims as the other unit tests.
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

import {
  resolveDiskSpaceSource,
  diskSpaceBindingFor,
  DISK_SPACE_DEFAULT_SETTINGS,
  type DiskSpaceSettingsValue,
} from "./disk-space-settings";

describe("resolveDiskSpaceSource", () => {
  it("keeps the stored source when that kind is available", () => {
    expect(
      resolveDiskSpaceSource("sonarr", { radarr: true, sonarr: true, lidarr: false }),
    ).toBe("sonarr");
  });

  it("falls back to the first configured kind in radarr → sonarr → lidarr order", () => {
    expect(
      resolveDiskSpaceSource("radarr", { radarr: false, sonarr: true, lidarr: true }),
    ).toBe("sonarr");
    expect(
      resolveDiskSpaceSource("sonarr", { radarr: false, sonarr: false, lidarr: true }),
    ).toBe("lidarr");
  });

  it("returns the stored source when nothing is configured", () => {
    expect(
      resolveDiskSpaceSource("lidarr", { radarr: false, sonarr: false, lidarr: false }),
    ).toBe("lidarr");
  });
});

describe("diskSpaceBindingFor", () => {
  const settings: DiskSpaceSettingsValue = {
    ...DISK_SPACE_DEFAULT_SETTINGS,
    radarrInstanceIds: ["r1"],
    sonarrInstanceIds: ["s1"],
    lidarrInstanceIds: ["l1"],
  };

  it("returns the binding field matching the source", () => {
    expect(diskSpaceBindingFor(settings, "radarr")).toEqual(["r1"]);
    expect(diskSpaceBindingFor(settings, "sonarr")).toEqual(["s1"]);
    expect(diskSpaceBindingFor(settings, "lidarr")).toEqual(["l1"]);
  });
});
