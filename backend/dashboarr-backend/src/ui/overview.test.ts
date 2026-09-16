import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverview, displayUrl, redactErrorText, type OverviewInputs } from "./overview.js";
import type { StoredServiceInstance } from "../db/repos/service-instance.js";

function instance(over: Partial<StoredServiceInstance> = {}): StoredServiceInstance {
  return {
    id: "inst-1",
    serviceId: "radarr",
    enabled: true,
    name: "Radarr",
    localUrl: "http://10.0.0.5:7878",
    remoteUrl: "",
    useRemote: false,
    apiKey: "SUPERSECRET-KEY",
    username: null,
    password: null,
    wolMac: "aa:bb:cc:dd:ee:ff",
    pollMs: null,
    updatedAt: 1000,
    ...over,
  };
}

function inputs(over: Partial<OverviewInputs> = {}): OverviewInputs {
  return {
    version: "1.5.0",
    uptimeMs: 5000,
    encryptionEnabled: false,
    publicUrl: null,
    backendUseRemote: false,
    devices: [],
    instances: [],
    pollers: [],
    health: () => null,
    webhooks: [],
    now: 123456,
    ...over,
  };
}

test("displayUrl keeps scheme, host and path only", () => {
  assert.equal(displayUrl("http://alice:pw@10.0.0.5:7878"), "http://10.0.0.5:7878/");
  assert.equal(displayUrl("https://radarr.example.com/base"), "https://radarr.example.com/base");
  assert.equal(displayUrl("https://sab.example.com/api?apikey=SECRET#frag"), "https://sab.example.com/api");
  assert.equal(displayUrl(""), "");
  assert.equal(displayUrl("not a url"), "");
});

test("activeUrl mirrors the poller fallback when the preferred URL is empty", () => {
  const remoteOnly = instance({ localUrl: "", remoteUrl: "https://radarr.example.com" });
  const both = instance({ id: "b", localUrl: "http://10.0.0.5:7878", remoteUrl: "https://radarr.example.com" });
  const none = instance({ id: "n", localUrl: "", remoteUrl: "" });
  const local = buildOverview(inputs({ instances: [remoteOnly, both, none], backendUseRemote: false }));
  assert.deepEqual(local.instances.map((i) => i.activeUrl), ["remote", "local", null]);
  const remote = buildOverview(inputs({ instances: [remoteOnly, both, none], backendUseRemote: true }));
  assert.deepEqual(remote.instances.map((i) => i.activeUrl), ["remote", "remote", null]);
});

test("publicUrl is sanitised like every other URL", () => {
  assert.equal(
    buildOverview(inputs({ publicUrl: "https://u:p@dashboarr.example.com/base?x=1" })).publicUrl,
    "https://dashboarr.example.com/base",
  );
  assert.equal(buildOverview(inputs({ publicUrl: null })).publicUrl, null);
});

test("instances carry booleans for credentials and never the values", () => {
  const out = buildOverview(
    inputs({
      instances: [
        instance({ localUrl: "http://alice:pw@10.0.0.5:7878?apikey=SUPERSECRET-KEY", username: "u", password: "hunter2" }),
      ],
    }),
  );
  const json = JSON.stringify(out);
  assert.equal(json.includes("SUPERSECRET-KEY"), false);
  assert.equal(json.includes("hunter2"), false);
  assert.equal(json.includes("alice:pw@"), false);
  assert.equal(json.includes("aa:bb:cc"), false);
  const inst = out.instances[0]!;
  assert.equal(inst.hasApiKey, true);
  assert.equal(inst.hasCredentials, true);
  assert.equal(inst.localUrl, "http://10.0.0.5:7878/");
  assert.equal(inst.poller, null);
  assert.equal(inst.health, null);
});

