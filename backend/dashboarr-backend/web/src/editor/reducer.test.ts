import { describe, expect, it } from "vitest";
import { blankExportPayload } from "@/lib/config-defaults";
import { validateExportPayload } from "@/store/config-schema";
import {
  addInstance,
  editorProblems,
  normalizeForSave,
  removeInstance,
  setApprise,
  setNotification,
  setSeerrAuthMode,
  updateInstance,
  updateSecrets,
} from "./reducer";

function withRadarr() {
  const { payload, id } = addInstance(blankExportPayload(), "radarr");
  return { payload: updateInstance(payload, "radarr", id, { enabled: true, localUrl: "http://10.0.0.5:7878" }), id };
}

describe("instances", () => {
  it("add creates a disabled instance named after the kind, and the result validates", () => {
    const { payload, id } = addInstance(blankExportPayload(), "radarr");
    const list = payload.services.radarr;
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ id, enabled: false, name: "Radarr", localUrl: "" });
    expect(() => validateExportPayload(payload)).not.toThrow();
  });

  it("updateSecrets sets and deletes slots on empty strings", () => {
    const { payload, id } = withRadarr();
    const a = updateSecrets(payload, id, { apiKey: "KEY", username: "u" });
    expect(a.secrets[id]).toEqual({ apiKey: "KEY", username: "u" });
    const b = updateSecrets(a, id, { username: "" });
    expect(b.secrets[id]).toEqual({ apiKey: "KEY" });
    const c = updateSecrets(b, id, { apiKey: "" });
    expect(c.secrets[id]).toBeUndefined();
    expect(payload.secrets[id]).toBeUndefined(); // input untouched
  });

  it("remove prunes secrets, per-instance settings, muted categories, attachments and active pins", () => {
    let { payload, id } = withRadarr();
    payload = updateSecrets(payload, id, { apiKey: "KEY" });
    payload = {
      ...payload,
      dashboards: payload.dashboards.map((d) => ({ ...d, attachedInstances: [id, "other"], activeInstance: { radarr: id } })),
      notificationSettings: {
        ...payload.notificationSettings!,
        perInstance: { [id]: { radarrDownloaded: false }, other: { serviceOffline: false } },
        qbtMutedCategories: { [id]: ["x"] },
      },
    };
    const out = removeInstance(payload, "radarr", id);
    expect(out.services.radarr.some((i) => i.id === id)).toBe(false);
    expect(out.secrets[id]).toBeUndefined();
    expect(out.dashboards[0]!.attachedInstances).toEqual(["other"]);
    expect(out.dashboards[0]!.activeInstance).toEqual({});
    expect(out.notificationSettings!.perInstance).toEqual({ other: { serviceOffline: false } });
    expect(out.notificationSettings!.qbtMutedCategories).toEqual({});
    expect(() => validateExportPayload(out)).not.toThrow();
  });
});

describe("Seerr mode switches", () => {
  function seerr() {
    const base = blankExportPayload();
    const id = base.services.overseerr[0]!.id;
    const loaded = { mode: "apiKey" as const, secrets: { apiKey: "ADMIN-KEY" } };
    return { payload: updateSecrets(base, id, { apiKey: "ADMIN-KEY" }), id, loaded };
  }

  it("switching to a user/password mode blanks the api key; switching back restores it", () => {
    const { payload, id, loaded } = seerr();
    const local = setSeerrAuthMode(payload, id, "local", loaded);
    expect(local.services.overseerr[0]!.authMode).toBe("local");
    expect(local.secrets[id]).toBeUndefined();
    const back = setSeerrAuthMode(updateSecrets(local, id, { username: "me", password: "pw" }), id, "apiKey", loaded);
    expect(back.secrets[id]).toEqual({ apiKey: "ADMIN-KEY" });
  });

  it("normalizeForSave stores apiKey mode as absence, drops requestAsUserId outside it and purges the unused family", () => {
    const { payload, id } = seerr();
    let p = updateInstance(payload, "overseerr", id, { authMode: "apiKey", requestAsUserId: 7 });
    const saved = normalizeForSave(p);
    expect(saved.services.overseerr[0]).not.toHaveProperty("authMode");
    expect(saved.services.overseerr[0]!.requestAsUserId).toBe(7);

    p = updateInstance(payload, "overseerr", id, { authMode: "local", requestAsUserId: 7 });
    p = updateSecrets(p, id, { username: "me", password: "pw" });
    const savedLocal = normalizeForSave(p);
    expect(savedLocal.services.overseerr[0]!.authMode).toBe("local");
    expect(savedLocal.services.overseerr[0]).not.toHaveProperty("requestAsUserId");
    expect(savedLocal.secrets[id]).toEqual({ username: "me", password: "pw" });
    expect(validateExportPayload(savedLocal).services.overseerr[0]!.authMode).toBe("local");
  });
});

describe("notifications and problems", () => {
  it("toggles and apprise edits keep the rest intact", () => {
    const p = setApprise(setNotification(blankExportPayload(), "serviceOffline", false), { enabled: true, url: "http://a:8000/notify/x" });
    expect(p.notificationSettings!.serviceOffline).toBe(false);
    expect(p.notificationSettings!.torrentCompleted).toBe(true);
    expect(p.notificationSettings!.apprise).toEqual({ enabled: true, url: "http://a:8000/notify/x", tags: "" });
    expect(() => validateExportPayload(p)).not.toThrow();
  });

  it("flags enabled instances without a URL or credential", () => {
    const { payload, id } = addInstance(blankExportPayload(), "radarr");
    const enabledNoUrl = updateInstance(payload, "radarr", id, { enabled: true });
    expect(editorProblems(enabledNoUrl).map((x) => x.message)).toEqual([
      "Radarr: enabled but has no URL",
      "Radarr: enabled but has no API key",
    ]);
    const ok = updateSecrets(updateInstance(enabledNoUrl, "radarr", id, { localUrl: "http://x:7878" }), id, { apiKey: "k" });
    expect(editorProblems(ok)).toEqual([]);
  });
});
