import { CURRENT_CONFIG_VERSION, migrateConfig } from "./config-migrations";
import { DEFAULT_DASHBOARD_WIDGETS } from "@/lib/constants";

describe("migrateConfig — entry point", () => {
  it("throws when raw is null", () => {
    expect(() => migrateConfig(null)).toThrow(/invalid/i);
  });

  it("throws when raw is a primitive", () => {
    expect(() => migrateConfig(42 as any)).toThrow(/invalid/i);
    expect(() => migrateConfig("hello" as any)).toThrow(/invalid/i);
  });

  it("defaults missing version to 0 and runs the full chain", () => {
    const result = migrateConfig({ services: {} });
    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
  });

  it("throws when version is greater than CURRENT_CONFIG_VERSION", () => {
    expect(() =>
      migrateConfig({ version: CURRENT_CONFIG_VERSION + 1, services: {} }),
    ).toThrow(new RegExp(String(CURRENT_CONFIG_VERSION + 1)));
  });

  it("returns payload unchanged when already at CURRENT_CONFIG_VERSION", () => {
    // v14 shape: dashboards/activeDashboardId carry layout; per-slot settings
    // live on the slot itself.
    const dashboardId = "11111111-1111-1111-1111-111111111111";
    const slotId = "22222222-2222-2222-2222-222222222222";
    const input = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: "2026-04-27T00:00:00.000Z",
      services: {
        radarr: [
          {
            id: "uuid-radarr-1",
            enabled: true,
            name: "Radarr",
            localUrl: "",
            remoteUrl: "",
            useRemote: false,
          },
        ],
      },
      secrets: {},
      activeInstance: { radarr: "uuid-radarr-1" },
      autoSwitchNetwork: false,
      homeNetworks: [],
      dashboards: [
        {
          id: dashboardId,
          name: "Default",
          widgets: [{ id: slotId, widgetId: "calendar" }],
        },
      ],
      activeDashboardId: dashboardId,
      wolDevices: [],
    };
    const result: any = migrateConfig({ ...input });
    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
    expect(result.services).toEqual(input.services);
    expect(result.dashboards).toEqual(input.dashboards);
    expect(result.activeDashboardId).toBe(dashboardId);
  });

  it("throws when final payload has services as null", () => {
    expect(() =>
      migrateConfig({ version: CURRENT_CONFIG_VERSION, services: null }),
    ).toThrow(/no services/i);
  });

  it("throws when final payload has no services key at all", () => {
    expect(() =>
      migrateConfig({ version: CURRENT_CONFIG_VERSION }),
    ).toThrow(/no services/i);
  });
});

