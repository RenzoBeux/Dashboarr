import { SERVICE_IDS, type ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";
import type { ServiceHealthStatus, HealthStatusKind } from "@/lib/types";
import {
  classifyInstance,
  buildIntegrationRows,
  summarizeIntegrations,
  integrationSubtitle,
  resolveKindRoute,
  resolveBrowseRoute,
  isConfigured,
  isBlankInstance,
  type InstanceProbeContext,
} from "@/lib/integration-status";

function inst(over: Partial<ServiceInstance> = {}): ServiceInstance {
  return {
    id: "i1",
    enabled: true,
    name: "Radarr",
    localUrl: "http://192.168.1.5:7878",
    remoteUrl: "",
    useRemote: false,
    ...over,
  };
}

/** An empty per-kind map, so tests only fill in the kinds they care about. */
function emptyInstances(): Record<ServiceId, ServiceInstance[]> {
  return SERVICE_IDS.reduce(
    (acc, id) => {
      acc[id] = [];
      return acc;
    },
    {} as Record<ServiceId, ServiceInstance[]>,
  );
}

function ctxFor(
  instances: ServiceInstance[],
  over: Partial<InstanceProbeContext> = {},
): Record<string, InstanceProbeContext> {
  return Object.fromEntries(
    instances.map((i) => [
      i.id,
      { activeUrl: i.localUrl || i.remoteUrl, lanBlocked: false, ...over },
    ]),
  );
}

function health(
  kind: ServiceId,
  entries: { instanceId: string; status: HealthStatusKind; responseTime?: number }[],
): ServiceHealthStatus[] {
  return [
    {
      id: kind,
      name: kind,
      online: entries.some((e) => e.status === "ok"),
      status: entries[0]?.status ?? "offline",
      instances: entries.map((e) => ({
        instanceId: e.instanceId,
        instanceName: "x",
        online: e.status === "ok",
        status: e.status,
        responseTime: e.responseTime,
      })),
    },
  ];
}

describe("isConfigured", () => {
  it("is false for a seeded placeholder with no URLs", () => {
    expect(isConfigured([inst({ enabled: false, localUrl: "", remoteUrl: "" })])).toBe(
      false,
    );
  });

  it("is true when either URL slot is filled, even while disabled", () => {
    expect(isConfigured([inst({ enabled: false })])).toBe(true);
    expect(
      isConfigured([inst({ enabled: false, localUrl: "", remoteUrl: "https://a.b" })]),
    ).toBe(true);
  });
});

describe("isBlankInstance", () => {
  const blank = { localUrl: "", remoteUrl: "" };

  it("is true for a slot with no URL and no credential", () => {
    expect(isBlankInstance(blank, {}, false)).toBe(true);
    expect(isBlankInstance(blank, {}, true)).toBe(true);
  });

  it("is false once either URL slot is filled", () => {
    expect(isBlankInstance({ localUrl: "http://a", remoteUrl: "" }, {}, false)).toBe(
      false,
    );
    expect(isBlankInstance({ localUrl: "", remoteUrl: "https://a" }, {}, false)).toBe(
      false,
    );
  });

  it("reads the credential slot the service actually uses", () => {
    // An API-key service with a stray username is still blank, and vice versa,
    // or backing out would keep a row the user never really configured.
    expect(isBlankInstance(blank, { apiKey: "k" }, false)).toBe(false);
    expect(isBlankInstance(blank, { username: "u" }, false)).toBe(true);

    expect(isBlankInstance(blank, { username: "u" }, true)).toBe(false);
    expect(isBlankInstance(blank, { password: "p" }, true)).toBe(false);
    expect(isBlankInstance(blank, { apiKey: "k" }, true)).toBe(true);
  });

  it("treats empty strings as absent", () => {
    expect(isBlankInstance(blank, { apiKey: "" }, false)).toBe(true);
    expect(isBlankInstance(blank, { username: "", password: "" }, true)).toBe(true);
  });
});

describe("classifyInstance", () => {
  it("reports a healthy enabled instance as ok", () => {
    const r = classifyInstance("radarr", inst(), { status: "ok" }, false, "http://a");
    expect(r.state).toBe("ok");
    expect(r.status).toBe("ok");
    expect(r.reason).toBeUndefined();
  });

  it("reports auth failures with a specific reason", () => {
    const r = classifyInstance(
      "radarr",
      inst(),
      { status: "auth_failed" },
      false,
      "http://a",
    );
    expect(r.state).toBe("attention");
    expect(r.reason).toBe("Authentication failed");
  });

  it("names the host in the unreachable reason", () => {
    const r = classifyInstance(
      "radarr",
      inst(),
      { status: "offline" },
      false,
      "http://192.168.1.5:7878/sub",
    );
    expect(r.state).toBe("attention");
    expect(r.reason).toBe("Unreachable · 192.168.1.5:7878");
  });

  // The split that stops the hub screaming on cellular.
  it("reports a LAN-blocked instance as away, never as attention", () => {
    const r = classifyInstance(
      "radarr",
      inst(),
      { status: "offline" },
      true,
      "http://192.168.1.5:7878",
    );
    expect(r.state).toBe("away");
    expect(r.reason).toBeUndefined();
  });

  it("prefers away over a pending probe", () => {
    const r = classifyInstance("radarr", inst(), undefined, true, "http://a");
    expect(r.state).toBe("away");
  });

  it("reports checking before the first probe resolves", () => {
    const r = classifyInstance("radarr", inst(), undefined, false, "http://a");
    expect(r.state).toBe("checking");
    expect(r.status).toBeUndefined();
  });

  it("reports a disabled but configured instance as off", () => {
    const r = classifyInstance(
      "radarr",
      inst({ enabled: false }),
      { status: "ok" },
      false,
      "http://a",
    );
    expect(r.state).toBe("off");
  });

  it("reports an untouched placeholder as unconfigured", () => {
    const r = classifyInstance(
      "radarr",
      inst({ enabled: false, localUrl: "", remoteUrl: "" }),
      undefined,
      false,
      "",
    );
    expect(r.state).toBe("unconfigured");
  });

  it("flags an enabled instance with no URL, which health cannot verdict on", () => {
    const r = classifyInstance(
      "radarr",
      inst({ localUrl: "", remoteUrl: "" }),
      undefined,
      false,
      "",
    );
    expect(r.state).toBe("attention");
    expect(r.reason).toBe("Enabled but no URL set");
  });
});

describe("buildIntegrationRows", () => {
  it("surfaces a broken secondary that the health hook's rollup would mask", () => {
    // useServiceHealth aggregates best-of-any, so this kind reads "ok" there.
    const a = inst({ id: "a", name: "Radarr Home" });
    const b = inst({ id: "b", name: "Radarr Cabin" });
    const map = emptyInstances();
    map.radarr = [a, b];

    const rows = buildIntegrationRows(
      map,
      health("radarr", [
        { instanceId: "a", status: "ok" },
        { instanceId: "b", status: "auth_failed" },
      ]),
      ctxFor([a, b]),
    );

    const radarr = rows.find((r) => r.kind === "radarr")!;
    expect(radarr.state).toBe("attention");
    expect(radarr.status).toBe("auth_failed");
    expect(radarr.rows.map((r) => r.state)).toEqual(["ok", "attention"]);
  });

  it("does not flag a kind whose only bad instance is disabled", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b", enabled: false });
    const map = emptyInstances();
    map.radarr = [a, b];

    const rows = buildIntegrationRows(
      map,
      health("radarr", [
        { instanceId: "a", status: "ok" },
        { instanceId: "b", status: "offline" },
      ]),
      ctxFor([a, b]),
    );
    expect(rows.find((r) => r.kind === "radarr")!.state).toBe("ok");
  });

  it("marks a configured kind with nothing enabled as off", () => {
    const a = inst({ id: "a", enabled: false });
    const map = emptyInstances();
    map.radarr = [a];
    const rows = buildIntegrationRows(map, [], ctxFor([a]));
    const radarr = rows.find((r) => r.kind === "radarr")!;
    expect(radarr.state).toBe("off");
    expect(radarr.configured).toBe(true);
    expect(radarr.enabledCount).toBe(0);
  });

  it("treats a seeded placeholder kind as unconfigured, not broken", () => {
    const a = inst({ id: "a", enabled: false, localUrl: "", remoteUrl: "" });
    const map = emptyInstances();
    map.radarr = [a];
    const rows = buildIntegrationRows(map, undefined, ctxFor([a]));
    expect(rows.find((r) => r.kind === "radarr")!.state).toBe("unconfigured");
  });

  // hooks/use-service-health.ts turns a kind whose probe body threw into
  // { status: "offline", instances: [] } via its allSettled fallback. Treating
  // the missing per-instance row as "not probed yet" hid that failure behind a
  // permanent "Checking..." dot.
  it("treats a settled kind with no instance rows as a real verdict", () => {
    const a = inst({ id: "a" });
    const map = emptyInstances();
    map.radarr = [a];

    const rows = buildIntegrationRows(
      map,
      [
        {
          id: "radarr",
          name: "Radarr",
          online: false,
          status: "offline",
          instances: [],
        },
      ],
      ctxFor([a]),
    );

    const radarr = rows.find((r) => r.kind === "radarr")!;
    expect(radarr.state).toBe("attention");
    expect(radarr.rows[0].state).toBe("attention");
    expect(radarr.rows[0].reason).toBe("Unreachable · 192.168.1.5:7878");
    expect(summarizeIntegrations(rows).attention).toBe(1);
  });

  it("still reports checking when the kind has not been probed at all", () => {
    const a = inst({ id: "a" });
    const map = emptyInstances();
    map.radarr = [a];
    // Health for other kinds resolved, this one is absent entirely.
    const rows = buildIntegrationRows(map, [], ctxFor([a]));
    expect(rows.find((r) => r.kind === "radarr")!.state).toBe("checking");
  });

  it("still reports checking for an instance added after the probe was keyed", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b", name: "Radarr Cabin" });
    const map = emptyInstances();
    map.radarr = [a, b];

    // Non-empty instances list that simply predates `b`.
    const rows = buildIntegrationRows(
      map,
      health("radarr", [{ instanceId: "a", status: "ok" }]),
      ctxFor([a, b]),
    );

    const radarr = rows.find((r) => r.kind === "radarr")!;
    expect(radarr.rows.map((r) => r.state)).toEqual(["ok", "checking"]);
  });

  it("does not let the settled fallback override away or disabled", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b", enabled: false });
    const map = emptyInstances();
    map.radarr = [a];
    map.sonarr = [b];

    const thrown = (kind: ServiceId): ServiceHealthStatus => ({
      id: kind,
      name: kind,
      online: false,
      status: "offline",
      instances: [],
    });

    const rows = buildIntegrationRows(
      map,
      [thrown("radarr"), thrown("sonarr")],
      { ...ctxFor([a], { lanBlocked: true }), ...ctxFor([b]) },
    );

    expect(rows.find((r) => r.kind === "radarr")!.state).toBe("away");
    expect(rows.find((r) => r.kind === "sonarr")!.state).toBe("off");
  });

  it("returns one row per kind in canonical order", () => {
    const rows = buildIntegrationRows(emptyInstances(), undefined, {});
    expect(rows.map((r) => r.kind)).toEqual([...SERVICE_IDS]);
  });
});