test("poller and health are joined by instance id", () => {
  const out = buildOverview(
    inputs({
      instances: [instance()],
      pollers: [
        {
          id: "inst-1",
          kind: "radarr",
          name: "Radarr",
          intervalMs: 30_000,
          lastRunAt: 900,
          lastError: "boom",
          failingSince: 800,
        },
        {
          id: "other",
          kind: "sonarr",
          name: "Sonarr",
          intervalMs: 30_000,
          lastRunAt: null,
          lastError: null,
          failingSince: null,
        },
      ],
      health: (id) => (id === "inst-1" ? { value: { online: false, failCount: 4 }, updatedAt: 950 } : null),
    }),
  );
  assert.deepEqual(out.instances[0]!.poller, {
    intervalMs: 30_000,
    lastRunAt: 900,
    lastError: "boom",
    failingSince: 800,
  });
  assert.deepEqual(out.instances[0]!.health, { online: false, failCount: 4, updatedAt: 950 });
});

test("instances are sorted by kind then name", () => {
  const out = buildOverview(
    inputs({
      instances: [
        instance({ id: "c", serviceId: "sonarr", name: "TV" }),
        instance({ id: "b", serviceId: "radarr", name: "Movies B" }),
        instance({ id: "a", serviceId: "radarr", name: "Movies A" }),
      ],
    }),
  );
  assert.deepEqual(
    out.instances.map((i) => i.id),
    ["a", "b", "c"],
  );
});

test("devices omit push token and shared secret; webhooks omit payloads", () => {
  const out = buildOverview(
    inputs({
      devices: [
        {
          id: "dev-1",
          expoPushToken: "ExponentPushToken[abc]",
          sharedSecret: "deadbeef",
          platform: "ios",
          appVersion: "1.18.0",
          createdAt: 1,
          lastSeenAt: 2,
          invalid: true,
        },
      ],
      webhooks: [
        {
          id: 9,
          source: "radarr",
          receivedAt: 3,
          payload: { eventType: "Download", movie: { title: "Heat", year: 1995, folderPath: "/secret/path" } },
        },
      ],
    }),
  );
  const json = JSON.stringify(out);
  assert.equal(json.includes("ExponentPushToken"), false);
  assert.equal(json.includes("deadbeef"), false);
  assert.equal(json.includes("/secret/path"), false);
  assert.deepEqual(out.devices, [
    { id: "dev-1", platform: "ios", appVersion: "1.18.0", createdAt: 1, lastSeenAt: 2, invalid: true },
  ]);
  assert.deepEqual(out.webhooks, [
    { id: 9, source: "radarr", receivedAt: 3, eventType: "Download", summary: "Heat (1995)" },
  ]);
  assert.equal(out.generatedAt, 123456);
});

test("redactErrorText drops userinfo and query strings from embedded URLs", () => {
  assert.equal(
    redactErrorText("Request cannot be constructed from a URL that includes credentials: http://alice:pw@10.0.0.5:8080/api/v2/auth/login"),
    "Request cannot be constructed from a URL that includes credentials: http://10.0.0.5:8080/api/v2/auth/login",
  );
  assert.equal(
    redactErrorText("sabnzbd HTTP 403 — https://sab.example.com/api?mode=queue&apikey=SECRET"),
    "sabnzbd HTTP 403 — https://sab.example.com/api",
  );
  assert.equal(redactErrorText("fetch failed"), "fetch failed");
  assert.equal(redactErrorText("two http://a:b@x/1?k=v and http://y/2#f done"), "two http://x/1 and http://y/2 done");
});

test("poller lastError is redacted in the overview", () => {
  const out = buildOverview(
    inputs({
      instances: [instance()],
      pollers: [
        {
          id: "inst-1",
          kind: "radarr",
          name: "Radarr",
          intervalMs: 30_000,
          lastRunAt: 1,
          lastError: "radarr HTTP 401 — http://u:p@10.0.0.5:7878/api/v3/queue?apikey=KEY",
          failingSince: 1,
        },
      ],
    }),
  );
  assert.equal(out.instances[0]!.poller?.lastError, "radarr HTTP 401 — http://10.0.0.5:7878/api/v3/queue");
});
