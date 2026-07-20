import { validateExportPayload } from "./config-schema";

const TEST_INSTANCE_ID = "11111111-1111-1111-1111-111111111111";
const TEST_DASHBOARD_ID = "22222222-2222-2222-2222-222222222222";

const baseValid = () => ({
  version: 14,
  exportedAt: "2026-04-27T00:00:00.000Z",
  services: {},
  secrets: {},
  // v22: top-level `activeInstance` is gone; per-workspace pins live on each
  // dashboard. Tests that need to assert resolution should set
  // `dashboards[0].activeInstance` directly.
  autoSwitchNetwork: false,
  homeNetworks: [],
  // v14: dashboards is required and must be non-empty. Every test below builds
  // on top of this minimal one-dashboard, zero-widget shape unless it overrides.
  dashboards: [
    { id: TEST_DASHBOARD_ID, name: "Default", widgets: [] },
  ],
  activeDashboardId: TEST_DASHBOARD_ID,
});

// v13: every service entry is a ServiceInstance carrying a UUID id. Tests that
// configure a single radarr instance use this helper, then wrap the result in
// an array to match the new Record<ServiceId, ServiceInstance[]> shape.
const validInstance = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_INSTANCE_ID,
  enabled: true,
  name: "Radarr",
  localUrl: "http://192.168.1.10:7878",
  remoteUrl: "https://radarr.example.com",
  useRemote: false,
  ...overrides,
});

describe("validateExportPayload — root shape", () => {
  it("throws when raw is not a plain object", () => {
    expect(() => validateExportPayload(null)).toThrow(/root/i);
    expect(() => validateExportPayload([])).toThrow(/root/i);
    expect(() => validateExportPayload(42 as any)).toThrow(/root/i);
  });

  it("throws when version is missing", () => {
    const { version, ...rest } = baseValid();
    expect(() => validateExportPayload(rest)).toThrow(/version/i);
  });

  it("throws when version is non-integer", () => {
    expect(() => validateExportPayload({ ...baseValid(), version: 1.5 })).toThrow(/version/i);
  });

  it("throws when version is negative", () => {
    expect(() => validateExportPayload({ ...baseValid(), version: -1 })).toThrow(/version/i);
  });

  it("throws when exportedAt is missing", () => {
    const { exportedAt, ...rest } = baseValid();
    expect(() => validateExportPayload(rest)).toThrow(/exportedAt/i);
  });

  it("throws when exportedAt is longer than 64 chars", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), exportedAt: "x".repeat(65) }),
    ).toThrow(/exportedAt/i);
  });

  it("throws when services is not a plain object", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), services: [] as any }),
    ).toThrow(/services/i);
  });

  it("throws when secrets is not a plain object", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), secrets: null as any }),
    ).toThrow(/secrets/i);
  });

  it("throws when autoSwitchNetwork is not boolean", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), autoSwitchNetwork: "yes" as any }),
    ).toThrow(/autoSwitchNetwork/i);
  });

  it("throws when homeNetworks is not an array", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), homeNetworks: "nope" as any }),
    ).toThrow(/homeNetworks/i);
  });

  it("throws when dashboards is not an array", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), dashboards: "Default" as any }),
    ).toThrow(/dashboards/i);
  });

  it("throws when dashboards is empty", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), dashboards: [] }),
    ).toThrow(/dashboards/i);
  });

  it("accepts a minimally valid payload", () => {
    const result = validateExportPayload(baseValid());
    expect(result.version).toBe(14);
    expect(result.dashboards).toHaveLength(1);
    expect(result.activeDashboardId).toBe(TEST_DASHBOARD_ID);
  });
});

