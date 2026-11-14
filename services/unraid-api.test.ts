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
  mapArrayDisk,
  mapPhysicalDisk,
  getUnraidStorage,
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
        capacity: { kilobytes: { free: "100", used: "900", total: "1000" } },
        disks: [arrayDisk("disk1", "sdc", "DATA")],
      },
      [],
    );
    expect(grouped.capacity).toEqual({ free: 100000, used: 900000, total: 1000000 });
    expect(grouped.dataDisks[0]!.fsUsed).toBe(600000);
    expect(grouped.dataDisks[0]!.size).toBe(1024000);
  });
});

describe("unRAID storage unit contract", () => {
  it("matches /dev-prefixed physical devices to their assigned array and boot devices", () => {
    const storage = groupUnraidStorage({
      disks: [{ device: "sda" }],
      caches: [{ name: "cache", device: "nvme0n1" }],
      boot: { device: "sdc" },
    }, ["/dev/sda", "/dev/nvme0n1", "/dev/sdc", "/dev/sdaa"].map(device => ({ id: device, device })));
    expect(storage.unassigned.map(d => d.device)).toEqual(["/dev/sdaa"]);
  });

  it("queries storage capacity rather than slot counts and normalizes decimal KB", async () => {
    mockRequest.mockResolvedValue({ data: { array: {
      state: "STARTED",
      capacity: {
        disks: { free: "24", used: "4", total: "28" },
        kilobytes: { free: "14200000000", used: "25800000000", total: "40000000000" },
      },
    } } });
    const storage = await getUnraidStorage();
    expect(storage.capacity).toEqual({ free: 14200000000000, used: 25800000000000, total: 40000000000000 });
    const query = JSON.parse(mockRequest.mock.calls[0][2].body).query;
    expect(query).toContain("capacity { kilobytes { free used total } }");
    expect(query).not.toContain("capacity { disks");
  });

  it("converts array size from KiB, filesystem fields from decimal KB, and physical size from bytes", () => {
    // Values from the official API's 18 TB disk fixture. Its slots parser
    // converts only fs* from KiB to decimal KB; size remains raw KiB.
    const disk = mapArrayDisk({
      size: "17578328012", fsSize: "17998742753",
      fsUsed: "4116003021", fsFree: "13882739732",
    });
    expect(disk.size).toBe(17578328012 * 1024);
    expect(disk.fsSize).toBe(17998742753000);
    expect(disk.fsUsed).toBe(4116003021000);
    expect(disk.fsFree).toBe(13882739732000);
    expect(mapPhysicalDisk({ id: "physical", size: "18000207937536" }).size).toBe(18000207937536);
  });

  it("preserves missing parity filesystem values and zero capacity", () => {
    const disk = mapArrayDisk({ size: "17578328012", fsSize: null });
    expect(disk.fsSize).toBeNull();
    expect(disk.fsUsed).toBeNull();
    expect(disk.fsFree).toBeNull();
    expect(groupUnraidStorage({}, []).capacity).toEqual({ free: 0, used: 0, total: 0 });
    expect(mapArrayDisk({ fsSize: "0", fsUsed: "0", fsFree: "0" }).fsSize).toBe(0);
  });
});
