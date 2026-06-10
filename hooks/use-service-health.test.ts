// Mock the native storage layer before importing — use-service-health pulls in
// http-client → config-store → AsyncStorage/SecureStore at module load. Same
// shims as store/config-store.test.ts; the helper under test is pure.
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
  buildHealthProbeSignature,
  type HealthProbeInputs,
} from "./use-service-health";
import { SERVICE_IDS, type ServiceId } from "@/lib/constants";
import type { ServiceInstance, ServiceSecrets } from "@/store/config-store";

// The health query's verdict is cached under a key derived from this
// signature. The #106 regression was that the key was static, so a verdict
// computed against the wrong URL (a remote probe fired before NetInfo had
// corrected the away flag at cold start) stayed frozen. These tests pin the
// signature to react to the inputs each probe actually uses.

function emptyInstances(): Record<ServiceId, ServiceInstance[]> {
  const out = {} as Record<ServiceId, ServiceInstance[]>;
  for (const id of SERVICE_IDS) out[id] = [];
  return out;
}

function makeInst(over: Partial<ServiceInstance> & { id: string }): ServiceInstance {
  return {
    enabled: true,
    name: "Radarr",
    localUrl: "http://10.0.0.2:7878",
    remoteUrl: "http://radarr.example.com",
    useRemote: false,
    ignoreCertErrors: false,
    ...over,
  };
}

interface Opts {
  instances: Record<ServiceId, ServiceInstance[]>;
  secrets?: Record<string, ServiceSecrets>;
  globalCustomHeaders?: Record<string, string>;
  autoSwitchNetwork?: boolean;
  networkAwayFromHome?: boolean;
  isOnWifi?: boolean | null;
  isVpnActive?: boolean;
}

// Compute the signature with a resolveUrl that mirrors getActiveUrl's
// local/remote choice: useRemote override → remote; auto-switch off → local;
// away → remote only; home → local.
function sig(opts: Opts): string {
  const autoSwitchNetwork = opts.autoSwitchNetwork ?? false;
  const networkAwayFromHome = opts.networkAwayFromHome ?? false;
  const inputs: HealthProbeInputs = {
    serviceInstances: opts.instances,
    instanceSecrets: opts.secrets ?? {},
    globalCustomHeaders: opts.globalCustomHeaders ?? {},
    autoSwitchNetwork,
    networkAwayFromHome,
    isOnWifi: opts.isOnWifi ?? null,
    isVpnActive: opts.isVpnActive ?? false,
    resolveUrl: (id, instanceId) => {
      const inst = (opts.instances[id] ?? []).find((x) => x.id === instanceId);
      if (!inst) return "";
      if (inst.useRemote) return inst.remoteUrl || inst.localUrl;
      if (!autoSwitchNetwork) return inst.localUrl || inst.remoteUrl;
      if (networkAwayFromHome) return inst.remoteUrl;
      return inst.localUrl || inst.remoteUrl;
    },
  };
  return buildHealthProbeSignature(inputs);
}

describe("buildHealthProbeSignature — health query re-keys on its inputs (#106)", () => {
  const oneRadarr = (): Record<ServiceId, ServiceInstance[]> => ({
    ...emptyInstances(),
    radarr: [makeInst({ id: "r1" })],
  });

  it("is stable for unchanged inputs", () => {
    expect(sig({ instances: oneRadarr() })).toBe(sig({ instances: oneRadarr() }));
  });

  it("changes — and switches to the remote URL — when auto-switch flips to away", () => {
    const home = sig({
      instances: oneRadarr(),
      autoSwitchNetwork: true,
      networkAwayFromHome: false,
    });
    const away = sig({
      instances: oneRadarr(),
      autoSwitchNetwork: true,
      networkAwayFromHome: true,
    });
    expect(away).not.toBe(home);
    expect(home).toContain("http://10.0.0.2:7878");
    expect(away).toContain("http://radarr.example.com");
  });

  it("changes when a stored URL is edited", () => {
    const before = sig({ instances: oneRadarr() });
    const after = sig({
      instances: {
        ...emptyInstances(),
        radarr: [makeInst({ id: "r1", localUrl: "http://10.0.0.9:7878" })],
      },
    });
    expect(after).not.toBe(before);
  });

  it("changes when credentials appear (presence only — value isn't hashed)", () => {
    const before = sig({ instances: oneRadarr() });
    const withKey = sig({ instances: oneRadarr(), secrets: { r1: { apiKey: "abc" } } });
    const withOtherKey = sig({
      instances: oneRadarr(),
      secrets: { r1: { apiKey: "different-but-still-present" } },
    });
    expect(withKey).not.toBe(before);
    // Same presence, different value → same signature (so secrets never leak
    // into the key); a value change is caught by the polling interval instead.
    expect(withOtherKey).toBe(withKey);
  });

  it("changes when custom headers change", () => {
    const before = sig({ instances: oneRadarr() });
    const withHeader = sig({
      instances: oneRadarr(),
      globalCustomHeaders: { "CF-Access-Client-Id": "x" },
    });
    expect(withHeader).not.toBe(before);
  });

  it("changes when a VPN comes up (the LAN guard stands down, #185)", () => {
    const noVpn = sig({ instances: oneRadarr(), isOnWifi: false });
    const vpn = sig({ instances: oneRadarr(), isOnWifi: false, isVpnActive: true });
    expect(vpn).not.toBe(noVpn);
  });

  it("ignores disabled instances", () => {
    const enabled = sig({ instances: oneRadarr() });
    const disabled = sig({
      instances: {
        ...emptyInstances(),
        radarr: [makeInst({ id: "r1", enabled: false })],
      },
    });
    expect(disabled).not.toBe(enabled);
    expect(disabled).not.toContain("http://10.0.0.2:7878");
  });
});