describe("validateExportPayload — service instance coercion", () => {
  it("rejects when a service kind's value is not an array (v12 singleton shape)", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: validInstance() } as any,
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects an instance whose id is missing", () => {
    const { id, ...inst } = validInstance();
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [inst] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects an instance whose enabled is not a boolean", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [validInstance({ enabled: "true" })] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects an instance whose name exceeds 200 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [validInstance({ name: "x".repeat(201) })] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects ftp:// in localUrl", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [validInstance({ localUrl: "ftp://x" })] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects javascript:alert(1) in remoteUrl", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [validInstance({ remoteUrl: "javascript:alert(1)" })] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects file:// URLs", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [validInstance({ localUrl: "file:///etc/passwd" })] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects useRemote as a string", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: [validInstance({ useRemote: "true" })] },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects duplicate instance ids across the same kind", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: {
          radarr: [
            validInstance(),
            validInstance({ name: "Second" }),
          ],
        },
      }),
    ).toThrow(/duplicate instance id/);
  });

  it("rejects duplicate instance ids across different kinds", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: {
          radarr: [validInstance()],
          sonarr: [validInstance({ name: "Sonarr" })],
        },
      }),
    ).toThrow(/duplicate instance id/);
  });

  it("accepts empty-string URLs (user hasn't configured them yet)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: [validInstance({ localUrl: "", remoteUrl: "" })],
      },
    });
    expect(result.services.radarr[0].localUrl).toBe("");
    expect(result.services.radarr[0].remoteUrl).toBe("");
  });

  it("accepts both http:// and https:// schemes", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: [validInstance({ localUrl: "http://x", remoteUrl: "https://x" })],
      },
    });
    expect(result.services.radarr[0].localUrl).toBe("http://x");
    expect(result.services.radarr[0].remoteUrl).toBe("https://x");
  });

  it("accepts multiple instances of the same kind with distinct ids", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: [
          validInstance({ id: "uuid-a", name: "Radarr 4K" }),
          validInstance({ id: "uuid-b", name: "Radarr 1080p" }),
        ],
      },
    });
    expect(result.services.radarr).toHaveLength(2);
    expect(result.services.radarr[0].name).toBe("Radarr 4K");
    expect(result.services.radarr[1].name).toBe("Radarr 1080p");
  });

  it("round-trips ignoreCertErrors=true (v23)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: { radarr: [validInstance({ ignoreCertErrors: true })] },
    });
    expect(result.services.radarr[0].ignoreCertErrors).toBe(true);
  });

  it("defaults ignoreCertErrors to false when absent or non-boolean", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: [validInstance()],
        sonarr: [validInstance({ id: "uuid-s", ignoreCertErrors: "yes" })],
      },
    });
    expect(result.services.radarr[0].ignoreCertErrors).toBe(false);
    expect(result.services.sonarr[0].ignoreCertErrors).toBe(false);
  });

  it("round-trips arr add-flow defaults (v36)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        lidarr: [
          validInstance({
            defaultQualityProfileId: 4,
            defaultRootFolderPath: "/movies",
            defaultMetadataProfileId: 1,
          }),
        ],
      },
    });
    expect(result.services.lidarr[0].defaultQualityProfileId).toBe(4);
    expect(result.services.lidarr[0].defaultRootFolderPath).toBe("/movies");
    expect(result.services.lidarr[0].defaultMetadataProfileId).toBe(1);
  });

  it("drops invalid arr defaults without rejecting the instance", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: [
          validInstance({
            defaultQualityProfileId: "4",
            defaultRootFolderPath: 42,
            defaultMetadataProfileId: -1,
          }),
        ],
      },
    });
    // The instance survives; only the garbage default fields are stripped.
    expect(result.services.radarr).toHaveLength(1);
    expect(result.services.radarr[0].defaultQualityProfileId).toBeUndefined();
    expect(result.services.radarr[0].defaultRootFolderPath).toBeUndefined();
    expect(result.services.radarr[0].defaultMetadataProfileId).toBeUndefined();
  });
});

describe("validateExportPayload — service IDs (forward-compat silent drop)", () => {
  it("drops services with unknown IDs without throwing", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: { unknownFutureService: [validInstance()] } as any,
    });
    expect(result.services).toEqual({});
  });

  it("preserves services with known IDs when other unknown ones are present", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: [validInstance()],
        unknownFutureService: [validInstance({ id: "other-uuid" })],
      } as any,
    });
    expect(result.services.radarr).toBeDefined();
    expect((result.services as any).unknownFutureService).toBeUndefined();
  });
});

