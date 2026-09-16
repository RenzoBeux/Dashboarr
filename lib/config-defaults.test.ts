import { SERVICE_IDS, DEFAULT_DASHBOARD_WIDGETS } from "@/lib/constants";
import { validateExportPayload } from "@/store/config-schema";
import { migrateConfig, CURRENT_CONFIG_VERSION } from "@/store/config-migrations";
import { blankExportPayload, defaultDashboards, defaultInstances } from "./config-defaults";

describe("config defaults", () => {
  it("defaultInstances gives every kind exactly one disabled instance with a unique id", () => {
    const instances = defaultInstances();
    const ids = new Set<string>();
    for (const kind of SERVICE_IDS) {
      const list = instances[kind];
      expect(list).toHaveLength(1);
      const inst = list[0]!;
      expect(inst.enabled).toBe(false);
      expect(inst.localUrl).toBe("");
      expect(inst.name.length).toBeGreaterThan(0);
      ids.add(inst.id);
    }
    expect(ids.size).toBe(SERVICE_IDS.length);
  });

  it("defaultDashboards builds the Default dashboard with the default widgets", () => {
    const [dash] = defaultDashboards();
    expect(dash!.name).toBe("Default");
    expect(dash!.widgets.map((w) => w.widgetId)).toEqual([...DEFAULT_DASHBOARD_WIDGETS]);
    expect(dash!.attachedInstances).toBeUndefined();
  });

  it("blankExportPayload validates, migrates as a no-op and is idempotent", () => {
    const blank = blankExportPayload();
    expect(blank.version).toBe(CURRENT_CONFIG_VERSION);
    expect(blank).not.toHaveProperty("backend");
    expect(blank).not.toHaveProperty("weekStart");
    const migrated = migrateConfig(blank);
    const validated = validateExportPayload(migrated);
    expect(validated.activeDashboardId).toBe(blank.dashboards[0]!.id);
    expect(Object.keys(validated.services)).toHaveLength(SERVICE_IDS.length);
    expect(validateExportPayload(validated)).toEqual(validated);
  });
});
