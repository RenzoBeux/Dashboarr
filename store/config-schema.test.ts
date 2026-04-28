import { validateExportPayload } from "./config-schema";

const baseValid = () => ({
  version: 7,
  exportedAt: "2026-04-27T00:00:00.000Z",
  services: {},
  secrets: {},
  autoSwitchNetwork: false,
  homeSSID: "",
  dashboardWidgets: [],
});

const validService = () => ({
  enabled: true,
  name: "Radarr",
  localUrl: "http://192.168.1.10:7878",
  remoteUrl: "https://radarr.example.com",
  useRemote: false,
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

  it("throws when homeSSID is longer than 64 chars", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), homeSSID: "x".repeat(65) }),
    ).toThrow(/homeSSID/i);
  });

  it("throws when homeBSSID is provided but not a string", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), homeBSSID: 42 as any }),
    ).toThrow(/homeBSSID/i);
  });

  it("throws when dashboardWidgets is not an array", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), dashboardWidgets: "calendar" as any }),
    ).toThrow(/dashboardWidgets/i);
  });

  it("accepts a minimally valid payload", () => {
    const result = validateExportPayload(baseValid());
    expect(result.version).toBe(7);
  });
});

describe("validateExportPayload — service config coercion", () => {
  it("rejects a service whose enabled is not a boolean", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: { ...validService(), enabled: "true" as any } },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects a service whose name exceeds 200 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: { ...validService(), name: "x".repeat(201) } },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects ftp:// in localUrl", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: { ...validService(), localUrl: "ftp://x" } },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects javascript:alert(1) in remoteUrl", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: { ...validService(), remoteUrl: "javascript:alert(1)" } },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects file:// URLs", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: { ...validService(), localUrl: "file:///etc/passwd" } },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("rejects useRemote as a string", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        services: { radarr: { ...validService(), useRemote: "true" as any } },
      }),
    ).toThrow(/services\.radarr/);
  });

  it("accepts empty-string URLs (user hasn't configured them yet)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: { ...validService(), localUrl: "", remoteUrl: "" },
      },
    });
    expect(result.services.radarr.localUrl).toBe("");
    expect(result.services.radarr.remoteUrl).toBe("");
  });

  it("accepts both http:// and https:// schemes", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: { ...validService(), localUrl: "http://x", remoteUrl: "https://x" },
      },
    });
    expect(result.services.radarr.localUrl).toBe("http://x");
    expect(result.services.radarr.remoteUrl).toBe("https://x");
  });
});

describe("validateExportPayload — service IDs (forward-compat silent drop)", () => {
  it("drops services with unknown IDs without throwing", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: { unknownFutureService: validService() } as any,
    });
    expect(result.services).toEqual({});
  });

  it("preserves services with known IDs when other unknown ones are present", () => {
    const result = validateExportPayload({
      ...baseValid(),
      services: {
        radarr: validService(),
        unknownFutureService: validService(),
      } as any,
    });
    expect(result.services.radarr).toBeDefined();
    expect((result.services as any).unknownFutureService).toBeUndefined();
  });
});

describe("validateExportPayload — service secrets", () => {
  it("drops null/undefined apiKey, username, password", () => {
    const result = validateExportPayload({
      ...baseValid(),
      secrets: { radarr: { apiKey: null, username: undefined } as any },
    });
    expect(result.secrets.radarr).toEqual({});
  });

  it("rejects an apiKey longer than 4096 chars", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        secrets: { radarr: { apiKey: "x".repeat(4097) } },
      }),
    ).toThrow(/secrets\.radarr/);
  });

  it("accepts an apiKey of exactly 4096 chars (boundary)", () => {
    const result = validateExportPayload({
      ...baseValid(),
      secrets: { radarr: { apiKey: "x".repeat(4096) } },
    });
    expect(result.secrets.radarr?.apiKey).toHaveLength(4096);
  });

  it("rejects a non-string apiKey", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        secrets: { radarr: { apiKey: 42 as any } },
      }),
    ).toThrow(/secrets\.radarr/);
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

describe("validateExportPayload — widget IDs (silent drop)", () => {
  it("drops unknown widget IDs without throwing", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboardWidgets: ["service-health", "future-widget", "calendar"],
    });
    expect(result.dashboardWidgets).toEqual(["service-health", "calendar"]);
  });

  it("preserves order of known widget IDs", () => {
    const result = validateExportPayload({
      ...baseValid(),
      dashboardWidgets: ["calendar", "downloads", "service-health"],
    });
    expect(result.dashboardWidgets).toEqual(["calendar", "downloads", "service-health"]);
  });
});

describe("validateExportPayload — widget settings", () => {
  it("drops unknown widget IDs from widgetSettings", () => {
    const result = validateExportPayload({
      ...baseValid(),
      widgetSettings: {
        calendar: { foo: 1 },
        "unknown-future-widget": { bar: 2 },
      } as any,
    });
    expect(result.widgetSettings?.calendar).toEqual({ foo: 1 });
    expect((result.widgetSettings as any)?.["unknown-future-widget"]).toBeUndefined();
  });

  it("rejects widgetSettings entries that are not objects", () => {
    expect(() =>
      validateExportPayload({
        ...baseValid(),
        widgetSettings: { calendar: "not-an-object" } as any,
      }),
    ).toThrow(/widgetSettings/);
  });

  it("rejects widgetSettings root that is not an object", () => {
    expect(() =>
      validateExportPayload({ ...baseValid(), widgetSettings: [] as any }),
    ).toThrow(/widgetSettings/);
  });
});