describe("validateExportPayload — service secrets", () => {
  // v13: secrets are keyed by instance UUID, not ServiceId. Tests pair an
  // instance UUID in `services` with the same UUID in `secrets`.
  const withInstance = (s: Record<string, unknown>) => ({
    ...baseValid(),
    services: { radarr: [validInstance()] },
    secrets: { [TEST_INSTANCE_ID]: s },
  });

  it("drops null/undefined apiKey, username, password", () => {
    const result = validateExportPayload(
      withInstance({ apiKey: null, username: undefined } as any),
    );
    expect(result.secrets[TEST_INSTANCE_ID]).toEqual({});
  });

  it("rejects an apiKey longer than 4096 chars", () => {
    expect(() =>
      validateExportPayload(withInstance({ apiKey: "x".repeat(4097) })),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("accepts an apiKey of exactly 4096 chars (boundary)", () => {
    const result = validateExportPayload(
      withInstance({ apiKey: "x".repeat(4096) }),
    );
    expect(result.secrets[TEST_INSTANCE_ID]?.apiKey).toHaveLength(4096);
  });

  it("rejects a non-string apiKey", () => {
    expect(() =>
      validateExportPayload(withInstance({ apiKey: 42 as any })),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("drops orphaned secrets whose UUID has no matching instance", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: { radarr: [validInstance()] },
      secrets: {
        [TEST_INSTANCE_ID]: { apiKey: "kept" },
        "orphan-uuid": { apiKey: "dropped" },
      },
    });
    expect(result.secrets[TEST_INSTANCE_ID]?.apiKey).toBe("kept");
    expect((result.secrets as any)["orphan-uuid"]).toBeUndefined();
  });
});

describe("validateExportPayload — dashboard.activeInstance (v22)", () => {
  it("omits dashboard.activeInstance when not provided", () => {
    const result = validateExportPayload(baseValid());
    expect(result.dashboards[0].activeInstance).toBeUndefined();
  });

  it("preserves a valid per-dashboard activeInstance map", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: { radarr: [validInstance()] },
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          activeInstance: { radarr: TEST_INSTANCE_ID },
        },
      ],
    });
    expect(result.dashboards[0].activeInstance).toEqual({
      radarr: TEST_INSTANCE_ID,
    });
  });

  it("keeps a stale UUID — the resolver falls back at read time, not validation", () => {
    // Cross-device imports may carry UUIDs the local install doesn't have yet;
    // dropping them during validation would lose data on re-export.
    const result = validateExportPayload({
      ...baseValid(),
      services: { radarr: [validInstance()] },
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          activeInstance: { radarr: "stale-uuid-from-another-device" },
        },
      ],
    });
    expect(result.dashboards[0].activeInstance).toEqual({
      radarr: "stale-uuid-from-another-device",
    });
  });

  it("drops unknown service ids and non-string entries", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          activeInstance: {
            radarr: TEST_INSTANCE_ID,
            bogus: "id",
            sonarr: 42,
          },
        },
      ],
    });
    expect(result.dashboards[0].activeInstance).toEqual({
      radarr: TEST_INSTANCE_ID,
    });
  });

  it("rejects a dashboard with a non-object activeInstance", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Default",
            widgets: [],
            activeInstance: ["radarr"] as any,
          },
        ],
      }),
    ).toThrow(/dashboards entry is invalid/);
  });
});

describe("validateExportPayload — dashboard.homeNetworkIds (v29)", () => {
  it("omits dashboard.homeNetworkIds when not provided (uses all networks)", () => {
    const result = validateExportPayload(baseValid());
    expect(result.dashboards[0].homeNetworkIds).toBeUndefined();
  });

  it("preserves a valid per-dashboard homeNetworkIds selection", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Cabin",
          widgets: [],
          homeNetworkIds: ["net-cabin", "net-home"],
        },
      ],
    });
    expect(result.dashboards[0].homeNetworkIds).toEqual([
      "net-cabin",
      "net-home",
    ]);
  });

  it("preserves an explicit empty selection (no home network → always remote)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        { id: TEST_DASHBOARD_ID, name: "Cabin", widgets: [], homeNetworkIds: [] },
      ],
    });
    expect(result.dashboards[0].homeNetworkIds).toEqual([]);
  });

  it("dedupes and drops empty/non-string ids (import-tolerant)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Cabin",
          widgets: [],
          homeNetworkIds: ["net-a", "net-a", "", 42, "net-b"] as any,
        },
      ],
    });
    expect(result.dashboards[0].homeNetworkIds).toEqual(["net-a", "net-b"]);
  });

  it("keeps a stale id — the resolver ignores it at read time", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Cabin",
          widgets: [],
          homeNetworkIds: ["id-from-another-device"],
        },
      ],
    });
    expect(result.dashboards[0].homeNetworkIds).toEqual([
      "id-from-another-device",
    ]);
  });

  it("truncates to MAX_HOME_NETWORKS (20)", () => {
    const many = Array.from({ length: 25 }, (_, i) => `net-${i}`);
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Cabin",
          widgets: [],
          homeNetworkIds: many,
        },
      ],
    });
    expect(result.dashboards[0].homeNetworkIds).toHaveLength(20);
  });

  it("rejects a dashboard with a non-array homeNetworkIds", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Cabin",
            widgets: [],
            homeNetworkIds: "nope" as any,
          },
        ],
      }),
    ).toThrow(/dashboards entry is invalid/);
  });
});

