import { serviceRequest } from "@/lib/http-client";
import type {
  GlancesCpu,
  GlancesMem,
  GlancesFsItem,
  GlancesPerCpuItem,
  GlancesLoad,
  GlancesDiskIOItem,
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
