import { serviceRequest } from "@/lib/http-client";
import type {
  UnraidArrayDisk,
  UnraidCapacity,
  UnraidContainer,
  UnraidPhysicalDisk,
  UnraidPool,
  UnraidStorage,
} from "@/lib/types";

// unRAID's official API is GraphQL-only: every call is POST /graphql with a
// {query, variables} JSON body (auth via X-Api-Key, injected by the http
// client). No GraphQL client library — the envelope is small enough to unwrap
// by hand, same spirit as rtorrent's XML-RPC layer.
//
// Schema reference: https://raw.githubusercontent.com/unraid/api/main/api/generated-schema.graphql

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
}

export class UnraidGraphqlError extends Error {
  constructor(
    public readonly errors: Array<{ message?: string; extensions?: { code?: string } }>,
    message: string,
  ) {
    super(message);
    this.name = "UnraidGraphqlError";
  }
}

// GraphQL failures arrive as HTTP 200 with an errors[] array (HttpError
// already covers non-2xx). Surface the first error message so toastError /
// error banners show something actionable instead of "undefined".
export async function unraidGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  instanceId?: string,
  timeout?: number,
): Promise<T> {
  const res = await serviceRequest<GraphqlEnvelope<T>>("unraid", "/graphql", {
    method: "POST",
    body: JSON.stringify(variables ? { query, variables } : { query }),
    instanceId,
    timeout,
  });
  if (res?.errors?.length && !res.data) {
    throw new UnraidGraphqlError(res.errors, res.errors[0]?.message || "unRAID API error");
  }
  if (!res?.data) throw new Error("Empty unRAID GraphQL response");
  return res.data;
}

// BigInt schema fields (disk sizes, fs usage, capacity) serialize as strings —
// same lesson as JellyStat's Postgres bigints. Coerce defensively.
export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ---- raw schema shapes (only the fields we select) ----

interface RawContainer {
  id: string;
  names?: string[] | null;
  image?: string | null;
  state?: string | null;
  status?: string | null;
  autoStart?: boolean | null;
  isUpdateAvailable?: boolean | null;
  isOrphaned?: boolean | null;
}

interface RawArrayDisk {
  idx?: number | null;
  name?: string | null;
  device?: string | null;
  size?: unknown;
  status?: string | null;
  type?: string | null;
  temp?: number | null;
  rotational?: boolean | null;
  isSpinning?: boolean | null;
  fsSize?: unknown;
  fsFree?: unknown;
  fsUsed?: unknown;
  fsType?: string | null;
}

interface RawPhysicalDisk {
  id: string;
  device?: string | null;
  name?: string | null;
  vendor?: string | null;
  size?: unknown;
  serialNum?: string | null;
  temperature?: number | null;
  smartStatus?: string | null;
  isSpinning?: boolean | null;
  interfaceType?: string | null;
}

interface RawArray {
  state?: string | null;
  capacity?: { disks?: { free?: unknown; used?: unknown; total?: unknown } | null } | null;
  parities?: RawArrayDisk[] | null;
  disks?: RawArrayDisk[] | null;
  caches?: RawArrayDisk[] | null;
  boot?: RawArrayDisk | null;
}

// ---- mappers (exported for tests) ----