describe("validateExportPayload — dashboard.tabIcons (v37)", () => {
  it("omits dashboard.tabIcons when not provided (default tab icons)", () => {
    const result = validateExportPayload(baseValid());
    expect(result.dashboards[0].tabIcons).toBeUndefined();
  });

  it("preserves a valid per-dashboard tabIcons map", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          tabIcons: { movies: "Clapperboard", requests: "Bell" },
        },
      ],
    });
    expect(result.dashboards[0].tabIcons).toEqual({
      movies: "Clapperboard",
      requests: "Bell",
    });
  });

  it("drops unknown tab keys and malformed values, keeping valid entries", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          tabIcons: {
            movies: "Clapperboard",
            notATab: "Film",
            tv: 42,
            requests: "",
            downloads: "x".repeat(65),
          } as any,
        },
      ],
    });
    expect(result.dashboards[0].tabIcons).toEqual({ movies: "Clapperboard" });
  });

  it("omits tabIcons entirely when every entry is dropped", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          tabIcons: { notATab: "Film" } as any,
        },
      ],
    });
    expect(result.dashboards[0].tabIcons).toBeUndefined();
  });

  it("keeps unknown icon names for known tabs (render-time fallback)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          tabIcons: { movies: "NotARealIcon" },
        },
      ],
    });
    expect(result.dashboards[0].tabIcons).toEqual({ movies: "NotARealIcon" });
  });

  it("rejects a dashboard with a non-object tabIcons", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Default",
            widgets: [],
            tabIcons: "nope" as any,
          },
        ],
      }),
    ).toThrow(/dashboards entry is invalid/);
  });
});

describe("validateExportPayload — WOL devices", () => {
  const baseWol = () => ({ id: "d1", name: "Server", mac: "aa:bb:cc:dd:ee:ff" });

  it("rejects a device with empty id", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        wolDevices: [{ ...baseWol(), id: "" }],
      }),
    ).toThrow(/wolDevices/);
  });

  it("rejects a device with id longer than 128 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        wolDevices: [{ ...baseWol(), id: "x".repeat(129) }],
      }),
    ).toThrow(/wolDevices/);
  });

  it("rejects a device with port 0", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        wolDevices: [{ ...baseWol(), port: 0 }],
      }),
    ).toThrow(/wolDevices/);
  });

  it("rejects a device with port 65536", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        wolDevices: [{ ...baseWol(), port: 65536 }],
      }),
    ).toThrow(/wolDevices/);
  });

  it("rejects a device with non-integer port (9.5)", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        wolDevices: [{ ...baseWol(), port: 9.5 }],
      }),
    ).toThrow(/wolDevices/);
  });

  it("accepts ports 1 and 65535 (boundaries)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      wolDevices: [
        { ...baseWol(), id: "a", port: 1 },
        { ...baseWol(), id: "b", port: 65535 },
      ],
    });
    expect(result.wolDevices?.[0].port).toBe(1);
    expect(result.wolDevices?.[1].port).toBe(65535);
  });

  it("rejects a broadcastAddress longer than 45 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        wolDevices: [{ ...baseWol(), broadcastAddress: "x".repeat(46) }],
      }),
    ).toThrow(/wolDevices/);
  });

  it("preserves an entirely omitted port", () => {
    const result = validateExportPayload({
      ...baseValid(),
      wolDevices: [baseWol()],
    });
    expect(result.wolDevices?.[0].port).toBeUndefined();
  });

  it("rejects when wolDevices is not an array", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), wolDevices: "nope" as any }),
    ).toThrow(/wolDevices/);
  });
});