describe("summarizeIntegrations", () => {
  // The invariant that keeps the Settings row and the hub honest.
  it("partitions every kind into exactly one bucket", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b", enabled: false });
    const c = inst({ id: "c", name: "Sonarr" });
    const map = emptyInstances();
    map.radarr = [a];
    map.sonarr = [c];
    map.plex = [b];

    const rows = buildIntegrationRows(
      map,
      health("radarr", [{ instanceId: "a", status: "ok" }]).concat(
        health("sonarr", [{ instanceId: "c", status: "offline" }]),
      ),
      ctxFor([a, b, c]),
    );
    const s = summarizeIntegrations(rows);

    expect(
      s.connected + s.attention + s.away + s.checking + s.off + s.available,
    ).toBe(SERVICE_IDS.length);
    expect(s.connected).toBe(1);
    expect(s.attention).toBe(1);
    expect(s.off).toBe(1);
    expect(s.available).toBe(SERVICE_IDS.length - 3);
  });

  it("holds the invariant for a completely empty install", () => {
    const rows = buildIntegrationRows(emptyInstances(), undefined, {});
    const s = summarizeIntegrations(rows);
    expect(
      s.connected + s.attention + s.away + s.checking + s.off + s.available,
    ).toBe(SERVICE_IDS.length);
    expect(s.line).toBe("Set up your first service");
  });

  it("reports auth failures as the worst dot", () => {
    const a = inst({ id: "a" });
    const map = emptyInstances();
    map.radarr = [a];
    const rows = buildIntegrationRows(
      map,
      health("radarr", [{ instanceId: "a", status: "auth_failed" }]),
      ctxFor([a]),
    );
    expect(summarizeIntegrations(rows).worst).toBe("auth_failed");
  });

  it("has no dot when nothing needs attention", () => {
    const a = inst({ id: "a" });
    const map = emptyInstances();
    map.radarr = [a];
    const rows = buildIntegrationRows(
      map,
      health("radarr", [{ instanceId: "a", status: "ok" }]),
      ctxFor([a]),
    );
    const s = summarizeIntegrations(rows);
    expect(s.worst).toBeUndefined();
    expect(s.line).toBe("1 service connected");
  });

  it("says away rather than needs attention when off the home network", () => {
    const a = inst({ id: "a" });
    const map = emptyInstances();
    map.radarr = [a];
    const rows = buildIntegrationRows(
      map,
      health("radarr", [{ instanceId: "a", status: "offline" }]),
      ctxFor([a], { lanBlocked: true }),
    );
    const s = summarizeIntegrations(rows);
    expect(s.attention).toBe(0);
    expect(s.away).toBe(1);
    expect(s.worst).toBeUndefined();
    expect(s.line).toBe("0 connected · 1 away from home");
  });

  it("reports checking while the first probe batch is in flight", () => {
    const a = inst({ id: "a" });
    const map = emptyInstances();
    map.radarr = [a];
    const rows = buildIntegrationRows(map, undefined, ctxFor([a]));
    expect(summarizeIntegrations(rows).line).toBe("Checking 1 service…");
  });
});