export function mapContainer(raw: RawContainer): UnraidContainer {
  return {
    id: raw.id,
    name: (raw.names?.[0] ?? raw.id).replace(/^\//, ""),
    image: raw.image ?? "",
    state: raw.state ?? "",
    status: raw.status ?? "",
    autoStart: raw.autoStart ?? false,
    isUpdateAvailable: raw.isUpdateAvailable ?? undefined,
    isOrphaned: raw.isOrphaned ?? undefined,
  };
}

export function mapArrayDisk(raw: RawArrayDisk): UnraidArrayDisk {
  return {
    idx: raw.idx ?? 0,
    name: raw.name ?? raw.device ?? "disk",
    device: raw.device ?? undefined,
    size: toNum(raw.size),
    status: raw.status ?? "",
    type: raw.type ?? "",
    temp: raw.temp ?? null,
    rotational: raw.rotational ?? undefined,
    isSpinning: raw.isSpinning ?? undefined,
    fsSize: toNumOrNull(raw.fsSize),
    fsFree: toNumOrNull(raw.fsFree),
    fsUsed: toNumOrNull(raw.fsUsed),
    fsType: raw.fsType ?? null,
  };
}

export function mapPhysicalDisk(raw: RawPhysicalDisk): UnraidPhysicalDisk {
  return {
    id: raw.id,
    device: raw.device ?? "",
    name: raw.name ?? raw.device ?? "disk",
    vendor: raw.vendor ?? undefined,
    size: toNum(raw.size),
    serialNum: raw.serialNum ?? undefined,
    temperature: raw.temperature ?? null,
    smartStatus: raw.smartStatus ?? undefined,
    isSpinning: raw.isSpinning ?? undefined,
    interfaceType: raw.interfaceType ?? undefined,
  };
}

// ---- grouping (pure, unit-tested) ----

// Pool members are named after their pool with a trailing member index:
// "cache", "cache2" → pool "cache"; a single-member named pool "nvme" → pool
// "nvme". Heuristic until the API grows a first-class pool field.
function poolNameOf(disk: UnraidArrayDisk): string {
  const stripped = disk.name.replace(/\d+$/, "");
  return stripped.length > 0 ? stripped : disk.name;
}

// Group unRAID's raw array + physical-disk lists into what the disks screen
// renders: parity/data straight from the array, caches folded into named
// pools, and Unassigned computed as "physical disks not claimed by the array"
// (the API has no first-class unassigned-devices query).
export function groupUnraidStorage(
  rawArray: RawArray,
  rawPhysical: RawPhysicalDisk[],
): Omit<UnraidStorage, "parityCheck"> {
  const parities = (rawArray.parities ?? []).map(mapArrayDisk);
  const dataDisks = (rawArray.disks ?? []).map(mapArrayDisk);
  const caches = (rawArray.caches ?? []).map(mapArrayDisk);
  const boot = rawArray.boot ? mapArrayDisk(rawArray.boot) : null;

  const pools: UnraidPool[] = [];
  for (const disk of caches) {
    const name = poolNameOf(disk);
    const existing = pools.find((p) => p.name === name);
    if (existing) existing.disks.push(disk);
    else pools.push({ name, disks: [disk] });
  }

  const claimed = new Set<string>();
  for (const d of [...parities, ...dataDisks, ...caches]) {
    if (d.device) claimed.add(d.device);
  }
  if (boot?.device) claimed.add(boot.device);
  const unassigned = rawPhysical
    .map(mapPhysicalDisk)
    .filter((d) => d.device.length > 0 && !claimed.has(d.device));

  const capacity: UnraidCapacity = {
    free: toNum(rawArray.capacity?.disks?.free),
    used: toNum(rawArray.capacity?.disks?.used),
    total: toNum(rawArray.capacity?.disks?.total),
  };

  return {
    arrayState: rawArray.state ?? "",
    capacity,
    parities,
    dataDisks,
    pools,
    unassigned,
  };
}

// ---- queries ----

// Demo mode dispatches on these operation names (lib/demo-data.ts) — keep
// them in sync when renaming.

const ARRAY_DISK_FIELDS =
  "idx name device size status type temp rotational isSpinning fsSize fsFree fsUsed fsType";

const CONTAINERS_QUERY = `query UnraidContainers {
  docker {
    containers {
      id
      names
      image
      state
      status
      autoStart
      isUpdateAvailable
      isOrphaned
    }
  }
}`;

const STORAGE_QUERY = `query UnraidStorage {
  array {
    state
    capacity { disks { free used total } }
    parities { ${ARRAY_DISK_FIELDS} }
    disks { ${ARRAY_DISK_FIELDS} }
    caches { ${ARRAY_DISK_FIELDS} }
    boot { idx name device size }
  }
  disks {
    id
    device
    name
    vendor
    size
    serialNum
    temperature
    smartStatus
    isSpinning
    interfaceType
  }
}`;

export async function getUnraidContainers(instanceId?: string): Promise<UnraidContainer[]> {
  const data = await unraidGraphql<{ docker?: { containers?: RawContainer[] | null } | null }>(
    CONTAINERS_QUERY,
    undefined,
    instanceId,
  );
  return (data.docker?.containers ?? []).map(mapContainer);
}

export async function getUnraidStorage(instanceId?: string): Promise<UnraidStorage> {
  const data = await unraidGraphql<{ array?: RawArray | null; disks?: RawPhysicalDisk[] | null }>(
    STORAGE_QUERY,
    undefined,
    instanceId,
  );
  return {
    ...groupUnraidStorage(data.array ?? {}, data.disks ?? []),
    // parityCheckStatus's field shape isn't verified against a live instance
    // yet — shipped as null in v1 so the UI degrades to "no parity line".
    parityCheck: null,
  };
}

// ---- container mutations ----

// Container stop/restart wait out Docker's SIGTERM grace period server-side,
// which can exceed the client's 15s default — give mutations 30s.
const MUTATION_TIMEOUT = 30000;

interface MutatedContainer {
  id: string;
  state?: string | null;
  status?: string | null;
}

async function containerMutation(
  operation: "StartContainer" | "StopContainer" | "RestartContainer",
  field: "start" | "stop" | "restart",
  id: string,
  instanceId?: string,
): Promise<void> {
  const query = `mutation ${operation}($id: PrefixedID!) {
  docker {
    ${field}(id: $id) { id state status }
  }
}`;
  await unraidGraphql<{ docker?: Partial<Record<typeof field, MutatedContainer>> | null }>(
    query,
    { id },
    instanceId,
    MUTATION_TIMEOUT,
  );
}

export function startUnraidContainer(id: string, instanceId?: string): Promise<void> {
  return containerMutation("StartContainer", "start", id, instanceId);
}

export function stopUnraidContainer(id: string, instanceId?: string): Promise<void> {
  return containerMutation("StopContainer", "stop", id, instanceId);
}

export function restartUnraidContainer(id: string, instanceId?: string): Promise<void> {
  return containerMutation("RestartContainer", "restart", id, instanceId);
}