describe("v0 → v1 (pre-versioning fallback)", () => {
  it("generates a parseable ISO exportedAt when missing", () => {
    const result = migrateConfig({ services: {} });
    expect(typeof result.exportedAt).toBe("string");
    expect(Number.isFinite(Date.parse(result.exportedAt))).toBe(true);
  });

  it("preserves an existing exportedAt", () => {
    const result = migrateConfig({
      services: {},
      exportedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.exportedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("defaults each missing field to its empty/false value", () => {
    const result: any = migrateConfig({ services: {} });
    expect(result.services).toEqual({});
    expect(result.secrets).toEqual({});
    expect(result.autoSwitchNetwork).toBe(false);
    // v11 migration drops legacy homeSSID/homeBSSID and replaces them with the
    // homeNetworks array (empty when no SSID was configured).
    expect(result.homeNetworks).toEqual([]);
    expect(result.homeSSID).toBeUndefined();
    expect(result.homeBSSID).toBeUndefined();
  });

  it("wraps a populated services map into the v13 instance-array shape", () => {
    const services = {
      radarr: { enabled: true, name: "Radarr", localUrl: "http://radarr" },
    };
    const result: any = migrateConfig({ services });
    // v12 → v13: every kind's singleton becomes a one-element array, with a
    // freshly-generated UUID id. The user's other fields are preserved verbatim.
    expect(Array.isArray(result.services.radarr)).toBe(true);
    expect(result.services.radarr).toHaveLength(1);
    expect(result.services.radarr[0]).toMatchObject({
      enabled: true,
      name: "Radarr",
      localUrl: "http://radarr",
    });
    expect(typeof result.services.radarr[0].id).toBe("string");
    expect(result.services.radarr[0].id.length).toBeGreaterThan(0);
  });

  it("guards against ?? vs || regression: autoSwitchNetwork:false stays false", () => {
    const result = migrateConfig({ services: {}, autoSwitchNetwork: false });
    expect(result.autoSwitchNetwork).toBe(false);
  });
});

describe("v1 → v2 (backend + notification settings)", () => {
  it("adds backend=null and notificationSettings=null when missing", () => {
    // Start from a v1 fixture so the v0 migration doesn't mask the v1→v2 step.
    const result = migrateConfig({ version: 1, services: {} });
    expect(result.backend).toBeNull();
    expect(result.notificationSettings).toBeNull();
  });

  it("preserves a configured backend object (no field synthesis)", () => {
    const backend = { url: "https://api.example.com", sharedSecret: "x", deviceId: "dev-1" };
    const result = migrateConfig({ version: 1, services: {}, backend });
    expect(result.backend).toEqual(backend);
  });

  it("preserves an existing partial notificationSettings shape", () => {
    const notif = { enabled: true } as any;
    const result = migrateConfig({ version: 1, services: {}, notificationSettings: notif });
    expect(result.notificationSettings).toEqual(notif);
  });
});

describe("v2 → v3 (per-service WOL → global)", () => {
  it("hoists wakeOnLan from a single service to top level", () => {
    const result: any = migrateConfig({
      version: 2,
      services: {
        radarr: { enabled: true, wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" } },
      },
    });
    // After v3 the value lives on the payload until v3→v4 wraps it. We can
    // only observe the final v7 shape, where wolDevices carries it.
    expect(result.wolDevices).toEqual([
      expect.objectContaining({ mac: "aa:bb:cc:dd:ee:ff" }),
    ]);
  });

  it("strips wakeOnLan from each service after hoisting", () => {
    const result: any = migrateConfig({
      version: 2,
      services: {
        radarr: { enabled: true, wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" } },
      },
    });
    expect(result.services.radarr[0].wakeOnLan).toBeUndefined();
    expect(result.services.radarr[0].enabled).toBe(true);
  });

  it("picks the FIRST encountered wakeOnLan when multiple services have one", () => {
    const result: any = migrateConfig({
      version: 2,
      services: {
        radarr: { wakeOnLan: { mac: "11:11:11:11:11:11" } },
        sonarr: { wakeOnLan: { mac: "22:22:22:22:22:22" } },
      },
    });
    expect(result.wolDevices).toHaveLength(1);
    expect(result.wolDevices[0].mac).toBe("11:11:11:11:11:11");
  });

  it("ignores services whose wakeOnLan has no mac", () => {
    const result: any = migrateConfig({
      version: 2,
      services: {
        radarr: { wakeOnLan: { broadcastAddress: "192.168.1.255" } },
        sonarr: { wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" } },
      },
    });
    expect(result.wolDevices).toHaveLength(1);
    expect(result.wolDevices[0].mac).toBe("aa:bb:cc:dd:ee:ff");
  });

  it("results in empty wolDevices when no service had a mac", () => {
    const result: any = migrateConfig({
      version: 2,
      services: { radarr: { enabled: true } },
    });
    expect(result.wolDevices).toEqual([]);
  });

  it("preserves broadcastAddress and port on the hoisted entry", () => {
    const result: any = migrateConfig({
      version: 2,
      services: {
        radarr: {
          wakeOnLan: {
            mac: "aa:bb:cc:dd:ee:ff",
            broadcastAddress: "192.168.1.255",
            port: 7,
          },
        },
      },
    });
    expect(result.wolDevices[0]).toEqual(
      expect.objectContaining({
        mac: "aa:bb:cc:dd:ee:ff",
        broadcastAddress: "192.168.1.255",
        port: 7,
      }),
    );
  });

  it("does not throw when services is undefined", () => {
    expect(() => migrateConfig({ version: 2 })).not.toThrow();
  });
});

describe("v3 → v4 (single → array of WOL devices)", () => {
  it("converts a single wakeOnLan with mac into a one-element wolDevices array", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" },
    });
    expect(result.wolDevices).toHaveLength(1);
  });

  it("assigns id 'migrated-1' and name 'Server' to the migrated entry", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" },
    });
    expect(result.wolDevices[0].id).toBe("migrated-1");
    expect(result.wolDevices[0].name).toBe("Server");
  });

  it("produces an empty wolDevices array when wakeOnLan is null", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: null,
    });
    expect(result.wolDevices).toEqual([]);
  });

  it("produces an empty wolDevices array when wakeOnLan exists but mac is missing", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: { broadcastAddress: "192.168.1.255" },
    });
    expect(result.wolDevices).toEqual([]);
  });

  it("removes the legacy top-level wakeOnLan key from output", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" },
    });
    expect(result.wakeOnLan).toBeUndefined();
  });

  it("preserves broadcastAddress and port on the new device entry", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: {
        mac: "aa:bb:cc:dd:ee:ff",
        broadcastAddress: "192.168.1.255",
        port: 7,
      },
    });
    expect(result.wolDevices[0].broadcastAddress).toBe("192.168.1.255");
    expect(result.wolDevices[0].port).toBe(7);
  });

  it("preserves an undefined port (not coerced to a number)", () => {
    const result: any = migrateConfig({
      version: 3,
      services: {},
      wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" },
    });
    expect(result.wolDevices[0].port).toBeUndefined();
  });
});