describe("validateExportPayload — homeNetworks", () => {
  const baseNetwork = () => ({ id: "n1", ssid: "MyHome", bssid: "" });

  it("accepts an empty array", () => {
    const result = validateExportPayload({ ...baseValid(), homeNetworks: [] });
    expect(result.homeNetworks).toEqual([]);
  });

  it("accepts a single SSID-only entry", () => {
    const result = validateExportPayload({
      ...baseValid(),
      homeNetworks: [baseNetwork()],
    });
    expect(result.homeNetworks).toEqual([{ id: "n1", ssid: "MyHome", bssid: "" }]);
  });

  it("accepts a mesh setup with multiple entries", () => {
    const result = validateExportPayload({
      ...baseValid(),
      homeNetworks: [
        { id: "n1", ssid: "MyHome", bssid: "aa:bb:cc:11:22:33" },
        { id: "n2", ssid: "MyHome-5G", bssid: "aa:bb:cc:11:22:34" },
        { id: "n3", ssid: "Garage-AP", bssid: "" },
      ],
    });
    expect(result.homeNetworks).toHaveLength(3);
  });

  it("rejects more than 20 entries", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `n${i}`,
      ssid: `Net${i}`,
      bssid: "",
    }));
    expect(() =>
      validateExportPayload({ ...baseValid(), homeNetworks: many }),
    ).toThrow(/homeNetworks/i);
  });

  it("accepts exactly 20 entries (boundary)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`,
      ssid: `Net${i}`,
      bssid: "",
    }));
    const result = validateExportPayload({ ...baseValid(), homeNetworks: many });
    expect(result.homeNetworks).toHaveLength(20);
  });

  it("rejects an entry with empty id", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ ...baseNetwork(), id: "" }],
      }),
    ).toThrow(/homeNetworks/i);
  });

  it("rejects an entry with id longer than 128 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ ...baseNetwork(), id: "x".repeat(129) }],
      }),
    ).toThrow(/homeNetworks/i);
  });

  it("rejects an entry with empty ssid", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ ...baseNetwork(), ssid: "" }],
      }),
    ).toThrow(/homeNetworks/i);
  });

  it("rejects an entry with ssid longer than 64 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ ...baseNetwork(), ssid: "x".repeat(65) }],
      }),
    ).toThrow(/homeNetworks/i);
  });

  it("accepts an entry with ssid of exactly 64 chars (boundary)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      homeNetworks: [{ ...baseNetwork(), ssid: "x".repeat(64) }],
    });
    expect(result.homeNetworks[0].ssid).toHaveLength(64);
  });

  it("rejects an entry with bssid longer than 64 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ ...baseNetwork(), bssid: "x".repeat(65) }],
      }),
    ).toThrow(/homeNetworks/i);
  });

  it("rejects an entry missing required fields", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ id: "n1", ssid: "MyHome" } as any],
      }),
    ).toThrow(/homeNetworks/i);
  });

  it("rejects when an entry's ssid is non-string", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        homeNetworks: [{ id: "n1", ssid: 42 as any, bssid: "" }],
      }),
    ).toThrow(/homeNetworks/i);
  });
});

describe("validateExportPayload — notification settings", () => {
  const fullSettings = {
    enabled: true,
    torrentCompleted: true,
    radarrDownloaded: false,
    sonarrDownloaded: false,
    serviceOffline: true,
    overseerrNewRequest: false,
  };

  it("rejects when any of the 6 boolean keys is missing", () => {
    const { enabled, ...rest } = fullSettings;
    expect(() =>
      validateExportPayload({ ...baseValid(), notificationSettings: rest as any }),
    ).toThrow(/notificationSettings/);
  });

  it("rejects when any holds a string instead of boolean", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        notificationSettings: { ...fullSettings, enabled: "yes" as any },
      }),
    ).toThrow(/notificationSettings/);
  });

  it("accepts the full 6-boolean object", () => {
    const result = validateExportPayload({
      ...baseValid(),
      notificationSettings: fullSettings,
    });
    expect(result.notificationSettings).toEqual(fullSettings);
  });

  it("accepts an optional sabnzbdCompleted alongside the 6 required keys", () => {
    const result = validateExportPayload({
      ...baseValid(),
      notificationSettings: { ...fullSettings, sabnzbdCompleted: true },
    });
    expect(result.notificationSettings).toEqual({
      ...fullSettings,
      sabnzbdCompleted: true,
    });
  });

  it("rejects sabnzbdCompleted with the wrong type", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        notificationSettings: { ...fullSettings, sabnzbdCompleted: "yes" as any },
      }),
    ).toThrow(/notificationSettings/);
  });

  it("round-trips perInstance overrides (v21)", () => {
    const perInstance = {
      "inst-radarr-1": { radarrDownloaded: false, serviceOffline: true },
      "inst-sonarr-2": { sonarrDownloaded: false },
    };
    const result = validateExportPayload({
      ...baseValid(),
      notificationSettings: { ...fullSettings, perInstance },
    });
    expect(result.notificationSettings?.perInstance).toEqual(perInstance);
  });

  it("drops unknown perInstance categories silently (forward-compat)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      notificationSettings: {
        ...fullSettings,
        perInstance: {
          "inst-1": { radarrDownloaded: false, futureCategory: true },
        },
      } as any,
    });
    expect(result.notificationSettings?.perInstance).toEqual({
      "inst-1": { radarrDownloaded: false },
    });
  });

  it("rejects perInstance with a non-boolean override value", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        notificationSettings: {
          ...fullSettings,
          perInstance: { "inst-1": { radarrDownloaded: "yes" as any } },
        } as any,
      }),
    ).toThrow(/notificationSettings/);
  });
});