describe("integrationSubtitle", () => {
  function rowFor(
    instances: ServiceInstance[],
    healthData?: ServiceHealthStatus[],
    over: Partial<InstanceProbeContext> = {},
  ) {
    const map = emptyInstances();
    map.radarr = instances;
    return buildIntegrationRows(map, healthData, ctxFor(instances, over)).find(
      (r) => r.kind === "radarr",
    )!;
  }

  it("invites setup for an untouched kind", () => {
    const r = rowFor([inst({ enabled: false, localUrl: "", remoteUrl: "" })]);
    expect(integrationSubtitle(r)).toEqual({ text: "Not set up", tone: "default" });
  });

  it("says configured but off for a disabled instance", () => {
    const r = rowFor([inst({ enabled: false })]);
    expect(integrationSubtitle(r).text).toBe("Configured, turned off");
  });

  it("shows the active URL and latency for one healthy instance", () => {
    const r = rowFor(
      [inst()],
      health("radarr", [{ instanceId: "i1", status: "ok", responseTime: 34 }]),
    );
    expect(integrationSubtitle(r)).toEqual({
      text: "http://192.168.1.5:7878 · 34 ms",
      tone: "default",
    });
  });

  it("warns with the reason for one broken instance", () => {
    const r = rowFor(
      [inst()],
      health("radarr", [{ instanceId: "i1", status: "auth_failed" }]),
    );
    expect(integrationSubtitle(r)).toEqual({
      text: "Authentication failed",
      tone: "warn",
    });
  });

  it("stays calm for a single away instance", () => {
    const r = rowFor(
      [inst()],
      health("radarr", [{ instanceId: "i1", status: "offline" }]),
      { lanBlocked: true },
    );
    expect(integrationSubtitle(r)).toEqual({
      text: "Local only · away from home",
      tone: "default",
    });
  });

  it("counts connected instances when there are several", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b" });
    const r = rowFor(
      [a, b],
      health("radarr", [
        { instanceId: "a", status: "ok" },
        { instanceId: "b", status: "ok" },
      ]),
    );
    expect(integrationSubtitle(r)).toEqual({
      text: "2 instances · 2 connected",
      tone: "default",
    });
  });

  it("warns when one of several instances is broken", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b" });
    const r = rowFor(
      [a, b],
      health("radarr", [
        { instanceId: "a", status: "ok" },
        { instanceId: "b", status: "offline" },
      ]),
    );
    expect(integrationSubtitle(r)).toEqual({
      text: "2 instances · 1 needs attention",
      tone: "warn",
    });
  });
});

