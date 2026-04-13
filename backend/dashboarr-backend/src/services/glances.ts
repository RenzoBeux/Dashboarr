import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface GlancesCpu {
  total: number;
}

export interface GlancesMem {
  percent: number;
}

export interface GlancesFsItem {
  mnt_point: string;
  percent: number;
}

export function getGlancesCpu(config: StoredServiceConfig): Promise<GlancesCpu> {
  return serviceFetch<GlancesCpu>(config, "/cpu");
}

export function getGlancesMem(config: StoredServiceConfig): Promise<GlancesMem> {
  return serviceFetch<GlancesMem>(config, "/mem");
}

export function getGlancesFs(config: StoredServiceConfig): Promise<GlancesFsItem[]> {
  return serviceFetch<GlancesFsItem[]>(config, "/fs");
}
