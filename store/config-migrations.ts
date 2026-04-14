import { DEFAULT_DASHBOARD_ORDER } from "@/lib/constants";
import type { ExportPayload } from "@/store/config-store";

/**
 * Bump this when the export schema changes and add a matching migration.
 * Export always writes this version; import migrates up from whatever it finds.
 *
 * History:
 *   v0  — pre-versioning (no version field)
 *   v1  — first versioned format (may be missing newer services)
 *   v2  — added backend pairing + notification settings
 */
export const CURRENT_CONFIG_VERSION = 2;

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
    dashboardOrder: payload.dashboardOrder ?? DEFAULT_DASHBOARD_ORDER,
  }),

  // v1 → v2: add backend pairing + notification settings
  1: (payload) => ({
    ...payload,
    version: 2,
    backend: payload.backend ?? null,
    notificationSettings: payload.notificationSettings ?? null,
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