describe("validateExportPayload — backend", () => {
  it("accepts {url:null, sharedSecret:null, deviceId:null}", () => {
    const result = validateExportPayload({
      ...baseValid(),
      backend: { url: null, sharedSecret: null, deviceId: null },
    });
    expect(result.backend).toEqual({ url: null, sharedSecret: null, deviceId: null });
  });

  it("rejects a non-http(s) backend url", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        backend: { url: "ftp://x", sharedSecret: null, deviceId: null },
      }),
    ).toThrow(/backend/);
  });

  it("rejects a sharedSecret longer than 512 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        backend: { url: null, sharedSecret: "x".repeat(513), deviceId: null },
      }),
    ).toThrow(/backend/);
  });

  it("rejects a deviceId longer than 256 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        backend: { url: null, sharedSecret: null, deviceId: "x".repeat(257) },
      }),
    ).toThrow(/backend/);
  });
});

describe("validateExportPayload — dashboards (slot widget IDs silent drop)", () => {
  it("drops slots whose widgetId is unknown without throwing", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [
            { id: "slot-a", widgetId: "service-health" },
            { id: "slot-b", widgetId: "future-widget" },
            { id: "slot-c", widgetId: "calendar" },
          ],
        },
      ],
    });
    expect(result.dashboards[0].widgets.map((w) => w.widgetId)).toEqual([
      "service-health",
      "calendar",
    ]);
  });

  it("preserves slot order across known widget IDs", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [
            { id: "slot-a", widgetId: "calendar" },
            { id: "slot-b", widgetId: "downloads" },
            { id: "slot-c", widgetId: "service-health" },
          ],
        },
      ],
    });
    expect(result.dashboards[0].widgets.map((w) => w.widgetId)).toEqual([
      "calendar",
      "downloads",
      "service-health",
    ]);
  });

  it("rejects duplicate slot ids across the whole list", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Default",
            widgets: [
              { id: "shared", widgetId: "calendar" },
              { id: "shared", widgetId: "downloads" },
            ],
          },
        ],
      }),
    ).toThrow(/duplicate slot id/);
  });

  it("rejects duplicate dashboard ids", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          { id: TEST_DASHBOARD_ID, name: "A", widgets: [] },
          { id: TEST_DASHBOARD_ID, name: "B", widgets: [] },
        ],
      }),
    ).toThrow(/duplicate id/);
  });

  it("falls back activeDashboardId to dashboards[0] when stored id doesn't match", () => {
    const result = validateExportPayload({
      ...baseValid(),
      activeDashboardId: "missing-id",
    });
    expect(result.activeDashboardId).toBe(TEST_DASHBOARD_ID);
  });
});