// After v14 the migration chain folds dashboardWidgets/widgetSettings into a
// per-slot dashboards array. These helpers extract the widget-id list from the
// auto-built Default dashboard so existing assertions stay readable.
const widgetIdsOf = (result: any) =>
  result.dashboards[0].widgets.map((w: any) => w.widgetId);

describe("v4 → v5 (dashboardOrder → dashboardWidgets, observed via v14)", () => {
  it("renames a non-empty dashboardOrder and folds it onto the Default dashboard", () => {
    const result: any = migrateConfig({
      version: 4,
      services: {},
      dashboardOrder: ["service-health", "downloads"],
    });
    expect(widgetIdsOf(result)).toEqual(["service-health", "downloads"]);
    expect(result.dashboardOrder).toBeUndefined();
    expect(result.dashboardWidgets).toBeUndefined();
  });

  it("falls back to DEFAULT_DASHBOARD_WIDGETS when dashboardOrder is missing", () => {
    const result: any = migrateConfig({ version: 4, services: {} });
    expect(widgetIdsOf(result)).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });

  it("falls back to DEFAULT_DASHBOARD_WIDGETS when dashboardOrder is empty", () => {
    const result: any = migrateConfig({
      version: 4,
      services: {},
      dashboardOrder: [],
    });
    expect(widgetIdsOf(result)).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });

  it("falls back to DEFAULT_DASHBOARD_WIDGETS when dashboardOrder is not an array", () => {
    const result: any = migrateConfig({
      version: 4,
      services: {},
      dashboardOrder: "service-health" as any,
    });
    expect(widgetIdsOf(result)).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });
});

describe("v5 → v6 (homeBSSID) — observed through to v11", () => {
  // The v5→v6 step itself adds homeBSSID. v10→v11 then folds homeSSID +
  // homeBSSID into the homeNetworks array. Since migrateConfig runs the whole
  // chain, the only observable shape today is the post-v11 form.

  it("produces an empty homeNetworks array when no homeSSID was set", () => {
    const result: any = migrateConfig({
      version: 5,
      services: {},
      dashboardWidgets: [],
    });
    expect(result.homeNetworks).toEqual([]);
    expect(result.homeBSSID).toBeUndefined();
  });

  it("folds homeSSID + homeBSSID into a single homeNetworks entry", () => {
    const result: any = migrateConfig({
      version: 5,
      services: {},
      dashboardWidgets: [],
      homeSSID: "MyWifi",
      homeBSSID: "aa:bb:cc:dd:ee:ff",
    });
    expect(result.homeNetworks).toEqual([
      { id: "migrated-1", ssid: "MyWifi", bssid: "aa:bb:cc:dd:ee:ff" },
    ]);
  });

  it("treats a non-string homeBSSID as empty when folding", () => {
    const result: any = migrateConfig({
      version: 5,
      services: {},
      dashboardWidgets: [],
      homeSSID: "MyWifi",
      homeBSSID: 0 as any,
    });
    expect(result.homeNetworks).toEqual([
      { id: "migrated-1", ssid: "MyWifi", bssid: "" },
    ]);
  });
});

describe("v10 → v11 (homeSSID/homeBSSID → homeNetworks)", () => {
  const baseV10 = () => ({
    version: 10,
    services: {},
    secrets: {},
    autoSwitchNetwork: false,
    dashboardWidgets: [],
    widgetSettings: {},
    globalCustomHeaders: {},
  });

  it("produces an empty homeNetworks array when homeSSID is empty", () => {
    const result: any = migrateConfig({ ...baseV10(), homeSSID: "", homeBSSID: "" });
    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
    expect(result.homeNetworks).toEqual([]);
  });

  it("produces a one-entry array when only homeSSID is set", () => {
    const result: any = migrateConfig({ ...baseV10(), homeSSID: "MyWifi" });
    expect(result.homeNetworks).toEqual([
      { id: "migrated-1", ssid: "MyWifi", bssid: "" },
    ]);
  });

  it("populates bssid when both homeSSID and homeBSSID are set", () => {
    const result: any = migrateConfig({
      ...baseV10(),
      homeSSID: "MyWifi",
      homeBSSID: "aa:bb:cc:dd:ee:ff",
    });
    expect(result.homeNetworks).toEqual([
      { id: "migrated-1", ssid: "MyWifi", bssid: "aa:bb:cc:dd:ee:ff" },
    ]);
  });

  it("treats a non-string homeSSID as empty (no entry created)", () => {
    const result: any = migrateConfig({ ...baseV10(), homeSSID: 0 as any });
    expect(result.homeNetworks).toEqual([]);
  });

  it("removes the legacy fields from the output payload", () => {
    const result: any = migrateConfig({
      ...baseV10(),
      homeSSID: "MyWifi",
      homeBSSID: "aa:bb:cc:dd:ee:ff",
    });
    expect(result.homeSSID).toBeUndefined();
    expect(result.homeBSSID).toBeUndefined();
  });
});

