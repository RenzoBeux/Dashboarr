// Mock the http client entirely — unraid-api routes every call through
// serviceRequest, and mocking the module here also stops the config-store /
// AsyncStorage import chain from loading in the test environment.
jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import {
  UnraidGraphqlError,
  getUnraidContainers,
  groupUnraidStorage,
  mapContainer,
  toNum,
  toNumOrNull,
  unraidGraphql,
} from "@/services/unraid-api";

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
});

describe("unraidGraphql envelope unwrapping", () => {
  it("returns data when present", async () => {
    mockRequest.mockResolvedValue({ data: { array: { state: "STARTED" } } });
    await expect(unraidGraphql("query { array { state } }")).resolves.toEqual({
      array: { state: "STARTED" },
    });
  });

  it("throws UnraidGraphqlError with the first message on errors without data", async () => {
    mockRequest.mockResolvedValue({
      errors: [
        { message: "Unauthorized", extensions: { code: "UNAUTHENTICATED" } },
        { message: "second" },
      ],
    });
    await expect(unraidGraphql("query { array { state } }")).rejects.toThrow(
      UnraidGraphqlError,
    );
    mockRequest.mockResolvedValue({ errors: [{ message: "Unauthorized" }] });
    await expect(unraidGraphql("query { array { state } }")).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("throws on an empty response", async () => {
    mockRequest.mockResolvedValue({});
    await expect(unraidGraphql("{__typename}")).rejects.toThrow(
      "Empty unRAID GraphQL response",
    );
  });

  it("POSTs the {query, variables} body to /graphql", async () => {
    mockRequest.mockResolvedValue({ data: { ok: true } });
    await unraidGraphql("mutation M($id: PrefixedID!) { x }", { id: "abc" });
    expect(mockRequest).toHaveBeenCalledWith(
      "unraid",
      "/graphql",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "mutation M($id: PrefixedID!) { x }", variables: { id: "abc" } }),
      }),
    );
  });
});

describe("BigInt-as-string coercion", () => {
  it("toNum handles numbers, numeric strings and garbage", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum("4000787030016")).toBe(4000787030016);
    expect(toNum("not-a-number")).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
  });

  it("toNumOrNull keeps null/undefined as null and rejects garbage", () => {
    expect(toNumOrNull(null)).toBeNull();
    expect(toNumOrNull(undefined)).toBeNull();
    expect(toNumOrNull("123")).toBe(123);
    expect(toNumOrNull(7)).toBe(7);
    expect(toNumOrNull("xfs")).toBeNull();
  });
});

describe("mapContainer", () => {
  it("takes the first names[] entry and strips the leading slash", () => {
    const mapped = mapContainer({
      id: "c1",
      names: ["/plex", "/plex-alias"],
      image: "plex:latest",
      state: "RUNNING",
      status: "Up 3 days",
      autoStart: true,
    });
    expect(mapped.name).toBe("plex");
    expect(mapped.state).toBe("RUNNING");
  });

  it("falls back to the id when names is empty", () => {
    const mapped = mapContainer({ id: "abc123" });
    expect(mapped.name).toBe("abc123");
  });
});

describe("getUnraidContainers", () => {
  it("unwraps docker.containers and maps rows", async () => {
    mockRequest.mockResolvedValue({
      data: {
        docker: {
          containers: [
            { id: "c1", names: ["/radarr"], image: "radarr", state: "RUNNING", status: "Up", autoStart: true },
          ],
        },
      },
    });
    const containers = await getUnraidContainers();
    expect(containers).toHaveLength(1);
    expect(containers[0]!.name).toBe("radarr");
  });
});

describe("groupUnraidStorage", () => {
  const arrayDisk = (name: string, device: string, type: string) => ({
    idx: 1,
    name,
    device,
    size: "1000",
    status: "DISK_OK",
    type,
    fsSize: "1000",
    fsFree: "400",
    fsUsed: "600",
    fsType: "xfs",
  });

  it("groups caches into pools by trailing-digit-stripped name", () => {
    const grouped = groupUnraidStorage(
      {
        state: "STARTED",
        caches: [
          arrayDisk("cache", "nvme0n1", "CACHE"),
          arrayDisk("cache2", "nvme1n1", "CACHE"),
          arrayDisk("apps", "nvme2n1", "CACHE"),
        ],
      },
      [],
    );
    expect(grouped.pools.map((p) => p.name)).toEqual(["cache", "apps"]);
    expect(grouped.pools[0]!.disks).toHaveLength(2);
    expect(grouped.pools[1]!.disks).toHaveLength(1);
  });

  it("returns no pools when there are no caches", () => {
    expect(groupUnraidStorage({ state: "STARTED" }, []).pools).toEqual([]);
  });

  it("computes unassigned as physical disks not claimed by the array (incl. boot)", () => {
    const physical = (device: string) => ({
      id: `disk-${device}`,
      device,
      name: device,
      size: 1000,
    });
    const grouped = groupUnraidStorage(
      {
        state: "STARTED",
        parities: [arrayDisk("parity", "sdb", "PARITY")],
        disks: [arrayDisk("disk1", "sdc", "DATA")],
        caches: [arrayDisk("cache", "nvme0n1", "CACHE")],
        boot: { idx: 0, name: "flash", device: "sda", size: "32" },
      },
      [physical("sda"), physical("sdb"), physical("sdc"), physical("nvme0n1"), physical("sdh")],
    );
    expect(grouped.unassigned.map((d) => d.device)).toEqual(["sdh"]);
  });

  it("coerces BigInt-as-string capacity and disk fields", () => {
    const grouped = groupUnraidStorage(
      {
        state: "STARTED",
        capacity: { disks: { free: "100", used: "900", total: "1000" } },
        disks: [arrayDisk("disk1", "sdc", "DATA")],
      },
      [],
    );
    expect(grouped.capacity).toEqual({ free: 100, used: 900, total: 1000 });
    expect(grouped.dataDisks[0]!.fsUsed).toBe(600);
    expect(grouped.dataDisks[0]!.size).toBe(1000);
  });
});