describe("validateExportPayload — dashboards (v20 identity + workspace fields)", () => {
  it("accepts a dashboard with icon, color, attachedInstances, and pinnedTabs", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Media",
          widgets: [],
          icon: "Film",
          color: "#ef4444",
          attachedInstances: ["inst-radarr-1", "inst-sonarr-1"],
          pinnedTabs: ["movies", "tv"],
        },
      ],
    });
    const d = result.dashboards[0];
    expect(d.icon).toBe("Film");
    expect(d.color).toBe("#ef4444");
    expect(d.attachedInstances).toEqual(["inst-radarr-1", "inst-sonarr-1"]);
    expect(d.pinnedTabs).toEqual(["movies", "tv"]);
  });

  it("allows dashboards without any v20 fields (pre-v20 shape passes)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [{ id: TEST_DASHBOARD_ID, name: "Default", widgets: [] }],
    });
    const d = result.dashboards[0];
    expect(d.icon).toBeUndefined();
    expect(d.color).toBeUndefined();
    expect(d.attachedInstances).toBeUndefined();
    expect(d.pinnedTabs).toBeUndefined();
  });

  it("rejects a non-hex color string", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Default",
            widgets: [],
            color: "red",
          },
        ],
      }),
    ).toThrow(/dashboards entry/);
  });

  it("rejects a non-string icon", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Default",
            widgets: [],
            icon: 42,
          },
        ],
      }),
    ).toThrow(/dashboards entry/);
  });

  it("drops empty/malformed entries from attachedInstances without rejecting the dashboard", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          attachedInstances: ["uuid-1", "", 42, "uuid-2", "uuid-1"],
        },
      ],
    });
    // Empties and non-strings are dropped; duplicates dedupe.
    expect(result.dashboards[0].attachedInstances).toEqual(["uuid-1", "uuid-2"]);
  });

  it("caps pinnedTabs at MAX_PINNED_TABS (3) and dedupes", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [],
          pinnedTabs: ["a", "a", "b", "c", "d", "e"],
        },
      ],
    });
    expect(result.dashboards[0].pinnedTabs).toEqual(["a", "b", "c"]);
  });

  it("rejects non-array attachedInstances", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        dashboards: [
          {
            id: TEST_DASHBOARD_ID,
            name: "Default",
            widgets: [],
            attachedInstances: "uuid-1",
          },
        ],
      }),
    ).toThrow(/dashboards entry/);
  });
});

describe("validateExportPayload — hapticsEnabled", () => {
  it("accepts true", () => {
    const result = validateExportPayload({ ...baseValid(), hapticsEnabled: true });
    expect(result.hapticsEnabled).toBe(true);
  });

  it("accepts false", () => {
    const result = validateExportPayload({ ...baseValid(), hapticsEnabled: false });
    expect(result.hapticsEnabled).toBe(false);
  });

  it("rejects a non-boolean hapticsEnabled", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), hapticsEnabled: "yes" as any }),
    ).toThrow(/hapticsEnabled/);
  });

  it("omits hapticsEnabled from the result when absent in input", () => {
    const result = validateExportPayload(baseValid());
    expect(result.hapticsEnabled).toBeUndefined();
  });
});

describe("validateExportPayload — treatVpnAsHome (v32, #185)", () => {
  it("accepts a boolean", () => {
    expect(
      validateExportPayload({ ...baseValid(), treatVpnAsHome: true }).treatVpnAsHome,
    ).toBe(true);
    expect(
      validateExportPayload({ ...baseValid(), treatVpnAsHome: false }).treatVpnAsHome,
    ).toBe(false);
  });

  it("rejects a non-boolean treatVpnAsHome", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), treatVpnAsHome: "yes" as any }),
    ).toThrow(/treatVpnAsHome/);
  });

  it("omits treatVpnAsHome from the result when absent (pre-v32 exports)", () => {
    expect(validateExportPayload(baseValid()).treatVpnAsHome).toBeUndefined();
  });
});