describe("v11 → v12 (uiScale)", () => {
  const baseV11 = () => ({
    version: 11,
    services: {},
    secrets: {},
    autoSwitchNetwork: false,
    homeNetworks: [],
    dashboardWidgets: [],
    widgetSettings: {},
    globalCustomHeaders: {},
  });

  it("adds uiScale=1 when missing", () => {
    const result: any = migrateConfig(baseV11());
    expect(result.uiScale).toBe(1);
  });

  it("preserves a whitelisted uiScale", () => {
    const result: any = migrateConfig({ ...baseV11(), uiScale: 1.3 });
    expect(result.uiScale).toBe(1.3);
  });

  it("replaces an out-of-whitelist uiScale with the default", () => {
    const result: any = migrateConfig({ ...baseV11(), uiScale: 2.5 });
    expect(result.uiScale).toBe(1);
  });

  it("replaces a non-numeric uiScale with the default", () => {
    const result: any = migrateConfig({ ...baseV11(), uiScale: "big" as any });
    expect(result.uiScale).toBe(1);
  });
});

describe("v6 → v7 (widget rename + settings, observed via v14)", () => {
  it("renames sonarr-calendar to calendar inside the Default dashboard", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["sonarr-calendar", "downloads"],
    });
    expect(widgetIdsOf(result)).toEqual(["calendar", "downloads"]);
  });

  it("dedupes when both sonarr-calendar AND calendar are present", () => {
    // The v6→v7 step renames+dedupes; v14 then folds the remaining ids into
    // slots. Both calendar references collapse into one slot.
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["sonarr-calendar", "downloads", "calendar"],
    });
    expect(widgetIdsOf(result)).toEqual(["calendar", "downloads"]);
  });

  it("preserves order when only sonarr-calendar is present", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["downloads", "sonarr-calendar", "service-health"],
    });
    expect(widgetIdsOf(result)).toEqual([
      "downloads",
      "calendar",
      "service-health",
    ]);
  });

  it("drops non-string entries silently", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["downloads", 42, null, "calendar"] as any,
    });
    expect(widgetIdsOf(result)).toEqual(["downloads", "calendar"]);
  });

  it("falls back to empty Default dashboard when dashboardWidgets is not an array", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: "service-health" as any,
    });
    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].widgets).toEqual([]);
  });

  it("v14 fold: every Default-dashboard slot has no settings unless v7 had them", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["calendar"],
    });
    // v6→v7 set widgetSettings={}, then v13→v14 ran with no settings to copy,
    // so the resulting slot has settings undefined.
    expect(result.dashboards[0].widgets).toEqual([
      { id: expect.any(String), widgetId: "calendar" },
    ]);
    expect(result.widgetSettings).toBeUndefined();
  });
});

describe("v7 → v8 (hapticsEnabled)", () => {
  it("adds hapticsEnabled=true when missing", () => {
    const result: any = migrateConfig({
      version: 7,
      services: {},
      dashboardWidgets: [],
      widgetSettings: {},
    });
    expect(result.hapticsEnabled).toBe(true);
  });

  it("preserves hapticsEnabled=false when explicitly set", () => {
    const result: any = migrateConfig({
      version: 7,
      services: {},
      dashboardWidgets: [],
      widgetSettings: {},
      hapticsEnabled: false,
    });
    expect(result.hapticsEnabled).toBe(false);
  });

  it("replaces a non-boolean hapticsEnabled with the default true", () => {
    const result: any = migrateConfig({
      version: 7,
      services: {},
      dashboardWidgets: [],
      widgetSettings: {},
      hapticsEnabled: "yes" as any,
    });
    expect(result.hapticsEnabled).toBe(true);
  });
});

