// Mock native storage before importing — instance-picker-row pulls in
// use-instance-target → config-store → AsyncStorage/SecureStore at module
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
  resolveBoundInstances,
  isExplicitInstanceBinding,
  INSTANCE_BINDING_ALL,
} from "./instance-picker-row";

const A = { id: "a" };
const B = { id: "b" };
const C = { id: "c" };
const ALL_INSTANCES = [A, B, C];

describe("resolveBoundInstances", () => {
  it("returns every instance for the 'all' sentinel", () => {
    expect(resolveBoundInstances(INSTANCE_BINDING_ALL, ALL_INSTANCES)).toEqual(
      ALL_INSTANCES,
    );
  });

  it("returns every instance for null/undefined (legacy/unset)", () => {
    expect(resolveBoundInstances(null, ALL_INSTANCES)).toEqual(ALL_INSTANCES);
    expect(resolveBoundInstances(undefined, ALL_INSTANCES)).toEqual(ALL_INSTANCES);
  });

  it("returns every instance for an empty array", () => {
    expect(resolveBoundInstances([], ALL_INSTANCES)).toEqual(ALL_INSTANCES);
  });

  it("matches a legacy scalar id like a single-element subset", () => {
    expect(resolveBoundInstances("b", ALL_INSTANCES)).toEqual([B]);
  });

  it("narrows to the named subset, preserving instance order", () => {
    expect(resolveBoundInstances(["c", "a"], ALL_INSTANCES)).toEqual([A, C]);
  });

  it("ignores ids not present in the instance list", () => {
    expect(resolveBoundInstances(["a", "zzz"], ALL_INSTANCES)).toEqual([A]);
  });
});

describe("isExplicitInstanceBinding (#106 — explicit picks bypass workspace filter)", () => {
  it("is false for the aggregate/default bindings", () => {
    expect(isExplicitInstanceBinding(INSTANCE_BINDING_ALL)).toBe(false);
    expect(isExplicitInstanceBinding(null)).toBe(false);
    expect(isExplicitInstanceBinding(undefined)).toBe(false);
    expect(isExplicitInstanceBinding([])).toBe(false);
  });

  it("is true for a legacy scalar id", () => {
    expect(isExplicitInstanceBinding("a")).toBe(true);
  });

  it("is true for a non-empty subset array", () => {
    expect(isExplicitInstanceBinding(["a"])).toBe(true);
    expect(isExplicitInstanceBinding(["a", "b"])).toBe(true);
  });
});
