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
    const input = {
      version: CURRENT_CONFIG_VERSION,
      exportedAt: "2026-04-27T00:00:00.000Z",
      services: { radarr: { enabled: true } },
      secrets: {},
      autoSwitchNetwork: false,
      homeSSID: "",
      homeBSSID: "",
      dashboardWidgets: ["calendar"],
      widgetSettings: {},
      wolDevices: [],
    };
    const result = migrateConfig({ ...input });
    expect(result.version).toBe(CURRENT_CONFIG_VERSION);
    expect(result.services).toEqual(input.services);
    expect(result.dashboardWidgets).toEqual(["calendar"]);
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
    const result = migrateConfig({ services: {} });
    expect(result.services).toEqual({});
    expect(result.secrets).toEqual({});
    expect(result.autoSwitchNetwork).toBe(false);
    expect(result.homeSSID).toBe("");
  });

  it("preserves a populated services map verbatim through migration", () => {
    const services = {
      radarr: { enabled: true, name: "Radarr", localUrl: "http://radarr" },
    };
    const result = migrateConfig({ services });
    expect(result.services).toEqual(services);
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
    expect(result.services.radarr.wakeOnLan).toBeUndefined();
    expect(result.services.radarr.enabled).toBe(true);
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

describe("v4 → v5 (dashboardOrder → dashboardWidgets)", () => {
  it("renames a non-empty dashboardOrder to dashboardWidgets", () => {
    const result: any = migrateConfig({
      version: 4,
      services: {},
      dashboardOrder: ["service-health", "downloads"],
    });
    expect(result.dashboardWidgets).toEqual(["service-health", "downloads"]);
    expect(result.dashboardOrder).toBeUndefined();
  });

  it("falls back to DEFAULT_DASHBOARD_WIDGETS when dashboardOrder is missing", () => {
    const result: any = migrateConfig({ version: 4, services: {} });
    expect(result.dashboardWidgets).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });

  it("falls back to DEFAULT_DASHBOARD_WIDGETS when dashboardOrder is empty", () => {
    const result: any = migrateConfig({
      version: 4,
      services: {},
      dashboardOrder: [],
    });
    expect(result.dashboardWidgets).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });

  it("falls back to DEFAULT_DASHBOARD_WIDGETS when dashboardOrder is not an array", () => {
    const result: any = migrateConfig({
      version: 4,
      services: {},
      dashboardOrder: "service-health" as any,
    });
    expect(result.dashboardWidgets).toEqual(DEFAULT_DASHBOARD_WIDGETS);
  });
});

describe("v5 → v6 (homeBSSID)", () => {
  it("adds homeBSSID='' when not present", () => {
    const result: any = migrateConfig({
      version: 5,
      services: {},
      dashboardWidgets: [],
    });
    expect(result.homeBSSID).toBe("");
  });

  it("preserves a string homeBSSID", () => {
    const result: any = migrateConfig({
      version: 5,
      services: {},
      dashboardWidgets: [],
      homeBSSID: "aa:bb:cc:dd:ee:ff",
    });
    expect(result.homeBSSID).toBe("aa:bb:cc:dd:ee:ff");
  });

  it("replaces a non-string homeBSSID with ''", () => {
    const result: any = migrateConfig({
      version: 5,
      services: {},
      dashboardWidgets: [],
      homeBSSID: 0 as any,
    });
    expect(result.homeBSSID).toBe("");
  });
});

describe("v6 → v7 (widget rename + settings)", () => {
  it("renames sonarr-calendar to calendar", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["sonarr-calendar", "downloads"],
    });
    expect(result.dashboardWidgets).toEqual(["calendar", "downloads"]);
  });

  it("dedupes when both sonarr-calendar AND calendar are present", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["sonarr-calendar", "downloads", "calendar"],
    });
    // After remapping sonarr-calendar→calendar, both collapse into one entry,
    // preserving the FIRST occurrence position.
    expect(result.dashboardWidgets).toEqual(["calendar", "downloads"]);
    const calendarCount = result.dashboardWidgets.filter(
      (id: string) => id === "calendar",
    ).length;
    expect(calendarCount).toBe(1);
  });

  it("preserves order when only sonarr-calendar is present", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["downloads", "sonarr-calendar", "service-health"],
    });
    expect(result.dashboardWidgets).toEqual([
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
    expect(result.dashboardWidgets).toEqual(["downloads", "calendar"]);
  });

  it("falls back to empty array when dashboardWidgets is not an array", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: "service-health" as any,
    });
    expect(result.dashboardWidgets).toEqual([]);
  });

  it("adds widgetSettings={} on every v7 payload", () => {
    const result: any = migrateConfig({
      version: 6,
      services: {},
      dashboardWidgets: ["calendar"],
    });
    expect(result.widgetSettings).toEqual({});
  });
});

describe("end-to-end multi-step", () => {
  it("upgrades a fully populated v0 fixture all the way to v7 in one pass", () => {
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

    expect(result.version).toBe(7);
    // v0→v1 generated exportedAt
    expect(typeof result.exportedAt).toBe("string");
    // v1→v2 added these
    expect(result.backend).toBeNull();
    expect(result.notificationSettings).toBeNull();
    // v2→v3 stripped wakeOnLan from radarr
    expect(result.services.radarr.wakeOnLan).toBeUndefined();
    expect(result.services.radarr.enabled).toBe(true);
    // v3→v4 produced the array entry
    expect(result.wolDevices).toHaveLength(1);
    expect(result.wolDevices[0]).toEqual({
      id: "migrated-1",
      name: "Server",
      mac: "aa:bb:cc:dd:ee:ff",
      broadcastAddress: "192.168.1.255",
      port: 9,
    });
    // v4→v5 renamed and v6→v7 deduped/remapped
    expect(result.dashboardWidgets).toEqual(["calendar", "downloads"]);
    // v5→v6 added homeBSSID
    expect(result.homeBSSID).toBe("");
    // v6→v7 added widgetSettings
    expect(result.widgetSettings).toEqual({});
    // user data preserved
    expect(result.secrets).toEqual({ radarr: { apiKey: "k1" } });
  });

  it("upgrades a v3 fixture (typical post-v3 build) to v7 without touching steps 0-2", () => {
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

    expect(result.version).toBe(7);
    expect(result.exportedAt).toBe("2025-06-01T00:00:00.000Z");
    expect(result.homeSSID).toBe("MyWifi");
    expect(result.wolDevices).toHaveLength(1);
    expect(result.dashboardWidgets).toEqual(["service-health"]);
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
    expect(result.services).toEqual(services);
    expect(result.secrets).toEqual(secrets);
  });
});