describe("resolveKindRoute", () => {
  it("skips the list level for the single-instance case", () => {
    expect(resolveKindRoute("radarr", [inst({ id: "abc" })])).toBe(
      "/settings/integrations/radarr/abc",
    );
  });

  it("goes to the instance list when there are several", () => {
    expect(
      resolveKindRoute("radarr", [inst({ id: "a" }), inst({ id: "b" })]),
    ).toBe("/settings/integrations/radarr");
  });

  it("goes to the instance list when a kind somehow has none", () => {
    expect(resolveKindRoute("radarr", [])).toBe("/settings/integrations/radarr");
  });
});

describe("resolveBrowseRoute", () => {
  // The regression this guards: with one configured instance, sending Browse
  // to that instance's editor left no reachable way to add a second server,
  // because a single-instance kind shows its list nowhere else.
  it("sends an already-configured kind to its instance list, not the editor", () => {
    const only = inst({ id: "abc" });
    expect(resolveBrowseRoute("radarr", [only])).toBe(
      "/settings/integrations/radarr",
    );
    expect(resolveBrowseRoute("radarr", [only])).not.toBe(
      resolveKindRoute("radarr", [only]),
    );
  });

  it("keeps the one-tap path for a kind that is not set up yet", () => {
    const placeholder = inst({
      id: "abc",
      enabled: false,
      localUrl: "",
      remoteUrl: "",
    });
    expect(resolveBrowseRoute("radarr", [placeholder])).toBe(
      "/settings/integrations/radarr/abc",
    );
  });

  it("sends a configured multi-instance kind to its list too", () => {
    expect(
      resolveBrowseRoute("radarr", [inst({ id: "a" }), inst({ id: "b" })]),
    ).toBe("/settings/integrations/radarr");
  });
});