describe("v8 → v9 (jellyfin stamp)", () => {
  it("just stamps the version without touching unrelated fields", () => {
    const result: any = migrateConfig({
      version: 8,
      services: { radarr: { enabled: true } },
      dashboardWidgets: ["calendar"],
      hapticsEnabled: false,
    });
    // v12 → v13 wraps the singleton; .enabled now lives on the first element.
    expect(result.services.radarr[0].enabled).toBe(true);
    expect(result.hapticsEnabled).toBe(false);
  });
});

describe("v9 → v10 (custom headers)", () => {
  it("adds globalCustomHeaders={} when not present", () => {
    const result: any = migrateConfig({
      version: 9,
      services: {},
      dashboardWidgets: [],
      widgetSettings: {},
    });
    expect(result.globalCustomHeaders).toEqual({});
  });

  it("preserves an existing globalCustomHeaders map", () => {
    const result: any = migrateConfig({
      version: 9,
      services: {},
      dashboardWidgets: [],
      widgetSettings: {},
      globalCustomHeaders: { "CF-Access-Client-Id": "xyz" },
    });
    expect(result.globalCustomHeaders).toEqual({ "CF-Access-Client-Id": "xyz" });
  });

  it("replaces a non-object globalCustomHeaders with {}", () => {
    const result: any = migrateConfig({
      version: 9,
      services: {},
      dashboardWidgets: [],
      widgetSettings: {},
      globalCustomHeaders: "not-an-object" as any,
    });
    expect(result.globalCustomHeaders).toEqual({});
  });

  it("preserves per-service customHeaders inside secrets through the stamp", () => {
    const result: any = migrateConfig({
      version: 9,
      services: {},
      secrets: {
        radarr: { apiKey: "k", customHeaders: { Authorization: "Bearer x" } },
      },
      dashboardWidgets: [],
      widgetSettings: {},
    });
    // v12 → v13 re-keys secrets from `secrets[serviceId]` to `secrets[uuid]`,
    // using the UUID assigned to the migrated instance for that kind. Since
    // there's no radarr instance in `services` here, the orphaned secret is
    // dropped — this matches the migration contract: secrets follow instances.
    // We only need to verify that customHeaders aren't mangled when they DO
    // travel along with an instance.
    const withInstance: any = migrateConfig({
      version: 9,
      services: {
        radarr: {
          enabled: true,
          name: "Radarr",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
        },
      },
      secrets: {
        radarr: { apiKey: "k", customHeaders: { Authorization: "Bearer x" } },
      },
      dashboardWidgets: [],
      widgetSettings: {},
    });
    const radarrUuid = withInstance.services.radarr[0].id;
    expect(withInstance.secrets[radarrUuid].customHeaders).toEqual({
      Authorization: "Bearer x",
    });
  });
});

describe("v12 → v13 (multi-instance)", () => {
  const baseV12 = () => ({
    version: 12,
    services: {},
    secrets: {},
    autoSwitchNetwork: false,
    homeNetworks: [],
    dashboardWidgets: [],
    widgetSettings: {},
    globalCustomHeaders: {},
    uiScale: 1,
  });

  it("wraps each kind's singleton into a one-element ServiceInstance array", () => {
    const result: any = migrateConfig({
      ...baseV12(),
      services: {
        qbittorrent: {
          enabled: true,
          name: "qBit",
          localUrl: "http://qb",
          remoteUrl: "",
          useRemote: false,
        },
        radarr: {
          enabled: false,
          name: "Radarr",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
        },
      },
    });
    expect(Array.isArray(result.services.qbittorrent)).toBe(true);
    expect(result.services.qbittorrent).toHaveLength(1);
    expect(result.services.qbittorrent[0].name).toBe("qBit");
    expect(result.services.radarr).toHaveLength(1);
    expect(result.services.radarr[0].enabled).toBe(false);
  });

  it("assigns a non-empty UUID to every wrapped instance", () => {
    const result: any = migrateConfig({
      ...baseV12(),
      services: {
        sonarr: {
          enabled: true,
          name: "Sonarr",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
        },
      },
    });
    const id = result.services.sonarr[0].id;
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(8);
  });

  it("re-keys per-service secrets to the new instance UUID", () => {
    const result: any = migrateConfig({
      ...baseV12(),
      services: {
        radarr: {
          enabled: true,
          name: "Radarr",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
        },
      },
      secrets: {
        radarr: { apiKey: "abc-123" },
      },
    });
    const uuid = result.services.radarr[0].id;
    // Old `secrets.radarr` slot is gone; the value lives under the UUID now.
    expect(result.secrets.radarr).toBeUndefined();
    expect(result.secrets[uuid]).toEqual({ apiKey: "abc-123" });
  });

  it("initializes activeInstance to the migrated UUID for every kind", () => {
    const result: any = migrateConfig({
      ...baseV12(),
      services: {
        qbittorrent: {
          enabled: true,
          name: "qBit",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
        },
        radarr: {
          enabled: false,
          name: "Radarr",
          localUrl: "",
          remoteUrl: "",
          useRemote: false,
        },
      },
    });
    expect(result.activeInstance.qbittorrent).toBe(
      result.services.qbittorrent[0].id,
    );
    expect(result.activeInstance.radarr).toBe(result.services.radarr[0].id);
  });

  it("drops orphaned secrets whose serviceId has no matching service entry", () => {
    const result: any = migrateConfig({
      ...baseV12(),
      services: {},
      secrets: { radarr: { apiKey: "stranded" } },
    });
    // No radarr in services → no UUID assigned → orphan secret is silently
    // dropped. This is the right call: a paired services+secrets export should
    // never have one without the other, and keeping the legacy slot would
    // poison the new UUID-keyed map.
    expect(result.secrets).toEqual({});
  });

  it("produces an empty activeInstance map when services is empty", () => {
    const result: any = migrateConfig({ ...baseV12(), services: {} });
    expect(result.activeInstance).toEqual({});
  });

  it("assigns distinct UUIDs across kinds (no collisions)", () => {
    const result: any = migrateConfig({
      ...baseV12(),
      services: {
        qbittorrent: { enabled: true, name: "q", localUrl: "", remoteUrl: "", useRemote: false },
        radarr: { enabled: true, name: "r", localUrl: "", remoteUrl: "", useRemote: false },
        sonarr: { enabled: true, name: "s", localUrl: "", remoteUrl: "", useRemote: false },
      },
    });
    const ids = [
      result.services.qbittorrent[0].id,
      result.services.radarr[0].id,
      result.services.sonarr[0].id,
    ];
    expect(new Set(ids).size).toBe(3);
  });
});

