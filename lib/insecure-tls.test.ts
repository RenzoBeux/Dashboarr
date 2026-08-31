// insecure-tls.ts imports the config store (for syncInsecureHosts), which pulls
// in AsyncStorage/SecureStore at module load — native modules absent in the
// jest-expo node env. Shim them; these tests only exercise the pure
// computeInsecureHosts helper.
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

import { computeInsecureHosts } from "./insecure-tls";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";

const inst = (overrides: Partial<ServiceInstance>): ServiceInstance => ({
  id: Math.random().toString(36).slice(2),
  enabled: true,
  name: "svc",
  localUrl: "",
  remoteUrl: "",
  useRemote: false,
  ignoreCertErrors: false,
  ...overrides,
});

// computeInsecureHosts iterates Object.values, so a partial record is enough.
const services = (
  map: Partial<Record<ServiceId, ServiceInstance[]>>,
): Record<ServiceId, ServiceInstance[]> =>
  map as Record<ServiceId, ServiceInstance[]>;

describe("computeInsecureHosts", () => {
  it("returns empty when no instance opts in", () => {
    expect(
      computeInsecureHosts(
        services({ radarr: [inst({ localUrl: "https://radarr.example.com" })] }),
      ),
    ).toEqual([]);
  });

  it("collects both local and remote hosts of opted-in instances", () => {
    expect(
      computeInsecureHosts(
        services({
          radarr: [
            inst({
              ignoreCertErrors: true,
              localUrl: "https://192.168.1.50:7878",
              remoteUrl: "https://radarr.example.com",
            }),
          ],
        }),
      ),
    ).toEqual(["192.168.1.50", "radarr.example.com"]);
  });

  it("parses scheme-less URLs and lowercases the host", () => {
    expect(
      computeInsecureHosts(
        services({ sonarr: [inst({ ignoreCertErrors: true, localUrl: "NAS.Local:8989" })] }),
      ),
    ).toEqual(["nas.local"]);
  });

  it("dedupes hosts shared across instances and ignores blank/garbage URLs", () => {
    expect(
      computeInsecureHosts(
        services({
          radarr: [inst({ ignoreCertErrors: true, localUrl: "https://nas.local:7878" })],
          sonarr: [
            inst({ ignoreCertErrors: true, localUrl: "https://nas.local:8989", remoteUrl: "   " }),
          ],
          prowlarr: [inst({ ignoreCertErrors: false, localUrl: "https://other.local" })],
        }),
      ),
    ).toEqual(["nas.local"]);
  });
});

// The backend lives in its own store, so its host reaches the allowlist through
// `extraUrls` rather than through a ServiceInstance (#357).
describe("computeInsecureHosts — extraUrls (backend host)", () => {
  it("merges the extra host with service hosts, sorted", () => {
    expect(
      computeInsecureHosts(
        services({ radarr: [inst({ ignoreCertErrors: true, localUrl: "https://nas.local:7878" })] }),
        ["https://dashboarr.ember.ops"],
      ),
    ).toEqual(["dashboarr.ember.ops", "nas.local"]);
  });

  it("normalizes and lowercases an extra URL (#357 shape)", () => {
    expect(
      computeInsecureHosts(services({}), ["https://Dashboarr.Ember.OPS:8443"]),
    ).toEqual(["dashboarr.ember.ops"]);
  });

  it("parses a scheme-less extra URL", () => {
    expect(computeInsecureHosts(services({}), ["dashboarr.ember.ops:4000"])).toEqual([
      "dashboarr.ember.ops",
    ]);
  });

  it("ignores null, undefined, empty and whitespace extras", () => {
    expect(
      computeInsecureHosts(services({}), [null, undefined, "", "   "]),
    ).toEqual([]);
  });

  it("dedupes an extra that repeats a service host", () => {
    expect(
      computeInsecureHosts(
        services({ radarr: [inst({ ignoreCertErrors: true, localUrl: "https://nas.local:7878" })] }),
        ["https://nas.local:4000"],
      ),
    ).toEqual(["nas.local"]);
  });

  it("defaults to no extras, leaving existing callers unchanged", () => {
    expect(
      computeInsecureHosts(
        services({ radarr: [inst({ ignoreCertErrors: true, localUrl: "https://nas.local" })] }),
      ),
    ).toEqual(["nas.local"]);
  });
});
