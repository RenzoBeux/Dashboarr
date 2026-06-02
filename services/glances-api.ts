import { serviceRequest, HttpError } from "@/lib/http-client";
import type {
  GlancesCpu,
  GlancesMem,
  GlancesFsItem,
  GlancesPerCpuItem,
  GlancesLoad,
  GlancesDiskIOItem,
  GlancesGpuItem,
  GlancesContainerItem,
  GlancesNetItem,
} from "@/lib/types";

// Per-instance routing: every function takes an optional `instanceId`.

export function getCpu(instanceId?: string): Promise<GlancesCpu> {
  return serviceRequest<GlancesCpu>("glances", "/cpu", { instanceId });
}

export function getPerCpu(instanceId?: string): Promise<GlancesPerCpuItem[]> {
  return serviceRequest<GlancesPerCpuItem[]>("glances", "/percpu", { instanceId });
}

export function getLoad(instanceId?: string): Promise<GlancesLoad> {
  return serviceRequest<GlancesLoad>("glances", "/load", { instanceId });
}

export function getMem(instanceId?: string): Promise<GlancesMem> {
  return serviceRequest<GlancesMem>("glances", "/mem", { instanceId });
}

const VIRTUAL_FS_TYPES = new Set([
  "tmpfs", "proc", "sysfs", "devtmpfs", "devpts", "cgroup", "cgroup2",
  "pstore", "debugfs", "tracefs", "securityfs", "fusectl", "hugetlbfs",
  "mqueue", "configfs", "overlay", "aufs", "nsfs", "ramfs", "squashfs",
  "fuse.lxcfs", "fuse.gvfsd-fuse",
]);

const SYSTEM_PREFIXES = [
  "/etc/", "/usr/", "/bin/", "/sbin/", "/lib", "/proc/",
  "/sys/", "/dev/", "/run/", "/tmp/",
  "/host/boot",
];

export function isRealDisk(item: GlancesFsItem): boolean {
  if (VIRTUAL_FS_TYPES.has(item.fs_type)) return false;
  const basename = item.mnt_point.split("/").pop() ?? "";
  if (basename.includes(".")) return false;
  if (SYSTEM_PREFIXES.some((p) => item.mnt_point.startsWith(p))) return false;
  return true;
}

export async function getFs(instanceId?: string): Promise<GlancesFsItem[]> {
  const all = await serviceRequest<GlancesFsItem[]>("glances", "/fs", { instanceId });
  return all.filter(isRealDisk);
}

export function getDiskIO(instanceId?: string): Promise<GlancesDiskIOItem[]> {
  return serviceRequest<GlancesDiskIOItem[]>("glances", "/diskio", { instanceId });
}

export function getNet(instanceId?: string): Promise<GlancesNetItem[]> {
  return serviceRequest<GlancesNetItem[]>("glances", "/network", { instanceId });
}

// Loopback carries local inter-service traffic, not the server's actual
// connection — hide it from network views (the analog of isRealDisk).
export function isLoopbackInterface(name: string): boolean {
  const n = name.toLowerCase();
  return n === "lo" || n === "lo0" || n.startsWith("loopback");
}

// Container/virtualization interfaces that are noise when monitoring the
// server's real connection: Docker bridges + veth pairs, libvirt/VMware/KVM
// taps, Kubernetes CNIs. VPN tunnels (wg*, tailscale*, tun*, ppp*) are
// deliberately NOT virtual — users monitor those as genuine connections. A
// plain `br0`/`bond0` is a real bridge/aggregate, so only `br-<id>` (Docker's
// user-network pattern) is matched, not every `br*`.
const VIRTUAL_IFACE_PATTERNS: readonly RegExp[] = [
  /^docker/i, /^br-/i, /^veth/i, /^virbr/i, /^vnet/i, /^vmnet/i,
  /^cni/i, /^flannel/i, /^cali/i, /^cilium/i, /^weave/i, /^kube/i,
  /^nerdctl/i, /^ifb/i, /^dummy/i,
];