describe("v13 → v14 (multi-dashboard + per-slot settings)", () => {
  const baseV13 = () => ({
    version: 13,
    services: {},
    secrets: {},
    activeInstance: {},
    autoSwitchNetwork: false,
    homeNetworks: [],
    dashboardWidgets: [],
    widgetSettings: {},
    globalCustomHeaders: {},
    uiScale: 1,
  });

  it("folds dashboardWidgets into a single Default dashboard", () => {
    const result: any = migrateConfig({
      ...baseV13(),
      dashboardWidgets: ["service-health", "calendar"],
    });
    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].name).toBe("Default");
    expect(result.dashboards[0].widgets.map((w: any) => w.widgetId)).toEqual([
      "service-health",
      "calendar",
    ]);
    expect(result.activeDashboardId).toBe(result.dashboards[0].id);
  });

  it("copies per-WidgetId settings onto matching slots", () => {
    const result: any = migrateConfig({
      ...baseV13(),
      dashboardWidgets: ["calendar", "downloads"],
      widgetSettings: {
        calendar: { daysAhead: 14 },
        downloads: { maxItems: 10 },
      },
    });
    const calendarSlot = result.dashboards[0].widgets.find(
      (w: any) => w.widgetId === "calendar",
    );
    const downloadsSlot = result.dashboards[0].widgets.find(
      (w: any) => w.widgetId === "downloads",
    );
    expect(calendarSlot.settings).toEqual({ daysAhead: 14 });
    expect(downloadsSlot.settings).toEqual({ maxItems: 10 });
  });

  it("omits settings on slots whose widget had no legacy settings entry", () => {
    const result: any = migrateConfig({
      ...baseV13(),
      dashboardWidgets: ["calendar", "downloads"],
      widgetSettings: { calendar: { daysAhead: 14 } },
    });
    const downloadsSlot = result.dashboards[0].widgets.find(
      (w: any) => w.widgetId === "downloads",
    );
    expect(downloadsSlot.settings).toBeUndefined();
  });

  it("omits settings when the legacy entry is an empty object", () => {
    const result: any = migrateConfig({
      ...baseV13(),
      dashboardWidgets: ["calendar"],
      widgetSettings: { calendar: {} },
    });
    expect(result.dashboards[0].widgets[0].settings).toBeUndefined();
  });

  it("drops the legacy dashboardWidgets and widgetSettings keys", () => {
    const result: any = migrateConfig({
      ...baseV13(),
      dashboardWidgets: ["calendar"],
      widgetSettings: { calendar: { daysAhead: 14 } },
    });
    expect(result.dashboardWidgets).toBeUndefined();
    expect(result.widgetSettings).toBeUndefined();
  });

  it("produces an empty Default dashboard when dashboardWidgets is missing", () => {
    const result: any = migrateConfig({ ...baseV13(), dashboardWidgets: undefined });
    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].widgets).toEqual([]);
  });

  it("assigns distinct UUIDs to dashboard and each slot", () => {
    const result: any = migrateConfig({
      ...baseV13(),
      dashboardWidgets: ["calendar", "downloads", "service-health"],
    });
    const dashboardId = result.dashboards[0].id;
    const slotIds = result.dashboards[0].widgets.map((w: any) => w.id);
    expect(typeof dashboardId).toBe("string");
    expect(dashboardId.length).toBeGreaterThan(8);
    expect(new Set([dashboardId, ...slotIds]).size).toBe(4);
  });
});

