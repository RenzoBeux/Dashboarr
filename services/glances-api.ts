import { serviceRequest } from "@/lib/http-client";
import type {
  GlancesCpu,
  GlancesMem,
  GlancesFsItem,
  GlancesPerCpuItem,
  GlancesLoad,
  GlancesDiskIOItem,
} from "@/lib/types";

export function getCpu(): Promise<GlancesCpu> {
  return serviceRequest<GlancesCpu>("glances", "/cpu");
}

export function getPerCpu(): Promise<GlancesPerCpuItem[]> {
  return serviceRequest<GlancesPerCpuItem[]>("glances", "/percpu");
}

export function getLoad(): Promise<GlancesLoad> {
  return serviceRequest<GlancesLoad>("glances", "/load");
}

export function getMem(): Promise<GlancesMem> {
  return serviceRequest<GlancesMem>("glances", "/mem");
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

export async function getFs(): Promise<GlancesFsItem[]> {
  const all = await serviceRequest<GlancesFsItem[]>("glances", "/fs");
  return all.filter(isRealDisk);
}

export function getDiskIO(): Promise<GlancesDiskIOItem[]> {
  return serviceRequest<GlancesDiskIOItem[]>("glances", "/diskio");
}