export function isVirtualInterface(name: string): boolean {
  return VIRTUAL_IFACE_PATTERNS.some((re) => re.test(name));
}

export interface GlancesNetRate extends GlancesNetItem {
  rx: number; // bytes/sec received
  tx: number; // bytes/sec sent
}

// Prefer Glances' server-computed per-second rate; fall back to the
// delta-over-interval formula the diskio view uses.
function netRxTx(item: GlancesNetItem): { rx: number; tx: number } {
  const rate = (precomputed: number | null | undefined, delta: number): number => {
    if (typeof precomputed === "number" && Number.isFinite(precomputed)) return precomputed;
    return item.time_since_update > 0 ? delta / item.time_since_update : 0;
  };
  return {
    rx: rate(item.bytes_recv_rate_per_sec, item.bytes_recv),
    tx: rate(item.bytes_sent_rate_per_sec, item.bytes_sent),
  };
}

// Up, non-loopback interfaces with computed rx/tx. Physical NICs first, then
// virtual (Docker/veth/…), each group sorted by total throughput descending —
// so the real connection floats to the top above container noise. Shared by the
// Glances screen (shows all) and the widgets (filter/sum by name).
export function rankedInterfaces(items: GlancesNetItem[]): GlancesNetRate[] {
  return items
    .filter((i) => i.is_up !== false && !isLoopbackInterface(i.interface_name))
    .map((i) => ({ ...i, ...netRxTx(i) }))
    .sort((a, b) => {
      const av = isVirtualInterface(a.interface_name) ? 1 : 0;
      const bv = isVirtualInterface(b.interface_name) ? 1 : 0;
      return av - bv || b.rx + b.tx - (a.rx + a.tx);
    });
}

// Widget-side selection of which interfaces to show. The sentinel "all" tracks
// every active, non-loopback interface; an array restricts to those names.
// Stored as a string (not null) so it survives JSON export and auto-includes
// interfaces that appear later. Owned here (the Glances data contract) so both
// the picker UI and the consuming widgets share one source of truth.
export const NETWORK_INTERFACES_ALL = "all" as const;
export type NetworkInterfacesValue = string[] | typeof NETWORK_INTERFACES_ALL;

// Resolve a selection against a live /network payload. The "all" sentinel means
// every real (non-virtual) interface — Docker/veth/bridge interfaces are
// excluded so the common case isn't drowned in container noise; with
// `activeOnly` it further drops idle NICs. An explicit name list is always shown
// verbatim, including virtual ones (the user picked them on purpose) and even
// when momentarily idle.
export function selectInterfaces(
  net: GlancesNetItem[] | undefined,
  selection: NetworkInterfacesValue,
  opts: { activeOnly?: boolean } = {},
): GlancesNetRate[] {
  if (!net) return [];
  const ranked = rankedInterfaces(net);
  if (selection === NETWORK_INTERFACES_ALL) {
    const real = ranked.filter((i) => !isVirtualInterface(i.interface_name));
    return opts.activeOnly ? real.filter((i) => i.rx + i.tx > 0) : real;
  }
  const allowed = new Set(selection);
  return ranked.filter((i) => allowed.has(i.interface_name));
}

export async function getGpu(instanceId?: string): Promise<GlancesGpuItem[]> {
  // Hosts without a GPU return an empty list; if the plugin is disabled the
  // endpoint can 404, so swallow that into [] rather than surfacing as error.
  try {
    return await serviceRequest<GlancesGpuItem[]>("glances", "/gpu", { instanceId });
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}

export async function getContainers(instanceId?: string): Promise<GlancesContainerItem[]> {
  // The containers plugin 404s when no engine (Docker/Podman) is installed or
  // the plugin is disabled — treat that as "no containers" rather than error.
  try {
    return await serviceRequest<GlancesContainerItem[]>("glances", "/containers", { instanceId });
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}