describe("v14 → v15 (multi-select widget instance binding)", () => {
  // A v14 payload with one slot per widget kind whose binding fields exercise
  // every legacy shape the migration has to handle.
  const v14WithBindings = (slotSettings: Record<string, unknown>) => ({
    version: 14,
    services: {},
    secrets: {},
    activeInstance: {},
    autoSwitchNetwork: false,
    homeNetworks: [],
    dashboards: [
      {
        id: "dash-1",
        name: "Default",
        widgets: [{ id: "slot-1", widgetId: "downloads", settings: slotSettings }],
      },
    ],
    activeDashboardId: "dash-1",
    globalCustomHeaders: {},
    uiScale: 1,
  });

  const slotSettingsAfter = (result: any) =>
    result.dashboards[0].widgets[0].settings as Record<string, unknown>;

  it("renames scalar instanceId to a single-element instanceIds array", () => {
    const result: any = migrateConfig(
      v14WithBindings({ instanceId: "uuid-abc", maxItems: 5 }),
    );
    expect(slotSettingsAfter(result)).toEqual({
      instanceIds: ["uuid-abc"],
      maxItems: 5,
    });
  });

  it("preserves the 'all' sentinel verbatim", () => {
    const result: any = migrateConfig(v14WithBindings({ instanceId: "all" }));
    expect(slotSettingsAfter(result)).toEqual({ instanceIds: "all" });
  });

  it("renames calendar's sonarrInstanceId and radarrInstanceId both", () => {
    const result: any = migrateConfig(v14WithBindings({
      sonarrInstanceId: "uuid-sonarr",
      radarrInstanceId: "all",
      daysAhead: 7,
    }));
    expect(slotSettingsAfter(result)).toEqual({
      sonarrInstanceIds: ["uuid-sonarr"],
      radarrInstanceIds: "all",
      daysAhead: 7,
    });
  });

  it("falls back to 'all' when the legacy value is malformed", () => {
    const result: any = migrateConfig(v14WithBindings({ instanceId: 42 }));
    expect(slotSettingsAfter(result)).toEqual({ instanceIds: "all" });
  });

  it("leaves slot settings without binding fields untouched", () => {
    const result: any = migrateConfig(v14WithBindings({ daysAhead: 30 }));
    expect(slotSettingsAfter(result)).toEqual({ daysAhead: 30 });
  });

  it("leaves slots with no settings untouched", () => {
    const payload: any = {
      version: 14,
      services: {},
      secrets: {},
      activeInstance: {},
      autoSwitchNetwork: false,
      homeNetworks: [],
      dashboards: [
        {
          id: "dash-1",
          name: "Default",
          widgets: [{ id: "slot-1", widgetId: "downloads" }],
        },
      ],
      activeDashboardId: "dash-1",
      globalCustomHeaders: {},
      uiScale: 1,
    };
    const result: any = migrateConfig(payload);
    expect(result.dashboards[0].widgets[0].settings).toBeUndefined();
  });

  it("drops the legacy key when the new key is already present", () => {
    const result: any = migrateConfig(
      v14WithBindings({ instanceId: "stale", instanceIds: ["winner"] }),
    );
    expect(slotSettingsAfter(result)).toEqual({ instanceIds: ["winner"] });
  });
});

