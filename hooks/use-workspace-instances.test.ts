// Mock native storage before importing — use-workspace-instances pulls in
// use-instance-target → config-store → AsyncStorage/SecureStore at module load.
// The function under test is pure. Same shims as the other unit tests.
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

import { scopeInstancesToWorkspace } from "./use-workspace-instances";

const inst = (id: string) => ({ id, name: id });

describe("scopeInstancesToWorkspace", () => {
  const a = inst("a");
  const b = inst("b");
  const c = inst("c");
  const resolved = [a, b, c];
  const attached = new Set(["a", "c"]); // b is NOT attached to this workspace

  it("filters the default 'all' binding down to attached instances", () => {
    expect(scopeInstancesToWorkspace(resolved, "all", attached)).toEqual([a, c]);
  });

  it("treats undefined / null bindings as the 'all' default (also filtered)", () => {
    expect(scopeInstancesToWorkspace(resolved, undefined, attached)).toEqual([a, c]);
    expect(scopeInstancesToWorkspace(resolved, null, attached)).toEqual([a, c]);
  });

  it("keeps an explicit subset binding unchanged — the deliberate pick wins", () => {
    // The card already resolved to [b] via resolveBoundInstances; even though b
    // isn't attached, an explicit per-widget pick is honored (the #106 rule).
    expect(scopeInstancesToWorkspace([b], ["b"], attached)).toEqual([b]);
  });

  it("keeps a legacy scalar-id binding unchanged (also explicit)", () => {
    expect(scopeInstancesToWorkspace([b], "b", attached)).toEqual([b]);
  });

  it("returns empty for the default binding when nothing is attached", () => {
    expect(scopeInstancesToWorkspace(resolved, "all", new Set<string>())).toEqual([]);
  });

  it("returns everything when all resolved instances are attached", () => {
    expect(
      scopeInstancesToWorkspace(resolved, "all", new Set(["a", "b", "c"])),
    ).toEqual([a, b, c]);
  });
});