describe("validateExportPayload — service customHeaders", () => {
  // Each test pairs a single-instance services entry with secrets keyed by
  // that instance's UUID, mirroring the v13 storage shape.
  const withInstance = (s: Record<string, unknown>) => ({
    ...baseValid(),
    services: { radarr: [validInstance()] },
    secrets: { [TEST_INSTANCE_ID]: s },
  });

  it("accepts a typical reverse-proxy header pair", () => {
    const result = validateExportPayload(
      withInstance({
        apiKey: "abc",
        customHeaders: {
          "CF-Access-Client-Id": "id",
          "CF-Access-Client-Secret": "secret",
        },
      }),
    );
    expect(result.secrets[TEST_INSTANCE_ID]?.customHeaders).toEqual({
      "CF-Access-Client-Id": "id",
      "CF-Access-Client-Secret": "secret",
    });
  });

  it("drops an empty header map (so consumers see undefined, not {})", () => {
    const result = validateExportPayload(withInstance({ customHeaders: {} }));
    expect(result.secrets[TEST_INSTANCE_ID]?.customHeaders).toBeUndefined();
  });

  it("rejects a header name with a space (CRLF-injection vector)", () => {
    expect(() =>
      validateExportPayload(
        withInstance({ customHeaders: { "Bad Header": "x" } }),
      ),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects a header name containing : (would corrupt the wire format)", () => {
    expect(() =>
      validateExportPayload(
        withInstance({ customHeaders: { "X-Bad:Name": "x" } }),
      ),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects an empty header name", () => {
    expect(() =>
      validateExportPayload(withInstance({ customHeaders: { "": "x" } })),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects a header value containing CR or LF (header-splitting vector)", () => {
    expect(() =>
      validateExportPayload(
        withInstance({
          customHeaders: { "X-Foo": "ok\r\nX-Injected: bad" },
        }),
      ),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects a header value longer than 4096 chars", () => {
    expect(() =>
      validateExportPayload(
        withInstance({ customHeaders: { "X-Foo": "x".repeat(4097) } }),
      ),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects more than 32 headers", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 33; i++) many[`X-Header-${i}`] = "v";
    expect(() =>
      validateExportPayload(withInstance({ customHeaders: many })),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects customHeaders that is not a plain object", () => {
    expect(() =>
      validateExportPayload(
        withInstance({ customHeaders: "not-an-object" as any }),
      ),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });

  it("rejects a non-string header value (e.g. numeric)", () => {
    expect(() =>
      validateExportPayload(
        withInstance({ customHeaders: { "X-Foo": 42 as any } }),
      ),
    ).toThrow(new RegExp(`secrets\\.${TEST_INSTANCE_ID}`));
  });
});

describe("validateExportPayload — globalCustomHeaders", () => {
  it("accepts a populated map at the top level", () => {
    const result = validateExportPayload({
      ...baseValid(),
      globalCustomHeaders: { Authorization: "Bearer xyz" },
    });
    expect(result.globalCustomHeaders).toEqual({ Authorization: "Bearer xyz" });
  });

  it("omits globalCustomHeaders from the result when absent in input", () => {
    const result = validateExportPayload(baseValid());
    expect(result.globalCustomHeaders).toBeUndefined();
  });

  it("rejects globalCustomHeaders that is not a plain object", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        globalCustomHeaders: ["X-Foo"] as any,
      }),
    ).toThrow(/globalCustomHeaders/);
  });

  it("rejects a CRLF-injection attempt in a global header value", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        globalCustomHeaders: { "X-Foo": "ok\nX-Injected: bad" },
      }),
    ).toThrow(/globalCustomHeaders/);
  });
});

describe("validateExportPayload — uiScale", () => {
  it("accepts a whitelisted uiScale value", () => {
    const result = validateExportPayload({ ...baseValid(), uiScale: 1.15 });
    expect(result.uiScale).toBe(1.15);
  });

  it("omits uiScale from the result when absent in input", () => {
    const result = validateExportPayload(baseValid());
    expect(result.uiScale).toBeUndefined();
  });

  it("rejects an out-of-whitelist uiScale", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), uiScale: 99 }),
    ).toThrow(/uiScale/);
  });

  it("rejects a non-numeric uiScale", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), uiScale: "big" as any }),
    ).toThrow(/uiScale/);
  });
});

describe("validateExportPayload — appTheme", () => {
  it("accepts a whitelisted appTheme id", () => {
    const result = validateExportPayload({ ...baseValid(), appTheme: "ember" });
    expect(result.appTheme).toBe("ember");
  });

  it("omits appTheme from the result when absent in input", () => {
    const result = validateExportPayload(baseValid());
    expect(result.appTheme).toBeUndefined();
  });

  it("rejects an unknown appTheme id", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), appTheme: "hotpink" as any }),
    ).toThrow(/appTheme/);
  });

  it("rejects a non-string appTheme", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), appTheme: 3 as any }),
    ).toThrow(/appTheme/);
  });
});

describe("validateExportPayload — slot settings", () => {
  it("preserves a slot's settings object verbatim", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [
            { id: "slot-cal", widgetId: "calendar", settings: { foo: 1 } },
          ],
        },
      ],
    });
    expect(result.dashboards[0].widgets[0].settings).toEqual({ foo: 1 });
  });

  it("drops the slot when settings is not an object", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [
            { id: "slot-cal", widgetId: "calendar", settings: "nope" as any },
          ],
        },
      ],
    });
    expect(result.dashboards[0].widgets).toEqual([]);
  });

  it("treats absent settings as the slot having no overrides", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboards: [
        {
          id: TEST_DASHBOARD_ID,
          name: "Default",
          widgets: [{ id: "slot-cal", widgetId: "calendar" }],
        },
      ],
    });
    expect(result.dashboards[0].widgets[0].settings).toBeUndefined();
  });
});