describe("end-to-end multi-step", () => {
  it("upgrades a fully populated v0 fixture all the way to the current version in one pass", () => {
    const v0 = {
      // No version field — pre-versioning export.
      services: {
        radarr: {
          enabled: true,
          name: "Radarr",
          localUrl: "http://192.168.1.10:7878",
          remoteUrl: "",
          useRemote: false,
          wakeOnLan: {
            mac: "aa:bb:cc:dd:ee:ff",
            broadcastAddress: "192.168.1.255",
            port: 9,
          },
        },
        sonarr: {
          enabled: true,
          name: "Sonarr",
          localUrl: "http://192.168.1.10:8989",
          remoteUrl: "",
          useRemote: false,
        },
      },
      secrets: { radarr: { apiKey: "k1" } },
      dashboardOrder: ["sonarr-calendar", "downloads", "calendar"],
    };

    const result: any = migrateConfig(v0);

    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
    // v0→v1 generated exportedAt
    expect(typeof result.exportedAt).toBe("string");
    // v1→v2 added these
    expect(result.backend).toBeNull();
    expect(result.notificationSettings).toBeNull();
    // v2→v3 stripped wakeOnLan from radarr
    expect(result.services.radarr[0].wakeOnLan).toBeUndefined();
    expect(result.services.radarr[0].enabled).toBe(true);
    // v3→v4 produced the array entry
    expect(result.wolDevices).toHaveLength(1);
    expect(result.wolDevices[0]).toEqual({
      id: "migrated-1",
      name: "Server",
      mac: "aa:bb:cc:dd:ee:ff",
      broadcastAddress: "192.168.1.255",
      port: 9,
    });
    // v4→v5 renamed and v6→v7 deduped/remapped, then v13→v14 folded the list
    // into the Default dashboard's slots.
    expect(widgetIdsOf(result)).toEqual(["calendar", "downloads"]);
    // v10→v11 replaced homeSSID/homeBSSID with homeNetworks. v0 had no SSID
    // configured, so the array is empty and the legacy fields are gone.
    expect(result.homeNetworks).toEqual([]);
    expect(result.homeSSID).toBeUndefined();
    expect(result.homeBSSID).toBeUndefined();
    // v13→v14 dropped widgetSettings; per-slot settings live on the slot now.
    expect(result.widgetSettings).toBeUndefined();
    // v7→v8 defaulted hapticsEnabled
    expect(result.hapticsEnabled).toBe(true);
    // v12→v13 re-keyed `secrets.radarr.apiKey` under the migrated radarr UUID
    // and initialized activeInstance for every kind that has a service entry.
    const radarrUuid = result.services.radarr[0].id;
    expect(result.secrets[radarrUuid]).toEqual({ apiKey: "k1" });
    expect(result.secrets.radarr).toBeUndefined();
    expect(result.activeInstance.radarr).toBe(radarrUuid);
  });

  it("upgrades a v3 fixture (typical post-v3 build) to the current version without touching steps 0-2", () => {
    const v3 = {
      version: 3,
      exportedAt: "2025-06-01T00:00:00.000Z",
      services: {
        radarr: {
          enabled: true,
          name: "Radarr",
          localUrl: "http://192.168.1.10:7878",
          remoteUrl: "",
          useRemote: false,
        },
      },
      secrets: {},
      autoSwitchNetwork: false,
      homeSSID: "MyWifi",
      backend: null,
      notificationSettings: null,
      wakeOnLan: { mac: "aa:bb:cc:dd:ee:ff" },
      dashboardOrder: ["service-health"],
    };

    const result: any = migrateConfig(v3);

    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
    expect(result.exportedAt).toBe("2025-06-01T00:00:00.000Z");
    // v10→v11 folds the v3-vintage homeSSID into the new homeNetworks array.
    expect(result.homeNetworks).toEqual([
      { id: "migrated-1", ssid: "MyWifi", bssid: "" },
    ]);
    expect(result.homeSSID).toBeUndefined();
    expect(result.wolDevices).toHaveLength(1);
    expect(widgetIdsOf(result)).toEqual(["service-health"]);
  });

  it("preserves user-provided service and secret data through the whole chain", () => {
    const services = {
      qbittorrent: {
        enabled: true,
        name: "qBittorrent",
        localUrl: "http://192.168.1.10:8080",
        remoteUrl: "https://qb.example.com",
        useRemote: false,
      },
    };
    const secrets = {
      qbittorrent: { username: "admin", password: "hunter2" },
      radarr: { apiKey: "abc123" },
    };
    const result: any = migrateConfig({ services, secrets });
    // v12 → v13 wraps each kind in an array with a UUID.
    expect(result.services.qbittorrent).toHaveLength(1);
    expect(result.services.qbittorrent[0]).toMatchObject({
      enabled: true,
      name: "qBittorrent",
      localUrl: "http://192.168.1.10:8080",
      remoteUrl: "https://qb.example.com",
      useRemote: false,
    });
    // qbittorrent secrets follow the qbittorrent instance to its UUID slot.
    const qbUuid = result.services.qbittorrent[0].id;
    expect(result.secrets[qbUuid]).toEqual({
      username: "admin",
      password: "hunter2",
    });
    // The radarr secret is dropped because no radarr service entry exists.
    expect(result.secrets.radarr).toBeUndefined();
    expect(Object.keys(result.secrets)).toEqual([qbUuid]);
  });
});
