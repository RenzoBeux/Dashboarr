import { DEFAULT_DASHBOARD_WIDGETS } from "@/lib/constants";
import type { ExportPayload } from "@/store/config-store";

/**
 * Bump this when the export schema changes and add a matching migration.
 * Export always writes this version; import migrates up from whatever it finds.
 *
 * History:
 *   v0  — pre-versioning (no version field)
 *   v1  — first versioned format (may be missing newer services)
 *   v2  — added backend pairing + notification settings
 *   v3  — moved wake-on-LAN from per-service to global config
 *   v4  — multiple WOL devices (wakeOnLan → wolDevices array)
 *   v5  — dashboardOrder renamed to dashboardWidgets
 *   v6  — added optional homeBSSID for rogue-AP-resistant auto-switch
 */
export const CURRENT_CONFIG_VERSION = 6;

/**
 * Each key N is a function that transforms a version-N payload into version N+1.
 * To add a new migration:
 *   1. Bump CURRENT_CONFIG_VERSION
 *   2. Add an entry:  [OLD]: (payload) => ({ ...transformed, version: OLD + 1 })
 */
const migrations: Record<number, (payload: any) => any> = {
  // v0 (pre-versioning) → v1
  0: (payload) => ({
    version: 1,
    exportedAt: payload.exportedAt ?? new Date().toISOString(),
    services: payload.services ?? {},
    secrets: payload.secrets ?? {},
    autoSwitchNetwork: payload.autoSwitchNetwork ?? false,
    homeSSID: payload.homeSSID ?? "",
    dashboardOrder: payload.dashboardOrder ?? [],
  }),

  // v1 → v2: add backend pairing + notification settings
  1: (payload) => ({
    ...payload,
    version: 2,
    backend: payload.backend ?? null,
    notificationSettings: payload.notificationSettings ?? null,
  }),

  // v2 → v3: move wake-on-LAN from per-service to global
  2: (payload) => {
    let wakeOnLan = null;
    const services: Record<string, any> = {};
    for (const [id, svc] of Object.entries(payload.services ?? {})) {
      const { wakeOnLan: wolConfig, ...rest } = svc as any;
      if (!wakeOnLan && wolConfig?.mac) {
        wakeOnLan = wolConfig;
      }
      services[id] = rest;
    }
    return { ...payload, version: 3, services, wakeOnLan };
  },

  // v3 → v4: single wakeOnLan → wolDevices array
  3: (payload) => {
    const wolDevices: any[] = [];
    if (payload.wakeOnLan?.mac) {
      wolDevices.push({
        id: "migrated-1",
        name: "Server",
        mac: payload.wakeOnLan.mac,
        broadcastAddress: payload.wakeOnLan.broadcastAddress,
        port: payload.wakeOnLan.port,
      });
    }
    const { wakeOnLan: _, ...rest } = payload;
    return { ...rest, version: 4, wolDevices };
  },

  // v4 → v5: dashboardOrder renamed to dashboardWidgets
  4: (payload) => {
    const { dashboardOrder, ...rest } = payload;
    const dashboardWidgets = Array.isArray(dashboardOrder) && dashboardOrder.length > 0
      ? dashboardOrder
      : DEFAULT_DASHBOARD_WIDGETS;
    return { ...rest, version: 5, dashboardWidgets };
  },

  // v5 → v6: added optional homeBSSID. Pre-v6 exports lack it; default empty
  // so existing auto-switch falls back to SSID-only matching (old behavior).
  5: (payload) => ({
    ...payload,
    version: 6,
    homeBSSID: typeof payload.homeBSSID === "string" ? payload.homeBSSID : "",
  }),
};

/**
 * Takes a raw parsed config (any version) and runs migrations sequentially
 * until it reaches CURRENT_CONFIG_VERSION.
 */
export function migrateConfig(raw: any): ExportPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid config file");
  }

  let version: number = typeof raw.version === "number" ? raw.version : 0;
  let payload = { ...raw };

  if (version > CURRENT_CONFIG_VERSION) {
    throw new Error(
      `Config version ${version} is newer than this app supports (v${CURRENT_CONFIG_VERSION}). Update the app first.`,
    );
  }

  while (version < CURRENT_CONFIG_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration path from config version ${version}`);
    }
    payload = migrate(payload);
    version = payload.version;
  }

  if (!payload.services || typeof payload.services !== "object") {
    throw new Error("Invalid config file — no services found");
  }

  return payload as ExportPayload;
}
