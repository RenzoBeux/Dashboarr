// Mock native storage before importing — arr-diskspace pulls in http-client →
// config-store → AsyncStorage/SecureStore at module load. The functions under
// test are pure. Same shims as the other unit tests.
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

import { selectDiskSpace, DISK_PATHS_ALL } from "@/services/arr-diskspace";
import type { ArrDiskSpace } from "@/lib/types";

function disk(path: string, freeSpace = 100, totalSpace = 1000): ArrDiskSpace {
  return { path, label: path, freeSpace, totalSpace };
}

describe("selectDiskSpace", () => {
  it("returns [] for undefined input", () => {
    expect(selectDiskSpace(undefined, DISK_PATHS_ALL)).toEqual([]);
    expect(selectDiskSpace(undefined, ["/data"])).toEqual([]);
  });

  it('"all" returns every mount sorted by path', () => {
    const disks = [disk("/media"), disk("/"), disk("/data")];
    expect(selectDiskSpace(disks, DISK_PATHS_ALL).map((d) => d.path)).toEqual([
      "/",
      "/data",
      "/media",
    ]);
  });

  it("an explicit subset filters by exact path, still sorted", () => {
    const disks = [disk("/media"), disk("/"), disk("/data")];
    expect(selectDiskSpace(disks, ["/media", "/data"]).map((d) => d.path)).toEqual([
      "/data",
      "/media",
    ]);
  });

  it("selection naming a vanished mount just omits it", () => {
    const disks = [disk("/data")];
    expect(selectDiskSpace(disks, ["/gone", "/data"]).map((d) => d.path)).toEqual([
      "/data",
    ]);
  });

  it("does not mutate the input array", () => {
    const disks = [disk("/media"), disk("/")];
    selectDiskSpace(disks, DISK_PATHS_ALL);
    expect(disks.map((d) => d.path)).toEqual(["/media", "/"]);
  });
});
